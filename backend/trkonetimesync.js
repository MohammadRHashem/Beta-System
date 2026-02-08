// force_trkbit_today.js
// V3: Uses intelligent parsing to extract the correct key before truncating.

require('dotenv').config();
const axios = require('axios');
const pool = require('./config/db');
const { format } = require('date-fns');

const API_URL = "https://shared-api.trkbit.co/supplier/bank/legacy/bank/brasilcash/account/5602362";

/**
 * Intelligently cleans and truncates a PIX key.
 * It first tries to find a logical endpoint (like ']') before doing a generic truncate.
 * @param {string} key The raw PIX key from the API.
 * @returns {string} A cleaned and safe key, guaranteed to be 255 chars or less.
 */
function smartTruncatePixKey(key) {
    const rawKey = key || '';
    
    // If it's already a safe length, do nothing.
    if (rawKey.length <= 255) {
        return rawKey;
    }

    // --- Intelligent Parsing ---
    // Look for the first character that indicates the start of garbage data.
    const garbageStartIndex = rawKey.indexOf(']');

    if (garbageStartIndex !== -1) {
        // If we found the marker, take everything before it.
        const cleanKey = rawKey.substring(0, garbageStartIndex);
        // It's possible the clean part is STILL too long, so we truncate it as a final step.
        return cleanKey.substring(0, 255);
    }

    // --- Fallback Safety Net ---
    // If no garbage marker was found, perform a simple, safe truncate.
    console.warn(`[DATA-WARNING] A long PIX key without a ']' delimiter was found. Performing generic truncate.`);
    return rawKey.substring(0, 255);
}


const runForceSyncToday = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    console.log(`[FORCE-SYNC-TODAY] Starting ONE-TIME sync for today's date: ${today}.`);
    
    try {
        console.log(`[FORCE-SYNC-TODAY] Fetching all transactions from ${today} to ${today}.`);
        
        const { data } = await axios.get(API_URL, {
            params: { start: today, end: today },
            timeout: 90000 
        });

        if (data.code !== 200 || !data.data || !data.data.inputs) {
            throw new Error('Invalid API response structure from Trkbit.');
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
            console.log(`[FORCE-SYNC-TODAY] No transactions found for today in the API response.`);
            return;
        }

        console.log(`[FORCE-SYNC-TODAY] Found ${allTransactions.length} total transactions. Upserting into the database...`);

        const connection = await pool.getConnection();
        try {
            const query = `
                INSERT INTO trkbit_transactions 
                (uid, tx_id, e2e_id, tx_date, amount, tx_pix_key, tx_type, tx_payer_name, tx_payer_id, raw_data)
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
                
                const values = chunk.map(tx => [
                    tx.uid,
                    tx.tx_id,
                    tx.e2e_id,
                    tx.tx_date,
                    parseFloat(tx.amount),
                    // === THIS IS THE SMARTER FIX ===
                    smartTruncatePixKey(tx.tx_pix_key),
                    // ==============================
                    tx.tx_type,
                    tx.tx_payer_name,
                    tx.tx_payer_id,
                    JSON.stringify(tx)
                ]);
                
                const [result] = await connection.query(query, [values]);
                console.log(`[FORCE-SYNC-TODAY] Processed chunk ${Math.floor(i/chunkSize) + 1}. Affected rows: ${result.affectedRows}`);
            }
            
        } finally {
            connection.release();
        }

        console.log('[FORCE-SYNC-TODAY] Today\'s sync is complete.');

    } catch (error) {
        console.error('[FORCE-SYNC-TODAY-ERROR] A critical error occurred:', error.message);
    } finally {
        await pool.end();
        console.log('[FORCE-SYNC-TODAY] Database connection pool closed.');
    }
};

runForceSyncToday();