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
        // Add client-specific info to the request object for use in controllers
        req.client = decoded; 
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token is not valid.' });
    }
};