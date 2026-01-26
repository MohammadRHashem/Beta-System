const pool = require('../config/db');
const fs = require('fs/promises');

// GET all uploads (permission-gated)
exports.getAllUploads = async (req, res) => {
    try {
        const [uploads] = await pool.query(
            'SELECT id, original_filename, stored_filename, mimetype, filepath, created_at FROM broadcast_uploads ORDER BY created_at DESC'
        );
        res.json(uploads);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch uploads.' });
    }
};

// POST a new upload
exports.handleUpload = async (req, res) => {
    const userId = req.user.id;
    if (!req.file) {
        return res.status(400).json({ message: 'No file was uploaded.' });
    }

    const { originalname, filename, mimetype, path } = req.file;
    try {
        const [result] = await pool.query(
            'INSERT INTO broadcast_uploads (user_id, original_filename, stored_filename, mimetype, filepath) VALUES (?, ?, ?, ?, ?)',
            [userId, originalname, filename, mimetype, path]
        );
        
        // === THIS IS THE FIX: The response object is now correct ===
        res.status(201).json({
            id: result.insertId,
            original_filename: originalname,
            stored_filename: filename, // The unique name on the server
            mimetype: mimetype,
            filepath: path, // The full system path for the backend service
            url: `/uploads/broadcasts/${filename}` // The correct relative URL for the frontend
        });
        // =========================================================

    } catch (error) {
        console.error('[UPLOAD-ERROR] Failed to save upload metadata:', error);
        res.status(500).json({ message: 'Failed to save file information.' });
    }
};

// DELETE an upload
exports.deleteUpload = async (req, res) => {
    const { id } = req.params;

    try {
        const [[upload]] = await pool.query(
            'SELECT id, filepath FROM broadcast_uploads WHERE id = ?',
            [id]
        );

        if (!upload) {
            return res.status(404).json({ message: 'File not found.' });
        }

        // Delete file from filesystem first
        await fs.unlink(upload.filepath);
        
        // Then delete the record from the database
        await pool.query('DELETE FROM broadcast_uploads WHERE id = ?', [id]);

        res.status(204).send();
    } catch (error) {
        console.error(`[DELETE-UPLOAD-ERROR] Failed to delete upload ${id}:`, error);
        res.status(500).json({ message: 'Failed to delete file.' });
    }
};
