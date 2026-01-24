const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided, authorization denied.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Hydrate request with full user permissions
        const [[user]] = await pool.query('SELECT r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ? AND u.is_active = 1', [decoded.id]);
        if (!user) {
            return res.status(401).json({ message: 'User not found or is inactive.' });
        }

        const [permissions] = await pool.query(
            `SELECT p.action FROM permissions p 
             JOIN role_permissions rp ON p.id = rp.permission_id 
             WHERE rp.role_id = (SELECT role_id FROM users WHERE id = ?)`,
            [decoded.id]
        );

        req.user = {
            id: decoded.id,
            username: decoded.username,
            role: user.role,
            permissions: permissions.map(p => p.action)
        };
        
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token is not valid or has expired.' });
    }
};