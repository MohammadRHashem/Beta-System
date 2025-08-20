const pool = require('../config/db');

// GET /api/chave-pix - Fetch all keys for the logged-in user
exports.getAllKeys = async (req, res) => {
    const userId = req.user.id;
    try {
        const [keys] = await pool.query(
            'SELECT * FROM chave_pix_keys WHERE user_id = ? ORDER BY name ASC',
            [userId]
        );
        res.json(keys);
    } catch (error) {
        console.error('Error fetching Chave Pix keys:', error);
        res.status(500).json({ message: 'Failed to fetch keys.' });
    }
};

// POST /api/chave-pix - Create a new key
exports.createKey = async (req, res) => {
    const userId = req.user.id;
    const { name, pix_key } = req.body;
    if (!name || !pix_key) {
        return res.status(400).json({ message: 'Name and PIX Key are required.' });
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO chave_pix_keys (user_id, name, pix_key) VALUES (?, ?, ?)',
            [userId, name, pix_key]
        );
        res.status(201).json({ id: result.insertId, name, pix_key });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This PIX Key already exists.' });
        }
        console.error('Error creating Chave Pix key:', error);
        res.status(500).json({ message: 'Failed to create key.' });
    }
};

// PUT /api/chave-pix/:id - Update an existing key
exports.updateKey = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, pix_key } = req.body;
    if (!name || !pix_key) {
        return res.status(400).json({ message: 'Name and PIX Key are required.' });
    }
    try {
        const [result] = await pool.query(
            'UPDATE chave_pix_keys SET name = ?, pix_key = ? WHERE id = ? AND user_id = ?',
            [name, pix_key, id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Key not found or you do not have permission to edit it.' });
        }
        res.json({ message: 'Key updated successfully.' });
    } catch (error) {
         if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This PIX Key already exists.' });
        }
        console.error('Error updating Chave Pix key:', error);
        res.status(500).json({ message: 'Failed to update key.' });
    }
};

// DELETE /api/chave-pix/:id - Delete a key
exports.deleteKey = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM chave_pix_keys WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Key not found or you do not have permission to delete it.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting Chave Pix key:', error);
        res.status(500).json({ message: 'Failed to delete key.' });
    }
};