const pool = require('../config/db');
const whatsappService = require('../services/whatsappService');

exports.getPendingInvoices = async (req, res) => {
    try {
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
    // ... (This function remains unchanged, it's already correct)
};

// === MODIFIED FUNCTION ===
exports.confirmInvoice = async (req, res) => {
    const io = req.app.get('io');
    const { messageId, linkedTransactionId, source } = req.body;

    if (!messageId) return res.status(400).json({ message: 'Message ID required.' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. If linked, update the source transaction table (Atomic Lock)
        if (linkedTransactionId && source) {
            let table = '';
            let idColumn = 'id';
            if (source === 'XPayz') table = 'xpayz_transactions';
            else if (source === 'Trkbit') table = 'trkbit_transactions';
            else if (source === 'USDT') table = 'usdt_transactions';
            else if (source === 'Alfa') {
                // Alfa doesn't have an is_used flag, the link itself is the indicator.
                // We just need to make sure we have a valid source.
                table = null;
            }

            if (table) {
                const [updateResult] = await connection.query(
                    `UPDATE ${table} SET is_used = 1 WHERE ${idColumn} = ? AND is_used = 0`, 
                    [linkedTransactionId]
                );
                if (updateResult.affectedRows === 0) {
                    // This could happen in a race condition, it's a valid failure.
                    throw new Error('Transaction already used by another invoice or not found.');
                }
            }
            
            // --- NEW: Update the invoices table to store the link ---
            await connection.query(
                'UPDATE invoices SET linked_transaction_id = ?, linked_transaction_source = ? WHERE message_id = ?',
                [linkedTransactionId, source, messageId]
            );
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

exports.rejectInvoice = async (req, res) => { /* ... (This function remains unchanged) ... */ };

// === NEW FUNCTION 1 ===
exports.confirmAllInvoices = async (req, res) => {
    const io = req.app.get('io');
    const { messageIds } = req.body;
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ message: 'An array of message IDs is required.' });
    }

    let successCount = 0;
    let errorCount = 0;

    // Process sequentially to avoid overwhelming the WhatsApp service
    for (const messageId of messageIds) {
        try {
            // Update forwarding status
            await pool.query(
                'UPDATE forwarded_invoices SET is_confirmed = 1 WHERE original_message_id = ?', 
                [messageId]
            );
            // Trigger bot reply
            whatsappService.sendManualConfirmation(messageId);
            successCount++;
        } catch (error) {
            console.error(`[MANUAL-CONFIRM-ALL] Failed to process ${messageId}:`, error.message);
            errorCount++;
        }
    }

    if (io) {
        io.emit('manual:refresh');
        io.emit('invoices:updated');
    }

    res.json({ message: `Operation complete. Confirmed: ${successCount}, Failed: ${errorCount}.` });
};

// === NEW FUNCTION 2 ===
exports.getCandidateInvoices = async (req, res) => {
    const { amount } = req.query;
    if (!amount) {
        return res.status(400).json({ message: 'Amount is required.' });
    }
    
    try {
        const searchAmount = parseFloat(amount);
        // Use a small margin for float comparison
        const margin = 0.01; 

        // Find invoices that have been forwarded but are not yet confirmed
        const query = `
            SELECT
                i.id,
                i.message_id,
                i.amount,
                i.sender_name,
                i.recipient_name,
                wg.group_name as source_group_name,
                i.received_at
            FROM invoices i
            JOIN forwarded_invoices fi ON i.message_id = fi.original_message_id
            LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
            WHERE
                fi.is_confirmed = 0
                AND i.is_deleted = 0
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