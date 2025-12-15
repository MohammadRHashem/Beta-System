// backend/services/bridgeLinkerService.js --- FINAL PRODUCTION FIX v7.0 (JSON Extract) ---

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
        console.log('[BRIDGE-LINKER] FATAL: PARTNER_SUBACCOUNT_NUMBER is not set in .env. Halting.');
        return;
    }

    isLinking = true;
    
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // === THE DEFINITIVE AND FINAL FIX ===
        // This query now joins by extracting the 'sender_document' from the `raw_details` JSON field.
        // This is the guaranteed, correct way to match the transactions based on your data structure.
        // JSON_UNQUOTE is used to remove the quotes from the extracted JSON string value.
        const linkQuery = `
            UPDATE bridge_transactions AS bt
            JOIN xpayz_transactions AS xt 
                ON bt.amount = xt.amount
                AND bt.payer_document = JSON_UNQUOTE(JSON_EXTRACT(xt.raw_details, '$.sender_document'))
            SET 
                bt.xpayz_transaction_id = xt.id
            WHERE bt.xpayz_transaction_id IS NULL 
              AND xt.subaccount_id = ?
              AND xt.operation_direct = 'in'
              AND xt.is_used = 0
              AND xt.transaction_date >= DATE_SUB(NOW(), INTERVAL 48 HOUR);
        `;
        
        const [result] = await connection.query(linkQuery, [PARTNER_XPAYZ_SUBACCOUNT_ID]);

        if (result.affectedRows > 0) {
            console.log(`[BRIDGE-LINKER] SUCCESS! Linked ${result.affectedRows} new transaction(s).`);

            // Now, mark the corresponding xpayz_transactions as used.
            const markUsedQuery = `
                UPDATE xpayz_transactions
                SET is_used = 1
                WHERE id IN (
                    SELECT xpayz_transaction_id 
                    FROM bridge_transactions 
                    WHERE xpayz_transaction_id IS NOT NULL
                ) AND is_used = 0;
            `;
            const [markResult] = await connection.query(markUsedQuery);
            if (markResult.affectedRows > 0) {
                console.log(`[BRIDGE-LINKER] Marked ${markResult.affectedRows} xpayz_transactions as 'is_used = 1'.`);
            }
        }

        await connection.commit();

    } catch (error) {
        await connection.rollback();
        console.error('[BRIDGE-LINKER-ERROR] Failed to run linking job:', error.message);
    } finally {
        isLinking = false;
        if (connection) connection.release();
    }
};

const main = () => {
    console.log('--- Bridge Linker Service Started (v7.0 - FINAL FIX) ---');
    
    linkTransactions(); // Run immediately on startup
    
    cron.schedule('*/5 * * * * *', linkTransactions);
    
    console.log('[BRIDGE-LINKER] Scheduled to run every 5s.');
};

main();