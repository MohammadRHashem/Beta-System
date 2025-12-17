const pool = require('../config/db');
const whatsappService = require('../services/whatsappService');

// GET /api/client-requests - Fetch all pending requests
exports.getPendingRequests = async (req, res) => {
    try {
        const query = `
            SELECT 
                cr.id, cr.content, cr.amount, cr.source_group_name, cr.request_type, cr.received_at,
                COALESCE(rt.color, '#E0E0E0') as type_color
            FROM client_requests cr
            LEFT JOIN request_types rt ON cr.request_type = rt.name
            WHERE cr.is_completed = 0 
            ORDER BY cr.received_at ASC
        `;
        const [requests] = await pool.query(query);
        res.json(requests);
    } catch (error) {
        console.error('[CLIENT-REQ-ERROR] Failed to fetch pending requests:', error);
        res.status(500).json({ message: 'Failed to fetch requests.' });
    }
};

// PATCH /api/client-requests/:id/complete - Mark a request as done
exports.completeRequest = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const io = req.app.get('io');

    try {
        const [[request]] = await pool.query(
            `SELECT message_id FROM client_requests WHERE id = ?`,
            [id]
        );

        if (!request) {
            return res.status(404).json({ message: 'Request not found.' });
        }

        const [result] = await pool.query(
            `UPDATE client_requests 
             SET is_completed = 1, completed_at = NOW(), completed_by_user_id = ? 
             WHERE id = ? AND is_completed = 0`,
            [userId, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Request already completed.' });
        }
        
        // Remove reaction from original message
        await whatsappService.clearReaction(request.message_id);

        io.emit('client_request:update'); // Notify all clients
        res.json({ message: 'Request marked as completed.' });

    } catch (error) {
        console.error(`[CLIENT-REQ-ERROR] Failed to complete request ${id}:`, error);
        res.status(500).json({ message: 'Failed to complete request.' });
    }
};

// NEW: PATCH /api/client-requests/:id/amount - Update the amount for a request
exports.updateRequestAmount = async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    const io = req.app.get('io');

    if (amount === undefined || isNaN(parseFloat(amount))) {
        return res.status(400).json({ message: 'A valid amount is required.' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE client_requests SET amount = ? WHERE id = ?',
            [amount, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Request not found.' });
        }
        
        io.emit('client_request:update');
        res.json({ message: 'Amount updated successfully.' });

    } catch (error) {
        console.error(`[CLIENT-REQ-ERROR] Failed to update amount for request ${id}:`, error);
        res.status(500).json({ message: 'Failed to update amount.' });
    }
};