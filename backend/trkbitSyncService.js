require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const pool = require('./config/db');
const { format } = require('date-fns');

// Configuration
const API_URL = "https://shared-api.trkbit.co/supplier/bank/legacy/bank/brasilcash/account/5602362";

let isSyncing = false;

const fetchAndStoreTransactions = async () => {
    if (isSyncing) return;
    isSyncing = true;
    console.log('[TRKBIT-SYNC] Starting sync cycle...');

    try {
        // Fetch data for the current day
        const today = format(new Date(), 'yyyy-MM-dd');
        
        const { data } = await axios.get(API_URL, {
            params: { start: today, end: today }
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
            console.log('[TRKBIT-SYNC] No transactions found for today.');
            isSyncing = false;
            return;
        }

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

            const values = allTransactions.map(tx => [
                tx.uid,
                tx.tx_id,
                tx.e2e_id,
                tx.tx_date, // format "2025-11-26 20:57:11"
                parseFloat(tx.amount),
                tx.tx_type,
                tx.tx_payer_name,
                tx.tx_payer_id,
                JSON.stringify(tx)
            ]);

            const [result] = await connection.query(query, [values]);
            if (result.affectedRows > 0) {
                console.log(`[TRKBIT-SYNC] Upserted/Ignored ${result.affectedRows} rows.`);
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

// Run independently if executed directly
if (require.main === module) {
    console.log('--- Trkbit Sync Service Started ---');
    fetchAndStoreTransactions();
    cron.schedule('* * * * *', fetchAndStoreTransactions);
}

module.exports = { fetchAndStoreTransactions };