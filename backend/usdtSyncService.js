require('dotenv').config();
const cron = require('node-cron');
const path = require('path');
const { execa } = require('execa');
const pool = require('./config/db');
const { formatForMySQL } = require('./utils/dateFormatter');

let isSyncing = false;

const syncUsdtTransactions = async () => {
    if (isSyncing) {
        console.log('[USDT-SYNC] Sync is already in progress. Skipping this run.');
        return;
    }
    isSyncing = true;
    console.log('[USDT-SYNC] Starting sync cycle for all enabled USDT wallets...');

    try {
        const [wallets] = await pool.query('SELECT wallet_address FROM usdt_wallets WHERE is_enabled = 1');
        if (wallets.length === 0) {
            console.log('[USDT-SYNC] No enabled wallets to sync.');
            isSyncing = false;
            return;
        }

        const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
        const scriptPath = path.join(__dirname, 'python_scripts', 'usdt_sync.py');
        let totalUpserted = 0;

        for (const wallet of wallets) {
            const address = wallet.wallet_address;
            console.log(`[USDT-SYNC] Fetching transactions for wallet: ${address}`);
            
            try {
                const { stdout } = await execa(pythonExecutable, [scriptPath, address]);
                const transactions = JSON.parse(stdout);

                if (transactions.error) {
                    console.error(`[USDT-SYNC-PYTHON-ERROR] for ${address}:`, transactions.error);
                    continue; // Move to next wallet
                }

                if (transactions.length > 0) {
                    const values = transactions.map(tx => [
                        tx.txid,
                        formatForMySQL(tx.time_iso),
                        tx.from_address,
                        tx.to_address,
                        tx.amount_usdt
                    ]);

                    const query = `
                        INSERT INTO usdt_transactions (txid, time_iso, from_address, to_address, amount_usdt)
                        VALUES ?
                        ON DUPLICATE KEY UPDATE txid=txid;
                    `;
                    const [result] = await pool.query(query, [values]);
                    if(result.affectedRows > 0) {
                        totalUpserted += result.affectedRows;
                    }
                }
            } catch (error) {
                console.error(`[USDT-SYNC-CRITICAL] Failed to sync wallet ${address}:`, error.stderr || error.message);
            }
        }
        console.log(`[USDT-SYNC] Sync cycle complete. Total new transactions upserted: ${totalUpserted}.`);

    } catch (dbError) {
        console.error('[USDT-SYNC-DB-ERROR] Could not fetch wallets from database:', dbError);
    } finally {
        isSyncing = false;
    }
};

const main = () => {
    console.log('--- USDT Sync Service Started ---');
    syncUsdtTransactions(); // Run once on startup
    cron.schedule('*/1 * * * *', syncUsdtTransactions); // Run every minute
    console.log('[USDT-SYNC] Scheduled to run every minute.');
};

main();