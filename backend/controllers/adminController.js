const pool = require('../config/db');
const whatsappService = require('../services/whatsappService'); // Import the service


// GET all abbreviation admins for the logged-in user
exports.getAllAdmins = async (req, res) => {
    const userId = req.user.id;
    try {
        const [admins] = await pool.query(
            'SELECT * FROM abbreviation_admins WHERE user_id = ? ORDER BY name ASC',
            [userId]
        );
        res.json(admins);
    } catch (error) {
        console.error('Error fetching admins:', error);
        res.status(500).json({ message: 'Failed to fetch admins.' });
    }
};

// POST a new abbreviation admin
exports.addAdmin = async (req, res) => {
    const userId = req.user.id;
    const { name, admin_jid } = req.body;
    if (!name || !admin_jid) {
        return res.status(400).json({ message: 'Name and Admin JID are required.' });
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO abbreviation_admins (user_id, name, admin_jid) VALUES (?, ?, ?)',
            [userId, name, admin_jid]
        );
        res.status(201).json({ id: result.insertId, name, admin_jid });
        whatsappService.refreshAdminCache(); 
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This admin JID already exists.' });
        }
        console.error('Error adding admin:', error);
        res.status(500).json({ message: 'Failed to add admin.' });
    }
};

// DELETE an abbreviation admin
exports.deleteAdmin = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM abbreviation_admins WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Admin not found or you do not have permission.' });
        }
        res.status(204).send();
        whatsappService.refreshAdminCache(); 
    } catch (error) {
        console.error('Error deleting admin:', error);
        res.status(500).json({ message: 'Failed to delete admin.' });
    }
};