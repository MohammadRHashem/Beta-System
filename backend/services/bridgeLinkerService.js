// backend/services/bridgeLinkerService.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cron = require('node-cron');
const pool = require('../config/db');

const PARTNER_XPAYZ_SUBACCOUNT_ID = process.env.PARTNER_SUBACCOUNT_NUMBER;

let isLinking = false;

const linkTransactions = async () => {
    if (isLinking) {
        return;
    }
    if (!PARTNER_XPAYZ_SUBACCOUNT_ID) {
        console.log('[BRIDGE-LINKER] FATAL: PARTNER_SUBACCOUNT_NUMBER is not set in .env. Skipping.');
        return;
    }

    isLinking = true;
    
    try {
        // === THE DEFINITIVE HYBRID FIX ===
        // This query now links a transaction if the amounts match AND EITHER:
        // 1. The document number from the bridge is found inside the raw sender name from XPayz.
        // OR
        // 2. The normalized names are subsets of each other (the previous fix).
        // This covers all possible data variations from the XPayz API.
        const linkQuery = `
            UPDATE bridge_transactions AS bt
            JOIN xpayz_transactions AS xt 
                ON bt.amount = xt.amount
                AND (
                    -- Condition A: Match by Document Number (Most Reliable)
                    -- Strips non-digits from the xpayz sender_name and checks if it contains the bridge's document number.
                    REGEXP_REPLACE(xt.sender_name, '[^0-9]+', '') LIKE CONCAT('%', bt.payer_document, '%')
                    
                    OR
                    
                    -- Condition B: Match by Name (Fallback)
                    -- Compares the normalized name from xpayz with the lowercase name from the bridge.
                    xt.sender_name_normalized LIKE CONCAT('%', LOWER(bt.payer_name), '%')
                    OR
                    LOWER(bt.payer_name) LIKE CONCAT('%', xt.sender_name_normalized, '%')
                )
            SET bt.xpayz_transaction_id = xt.id
            WHERE bt.xpayz_transaction_id IS NULL 
              AND xt.subaccount_id = ?
              AND xt.operation_direct = 'in'
              AND xt.is_used = 0
              AND xt.transaction_date >= DATE_SUB(NOW(), INTERVAL 48 HOUR);
        `;
        
        const [result] = await pool.query(linkQuery, [PARTNER_XPAYZ_SUBACCOUNT_ID]);

        if (result.affectedRows > 0) {
            console.log(`[BRIDGE-LINKER] SUCCESS! Linked ${result.affectedRows} new transaction(s) using HYBRID logic.`);
        }

    } catch (error) {
        console.error('[BRIDGE-LINKER-ERROR] Failed to run linking job:', error.message);
    } finally {
        isLinking = false;
    }
};

const main = () => {
    console.log('--- Bridge Linker Service Started (v3.0 - HYBRID FIX) ---');
    linkTransactions(); // Run immediately on startup
    cron.schedule('*/5 * * * * *', linkTransactions); // Continues to run every 5 seconds
    console.log('[BRIDGE-LINKER] Scheduled to run every 5s.');
};

main();