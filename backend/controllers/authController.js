const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const checkPermission = require('../middleware/permissionMiddleware');
const { logAction } = require('../services/auditService');

const JWT_SECRET = process.env.JWT_SECRET;

exports.register = async (req, res) => {

    checkPermission('admin:manage_users'),
    async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required.' });
        }
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const [result] = await pool.query(
                'INSERT INTO users (username, password_hash) VALUES (?, ?)',
                [username, hashedPassword]
            );
            res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: 'Username already exists.' });
            }
            console.error('Registration error:', error);
            res.status(500).json({ message: 'Server error during registration.' });
        }
        await logAction(req, 'admin:manage_users', 'User', result.insertId, { created_user: username, assigned_role_id: role_id });
    }
    
};

exports.login = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = users[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash)) || !user.is_active) {
            return res.status(401).json({ message: 'Invalid credentials or account is inactive.' });
        }

        await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
        
        // Log the login event
        await logAction({ user: { id: user.id, username: user.username } }, 'auth:login');

        res.json({ token, user: { id: user.id, username: user.username } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};