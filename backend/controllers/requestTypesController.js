const pool = require('../config/db');
const whatsappService = require('../services/whatsappService');

// GET all request types for the logged-in user
exports.getAll = async (req, res) => {
    const userId = req.user.id;
    try {
        const [types] = await pool.query(
            'SELECT * FROM request_types WHERE user_id = ? ORDER BY name ASC',
            [userId]
        );
        res.json(types);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch request types.' });
    }
};

// POST a new request type
exports.create = async (req, res) => {
    const userId = req.user.id;
    const { name, trigger_regex, acknowledgement_reaction } = req.body;

    try {
        const [result] = await pool.query(
            'INSERT INTO request_types (user_id, name, trigger_regex, acknowledgement_reaction) VALUES (?, ?, ?, ?)',
            [userId, name, trigger_regex, acknowledgement_reaction]
        );
        whatsappService.refreshRequestTypeCache(); // Refresh the cache
        res.status(201).json({ id: result.insertId });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create request type.' });
    }
};

// PUT (update) an existing request type
exports.update = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, trigger_regex, acknowledgement_reaction, is_enabled } = req.body;

    try {
        await pool.query(
            'UPDATE request_types SET name = ?, trigger_regex = ?, acknowledgement_reaction = ?, is_enabled = ? WHERE id = ? AND user_id = ?',
            [name, trigger_regex, acknowledgement_reaction, is_enabled, id, userId]
        );
        whatsappService.refreshRequestTypeCache();
        res.json({ message: 'Request type updated.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update request type.' });
    }
};

// DELETE a request type
exports.delete = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    try {
        await pool.query(
            'DELETE FROM request_types WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        whatsappService.refreshRequestTypeCache();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete request type.' });
    }
};