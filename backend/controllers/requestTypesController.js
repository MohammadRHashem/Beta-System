const pool = require('../config/db');
const whatsappService = require('../services/whatsappService');

// GET all request types (permission-gated)
exports.getAll = async (req, res) => {
    try {
        // MODIFIED: Select new sort_order column and order by it
        const [types] = await pool.query(
            'SELECT id, name, trigger_regex, acknowledgement_reaction, color, is_enabled, sort_order FROM request_types ORDER BY sort_order ASC, name ASC'
        );
        res.json(types);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch request types.' });
    }
};

// --- NEW FUNCTION ---
// POST /api/request-types/update-order - Updates the sort order of all types
exports.updateOrder = async (req, res) => {
    const orderedIds = req.body; // Expects an array of IDs: [3, 1, 2]

    if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ message: 'Request body must be an array of IDs.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Use a CASE statement for an efficient bulk update in a single query
        let caseStatement = 'CASE id ';
        const params = [];
        
        orderedIds.forEach((id, index) => {
            caseStatement += 'WHEN ? THEN ? ';
            params.push(id, index);
        });
        
        caseStatement += 'END';
        params.push(orderedIds); // For the IN clause

        const query = `
            UPDATE request_types 
            SET sort_order = ${caseStatement}
            WHERE id IN (?)
        `;

        await connection.query(query, params);
        await connection.commit();
        
        whatsappService.refreshRequestTypeCache(); // Refresh cache to respect new order if needed
        res.json({ message: 'Order updated successfully.' });

    } catch (error) {
        await connection.rollback();
        console.error('[ERROR] Failed to update request type order:', error);
        res.status(500).json({ message: 'Failed to update order.' });
    } finally {
        connection.release();
    }
};

// POST a new request type
exports.create = async (req, res) => {
    const userId = req.user.id;
    // UPDATED: Get color from body
    const { name, trigger_regex, acknowledgement_reaction, color } = req.body;

    try {
        // UPDATED: Insert color into DB
        const [result] = await pool.query(
            'INSERT INTO request_types (user_id, name, trigger_regex, acknowledgement_reaction, color) VALUES (?, ?, ?, ?, ?)',
            [userId, name, trigger_regex, acknowledgement_reaction, color || '#E0E0E0']
        );
        whatsappService.refreshRequestTypeCache();
        res.status(201).json({ id: result.insertId });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create request type.' });
    }
};

// PUT (update) an existing request type
exports.update = async (req, res) => {
    const { id } = req.params;
    // UPDATED: Get color from body
    const { name, trigger_regex, acknowledgement_reaction, is_enabled, color } = req.body;

    try {
        // UPDATED: Update color in DB
        await pool.query(
            'UPDATE request_types SET name = ?, trigger_regex = ?, acknowledgement_reaction = ?, is_enabled = ?, color = ? WHERE id = ?',
            [name, trigger_regex, acknowledgement_reaction, is_enabled, color || '#E0E0E0', id]
        );
        whatsappService.refreshRequestTypeCache();
        res.json({ message: 'Request type updated.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update request type.' });
    }
};

// DELETE a request type
exports.delete = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(
            'DELETE FROM request_types WHERE id = ?',
            [id]
        );
        whatsappService.refreshRequestTypeCache();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete request type.' });
    }
};
