const jwt = require('jsonwebtoken');
require('dotenv').config();
const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET;

module.exports = (req, res, next) => {
    console.log(`\n--- [PORTAL MIDDLEWARE] Request received for: ${req.method} ${req.originalUrl} ---`);
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
        console.log('[PORTAL MIDDLEWARE] SUCCESS: Token decoded successfully.');
        console.log('[PORTAL MIDDLEWARE] Decoded Payload:', JSON.stringify(decoded, null, 2));
        
        const decoded = jwt.verify(token, PORTAL_JWT_SECRET);
        
        // --- AGGRESSIVE DEBUGGING ---
        console.log('[MIDDLEWARE-DEBUG] Decoded payload:', decoded);
        
        if (!decoded.subaccountNumber) {
            console.error('[MIDDLEWARE-FATAL] subaccountNumber is MISSING from the decoded JWT payload!');
        } else {
            console.log(`[MIDDLEWARE-SUCCESS] Found subaccountNumber: '${decoded.subaccountNumber}'. Attaching to req.`);
        }
        
        // Attach the entire object AND the specific property to be safe.
        req.client = decoded; 
        req.subaccountNumberForPortal = decoded.subaccountNumber;
        // --- END AGGRESSIVE DEBUGGING ---

        next();
    } catch (error) {
        console.error('[MIDDLEWARE-ERROR] JWT verification failed:', error.message);
        res.status(401).json({ message: 'Token is not valid.' });
    }
};