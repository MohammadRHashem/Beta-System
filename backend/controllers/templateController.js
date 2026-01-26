const pool = require('../config/db');

exports.getAllTemplates = async (req, res) => {
    try {
        const query = `
            SELECT 
                mt.id, mt.name, mt.text, mt.upload_id,
                bu.original_filename, bu.stored_filename, bu.mimetype, bu.filepath
            FROM message_templates mt
            LEFT JOIN broadcast_uploads bu ON mt.upload_id = bu.id
            ORDER BY mt.name
        `;
        const [templates] = await pool.query(query);
        
        const formattedTemplates = templates.map(t => ({
            id: t.id,
            name: t.name,
            text: t.text,
            attachment: t.upload_id ? {
                id: t.upload_id,
                original_filename: t.original_filename,
                stored_filename: t.stored_filename,
                mimetype: t.mimetype,
                filepath: t.filepath,
                url: `/uploads/broadcasts/${t.stored_filename}`
            } : null
        }));
        
        res.json(formattedTemplates);
    } catch (error) {
        console.error("Error fetching templates:", error);
        res.status(500).json({ message: 'Failed to fetch templates' });
    }
};

exports.createTemplate = async (req, res) => {
    const userId = req.user.id;
    const { name, text, upload_id } = req.body;
    if (!name || (!text && !upload_id)) {
        return res.status(400).json({ message: 'Template name and either text or an attachment are required.' });
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO message_templates (user_id, name, text, upload_id) VALUES (?, ?, ?, ?)',
            [userId, name, text || '', upload_id || null]
        );
        res.status(201).json({ id: result.insertId });
    } catch (error) {
        console.error("Error creating template:", error);
        res.status(500).json({ message: 'Failed to create template' });
    }
};

exports.updateTemplate = async (req, res) => {
    const { id } = req.params;
    const { name, text, upload_id } = req.body;

    if (!name || (!text && !upload_id)) {
        return res.status(400).json({ message: 'Template name and either text or an attachment are required.' });
    }
    try {
        await pool.query(
            'UPDATE message_templates SET name = ?, text = ?, upload_id = ? WHERE id = ?',
            [name, text || '', upload_id || null, id]
        );
        res.status(200).json({ message: 'Template updated successfully.' });
    } catch (error) {
        console.error("Error updating template:", error);
        res.status(500).json({ message: 'Failed to update template' });
    }
};

exports.deleteTemplate = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(
            'DELETE FROM message_templates WHERE id = ?',
            [id]
        );
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ message: 'Failed to delete template' });
    }
};
