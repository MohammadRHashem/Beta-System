const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { logAction } = require('../services/auditService');

// ==== USER MANAGEMENT ====

exports.getAllUsers = async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT u.id, u.username, u.is_active, u.last_login, r.name as role_name 
             FROM users u 
             LEFT JOIN roles r ON u.role_id = r.id 
             ORDER BY u.username`
        );
        res.json(users);
    } catch (error) {
        console.error('Failed to get users:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.createUser = async (req, res) => {
    const { username, password, role_id } = req.body;
    if (!username || !password || !role_id) {
        return res.status(400).json({ message: 'Username, password, and role are required.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (username, password_hash, role_id) VALUES (?, ?, ?)',
            [username, hashedPassword, role_id]
        );
        
        await logAction(req, 'admin:manage_users', 'User', result.insertId, { created_user: username, role_id });
        res.status(201).json({ id: result.insertId, username });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Username already exists.' });
        }
        console.error('Failed to create user:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { role_id, is_active, password } = req.body;

    // Build query dynamically
    let fields = [];
    let params = [];
    if (role_id) { fields.push('role_id = ?'); params.push(role_id); }
    if (is_active !== undefined) { fields.push('is_active = ?'); params.push(is_active); }
    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        fields.push('password_hash = ?');
        params.push(hashedPassword);
    }

    if (fields.length === 0) {
        return res.status(400).json({ message: 'No fields to update.' });
    }

    params.push(id);
    params.push(req.user.id); // Ensure user cannot edit themselves

    try {
        const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ? AND id != ?`;
        const [result] = await pool.query(query, params);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found or you cannot edit your own account.' });
        }
        await logAction(req, 'admin:manage_users', 'User', id, { updated_fields: req.body });
        res.json({ message: 'User updated successfully.' });
    } catch (error) {
        console.error('Failed to update user:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};


// ==== ROLE & PERMISSION MANAGEMENT ====

exports.getAllRoles = async (req, res) => {
    try {
        const [roles] = await pool.query('SELECT id, name, description FROM roles ORDER BY name');
        res.json(roles);
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.getRolePermissions = async (req, res) => {
    const { id } = req.params;
    try {
        const [permissions] = await pool.query(
            `SELECT p.id, p.action, p.module, p.description, (rp.permission_id IS NOT NULL) AS has_permission
             FROM permissions p
             LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role_id = ?
             ORDER BY p.module, p.action`,
            [id]
        );
        res.json(permissions);
    } catch (error) {
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.updateRolePermissions = async (req, res) => {
    const { id } = req.params;
    const { permissionIds } = req.body; // Expects an array of numbers
    if (!Array.isArray(permissionIds)) {
        return res.status(400).json({ message: 'permissionIds must be an array.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // Clear existing permissions for this role
        await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);
        
        // Insert new ones if any are provided
        if (permissionIds.length > 0) {
            const values = permissionIds.map(pid => [id, pid]);
            await connection.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [values]);
        }
        
        await connection.commit();
        await logAction(req, 'admin:manage_roles', 'Role', id, { new_permission_count: permissionIds.length });
        res.json({ message: 'Role permissions updated successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('Failed to update role permissions:', error);
        res.status(500).json({ message: 'Server error.' });
    } finally {
        connection.release();
    }
};

exports.createRole = async (req, res) => {
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Role name is required.' });
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO roles (name, description) VALUES (?, ?)',
            [name, description || null]
        );
        await logAction(req, 'admin:manage_roles', 'Role', result.insertId, { created_role: name });
        res.status(201).json({ id: result.insertId, name, description });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'A role with this name already exists.' });
        }
        console.error('Failed to create role:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.updateRole = async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Role name is required.' });
    }
    // Prevent editing of the Administrator role
    if (id == 1) {
        return res.status(403).json({ message: 'The Administrator role cannot be modified.' });
    }
    try {
        const [result] = await pool.query(
            'UPDATE roles SET name = ?, description = ? WHERE id = ?',
            [name, description || null, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Role not found.' });
        }
        await logAction(req, 'admin:manage_roles', 'Role', id, { updated_fields: { name, description } });
        res.json({ message: 'Role updated successfully.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'A role with this name already exists.' });
        }
        console.error('Failed to update role:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};

// ==== AUDIT LOG ====

exports.getAuditLogs = async (req, res) => {
    const { page = 1, limit = 50, userId, action, dateFrom, dateTo } = req.query;
    const offset = (page - 1) * limit;

    let query = 'FROM audit_log WHERE 1=1';
    const params = [];

    if (userId) { query += ' AND user_id = ?'; params.push(userId); }
    if (action) { query += ' AND action = ?'; params.push(action); }
    if (dateFrom) { query += ' AND timestamp >= ?'; params.push(dateFrom); }
    if (dateTo) { query += ' AND timestamp <= ?'; params.push(`${dateTo} 23:59:59`); }

    try {
        const countQuery = `SELECT COUNT(*) as total ${query}`;
        const [[{ total }]] = await pool.query(countQuery, params);

        const dataQuery = `SELECT * ${query} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
        const [logs] = await pool.query(dataQuery, [...params, parseInt(limit), parseInt(offset)]);

        res.json({
            logs,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
        });
    } catch (error) {
        console.error('Failed to get audit logs:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};