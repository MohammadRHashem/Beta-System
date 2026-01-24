// backend/middleware/authMiddleware.js
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
        
        // Fetch the user's current role and status from the database.
        const [[user]] = await pool.query(
            // === FIX 1: Use `roles` table ===
            `SELECT u.id, u.username, u.role_id, r.name as role 
             FROM users u 
             LEFT JOIN roles r ON u.role_id = r.id 
             WHERE u.id = ? AND u.is_active = 1`, 
            [decoded.id]
        );

        if (!user) {
            return res.status(401).json({ message: 'User not found or is inactive.' });
        }

        // Fetch the current permissions for that user's role.
        const [permissions] = await pool.query(
            // === FIX 2: Use `permissions` and `role_permissions` tables ===
            `SELECT p.action FROM permissions p 
             JOIN role_permissions rp ON p.id = rp.permission_id 
             WHERE rp.role_id = ?`,
            [user.role_id] // Use the role_id we just fetched
        );
        
        // Build the fresh user object and attach it to the request.
        req.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            permissions: permissions.map(p => p.action)
        };
        
        next();
    } catch (error) {
        // This will catch expired tokens or DB errors.
        console.error('[AUTH MIDDLEWARE ERROR]', error); // Added for better debugging
        res.status(401).json({ message: 'Token is not valid or has expired.' });
    }
};