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
// Add update and delete functions for rules as needed...

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