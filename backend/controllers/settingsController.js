const pool = require('../config/db');

// --- Forwarding Rules ---
exports.getForwardingRules = async (req, res) => {
    try {
        const [rules] = await pool.query('SELECT * FROM forwarding_rules');
        res.json(rules);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch rules.' });
    }
};

exports.createForwardingRule = async (req, res) => {
    const { trigger_keyword, destination_group_jid, destination_group_name } = req.body;
    try {
        await pool.query(
            'INSERT INTO forwarding_rules (trigger_keyword, destination_group_jid, destination_group_name) VALUES (?, ?, ?)',
            [trigger_keyword, destination_group_jid, destination_group_name]
        );
        res.status(201).json({ message: 'Rule created successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create rule.' });
    }
};

exports.updateForwardingRule = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { trigger_keyword, destination_group_jid, destination_group_name } = req.body;
    if (!trigger_keyword || !destination_group_jid || !destination_group_name) {
        return res.status(400).json({ message: 'All fields are required.' });
    }
    try {
        const [result] = await pool.query(
            'UPDATE forwarding_rules SET trigger_keyword = ?, destination_group_jid = ?, destination_group_name = ? WHERE id = ? AND user_id = ?',
            [trigger_keyword, destination_group_jid, destination_group_name, id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rule not found or you do not have permission to edit it.' });
        }
        res.json({ message: 'Rule updated successfully.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This trigger keyword already exists.' });
        }
        console.error('Error updating forwarding rule:', error);
        res.status(500).json({ message: 'Failed to update rule.' });
    }
};

exports.deleteForwardingRule = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM forwarding_rules WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rule not found or you do not have permission to delete it.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting forwarding rule:', error);
        res.status(500).json({ message: 'Failed to delete rule.' });
    }
};

// --- Group Settings ---
exports.getGroupSettings = async (req, res) => {
    try {
        // We do a LEFT JOIN to ensure all groups from whatsapp_groups are listed,
        // even if they don't have a settings entry yet (we'll use defaults).
        const [groups] = await pool.query(`
            SELECT 
                wg.group_jid, 
                wg.group_name,
                COALESCE(gs.forwarding_enabled, 1) as forwarding_enabled,
                COALESCE(gs.archiving_enabled, 1) as archiving_enabled
            FROM whatsapp_groups wg
            LEFT JOIN group_settings gs ON wg.group_jid = gs.group_jid
        `);
        res.json(groups);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch group settings.' });
    }
};

exports.updateGroupSetting = async (req, res) => {
    const { group_jid, group_name, setting, value } = req.body;
    const validSettings = ['forwarding_enabled', 'archiving_enabled'];
    if (!validSettings.includes(setting)) {
        return res.status(400).json({ message: 'Invalid setting specified.' });
    }
    
    try {
        const query = `
            INSERT INTO group_settings (group_jid, group_name, ${setting})
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), ${setting} = VALUES(${setting});
        `;
        await pool.query(query, [group_jid, group_name, value]);
        res.json({ message: 'Setting updated successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update setting.' });
    }
};