require('dotenv').config();
const cron = require('node-cron');
const path = require('path');
const { execa } = require('execa');
const pool = require('./config/db');

let isSyncing = false;

// === MODIFICATION 1: Encapsulate the single-account sync logic into an exportable function ===
const syncSingleSubaccount = async (subaccountId) => {
    if (!subaccountId) {
        console.error('[XPAYZ-SYNC-JIT] No subaccount ID provided for on-demand sync.');
        return;
    }
    console.log(`[XPAYZ-SYNC-JIT] ==> Starting ON-DEMAND sync for subaccount ID: ${subaccountId}...`);
    try {
        const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
        const scriptPath = path.join(__dirname, 'python_scripts', 'xpayz_subaccount_exporter.py');
        
        const { stdout, stderr } = await execa(
            pythonExecutable, 
            [scriptPath, subaccountId],
            {
                encoding: 'utf8',
                env: { ...process.env, PYTHONUTF8: '1' }
            }
        );
        if (stderr) console.error(`[XPAYZ-SYNC-JIT-PYTHON-ERROR][${subaccountId}]`, stderr);
        if (stdout) console.log(`[XPAYZ-SYNC-JIT-PYTHON-OUT][${subaccountId}]`, stdout);
        console.log(`[XPAYZ-SYNC-JIT] On-demand sync finished for ${subaccountId}.`);
    } catch (error) {
        console.error(`[XPAYZ-SYNC-JIT-CRITICAL] Failed to execute Python script for subaccount ${subaccountId}:`, error.message);
        if (error.stderr) console.error(`[XPAYZ-SYNC-JIT-PYTHON-STDERR][${subaccountId}]:`, error.stderr);
    }
};

const syncAllSubaccounts = async () => {
    if (isSyncing) {
        console.log('[XPAYZ-SYNC] Scheduled sync is already in progress. Skipping this run.');
        return;
    }
    isSyncing = true;
    console.log('[XPAYZ-SYNC] Starting full scheduled sync for all tracked subaccounts...');

    try {
        const [subaccounts] = await pool.query('SELECT subaccount_number FROM subaccounts');
        if (subaccounts.length === 0) {
            console.log('[XPAYZ-SYNC] No subaccounts configured. Scheduled sync finished.');
            isSyncing = false;
            return;
        }

        for (const account of subaccounts) {
            // We can reuse the single-sync function here
            await syncSingleSubaccount(account.subaccount_number);
        }
    } catch (dbError) {
        console.error('[XPAYZ-SYNC-DB-ERROR] Could not fetch subaccounts from database:', dbError);
    } finally {
        isSyncing = false;
        console.log('[XPAYZ-SYNC] Full scheduled sync cycle finished.');
    }
};

const main = () => {
    console.log('--- XPayz Multi-Account Sync Service Started ---');
    syncAllSubaccounts();
    cron.schedule('* * * * *', syncAllSubaccounts);
    console.log('[XPAYZ-SYNC] Scheduled to run every minute.');
};

// We only run main if this file is executed directly.
// This allows whatsappService.js to import the syncSingleSubaccount function without starting the cron job again.
if (require.main === module) {
    main();
}

// === MODIFICATION 2: Export the function so other services can call it ===
module.exports = { syncSingleSubaccount };