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

exports.syncGroups = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const freshGroups = await baileysService.fetchAllGroups();
        const freshGroupIds = new Set(freshGroups.map(g => g.id));
        const [staleDbGroups] = await connection.query('SELECT group_jid FROM whatsapp_groups WHERE user_id = 1');
        const staleGroupIds = new Set(staleDbGroups.map(g => g.group_jid));
        const groupsToDelete = [...staleGroupIds].filter(id => !freshGroupIds.has(id));

        if (groupsToDelete.length > 0) {
            await connection.query('DELETE FROM whatsapp_groups WHERE user_id = 1 AND group_jid IN (?)', [groupsToDelete]);
        }

        if (freshGroups.length > 0) {
            const groupValues = freshGroups.map(g => [1, g.id, g.name]);
            const upsertQuery = `
                INSERT INTO whatsapp_groups (user_id, group_jid, group_name)
                VALUES ?
                ON DUPLICATE KEY UPDATE group_name = VALUES(group_name);
            `;
            await connection.query(upsertQuery, [groupValues]);
        }
        await connection.commit();
        res.status(200).json({ message: `Successfully synced ${freshGroups.length} groups. Deleted ${groupsToDelete.length} obsolete groups.` });
    } catch (error) {
        await connection.rollback();
        console.error('Error syncing groups, transaction rolled back:', error);
        res.status(500).json({ message: error.message || 'An error occurred during group sync.' });
    } finally {
        connection.release();
    }
};

exports.broadcastMessage = (req, res) => {
    const { groupObjects, message, socketId } = req.body;

    if (!groupObjects || !message || !socketId || !Array.isArray(groupObjects)) {
        return res.status(400).json({ message: 'Invalid request body.' });
    }
    
    try {
        res.status(202).json({ message: 'Broadcast accepted and will start shortly.' });
        
        console.log(`[CONTROLLER] Handing off broadcast job to Baileys service for socket ${socketId}.`);
        baileysService.broadcast(req.io, socketId, groupObjects, message);

    } catch (error) {
        console.error("[CONTROLLER-ERROR] Failed to start broadcast job:", error);
        if (req.io && socketId) {
            req.io.to(socketId).emit('broadcast:error', { message: 'Failed to start the broadcast process on the server.' });
        }
    }
};