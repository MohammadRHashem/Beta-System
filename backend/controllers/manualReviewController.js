const pool = require('../config/db');
const whatsappService = require('../services/whatsappService');

exports.getPendingInvoices = async (req, res) => {
    try {
        // Fetch invoices that are in the forwarding table but NOT confirmed yet
        const query = `
            SELECT 
                i.id, 
                i.message_id, 
                i.amount, 
                i.sender_name, 
                i.recipient_name, 
                i.received_at,
                i.raw_json_data,
                fi.destination_group_jid,
                wg.group_name as source_group_name
            FROM forwarded_invoices fi
            JOIN invoices i ON fi.original_message_id = i.message_id
            LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
            WHERE fi.is_confirmed = 0 
            AND i.is_deleted = 0
            ORDER BY i.received_at ASC
        `;
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('[MANUAL-REVIEW] Failed to fetch pending:', error);
        res.status(500).json({ message: 'Failed to fetch pending invoices.' });
    }
};

exports.getCandidates = async (req, res) => {
    const { amount } = req.query;
    if (!amount) return res.json([]);

    try {
        const searchAmount = parseFloat(amount);
        const margin = 0.01; // Strict margin

        // 1. XPayz Candidates
        const [xpayz] = await pool.query(`
            SELECT id, 'XPayz' as source, sender_name as name, transaction_date as date, amount 
            FROM xpayz_transactions 
            WHERE is_used = 0 AND operation_direct = 'in' 
            AND amount BETWEEN ? AND ?
            ORDER BY transaction_date DESC
        `, [searchAmount - margin, searchAmount + margin]);

        // 2. Trkbit Candidates
        const [trkbit] = await pool.query(`
            SELECT id, 'Trkbit' as source, tx_payer_name as name, tx_date as date, amount 
            FROM trkbit_transactions 
            WHERE is_used = 0 
            AND amount BETWEEN ? AND ?
            ORDER BY tx_date DESC
        `, [searchAmount - margin, searchAmount + margin]);

        // 3. USDT Candidates (Optional, usually confirmed automatically, but good to have)
        const [usdt] = await pool.query(`
            SELECT id, 'USDT' as source, CONCAT(LEFT(from_address, 6), '...', RIGHT(from_address, 6)) as name, time_iso as date, amount_usdt as amount
            FROM usdt_transactions
            WHERE is_used = 0
            AND amount_usdt BETWEEN ? AND ?
            ORDER BY time_iso DESC
        `, [searchAmount - margin, searchAmount + margin]);

        const candidates = [...xpayz, ...trkbit, ...usdt];
        res.json(candidates);

    } catch (error) {
        console.error('[MANUAL-REVIEW] Failed to fetch candidates:', error);
        res.status(500).json({ message: 'Failed to fetch candidates.' });
    }
};

exports.confirmInvoice = async (req, res) => {
    const { messageId, linkedTransactionId, source } = req.body;

    if (!messageId) return res.status(400).json({ message: 'Message ID required.' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. If linked, update the transaction table (Atomic Lock)
        if (linkedTransactionId && source) {
            let table = '';
            if (source === 'XPayz') table = 'xpayz_transactions';
            else if (source === 'Trkbit') table = 'trkbit_transactions';
            else if (source === 'USDT') table = 'usdt_transactions';

            if (table) {
                const [updateResult] = await connection.query(
                    `UPDATE ${table} SET is_used = 1 WHERE id = ? AND is_used = 0`, 
                    [linkedTransactionId]
                );
                if (updateResult.affectedRows === 0) {
                    throw new Error('Transaction already used or not found.');
                }
            }
        }

        // 2. Update Forwarding Status
        await connection.query(
            'UPDATE forwarded_invoices SET is_confirmed = 1 WHERE original_message_id = ?', 
            [messageId]
        );

        await connection.commit();

        // 3. Trigger Bot Actions (Non-blocking)
        whatsappService.sendManualConfirmation(messageId);
        
        // 4. Notify Frontend
        req.io.emit('manual:refresh');
        req.io.emit('invoices:updated');

        res.json({ message: 'Invoice confirmed successfully.' });

    } catch (error) {
        await connection.rollback();
        console.error('[MANUAL-REVIEW] Confirm failed:', error);
        res.status(500).json({ message: error.message || 'Failed to confirm invoice.' });
    } finally {
        connection.release();
    }
};

exports.rejectInvoice = async (req, res) => {
    const { messageId } = req.body;
    if (!messageId) return res.status(400).json({ message: 'Message ID required.' });

    try {
        // Update DB first
        await pool.query('UPDATE forwarded_invoices SET is_confirmed = 2 WHERE original_message_id = ?', [messageId]);
        await pool.query('UPDATE invoices SET is_deleted = 1 WHERE message_id = ?', [messageId]);

        // Trigger Bot
        whatsappService.sendManualRejection(messageId);

        // Notify Frontend
        req.io.emit('manual:refresh');
        req.io.emit('invoices:updated');

        res.json({ message: 'Invoice rejected.' });
    } catch (error) {
        console.error('[MANUAL-REVIEW] Reject failed:', error);
        res.status(500).json({ message: 'Failed to reject invoice.' });
    }
};