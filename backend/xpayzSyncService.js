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
    console.log(`[XPAYZ-SYNC] ==> Starting sync for subaccount ID: ${subaccountId}...`);
    try {
        const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
        const scriptPath = path.join(__dirname, 'python_scripts', 'xpayz_subaccount_exporter.py');
        
        // --- THIS IS THE FIX ---
        // We use execa() to create a subprocess
        const subprocess = execa(
            pythonExecutable, 
            [scriptPath, subaccountId],
            {
                encoding: 'utf8',
                env: { ...process.env, PYTHONUTF8: '1' }
            }
        );

        // Pipe the Python script's stdout and stderr directly to the Node.js process's streams
        // This will make Python's `print()` statements appear in your PM2 logs in real-time.
        subprocess.stdout.pipe(process.stdout);
        subprocess.stderr.pipe(process.stderr);

        // Wait for the subprocess to finish
        await subprocess;
        // --- END OF FIX ---

        console.log(`[XPAYZ-SYNC] <== Sync finished for ${subaccountId}.`);
    } catch (error) {
        // The error will have already been piped to stderr, but we log a final message.
        console.error(`[XPAYZ-SYNC-CRITICAL] Execution failed for subaccount ${subaccountId}.`);
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

const main = async () => {
    console.log('--- XPayz Multi-Account Sync Service Started ---');
    
    // 1. Run the first sync on startup and WAIT for it to complete.
    console.log('[XPAYZ-SYNC] Performing initial startup sync. This may take a while...');
    await syncAllSubaccounts();
    console.log('[XPAYZ-SYNC] Initial startup sync complete.');

    // 2. ONLY AFTER the first sync is done, schedule the recurring job for the future.
    cron.schedule('* * * * *', syncAllSubaccounts);
    console.log('[XPAYZ-SYNC] Recurring sync scheduled to run every minute.');
};

// We only run main if this file is executed directly.
// This allows whatsappService.js to import the syncSingleSubaccount function without starting the cron job again.
if (require.main === module) {
    main();
}

// === MODIFICATION 2: Export the function so other services can call it ===
module.exports = { syncSingleSubaccount };