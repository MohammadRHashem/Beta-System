const fs = require('fs-extra');
const baileysService = require('../services/baileys');
const pool = require('../config/db'); // <-- Make sure you have this import

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

// --- MODIFIED ---
// This function now quickly fetches groups from YOUR database.
exports.getGroups = async (req, res) => {
    try {
        // We use user_id = 1 as a placeholder for a single-user system
        const [groups] = await pool.query(
            'SELECT group_jid as id, group_name as name FROM whatsapp_groups WHERE user_id = 1 ORDER BY group_name'
        );
        res.status(200).json(groups);
    } catch (error) {
        console.error('Error fetching groups from DB:', error);
        res.status(500).json({ message: 'Failed to fetch groups from database.' });
    }
};

// --- NEW FUNCTION ---
// This function fetches groups from WhatsApp and saves them to your database.
exports.syncGroups = async (req, res) => {
    try {
        // Step 1: Fetch all groups fresh from Baileys/WhatsApp
        console.log('Starting group sync from WhatsApp...');
        const freshGroups = await baileysService.fetchAllGroups();
        console.log(`Fetched ${freshGroups.length} groups from WhatsApp.`);

        if (freshGroups.length === 0) {
            return res.status(200).json({ message: 'No groups found to sync.' });
        }

        // Step 2: Prepare the data for an "UPSERT" operation
        // (INSERT a new group, or UPDATE the name if it already exists)
        const groupValues = freshGroups.map(g => [1, g.id, g.name]); // user_id = 1

        // Step 3: Execute the UPSERT query
        const query = `
            INSERT INTO whatsapp_groups (user_id, group_jid, group_name)
            VALUES ?
            ON DUPLICATE KEY UPDATE group_name = VALUES(group_name);
        `;
        
        await pool.query(query, [groupValues]);
        console.log('Database sync complete.');

        res.status(200).json({ message: `Successfully synced ${freshGroups.length} groups.` });

    } catch (error) {
        console.error('Error syncing groups:', error);
        res.status(500).json({ message: error.message || 'An error occurred during group sync.' });
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