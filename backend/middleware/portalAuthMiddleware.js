const jwt = require('jsonwebtoken');
require('dotenv').config();
const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET;

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided, authorization denied.' });
    }

    const token = authHeader.split(' ')[1];
    if (!PORTAL_JWT_SECRET) {
        console.error("FATAL: PORTAL_JWT_SECRET is not defined in .env file.");
        return res.status(500).json({ message: 'Server configuration error.' });
    }

    try {
        const decoded = jwt.verify(token, PORTAL_JWT_SECRET);
        
        // === THE FIX: Use console.log directly on the object. ===
        // This avoids the JSON.stringify error with complex objects.
        // It's still useful for debugging the confirmation issue.
        console.log('[PORTAL MIDDLEWARE] Decoded Payload:', decoded);
        
        req.client = decoded; 
        next();
    } catch (error) {
        // This catch block will now only trigger for actual token validation errors (e.g., expired, invalid signature)
        console.error('[PORTAL MIDDLEWARE] FAILED: JWT verification error:', error.message);
        res.status(401).json({ message: 'Token is not valid.' });
    }
};