const pool = require('../config/db');
const whatsappService = require('../services/whatsappService');

exports.getForwardingRules = async (req, res) => {
    const userId = req.user.id;
    try {
        const [rules] = await pool.query('SELECT * FROM forwarding_rules WHERE user_id = ? ORDER BY trigger_keyword ASC', [userId]);
        res.json(rules);
    } catch (error) {
        console.error('[ERROR] Failed to fetch forwarding rules:', error);
        res.status(500).json({ message: 'Failed to fetch rules.' });
    }
};

exports.createForwardingRule = async (req, res) => {
    const userId = req.user.id;
    const { trigger_keyword, destination_group_jid, destination_group_name } = req.body;
    try {
        await pool.query(
            'INSERT INTO forwarding_rules (user_id, trigger_keyword, destination_group_jid, destination_group_name, is_enabled) VALUES (?, ?, ?, ?, ?)',
            [userId, trigger_keyword, destination_group_jid, destination_group_name, 1]
        );
        res.status(201).json({ message: 'Rule created successfully.' });
    } catch (error) {
        console.error('[ERROR] Failed to create forwarding rule:', error);
        res.status(500).json({ message: 'Failed to create rule.' });
    }
};

// === THE FINAL, DEFINITIVE FIX FOR THE UPDATE BUG ===
exports.updateForwardingRule = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    // We ONLY trust the trigger and the JID from the client.
    const { trigger_keyword, destination_group_jid } = req.body;

    if (!trigger_keyword || !destination_group_jid) {
        return res.status(400).json({ message: 'Trigger keyword and destination group are required.' });
    }
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Step 1: Look up the definitive group name from the database using the provided JID.
        const [[group]] = await connection.query(
            'SELECT group_name FROM whatsapp_groups WHERE group_jid = ?',
            [destination_group_jid]
        );

        if (!group) {
            // If the group doesn't exist in our system, fail the request.
            throw new Error('Destination group not found in the system. Please sync groups and try again.');
        }
        
        // This is the true, up-to-date name.
        const correct_destination_group_name = group.group_name;
        console.log(`[INFO] Updating rule ${id}. Found correct group name: "${correct_destination_group_name}" for JID: ${destination_group_jid}`);

        // Step 2: Update the rule using the data we have validated and looked up ourselves.
        const [result] = await connection.query(
            'UPDATE forwarding_rules SET trigger_keyword = ?, destination_group_jid = ?, destination_group_name = ? WHERE id = ? AND user_id = ?',
            [trigger_keyword, destination_group_jid, correct_destination_group_name, id, userId]
        );

        if (result.affectedRows === 0) {
            // This happens if the rule ID doesn't exist or doesn't belong to the user.
            await connection.rollback();
            return res.status(404).json({ message: 'Rule not found or you do not have permission to edit it.' });
        }
        
        await connection.commit();
        res.json({ message: 'Rule updated successfully.' });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This trigger keyword already exists.' });
        }
        console.error(`[ERROR] Failed to update forwarding rule ${id}:`, error);
        res.status(500).json({ message: error.message || 'Failed to update rule.' });
    } finally {
        connection.release();
    }
};

exports.toggleForwardingRule = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { is_enabled } = req.body;

    if (typeof is_enabled !== 'boolean') {
        return res.status(400).json({ message: 'A boolean `is_enabled` value is required.' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE forwarding_rules SET is_enabled = ? WHERE id = ? AND user_id = ?',
            [is_enabled, id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rule not found or permission denied.' });
        }
        res.json({ message: `Rule successfully ${is_enabled ? 'enabled' : 'disabled'}.` });
    } catch (error) {
        console.error('[ERROR] Failed to toggle forwarding rule:', error);
        res.status(500).json({ message: 'Failed to update rule status.' });
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
        console.error('[ERROR] Failed to delete forwarding rule:', error);
        res.status(500).json({ message: 'Failed to delete rule.' });
    }
};

exports.getGroupSettings = async (req, res) => {
    try {
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
        console.error('[ERROR] Failed to fetch group settings:', error);
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
        console.error('[ERROR] Failed to update group setting:', error);
        res.status(500).json({ message: 'Failed to update setting.' });
    }
};

exports.getAutoConfirmationStatus = async (req, res) => {
    try {
        const [[setting]] = await pool.query(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'auto_confirmation_enabled'"
        );
        const isEnabled = setting ? setting.setting_value === 'true' : false;
        res.json({ isEnabled });
    } catch (error) {
        console.error('[ERROR] Failed to fetch auto confirmation status:', error);
        res.status(500).json({ message: 'Failed to fetch status.' });
    }
};

exports.setAutoConfirmationStatus = async (req, res) => {
    const { isEnabled } = req.body;
    if (typeof isEnabled !== 'boolean') {
        return res.status(400).json({ message: 'A boolean `isEnabled` value is required.' });
    }

    try {
        await pool.query(
            "UPDATE system_settings SET setting_value = ? WHERE setting_key = 'auto_confirmation_enabled'",
            [isEnabled.toString()]
        );
        whatsappService.refreshAutoConfirmationStatus(); // Notify the service of the change
        res.json({ message: `Auto confirmation successfully ${isEnabled ? 'enabled' : 'disabled'}.` });
    } catch (error) {
        console.error('[ERROR] Failed to update auto confirmation status:', error);
        res.status(500).json({ message: 'Failed to update status.' });
    }
};