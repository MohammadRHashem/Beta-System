const pool = require('../config/db');
const whatsappService = require('../services/whatsappService');

exports.getPendingInvoices = async (req, res) => {
    try {
        const query = `
            SELECT 
                i.id, i.message_id, i.amount, i.sender_name, i.recipient_name, 
                i.received_at, wg.group_name as source_group_name
            FROM forwarded_invoices fi
            JOIN invoices i ON fi.original_message_id = i.message_id
            LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
            WHERE fi.is_confirmed = 0 AND i.is_deleted = 0
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
    const { amount, recipientName } = req.query;
    if (!amount) {
        return res.json([]);
    }

    try {
        const searchAmount = parseFloat(amount);
        if (isNaN(searchAmount)) return res.json([]);
        const margin = 0.01;
        let candidates = [];
        const recipientLower = (recipientName || '').toLowerCase();

        if (!recipientName || recipientLower.includes('upgrade zone')) {
            const [xpayz] = await pool.query(`
                SELECT id, 'XPayz' as source, sender_name as name, transaction_date as date, amount 
                FROM xpayz_transactions WHERE is_used = 0 AND operation_direct = 'in' AND amount BETWEEN ? AND ?
            `, [searchAmount - margin, searchAmount + margin]);
            candidates.push(...xpayz);
        }
        
        if (!recipientName || recipientLower.includes('cross') || recipientLower.includes('trkbit')) {
            const [trkbit] = await pool.query(`
                SELECT uid as id, 'Trkbit' as source, tx_payer_name as name, tx_date as date, amount 
                FROM trkbit_transactions WHERE is_used = 0 AND amount BETWEEN ? AND ?
            `, [searchAmount - margin, searchAmount + margin]);
            candidates.push(...trkbit);
        }
        
        if (!recipientName || recipientLower.includes('usdt')) {
            const [usdt] = await pool.query(`
                SELECT id, 'USDT' as source, CONCAT(LEFT(from_address, 6), '...', RIGHT(from_address, 6)) as name, time_iso as date, amount_usdt as amount
                FROM usdt_transactions WHERE is_used = 0 AND amount_usdt BETWEEN ? AND ?
            `, [searchAmount - margin, searchAmount + margin]);
            candidates.push(...usdt);
        }

        candidates.sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(candidates);

    } catch (error) {
        console.error('[MANUAL-REVIEW] Failed to fetch candidates:', error);
        res.status(500).json({ message: 'Failed to fetch candidates.' });
    }
};

exports.confirmInvoice = async (req, res) => {
    const io = req.app.get('io');
    const { messageId, linkedTransactionId, source } = req.body;

    if (!messageId) return res.status(400).json({ message: 'Message ID required.' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        if (linkedTransactionId && source) {
            let table = '';
            let idColumn = 'id';
            if (source === 'XPayz') table = 'xpayz_transactions';
            else if (source === 'Trkbit') { table = 'trkbit_transactions'; idColumn = 'uid'; }
            else if (source === 'USDT') table = 'usdt_transactions';
            else if (source === 'Alfa') { table = 'alfa_transactions'; idColumn = 'transaction_id'; }

            if (table) {
                if (source !== 'Alfa') {
                    const [updateResult] = await connection.query(
                        `UPDATE ${table} SET is_used = 1 WHERE ${idColumn} = ? AND is_used = 0`, 
                        [linkedTransactionId]
                    );
                    if (updateResult.affectedRows === 0) {
                        throw new Error('Transaction already used or not found.');
                    }
                }
            }
            
            await connection.query(
                'UPDATE invoices SET linked_transaction_id = ?, linked_transaction_source = ? WHERE message_id = ?',
                [linkedTransactionId, source, messageId]
            );
        }
        
        await connection.query(
            'UPDATE forwarded_invoices SET is_confirmed = 1 WHERE original_message_id = ?', 
            [messageId]
        );

        await connection.commit();
        whatsappService.sendManualConfirmation(messageId);
        
        if (io) {
            io.emit('manual:refresh');
            io.emit('invoices:updated');
        }

        res.json({ message: 'Invoice confirmed and linked successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('[MANUAL-REVIEW] Confirm failed:', error);
        res.status(500).json({ message: error.message || 'Failed to confirm invoice.' });
    } finally {
        connection.release();
    }
};

exports.rejectInvoice = async (req, res) => {
    const io = req.app.get('io');
    const { messageId } = req.body;
    if (!messageId) return res.status(400).json({ message: 'Message ID required.' });

    try {
        await pool.query('UPDATE forwarded_invoices SET is_confirmed = 2 WHERE original_message_id = ?', [messageId]);
        await pool.query('UPDATE invoices SET is_deleted = 1 WHERE message_id = ?', [messageId]);
        whatsappService.sendManualRejection(messageId);
        if (io) {
            io.emit('manual:refresh');
            io.emit('invoices:updated');
        }
        res.json({ message: 'Invoice rejected.' });
    } catch (error) {
        console.error('[MANUAL-REVIEW] Reject failed:', error);
        res.status(500).json({ message: 'Failed to reject invoice.' });
    }
};

exports.clearAllPending = async (req, res) => {
    const io = req.app.get('io');
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ message: 'An array of message IDs is required.' });
    }

    try {
        await pool.query(
            'UPDATE forwarded_invoices SET is_confirmed = 1 WHERE original_message_id IN (?)',
            [messageIds]
        );
        if (io) {
            io.emit('manual:refresh');
        }
        res.json({ message: `Successfully cleared ${messageIds.length} items from the queue.` });
    } catch (error) {
        console.error('[MANUAL-CLEAR-ALL] Failed to clear pending invoices:', error.message);
        res.status(500).json({ message: 'A server error occurred.' });
    }
};

exports.getCandidateInvoices = async (req, res) => {
    const { amount } = req.query;
    if (!amount) return res.status(400).json({ message: 'Amount is required.' });
    
    try {
        const searchAmount = parseFloat(amount);
        const margin = 0.01; 
        const query = `
            SELECT
                i.id, i.message_id, i.amount, i.sender_name, i.recipient_name,
                wg.group_name as source_group_name, i.received_at
            FROM invoices i
            LEFT JOIN forwarded_invoices fi ON i.message_id = fi.original_message_id
            LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
            WHERE
                (fi.is_confirmed = 0 OR fi.original_message_id IS NULL)
                AND i.is_deleted = 0
                AND i.linked_transaction_id IS NULL
                AND CAST(REPLACE(i.amount, ',', '') AS DECIMAL(20, 2)) BETWEEN ? AND ?
            ORDER BY i.received_at DESC;
        `;
        const [invoices] = await pool.query(query, [searchAmount - margin, searchAmount + margin]);
        res.json(invoices);
    } catch (error) {
        console.error('[MANUAL-REVIEW] Failed to fetch candidate invoices:', error);
        res.status(500).json({ message: 'Failed to fetch candidate invoices.' });
    }
};