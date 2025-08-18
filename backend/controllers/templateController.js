const pool = require('../config/db');

exports.getAllTemplates = async (req, res) => {
    try {
        const [templates] = await pool.query('SELECT id, name, text FROM message_templates ORDER BY name');
        res.json(templates);
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ message: 'Failed to fetch templates' });
    }
};

exports.createTemplate = async (req, res) => {
    const { name, text } = req.body;
    if (!name || !text) {
        return res.status(400).json({ message: 'Template name and text are required.' });
    }
    try {
        const [result] = await pool.query('INSERT INTO message_templates (name, text) VALUES (?, ?)', [name, text]);
        res.status(201).json({ id: result.insertId, name, text });
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({ message: 'Failed to create template' });
    }
};

exports.updateTemplate = async (req, res) => {
    const { id } = req.params;
    const { name, text } = req.body;

    if (!name || !text) {
        return res.status(400).json({ message: 'Template name and text are required.' });
    }

    try {
        await pool.query('UPDATE message_templates SET name = ?, text = ? WHERE id = ?', [name, text, id]);
        res.status(200).json({ message: 'Template updated successfully.' });
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({ message: 'Failed to update template' });
    }
};

exports.deleteTemplate = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM message_templates WHERE id = ?', [id]);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ message: 'Failed to delete template' });
    }
};