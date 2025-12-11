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
    console.log('[BRIDGE-LINKER] Running job with DEFINITIVE NAME-BASED logic...');

    try {
        // === THE DEFINITIVE, FINAL FIX ===
        // This query now joins on amount AND by comparing the pre-normalized sender_name from the xpayz table
        // against the lowercase payer_name from the bridge table. This is robust and correct.
        const linkQuery = `
            UPDATE bridge_transactions AS bt
            JOIN xpayz_transactions AS xt 
                ON bt.amount = xt.amount
                AND xt.sender_name_normalized = LOWER(bt.payer_name)
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
            console.log('[BRIDGE-LINKER] No new transactions found to link with the new logic.');
        }

    } catch (error) {
        console.error('[BRIDGE-LINKER-ERROR] Failed to run linking job:', error.message);
    } finally {
        isLinking = false;
    }
};

const main = () => {
    console.log('--- Bridge Linker Service Started (v2.0 - DEFINITIVE FIX) ---');
    linkTransactions();
    cron.schedule('* * * * *', linkTransactions);
    console.log('[BRIDGE-LINKER] Scheduled to run every minute.');
};

main();