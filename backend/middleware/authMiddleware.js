// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // === THE FIX: Version Check ===
        // Fetch only the essential data for the check. This is very fast.
        const [[user]] = await pool.query(
            'SELECT token_version, is_active FROM users WHERE id = ?', 
            [decoded.id]
        );

        // If user doesn't exist, is inactive, or token version is stale, reject the token.
        if (!user || !user.is_active || user.token_version !== decoded.token_version) {
            return res.status(401).json({ message: 'Session is invalid. Please log in again.' });
        }

        // The token is valid and fresh. We can now trust its contents.
        // This avoids extra DB calls for permissions on every request.
        const roles = Array.isArray(decoded.roles)
            ? decoded.roles
            : (decoded.role ? [decoded.role] : []);

        req.user = {
            id: decoded.id,
            username: decoded.username,
            roles,
            role: roles[0] || decoded.role || null,
            permissions: decoded.permissions || []
        };
        
        next();
    } catch (error) {
        console.error('[AUTH MIDDLEWARE ERROR]', error);
        res.status(401).json({ message: 'Token is not valid or has expired.' });
    }
};
