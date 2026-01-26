const pool = require('../config/db');

// --- GET ALL BATCHES (Permission-Gated) ---
exports.getAllBatches = async (req, res) => {
    try {
        const [batches] = await pool.query(
            'SELECT id, name FROM group_batches ORDER BY name'
        );
        res.json(batches);
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({ message: 'Failed to fetch batches' });
    }
};

// --- GET GROUPS FOR A BATCH (Still Public - OK for now, but could be secured) ---
exports.getGroupIdsByBatch = async (req, res) => {
    try {
        const batchId = req.params.id;
        const [links] = await pool.query('SELECT group_id FROM batch_group_link WHERE batch_id = ?', [batchId]);
        const groupIds = links.map(link => link.group_id);
        res.json(groupIds);
    } catch (error) {
        console.error('Error fetching group IDs for batch:', error);
        res.status(500).json({ message: 'Failed to fetch group IDs' });
    }
};

// --- CREATE BATCH ---
exports.createBatch = async (req, res) => {
    const userId = req.user.id; // Get user ID
    const { name, groupIds } = req.body;
    if (!name || !groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
        return res.status(400).json({ message: 'Batch name and a non-empty array of group IDs are required.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.query(
            'INSERT INTO group_batches (user_id, name) VALUES (?, ?)',
            [userId, name] // Add user_id
        );
        const newBatchId = result.insertId;

        const linkValues = groupIds.map(groupId => [newBatchId, groupId]);
        await connection.query('INSERT INTO batch_group_link (batch_id, group_id) VALUES ?', [linkValues]);

        await connection.commit();
        res.status(201).json({ id: newBatchId, name });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating batch:', error);
        res.status(500).json({ message: 'Failed to create batch' });
    } finally {
        connection.release();
    }
};

// --- UPDATE BATCH ---
exports.updateBatch = async (req, res) => {
    const { id } = req.params;
    const { name, groupIds } = req.body;

    if (!name || !groupIds || !Array.isArray(groupIds)) {
        return res.status(400).json({ message: 'Batch name and an array of group IDs are required.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const [batchCheck] = await connection.query('SELECT id FROM group_batches WHERE id = ?', [id]);
        if (batchCheck.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Batch not found.' });
        }

        await connection.query('UPDATE group_batches SET name = ? WHERE id = ?', [name, id]);
        await connection.query('DELETE FROM batch_group_link WHERE batch_id = ?', [id]);

        if (groupIds.length > 0) {
            const linkValues = groupIds.map(groupId => [id, groupId]);
            await connection.query('INSERT INTO batch_group_link (batch_id, group_id) VALUES ?', [linkValues]);
        }

        await connection.commit();
        res.status(200).json({ message: 'Batch updated successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating batch:', error);
        res.status(500).json({ message: 'Failed to update batch' });
    } finally {
        connection.release();
    }
};

// --- DELETE BATCH ---
exports.deleteBatch = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM group_batches WHERE id = ?', [id]);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting batch:', error);
        res.status(500).json({ message: 'Failed to delete batch' });
    }
};
