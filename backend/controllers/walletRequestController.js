const pool = require('../config/db');

// GET /api/wallet-requests - Fetch all pending requests
exports.getPendingRequests = async (req, res) => {
    try {
        const [requests] = await pool.query(
            `SELECT id, wallet_address, source_group_name, received_at 
             FROM wallet_address_requests 
             WHERE is_completed = 0 
             ORDER BY received_at ASC`
        );
        res.json(requests);
    } catch (error) {
        console.error('[WALLET-REQ-ERROR] Failed to fetch pending requests:', error);
        res.status(500).json({ message: 'Failed to fetch requests.' });
    }
};

// PATCH /api/wallet-requests/:id/complete - Mark a request as done
exports.completeRequest = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const io = req.app.get('io');

    try {
        const [result] = await pool.query(
            `UPDATE wallet_address_requests 
             SET is_completed = 1, completed_at = NOW(), completed_by_user_id = ? 
             WHERE id = ? AND is_completed = 0`,
            [userId, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Request not found or already completed.' });
        }

        io.emit('wallet_request:update'); // Notify all clients
        res.json({ message: 'Request marked as completed.' });

    } catch (error) {
        console.error(`[WALLET-REQ-ERROR] Failed to complete request ${id}:`, error);
        res.status(500).json({ message: 'Failed to complete request.' });
    }
};