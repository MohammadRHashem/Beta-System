const pool = require('../config/db');

// GET all direct forwarding rules (permission-gated)
exports.getAllRules = async (req, res) => {
    try {
        const [rules] = await pool.query(
            'SELECT * FROM direct_forwarding_rules ORDER BY source_group_name ASC'
        );
        res.json(rules);
    } catch (error) {
        console.error('[ERROR] Failed to fetch direct forwarding rules:', error);
        res.status(500).json({ message: 'Failed to fetch rules.' });
    }
};

// POST a new direct forwarding rule
exports.createRule = async (req, res) => {
    const userId = req.user.id;
    const { source_group_jid, destination_group_jid } = req.body;

    if (!source_group_jid || !destination_group_jid) {
        return res.status(400).json({ message: 'Source and destination groups are required.' });
    }
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Look up the names for both JIDs to store for user convenience
        const [[sourceGroup]] = await connection.query('SELECT group_name FROM whatsapp_groups WHERE group_jid = ?', [source_group_jid]);
        const [[destGroup]] = await connection.query('SELECT group_name FROM whatsapp_groups WHERE group_jid = ?', [destination_group_jid]);

        if (!sourceGroup || !destGroup) {
            throw new Error('One or both of the selected groups were not found in the system.');
        }

        const [result] = await connection.query(
            'INSERT INTO direct_forwarding_rules (user_id, source_group_jid, source_group_name, destination_group_jid, destination_group_name) VALUES (?, ?, ?, ?, ?)',
            [userId, source_group_jid, sourceGroup.group_name, destination_group_jid, destGroup.group_name]
        );
        
        await connection.commit();
        res.status(201).json({ 
            id: result.insertId, 
            message: 'Direct forwarding rule created successfully.' 
        });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'A rule for this source group already exists.' });
        }
        console.error('[ERROR] Failed to create direct forwarding rule:', error);
        res.status(500).json({ message: error.message || 'Failed to create rule.' });
    } finally {
        connection.release();
    }
};

// DELETE a direct forwarding rule
exports.deleteRule = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM direct_forwarding_rules WHERE id = ?',
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rule not found or you do not have permission to delete it.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('[ERROR] Failed to delete direct forwarding rule:', error);
        res.status(500).json({ message: 'Failed to delete rule.' });
    }
};
