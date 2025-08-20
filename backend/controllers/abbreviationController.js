const pool = require('../config/db');
const whatsappService = require('../services/whatsappService');

// GET all abbreviations for the logged-in user
exports.getAll = async (req, res) => {
    const userId = req.user.id;
    try {
        const [abbreviations] = await pool.query(
            'SELECT * FROM abbreviations WHERE user_id = ? ORDER BY `trigger` ASC',
            [userId]
        );
        res.json(abbreviations);
    } catch (error) {
        console.error('Error fetching abbreviations:', error);
        res.status(500).json({ message: 'Failed to fetch abbreviations.' });
    }
};

// POST a new abbreviation
exports.create = async (req, res) => {
    const userId = req.user.id;
    const { trigger, response } = req.body;
    if (!trigger || !response) {
        return res.status(400).json({ message: 'Trigger and response are required.' });
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO abbreviations (user_id, `trigger`, response) VALUES (?, ?, ?)',
            [userId, trigger, response]
        );
        res.status(201).json({ id: result.insertId, trigger, response });
        whatsappService.refreshAbbreviationCache();
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This trigger already exists.' });
        }
        console.error('Error creating abbreviation:', error);
        res.status(500).json({ message: 'Failed to create abbreviation.' });
    }
};

// PUT (update) an existing abbreviation
exports.update = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { trigger, response } = req.body;
    if (!trigger || !response) {
        return res.status(400).json({ message: 'Trigger and response are required.' });
    }
    try {
        const [result] = await pool.query(
            'UPDATE abbreviations SET `trigger` = ?, response = ? WHERE id = ? AND user_id = ?',
            [trigger, response, id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Abbreviation not found or you do not have permission to edit it.' });
        }
        res.json({ message: 'Abbreviation updated successfully.' });
        whatsappService.refreshAbbreviationCache();
    } catch (error)
     {
         if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This trigger already exists.' });
        }
        console.error('Error updating abbreviation:', error);
        res.status(500).json({ message: 'Failed to update abbreviation.' });
    }
};

// DELETE an abbreviation
exports.delete = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM abbreviations WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Abbreviation not found or you do not have permission to delete it.' });
        }
        res.status(204).send();
        whatsappService.refreshAbbreviationCache();
    } catch (error) {
        console.error('Error deleting abbreviation:', error);
        res.status(500).json({ message: 'Failed to delete abbreviation.' });
    }
};