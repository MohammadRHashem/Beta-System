const fs = require('fs-extra');
const baileysService = require('../services/baileys');
const pool = require('../config/db');

exports.init = () => {
    baileysService.init();
};

exports.getStatus = (req, res) => {
    const status = baileysService.getStatus();
    res.json({ status });
};

exports.getQRCode = (req, res) => {
    const qr = baileysService.getQR();
    res.json({ qr });
};

exports.logout = async (req, res) => {
    try {
        const sock = baileysService.getSocket();
        if (sock) {
            await sock.logout();
        }
        await fs.remove('baileys_auth_info');
        console.log('Logged out and session cleared.');
        baileysService.init();
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Error logging out:', error);
        res.status(500).json({ message: 'Error during logout' });
    }
};

exports.getGroups = async (req, res) => {
    try {
        const [groups] = await pool.query(
            'SELECT group_jid as id, group_name as name FROM whatsapp_groups WHERE user_id = 1 ORDER BY group_name'
        );
        res.status(200).json(groups);
    } catch (error) {
        console.error('Error fetching groups from DB:', error);
        res.status(500).json({ message: 'Failed to fetch groups from database.' });
    }
};

// --- DEFINITIVELY CORRECTED syncGroups FUNCTION ---
exports.syncGroups = async (req, res) => {
    const connection = await pool.getConnection(); // Use a single connection for the transaction
    try {
        console.log('Starting robust group sync...');
        await connection.beginTransaction();

        // Step 1: Fetch fresh groups from WhatsApp (Source of Truth)
        const freshGroups = await baileysService.fetchAllGroups();
        const freshGroupIds = new Set(freshGroups.map(g => g.id));
        console.log(`[SYNC] Fetched ${freshGroups.length} groups from WhatsApp.`);

        // Step 2: Fetch stale group IDs currently in our database
        const [staleDbGroups] = await connection.query('SELECT group_jid FROM whatsapp_groups WHERE user_id = 1');
        const staleGroupIds = new Set(staleDbGroups.map(g => g.group_jid));
        console.log(`[SYNC] Found ${staleGroupIds.size} groups in the database.`);

        // Step 3: CALCULATE THE DIFFERENCE - Find groups to DELETE
        // These are groups that exist in our database but NOT in the fresh list from WhatsApp.
        const groupsToDelete = [...staleGroupIds].filter(id => !freshGroupIds.has(id));

        if (groupsToDelete.length > 0) {
            console.log(`[SYNC] Deleting ${groupsToDelete.length} obsolete groups:`, groupsToDelete);
            // Thanks to 'ON DELETE CASCADE', deleting from whatsapp_groups
            // will also automatically clean up the batch_group_link table.
            await connection.query('DELETE FROM whatsapp_groups WHERE user_id = 1 AND group_jid IN (?)', [groupsToDelete]);
            console.log('[SYNC] Obsolete groups deleted successfully.');
        } else {
            console.log('[SYNC] No groups needed deletion.');
        }

        // Step 4: UPSERT (Insert or Update) the fresh group list
        // This handles new groups and name changes for existing groups.
        if (freshGroups.length > 0) {
            const groupValues = freshGroups.map(g => [1, g.id, g.name]); // user_id = 1
            const upsertQuery = `
                INSERT INTO whatsapp_groups (user_id, group_jid, group_name)
                VALUES ?
                ON DUPLICATE KEY UPDATE group_name = VALUES(group_name);
            `;
            await connection.query(upsertQuery, [groupValues]);
            console.log('[SYNC] Upserted fresh group list to the database.');
        }

        // If all steps succeeded, commit the transaction
        await connection.commit();
        console.log('[SYNC] Database sync complete and transaction committed.');
        res.status(200).json({ message: `Sync complete. Synced ${freshGroups.length} groups. Removed ${groupsToDelete.length} obsolete groups.` });

    } catch (error) {
        // If any step failed, roll back the entire transaction to prevent partial updates
        await connection.rollback();
        console.error('[SYNC-ERROR] Transaction rolled back due to error:', error);
        res.status(500).json({ message: error.message || 'An error occurred during group sync.' });
    } finally {
        // Always release the connection back to the pool
        connection.release();
    }
};

exports.broadcastMessage = async (req, res) => {
    const { groups, message } = req.body;
    if (!groups || !message || !Array.isArray(groups)) {
        return res.status(400).json({ message: 'Invalid request body.' });
    }

    try {
        const result = await baileysService.broadcast(groups, message);
        res.status(200).json({ message: `Broadcast initiated.`, ...result });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};