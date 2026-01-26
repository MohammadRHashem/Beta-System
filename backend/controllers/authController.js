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
        // Fetch user from the new `users` table, INCLUDING token_version
        const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        const user = users[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash)) || !user.is_active) {
            return res.status(401).json({ message: 'Invalid credentials or account is inactive.' });
        }

        let [roleRows] = await pool.query(
            `SELECT r.id, r.name
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = ?`,
            [user.id]
        );

        if (roleRows.length === 0 && user.role_id) {
            const [[roleFallback]] = await pool.query('SELECT id, name FROM roles WHERE id = ?', [user.role_id]);
            roleRows = roleFallback ? [roleFallback] : [];
        }

        const roleIds = roleRows.map(r => r.id);
        const roleNames = roleRows.map(r => r.name);

        let permissions = [];
        if (roleIds.length > 0) {
            const [permissionRows] = await pool.query(
                `SELECT DISTINCT p.action FROM permissions p
                 JOIN role_permissions rp ON p.id = rp.permission_id
                 WHERE rp.role_id IN (?)`,
                [roleIds]
            );
            permissions = permissionRows.map(p => p.action);
        }

        // Update the last_login timestamp
        await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
        
        // Create the NEW, enriched JWT payload
        // === THE FIX: Add token_version to the JWT payload ===
        const tokenPayload = { 
            id: user.id, 
            username: user.username,
            roles: roleNames,
            role: roleNames[0] || null,
            role_ids: roleIds,
            permissions,
            token_version: user.token_version
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });
        
        await logAction({ user: { id: user.id, username: user.username } }, 'auth:login');
        
        res.json({ token, user: { id: user.id, username: user.username } });
        // === END OF THE NEW LOGIC ===

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};
