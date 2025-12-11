// backend/services/bridgeLinkerService.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cron = require('node-cron');
const pool = require('../config/db');

const PARTNER_SUBACCOUNT_NUMBER = process.env.PARTNER_SUBACCOUNT_NUMBER;

let isLinking = false;

const linkTransactions = async () => {
    if (isLinking) {
        console.log('[BRIDGE-LINKER] Linking is already in progress. Skipping run.');
        return;
    }
    if (!PARTNER_SUBACCOUNT_NUMBER) {
        console.log('[BRIDGE-LINKER] PARTNER_SUBACCOUNT_NUMBER not set in .env. Skipping.');
        return;
    }

    isLinking = true;
    console.log('[BRIDGE-LINKER] Running job to link bridge transactions to xpayz transactions...');

    try {
        // This is the core linking logic based on Amount, Payer Document, and Subaccount ID.
        const linkQuery = `
            UPDATE bridge_transactions AS bt
            JOIN xpayz_transactions AS xt 
                ON bt.amount = xt.amount 
                AND INSTR(xt.sender_name, bt.payer_document) > 0
            SET bt.xpayz_transaction_id = xt.id
            WHERE bt.xpayz_transaction_id IS NULL 
              AND xt.subaccount_id = ?
              AND xt.transaction_date >= DATE_SUB(NOW(), INTERVAL 48 HOUR);
        `;
        
        const [result] = await pool.query(linkQuery, [PARTNER_SUBACCOUNT_NUMBER]);

        if (result.affectedRows > 0) {
            console.log(`[BRIDGE-LINKER] Success! Linked ${result.affectedRows} new transaction(s).`);
        } else {
            console.log('[BRIDGE-LINKER] No new transactions to link.');
        }

    } catch (error) {
        console.error('[BRIDGE-LINKER-ERROR] Failed to run linking job:', error.message);
    } finally {
        isLinking = false;
    }
};

const main = () => {
    console.log('--- Bridge Linker Service Started ---');
    linkTransactions(); // Run once on startup
    cron.schedule('* * * * *', linkTransactions); // Run every minute
    console.log('[BRIDGE-LINKER] Scheduled to run every minute.');
};

main();