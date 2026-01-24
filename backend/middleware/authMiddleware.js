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
        // Step 1: Verify the token is valid and extract the user ID.
        // The payload in the token is now only used to identify the user, not for their permissions.
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // === START OF THE REAL-TIME HYDRATION LOGIC ===
        // Step 2: On every request, fetch the user's current role and status from the database.
        // This ensures that if a user is deactivated, their access is revoked instantly.
        const [[user]] = await pool.query(
            `SELECT u.id, u.username, u.role_id, r.name as role 
             FROM users u 
             LEFT JOIN rbac_roles r ON u.role_id = r.id 
             WHERE u.id = ? AND u.is_active = 1`, 
            [decoded.id]
        );

        if (!user) {
            return res.status(401).json({ message: 'User not found or is inactive.' });
        }

        // Step 3: On every request, fetch the current permissions for that user's role.
        // This is the core of the fix.
        const [permissions] = await pool.query(
            `SELECT p.action FROM rbac_permissions p 
             JOIN rbac_role_permissions rp ON p.id = rp.permission_id 
             WHERE rp.role_id = ?`,
            [user.role_id]
        );
        
        // Step 4: Build the fresh, up-to-the-second user object and attach it to the request.
        req.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            permissions: permissions.map(p => p.action)
        };
        // === END OF THE REAL-TIME HYDRATION LOGIC ===
        
        next();
    } catch (error) {
        // This will catch expired tokens or other JWT errors.
        res.status(401).json({ message: 'Token is not valid or has expired.' });
    }
};