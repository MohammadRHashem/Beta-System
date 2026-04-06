const pool = require('../config/db');
const fs = require('fs/promises');
const whatsappService = require('../services/whatsappService');

const normalizeType = (value) => {
    const normalized = String(value || 'text').trim().toLowerCase();
    return normalized === 'image' ? 'image' : 'text';
};

const removeFileIfExists = async (filePath) => {
    if (!filePath) return;
    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('[ABBREVIATIONS] Failed to remove file:', error);
        }
    }
};

const buildMediaFields = (file) => ({
    media_path: file?.path || null,
    media_mimetype: file?.mimetype || null,
    media_original_filename: file?.originalname || null,
    media_stored_filename: file?.filename || null
});

const toResponseRow = (row) => ({
    ...row,
    type: normalizeType(row.type),
    media_url: row.media_stored_filename ? `/uploads/broadcasts/${row.media_stored_filename}` : null
});

// GET all abbreviations (permission-gated)
exports.getAll = async (req, res) => {
    try {
        const [abbreviations] = await pool.query(
            `SELECT id, user_id, \`trigger\`, response, type, media_path, media_mimetype,
                    media_original_filename, media_stored_filename, created_at
               FROM abbreviations
              ORDER BY \`trigger\` ASC`
        );
        res.json(abbreviations.map(toResponseRow));
    } catch (error) {
        console.error('Error fetching abbreviations:', error);
        res.status(500).json({ message: 'Failed to fetch abbreviations.' });
    }
};

// POST a new abbreviation
exports.create = async (req, res) => {
    const userId = req.user.id;
    const trigger = String(req.body.trigger || '').trim();
    const response = String(req.body.response || '').trim();
    const type = normalizeType(req.body.type);
    const normalizedResponse = response || '';

    if (!trigger) {
        await removeFileIfExists(req.file?.path);
        return res.status(400).json({ message: 'Trigger is required.' });
    }
    if (type === 'text' && !response) {
        await removeFileIfExists(req.file?.path);
        return res.status(400).json({ message: 'Text abbreviations require a response.' });
    }
    if (type === 'image' && !req.file) {
        return res.status(400).json({ message: 'Image abbreviations require an uploaded image.' });
    }

    const mediaFields = type === 'image' ? buildMediaFields(req.file) : buildMediaFields(null);
    try {
        const [result] = await pool.query(
            `INSERT INTO abbreviations (
                user_id, \`trigger\`, response, type, media_path, media_mimetype,
                media_original_filename, media_stored_filename
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                trigger,
                normalizedResponse,
                type,
                mediaFields.media_path,
                mediaFields.media_mimetype,
                mediaFields.media_original_filename,
                mediaFields.media_stored_filename
            ]
        );
        if (type === 'text' && req.file?.path) {
            await removeFileIfExists(req.file.path);
        }
        res.status(201).json(toResponseRow({
            id: result.insertId,
            user_id: userId,
            trigger,
            response: normalizedResponse,
            type,
            ...mediaFields,
            created_at: new Date()
        }));
        whatsappService.refreshAbbreviationCache();
    } catch (error) {
        await removeFileIfExists(req.file?.path);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This trigger already exists.' });
        }
        console.error('Error creating abbreviation:', error);
        res.status(500).json({ message: 'Failed to create abbreviation.' });
    }
};

// PUT (update) an existing abbreviation
exports.update = async (req, res) => {
    const { id } = req.params;
    const trigger = String(req.body.trigger || '').trim();
    const response = String(req.body.response || '').trim();
    const type = normalizeType(req.body.type);
    const normalizedResponse = response || '';

    try {
        const [[existing]] = await pool.query(
            `SELECT id, media_path, media_mimetype, media_original_filename, media_stored_filename, type
               FROM abbreviations
              WHERE id = ?`,
            [id]
        );

        if (!existing) {
            await removeFileIfExists(req.file?.path);
            return res.status(404).json({ message: 'Abbreviation not found.' });
        }

        if (!trigger) {
            await removeFileIfExists(req.file?.path);
            return res.status(400).json({ message: 'Trigger is required.' });
        }
        if (type === 'text' && !response) {
            await removeFileIfExists(req.file?.path);
            return res.status(400).json({ message: 'Text abbreviations require a response.' });
        }
        if (type === 'image' && !req.file && !existing.media_stored_filename) {
            return res.status(400).json({ message: 'Image abbreviations require an uploaded image.' });
        }

        const nextMedia = type === 'image'
            ? (req.file ? buildMediaFields(req.file) : buildMediaFields(existing))
            : buildMediaFields(null);

        const [result] = await pool.query(
            `UPDATE abbreviations
                SET \`trigger\` = ?, response = ?, type = ?, media_path = ?, media_mimetype = ?,
                    media_original_filename = ?, media_stored_filename = ?
              WHERE id = ?`,
            [
                trigger,
                normalizedResponse,
                type,
                nextMedia.media_path,
                nextMedia.media_mimetype,
                nextMedia.media_original_filename,
                nextMedia.media_stored_filename,
                id
            ]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Abbreviation not found.' });
        }

        const shouldDeleteOldFile = Boolean(
            existing.media_path &&
            (
                type === 'text' ||
                (req.file && existing.media_path !== req.file.path)
            )
        );
        if (shouldDeleteOldFile) {
            await removeFileIfExists(existing.media_path);
        }
        if (type === 'text' && req.file?.path) {
            await removeFileIfExists(req.file.path);
        }

        res.json({ message: 'Abbreviation updated successfully.' });
        whatsappService.refreshAbbreviationCache();
    } catch (error)
     {
         await removeFileIfExists(req.file?.path);
         if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This trigger already exists.' });
        }
        console.error('Error updating abbreviation:', error);
        res.status(500).json({ message: 'Failed to update abbreviation.' });
    }
};

// DELETE an abbreviation
exports.delete = async (req, res) => {
    const { id } = req.params;
    try {
        const [[existing]] = await pool.query(
            'SELECT id, media_path FROM abbreviations WHERE id = ?',
            [id]
        );
        if (!existing) {
            return res.status(404).json({ message: 'Abbreviation not found.' });
        }

        const [result] = await pool.query(
            'DELETE FROM abbreviations WHERE id = ?',
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Abbreviation not found.' });
        }
        await removeFileIfExists(existing.media_path);
        res.status(204).send();
        whatsappService.refreshAbbreviationCache();
    } catch (error) {
        console.error('Error deleting abbreviation:', error);
        res.status(500).json({ message: 'Failed to delete abbreviation.' });
    }
};
