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
    
    try {
        // Step 1: Fetch all available, unused deposits for the partner account.
        const [availableDeposits] = await pool.query(
            `SELECT id, amount, sender_name_normalized, JSON_UNQUOTE(JSON_EXTRACT(raw_details, '$.sender_document')) as sender_document
             FROM xpayz_transactions
             WHERE subaccount_id = ? AND operation_direct = 'in' AND is_used = 0 AND transaction_date >= DATE_SUB(NOW(), INTERVAL 48 HOUR)`,
            [PARTNER_XPAYZ_SUBACCOUNT_ID]
        );

        if (availableDeposits.length === 0) {
            isLinking = false;
            return; // No available deposits, nothing to do.
        }

        // Step 2: Fetch all unlinked orders.
        let [unlinkedOrders] = await pool.query(
            `SELECT id, amount, payer_name, payer_document 
             FROM bridge_transactions 
             WHERE xpayz_transaction_id IS NULL AND status = 'pending' AND created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)`
        );

        if (unlinkedOrders.length === 0) {
            isLinking = false;
            return; // No unlinked orders, nothing to do.
        }

        let linkedCount = 0;

        // Step 3: Loop through each available deposit and try to find the best (latest) order for it.
        for (const deposit of availableDeposits) {
            const potentialMatches = unlinkedOrders.filter(order => {
                // Match by amount first
                if (order.amount != deposit.amount) {
                    return false;
                }
                // Then, match by EITHER document number OR name
                const documentMatch = deposit.sender_document && deposit.sender_document === order.payer_document;
                const nameMatch = deposit.sender_name_normalized && (deposit.sender_name_normalized.includes(order.payer_name.toLowerCase()) || order.payer_name.toLowerCase().includes(deposit.sender_name_normalized));
                
                return documentMatch || nameMatch;
            });

            if (potentialMatches.length > 0) {
                // Sort the matches to find the latest one (highest ID or latest created_at)
                potentialMatches.sort((a, b) => b.id - a.id);
                const latestOrder = potentialMatches[0];

                const connection = await pool.getConnection();
                try {
                    await connection.beginTransaction();

                    // Atomically lock the deposit
                    const [lockResult] = await connection.query(
                        'UPDATE xpayz_transactions SET is_used = 1 WHERE id = ? AND is_used = 0',
                        [deposit.id]
                    );

                    // If the lock was successful (affectedRows > 0), link the latest order
                    if (lockResult.affectedRows > 0) {
                        await connection.query(
                            'UPDATE bridge_transactions SET xpayz_transaction_id = ? WHERE id = ?',
                            [deposit.id, latestOrder.id]
                        );
                        await connection.commit();
                        linkedCount++;
                        console.log(`[BRIDGE-LINKER] SUCCESS: Linked Deposit #${deposit.id} to LATEST Order #${latestOrder.id}.`);
                        
                        // Remove the used deposit and orders from our in-memory lists to prevent re-matching in this cycle
                        unlinkedOrders = unlinkedOrders.filter(o => o.id !== latestOrder.id);

                    } else {
                        // The deposit was claimed by another process between our SELECT and UPDATE. This is safe.
                        await connection.rollback();
                    }
                } catch (e) {
                    await connection.rollback();
                    console.error(`[BRIDGE-LINKER-ERROR] Transaction failed for Deposit #${deposit.id}:`, e.message);
                } finally {
                    connection.release();
                }
            }
        }
    } catch (error) {
        console.error('[BRIDGE-LINKER-ERROR] Main process failed:', error.message);
    } finally {
        isLinking = false;
    }
};


const main = () => {
    console.log('--- Bridge Linker Service Started (v9.0 - LATEST-ORDER ATOMIC) ---');
    linkTransactions();
    cron.schedule('*/5 * * * * *', linkTransactions);
    console.log('[BRIDGE-LINKER] Scheduled to run every 5s.');
};

main();