// backend/xpayzSyncService.js

require('dotenv').config();
const cron = require('node-cron');
const path = require('path');
const { execa } = require('execa');
const pool = require('./config/db');

let isSyncing = false;

const syncSingleSubaccount = async (subaccountId) => {
    if (!subaccountId) {
        console.error('[XPAYZ-SYNC-JIT] No subaccount ID provided for on-demand sync.');
        return;
    }
    try {
        const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
        const scriptPath = path.join(__dirname, 'python_scripts', 'xpayz_subaccount_exporter.py');
        
        const subprocess = execa(
            pythonExecutable, 
            [scriptPath, subaccountId],
            {
                encoding: 'utf8',
                env: { ...process.env, PYTHONUTF8: '1' }
            }
        );

        subprocess.stdout.pipe(process.stdout);
        subprocess.stderr.pipe(process.stderr);

        await subprocess;

    } catch (error) {
        console.error(`[XPAYZ-SYNC-CRITICAL] Execution failed for subaccount ${subaccountId}.`);
    }
};

const syncAllSubaccounts = async () => {
    if (isSyncing) {
        return; // Silently exit if already running
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
                 await syncSingleSubaccount(account.subaccount_number);
            }
        }
    } catch (dbError) {
        console.error('[XPAYZ-SYNC-DB-ERROR] Could not fetch subaccounts from database:', dbError);
    } finally {
        isSyncing = false;
    }
};

const main = async () => {
    console.log('--- XPayz Multi-Account Sync Service Started (v2.1 - 5 Second Interval) ---');
    
    await syncAllSubaccounts();

    // === THE CRON SCHEDULE CHANGE ===
    cron.schedule('*/5 * * * * *', syncAllSubaccounts);
    console.log('[XPAYZ-SYNC] Recurring sync scheduled to run every 5 seconds.');
};

if (require.main === module) {
    main();
}

module.exports = { syncSingleSubaccount };