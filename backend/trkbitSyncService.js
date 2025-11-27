require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const pool = require('./config/db');
const { format } = require('date-fns');

// Configuration
const API_URL = "https://shared-api.trkbit.co/supplier/bank/legacy/bank/brasilcash/account/5602362";
// Date to start fetching from if the database is empty (YYYY-MM-DD)
const HISTORY_START_DATE = '2024-01-01'; 

let isSyncing = false;

const fetchAndStoreTransactions = async (customStartDate = null) => {
    if (isSyncing) return;
    isSyncing = true;
    
    try {
        const today = format(new Date(), 'yyyy-MM-dd');
        // Use custom start date (for history) or default to today
        const startDate = customStartDate || today;

        console.log(`[TRKBIT-SYNC] Starting sync cycle from ${startDate} to ${today}...`);
        
        const { data } = await axios.get(API_URL, {
            params: { start: startDate, end: today },
            timeout: 60000 // Increased timeout for historical fetch
        });

        if (data.code !== 200 || !data.data || !data.data.inputs) {
            throw new Error('Invalid API response structure.');
        }

        // Flatten the nested structure
        const allTransactions = [];
        if (Array.isArray(data.data.inputs)) {
            data.data.inputs.forEach(dayGroup => {
                if (dayGroup.inputs && Array.isArray(dayGroup.inputs)) {
                    allTransactions.push(...dayGroup.inputs);
                }
            });
        }

        if (allTransactions.length === 0) {
            console.log(`[TRKBIT-SYNC] No transactions found for range ${startDate} - ${today}.`);
            isSyncing = false;
            return;
        }

        console.log(`[TRKBIT-SYNC] Found ${allTransactions.length} transactions. Inserting...`);

        const connection = await pool.getConnection();
        try {
            const query = `
                INSERT INTO trkbit_transactions 
                (uid, tx_id, e2e_id, tx_date, amount, tx_type, tx_payer_name, tx_payer_id, raw_data)
                VALUES ?
                ON DUPLICATE KEY UPDATE 
                    tx_id = VALUES(tx_id),
                    tx_payer_name = VALUES(tx_payer_name),
                    updated_at = NOW();
            `;

            // Process in chunks of 500 to prevent packet size errors during historical sync
            const chunkSize = 500;
            for (let i = 0; i < allTransactions.length; i += chunkSize) {
                const chunk = allTransactions.slice(i, i + chunkSize);
                const values = chunk.map(tx => [
                    tx.uid,
                    tx.tx_id,
                    tx.e2e_id,
                    tx.tx_date,
                    parseFloat(tx.amount),
                    tx.tx_type,
                    tx.tx_payer_name,
                    tx.tx_payer_id,
                    JSON.stringify(tx)
                ]);
                
                const [result] = await connection.query(query, [values]);
                console.log(`[TRKBIT-SYNC] Processed chunk ${i/chunkSize + 1}. Affected rows: ${result.affectedRows}`);
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

// Main Execution Logic
const main = async () => {
    console.log('--- Trkbit Sync Service Started ---');

    try {
        // Check if DB is empty
        const [rows] = await pool.query("SELECT COUNT(*) as count FROM trkbit_transactions");
        const count = rows[0].count;

        if (count === 0) {
            console.log('[TRKBIT-SYNC] Database is empty. Performing INITIAL HISTORY SYNC...');
            await fetchAndStoreTransactions(HISTORY_START_DATE);
            console.log('[TRKBIT-SYNC] Initial sync complete.');
        } else {
            console.log(`[TRKBIT-SYNC] Database has ${count} records. Performing standard incremental sync...`);
            await fetchAndStoreTransactions(null); // Sync only today
        }

    } catch (e) {
        console.error('[TRKBIT-SYNC] Failed to check DB status:', e.message);
    }

    // Schedule standard sync (Current Day Only)
    cron.schedule('* * * * *', () => fetchAndStoreTransactions(null));
};

if (require.main === module) {
    main();
}

module.exports = { fetchAndStoreTransactions };