const pool = require('../config/db');

/**
 * Logs a user action to the audit_log table.
 * @param {object} req - The Express request object, containing req.user.
 * @param {string} action - The permission string for the action (e.g., 'invoice:delete').
 * @param {string} targetType - The type of entity being affected (e.g., 'Invoice').
 * @param {string|number} targetId - The ID of the entity.
 * @param {object} details - A JSON object with before/after states or other info.
 */
const logAction = async (req, action, targetType = null, targetId = null, details = null) => {
    try {
        if (!req.user) {
            console.warn('[AUDIT-WARN] logAction called without a user on the request object.');
            return;
        }

        const { id: userId, username } = req.user;

        await pool.query(
            'INSERT INTO audit_log (user_id, username, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, username, action, targetType, targetId, JSON.stringify(details)]
        );
    } catch (error) {
        console.error('[AUDIT-ERROR] Failed to write to audit log:', error);
    }
};

module.exports = { logAction };