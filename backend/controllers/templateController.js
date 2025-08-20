const pool = require('../config/db');

// --- GET ALL TEMPLATES (User-Specific) ---
exports.getAllTemplates = async (req, res) => {
    const userId = req.user.id; // Get the logged-in user's ID from the token
    try {
        const [templates] = await pool.query(
            'SELECT id, name, text FROM message_templates WHERE user_id = ? ORDER BY name',
            [userId] // Use the ID in the query
        );
        res.json(templates);
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ message: 'Failed to fetch templates' });
    }
};

// --- CREATE TEMPLATE (User-Specific) ---
exports.createTemplate = async (req, res) => {
    const userId = req.user.id; // Get the logged-in user's ID
    const { name, text } = req.body;
    if (!name || !text) {
        return res.status(400).json({ message: 'Template name and text are required.' });
    }
    try {
        // Add user_id to the INSERT statement
        const [result] = await pool.query(
            'INSERT INTO message_templates (user_id, name, text) VALUES (?, ?, ?)',
            [userId, name, text]
        );
        res.status(201).json({ id: result.insertId, name, text });
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({ message: 'Failed to create template' });
    }
};

// --- UPDATE TEMPLATE (User-Specific) ---
exports.updateTemplate = async (req, res) => {
    const userId = req.user.id; // Get the logged-in user's ID
    const { id } = req.params;
    const { name, text } = req.body;

    if (!name || !text) {
        return res.status(400).json({ message: 'Template name and text are required.' });
    }
    try {
        // Add user_id to the WHERE clause for security
        // This ensures a user can only edit their own templates
        await pool.query(
            'UPDATE message_templates SET name = ?, text = ? WHERE id = ? AND user_id = ?',
            [name, text, id, userId]
        );
        res.status(200).json({ message: 'Template updated successfully.' });
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({ message: 'Failed to update template' });
    }
};

// --- DELETE TEMPLATE (User-Specific) ---
exports.deleteTemplate = async (req, res) => {
    const userId = req.user.id; // Get the logged-in user's ID
    const { id } = req.params;
    try {
        // Add user_id to the WHERE clause for security
        await pool.query(
            'DELETE FROM message_templates WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ message: 'Failed to delete template' });
    }
};