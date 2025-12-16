require('dotenv').config();
const cron = require('node-cron');
const path = require('path');
const { execa } = require('execa');
const pool = require('./config/db');

let isSyncing = false;

// The orchestrator function now accepts the 'historical' flag
const syncSingleSubaccount = async (subaccountId, historical = false) => {
    if (!subaccountId) {
        console.error('[XPAYZ-SYNC-JIT] No subaccount ID provided for on-demand sync.');
        return;
    }
    try {
        const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
        const scriptPath = path.join(__dirname, 'python_scripts', 'xpayz_subaccount_exporter.py');
        
        // Build the arguments for the script
        const scriptArgs = [scriptPath, subaccountId];
        if (historical) {
            scriptArgs.push('--historical'); // Add the flag if the trigger demands it
            console.log(`[XPAYZ-SYNC] ==> Starting HISTORICAL sync for subaccount ID: ${subaccountId}...`);
        }
        
        const subprocess = execa(pythonExecutable, scriptArgs, {
            encoding: 'utf8',
            env: { ...process.env, PYTHONUTF8: '1' }
        });

        subprocess.stdout.pipe(process.stdout);
        subprocess.stderr.pipe(process.stderr);

        await subprocess;

    } catch (error) {
        console.error(`[XPAYZ-SYNC-CRITICAL] Execution failed for subaccount ${subaccountId}.`);
    }
};

// This function for the regular 5-second sync remains the same
const syncAllSubaccounts = async () => {
    if (isSyncing) {
        return;
    }
    isSyncing = true;
    
    try {
        const [subaccounts] = await pool.query('SELECT subaccount_number FROM subaccounts WHERE account_type = "xpayz"');
        if (subaccounts.length === 0) {
            isSyncing = false;
            return;
        }

        for (const account of subaccounts) {
            if (account.subaccount_number) {
                 // The regular sync calls without the 'historical' flag, so it remains fast
                 await syncSingleSubaccount(account.subaccount_number, false);
            }
        }
    } catch (dbError) {
        console.error('[XPAYZ-SYNC-DB-ERROR] Could not fetch subaccounts from database:', dbError);
    } finally {
        isSyncing = false;
    }
};

const main = () => {
    console.log('--- XPayz Sync Service Started (v3.0 - Hard Refresh Enabled) ---');
    
    // Perform a standard (fast) sync on startup
    syncAllSubaccounts();

    cron.schedule('*/5 * * * * *', syncAllSubaccounts);
    console.log('[XPAYZ-SYNC] Recurring 5-second sync scheduled.');
};

if (require.main === module) {
    main();
}

module.exports = { syncSingleSubaccount };