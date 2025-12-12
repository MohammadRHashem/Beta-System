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
    console.log('[BRIDGE-LINKER] Running job with RESILIENT, SUBSTRING-BASED logic...');

    try {
        // === THE DEFINITIVE, RESILIENT FIX ===
        // This query now uses a bi-directional LIKE to match names,
        // allowing for one name to be a subset of the other.
        const linkQuery = `
            UPDATE bridge_transactions AS bt
            JOIN xpayz_transactions AS xt 
                ON bt.amount = xt.amount
                AND (
                    xt.sender_name_normalized LIKE CONCAT('%', LOWER(bt.payer_name), '%')
                    OR
                    LOWER(bt.payer_name) LIKE CONCAT('%', xt.sender_name_normalized, '%')
                )
            SET bt.xpayz_transaction_id = xt.id
            WHERE bt.xpayz_transaction_id IS NULL 
              AND xt.subaccount_id = ?
              AND xt.operation_direct = 'in'
              AND xt.transaction_date >= DATE_SUB(NOW(), INTERVAL 48 HOUR);
        `;
        
        const [result] = await pool.query(linkQuery, [PARTNER_XPAYZ_SUBACCOUNT_ID]);

        if (result.affectedRows > 0) {
            console.log(`[BRIDGE-LINKER] SUCCESS! Linked ${result.affectedRows} new transaction(s).`);
        } else {
            console.log('[BRIDGE-LINKER] No new transactions found to link with the resilient logic.');
        }

    } catch (error) {
        console.error('[BRIDGE-LINKER-ERROR] Failed to run linking job:', error.message);
    } finally {
        isLinking = false;
    }
};

const main = () => {
    console.log('--- Bridge Linker Service Started (v2.1 - Resilient Fix) ---');
    linkTransactions();
    cron.schedule('*/5 * * * * *', linkTransactions);
    console.log('[BRIDGE-LINKER] Scheduled to run every 5s.');
};

main();