const pool = require('../config/db');
const whatsappService = require('../services/whatsappService');

// RENAMED & MODIFIED: Fetches ALL requests (pending and completed)
exports.getAllRequests = async (req, res) => {
    try {
        const query = `
            SELECT 
                cr.id, cr.message_id, cr.content, cr.amount, cr.source_group_name, cr.request_type, 
                cr.received_at, cr.is_completed, cr.completed_at, u.username as completed_by,
                COALESCE(rt.color, '#E0E0E0') as type_color,
                rt.acknowledgement_reaction
            FROM client_requests cr
            LEFT JOIN request_types rt ON cr.request_type = rt.name
            LEFT JOIN users u ON cr.completed_by_user_id = u.id
            ORDER BY cr.received_at ASC
        `;
        const [requests] = await pool.query(query);
        res.json(requests);
    } catch (error) {
        console.error('[CLIENT-REQ-ERROR] Failed to fetch all requests:', error);
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
        
        await whatsappService.clearReaction(request.message_id);

        io.emit('client_request:update');
        res.json({ message: 'Request marked as completed.' });

    } catch (error) {
        console.error(`[CLIENT-REQ-ERROR] Failed to complete request ${id}:`, error);
        res.status(500).json({ message: 'Failed to complete request.' });
    }
};

// --- NEW FUNCTION ---
// PATCH /api/client-requests/:id/restore - Mark a request as pending again
exports.restoreRequest = async (req, res) => {
    const { id } = req.params;
    const io = req.app.get('io');

    try {
        const [[requestToRestore]] = await pool.query(
            `SELECT cr.message_id, rt.acknowledgement_reaction 
             FROM client_requests cr
             LEFT JOIN request_types rt ON cr.request_type = rt.name
             WHERE cr.id = ?`,
            [id]
        );
        
        if (!requestToRestore) {
            return res.status(404).json({ message: "Request not found." });
        }
        
        const [result] = await pool.query(
            `UPDATE client_requests SET is_completed = 0, completed_at = NULL, completed_by_user_id = NULL WHERE id = ? AND is_completed = 1`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(409).json({ message: "Request is already pending." });
        }
        
        // Re-apply the original reaction
        if (requestToRestore.acknowledgement_reaction) {
            await whatsappService.reactToMessage(requestToRestore.message_id, requestToRestore.acknowledgement_reaction);
        }

        io.emit('client_request:update');
        res.json({ message: 'Request restored successfully.' });

    } catch (error) {
        console.error(`[CLIENT-REQ-ERROR] Failed to restore request ${id}:`, error);
        res.status(500).json({ message: 'Failed to restore request.' });
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

exports.updateRequestContent = async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    const io = req.app.get('io');

    // Basic validation
    if (content === undefined || content === null) {
        return res.status(400).json({ message: 'Content must be provided.' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE client_requests SET content = ? WHERE id = ?',
            [content, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Request not found.' });
        }
        
        // Notify all clients that data has changed
        io.emit('client_request:update');
        res.json({ message: 'Information updated successfully.' });

    } catch (error) {
        console.error(`[CLIENT-REQ-ERROR] Failed to update content for request ${id}:`, error);
        res.status(500).json({ message: 'Failed to update information.' });
    }
};