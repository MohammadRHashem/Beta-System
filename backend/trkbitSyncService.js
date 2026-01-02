require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const pool = require('./config/db');
const { format, differenceInHours } = require('date-fns');

// Configuration
const API_URL = "https://shared-api.trkbit.co/supplier/bank/legacy/bank/brasilcash/account/5602362";
const HISTORY_START_DATE = '2024-01-01'; 

let isSyncing = false;

const fetchAndStoreTransactions = async (customStartDate = null) => {
    if (isSyncing) {
        console.log('[TRKBIT-SYNC] Sync is already in progress. Skipping this run.');
        return;
    }
    isSyncing = true;
    
    try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const startDate = customStartDate || today;

        console.log(`[TRKBIT-SYNC] Starting sync cycle from ${startDate} to ${today}...`);
        
        const { data } = await axios.get(API_URL, {
            params: { start: startDate, end: today },
            timeout: 90000
        });

        if (data.code !== 200 || !data.data || !data.data.inputs) {
            throw new Error('Invalid API response structure.');
        }

        const allTransactions = [];
        if (Array.isArray(data.data.inputs)) {
            data.data.inputs.forEach(dayGroup => {
                if (dayGroup.inputs && Array.isArray(dayGroup.inputs)) {
                    allTransactions.push(...dayGroup.inputs);
                }
            });
        }

        if (allTransactions.length === 0) {
            console.log(`[TRKBIT-SYNC] No new transactions found for range ${startDate} - ${today}.`);
            isSyncing = false;
            return;
        }

        console.log(`[TRKBIT-SYNC] Found ${allTransactions.length} transactions. Pre-processing for auto-lock...`);
        
        // --- THIS IS THE NEW AUTO-LOCK LOGIC ---
        const [autoLockRows] = await pool.query("SELECT chave_pix FROM subaccounts WHERE account_type = 'cross' AND auto_lock_deposits = 1");
        const autoLockPixKeys = new Set(autoLockRows.map(r => r.chave_pix));
        console.log(`[TRKBIT-SYNC] Found ${autoLockPixKeys.size} Chave PIX accounts to auto-lock.`);
        // ------------------------------------------

        const connection = await pool.getConnection();
        try {
            const query = `
                INSERT INTO trkbit_transactions 
                (uid, tx_id, e2e_id, tx_date, amount, tx_pix_key, tx_type, tx_payer_name, tx_payer_id, raw_data, is_used)
                VALUES ?
                ON DUPLICATE KEY UPDATE 
                    tx_id = VALUES(tx_id),
                    tx_payer_name = VALUES(tx_payer_name),
                    tx_pix_key = VALUES(tx_pix_key),
                    updated_at = NOW();
            `;

            const chunkSize = 500;
            for (let i = 0; i < allTransactions.length; i += chunkSize) {
                const chunk = allTransactions.slice(i, i + chunkSize);
                const values = chunk.map(tx => {
                    // Check if the transaction's PIX key is in our auto-lock set
                    const isUsedFlag = (tx.tx_type === 'C' && autoLockPixKeys.has(tx.tx_pix_key)) ? 1 : 0;
                    return [
                        tx.uid, tx.tx_id, tx.e2e_id, tx.tx_date,
                        parseFloat(tx.amount), tx.tx_pix_key, tx.tx_type,
                        tx.tx_payer_name, tx.tx_payer_id, JSON.stringify(tx),
                        isUsedFlag // Add the flag to the values array
                    ];
                });
                
                const [result] = await connection.query(query, [values]);
                console.log(`[TRKBIT-SYNC] Processed chunk ${Math.floor(i/chunkSize) + 1}. Affected rows: ${result.affectedRows}`);
            }
            
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('[TRKBIT-SYNC-ERROR]', error.message);
    } finally {
        isSyncing = false;
    }
};

// --- THIS IS THE FINAL, MORE EFFICIENT STARTUP LOGIC ---
const main = async () => {
    console.log('--- Trkbit Sync Service Started (Self-Healing v2) ---');

    try {
        const [[{ count }]] = await pool.query("SELECT COUNT(*) as count FROM trkbit_transactions");

        if (count === 0) {
            // Case A: Database is empty. Perform full initial history sync.
            console.log('[TRKBIT-SYNC] Database is empty. Performing INITIAL HISTORY SYNC...');
            await fetchAndStoreTransactions(HISTORY_START_DATE);
            console.log('[TRKBIT-SYNC] Initial history sync complete.');
        } else {
            // Case B & C: Database has data. Check how old the latest entry is.
            const [[{ latest_tx_date }]] = await pool.query("SELECT MAX(tx_date) as latest_tx_date FROM trkbit_transactions");
            
            const now = new Date();
            const lastSyncDate = new Date(latest_tx_date);
            const hoursSinceLastSync = differenceInHours(now, lastSyncDate);

            // If the last sync was more than 2 hours ago, assume downtime.
            if (hoursSinceLastSync > 2) {
                // EFFICIENT CATCH-UP: Start the sync from the date of the last known transaction.
                const catchUpStartDate = format(lastSyncDate, 'yyyy-MM-dd');
                console.log(`[TRKBIT-SYNC] Last transaction is from over 2 hours ago (at ${lastSyncDate.toLocaleString()}). Assuming downtime.`);
                console.log(`[TRKBIT-SYNC] Performing CATCH-UP sync starting from ${catchUpStartDate}...`);
                await fetchAndStoreTransactions(catchUpStartDate);
            } else {
                // If data is recent, just sync today to be safe.
                console.log(`[TRKBIT-SYNC] Data is recent. Performing standard incremental sync for today.`);
                await fetchAndStoreTransactions(null); 
            }
        }

    } catch (e) {
        console.error('[TRKBIT-SYNC] FATAL: Failed to run startup sync logic:', e.message);
    }

    // Schedule the normal, recurring sync to run every minute (fetching only today's data)
    cron.schedule('* * * * *', () => fetchAndStoreTransactions(null));
    console.log('[TRKBIT-SYNC] Recurring 1-minute sync for "today" has been scheduled.');
};

if (require.main === module) {
    main();
}

module.exports = { fetchAndStoreTransactions };