const pool = require('../config/db');
const whatsappService = require('../services/whatsappService');

exports.getForwardingRules = async (req, res) => {
    const userId = req.user.id;
    try {
        // Select the new column
        const [rules] = await pool.query('SELECT * FROM forwarding_rules WHERE user_id = ? ORDER BY trigger_keyword ASC', [userId]);
        res.json(rules);
    } catch (error) {
        console.error('[ERROR] Failed to fetch forwarding rules:', error);
        res.status(500).json({ message: 'Failed to fetch rules.' });
    }
};

exports.createForwardingRule = async (req, res) => {
    const userId = req.user.id;
    // Accept new parameter
    const { trigger_keyword, destination_group_jid, destination_group_name, reply_with_group_name } = req.body;
    try {
        await pool.query(
            'INSERT INTO forwarding_rules (user_id, trigger_keyword, destination_group_jid, destination_group_name, is_enabled, reply_with_group_name) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, trigger_keyword, destination_group_jid, destination_group_name, 1, reply_with_group_name || 0]
        );
        res.status(201).json({ message: 'Rule created successfully.' });
    } catch (error) {
        console.error('[ERROR] Failed to create forwarding rule:', error);
        res.status(500).json({ message: 'Failed to create rule.' });
    }
};

exports.updateForwardingRule = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    // Accept new parameter
    const { trigger_keyword, destination_group_jid, reply_with_group_name } = req.body;

    if (!trigger_keyword || !destination_group_jid) {
        return res.status(400).json({ message: 'Trigger keyword and destination group are required.' });
    }
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Step 1: Look up the definitive group name
        const [[group]] = await connection.query(
            'SELECT group_name FROM whatsapp_groups WHERE group_jid = ?',
            [destination_group_jid]
        );

        if (!group) {
            throw new Error('Destination group not found in the system. Please sync groups and try again.');
        }
        
        const correct_destination_group_name = group.group_name;

        // Step 2: Update the rule including the new boolean toggle
        const [result] = await connection.query(
            'UPDATE forwarding_rules SET trigger_keyword = ?, destination_group_jid = ?, destination_group_name = ?, reply_with_group_name = ? WHERE id = ? AND user_id = ?',
            [trigger_keyword, destination_group_jid, correct_destination_group_name, reply_with_group_name || 0, id, userId]
        );

        if (result.affectedRows === 0) {
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

exports.toggleForwardingRuleReply = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { reply_with_group_name } = req.body;

    if (typeof reply_with_group_name !== 'boolean') {
        return res.status(400).json({ message: 'A boolean value is required.' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE forwarding_rules SET reply_with_group_name = ? WHERE id = ? AND user_id = ?',
            [reply_with_group_name, id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Rule not found or permission denied.' });
        }
        res.json({ message: `Reply setting successfully updated.` });
    } catch (error) {
        console.error('[ERROR] Failed to toggle reply setting:', error);
        res.status(500).json({ message: 'Failed to update setting.' });
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

exports.getAlfaApiConfirmationStatus = async (req, res) => {
    try {
        const [[setting]] = await pool.query(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'alfa_api_confirmation_enabled'"
        );
        const isEnabled = setting ? setting.setting_value === 'true' : false;
        res.json({ isEnabled });
    } catch (error) {
        console.error('[ERROR] Failed to fetch Alfa API confirmation status:', error);
        res.status(500).json({ message: 'Failed to fetch status.' });
    }
};

exports.setAlfaApiConfirmationStatus = async (req, res) => {
    const { isEnabled } = req.body;
    if (typeof isEnabled !== 'boolean') {
        return res.status(400).json({ message: 'A boolean `isEnabled` value is required.' });
    }

    try {
        const query = `
            INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
        `;
        await pool.query(query, ['alfa_api_confirmation_enabled', isEnabled.toString()]);
        
        whatsappService.refreshAlfaApiConfirmationStatus(); // Notify the service of the change
        res.json({ message: `Alfa API confirmation successfully ${isEnabled ? 'enabled' : 'disabled'}.` });
    } catch (error) {
        console.error('[ERROR] Failed to update Alfa API confirmation status:', error);
        res.status(500).json({ message: 'Failed to update status.' });
    }
};


// === NEW: Troca Coin Telegram Confirmation Endpoints ===
exports.getTrocaCoinConfirmationStatus = async (req, res) => {
    try {
        const [[setting]] = await pool.query(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'troca_coin_telegram_enabled'"
        );
        const isEnabled = setting ? setting.setting_value === 'true' : false;
        res.json({ isEnabled });
    } catch (error) {
        console.error('[ERROR] Failed to fetch Troca Coin confirmation status:', error);
        res.status(500).json({ message: 'Failed to fetch status.' });
    }
};

exports.setTrocaCoinConfirmationStatus = async (req, res) => {
    const { isEnabled } = req.body;
    if (typeof isEnabled !== 'boolean') {
        return res.status(400).json({ message: 'A boolean `isEnabled` value is required.' });
    }

    try {
        const query = `
            INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
        `;
        await pool.query(query, ['troca_coin_telegram_enabled', isEnabled.toString()]);
        
        whatsappService.refreshTrocaCoinStatus(); // Notify the service of the change
        res.json({ message: `Troca Coin Telegram confirmation successfully ${isEnabled ? 'enabled' : 'disabled'}.` });
    } catch (error) {
        console.error('[ERROR] Failed to update Troca Coin confirmation status:', error);
        res.status(500).json({ message: 'Failed to update status.' });
    }
};


exports.getTrocaCoinMethod = async (req, res) => {
    try {
        const [[setting]] = await pool.query(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'troca_coin_confirmation_method'"
        );
        // Default to 'telegram' if the setting doesn't exist for some reason
        const method = setting ? setting.setting_value : 'telegram';
        res.json({ method });
    } catch (error) {
        console.error('[ERROR] Failed to fetch Troca Coin confirmation method:', error);
        res.status(500).json({ message: 'Failed to fetch method.' });
    }
};

exports.setTrocaCoinMethod = async (req, res) => {
    const { method } = req.body;
    if (!['telegram', 'xpayz'].includes(method)) {
        return res.status(400).json({ message: 'Invalid method specified. Must be "telegram" or "xpayz".' });
    }

    try {
        const query = `
            INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
        `;
        await pool.query(query, ['troca_coin_confirmation_method', method]);
        
        // Notify the whatsapp service to refresh its internal state
        whatsappService.refreshTrocaCoinMethod();
        res.json({ message: `Troca Coin confirmation method successfully set to '${method}'.` });
    } catch (error) {
        console.error('[ERROR] Failed to update Troca Coin confirmation method:', error);
        res.status(500).json({ message: 'Failed to update method.' });
    }
};

exports.getTrkbitConfirmationStatus = async (req, res) => {
    try {
        const [[setting]] = await pool.query(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'trkbit_confirmation_enabled'"
        );
        const isEnabled = setting ? setting.setting_value === 'true' : false;
        res.json({ isEnabled });
    } catch (error) {
        console.error('[ERROR] Failed to fetch Trkbit status:', error);
        res.status(500).json({ message: 'Failed to fetch status.' });
    }
};

exports.setTrkbitConfirmationStatus = async (req, res) => {
    const { isEnabled } = req.body;
    if (typeof isEnabled !== 'boolean') {
        return res.status(400).json({ message: 'A boolean value is required.' });
    }
    try {
        const query = `
            INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
        `;
        await pool.query(query, ['trkbit_confirmation_enabled', isEnabled.toString()]);
        
        // Notify service
        const whatsappService = require('../services/whatsappService');
        whatsappService.refreshTrkbitConfirmationStatus();
        
        res.json({ message: `Trkbit confirmation successfully ${isEnabled ? 'enabled' : 'disabled'}.` });
    } catch (error) {
        console.error('[ERROR] Failed to update Trkbit status:', error);
        res.status(500).json({ message: 'Failed to update status.' });
    }
};