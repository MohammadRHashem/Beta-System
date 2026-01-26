const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { logAction } = require('../services/auditService');

// ==== USER MANAGEMENT ====

exports.getAllUsers = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT 
                u.id, u.username, u.is_active, u.last_login, 
                r.id as role_id, r.name as role_name
             FROM users u
             LEFT JOIN user_roles ur ON u.id = ur.user_id
             LEFT JOIN roles r ON r.id = COALESCE(ur.role_id, u.role_id)
             ORDER BY u.username, r.name`
        );

        const usersById = new Map();
        rows.forEach(row => {
            if (!usersById.has(row.id)) {
                usersById.set(row.id, {
                    id: row.id,
                    username: row.username,
                    is_active: row.is_active,
                    last_login: row.last_login,
                    role_ids: [],
                    role_names: []
                });
            }

            if (row.role_id) {
                const user = usersById.get(row.id);
                if (!user.role_ids.includes(row.role_id)) {
                    user.role_ids.push(row.role_id);
                    user.role_names.push(row.role_name);
                }
            }
        });

        res.json(Array.from(usersById.values()));
    } catch (error) {
        console.error('Failed to get users:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};

exports.createUser = async (req, res) => {
    const { username, password, role_ids } = req.body;
    if (!username || !password || !Array.isArray(role_ids) || role_ids.length === 0) {
        return res.status(400).json({ message: 'Username, password, and at least one role are required.' });
    }

    const normalizedRoleIds = Array.from(new Set(role_ids.map(id => parseInt(id, 10)).filter(Number.isInteger)));
    if (normalizedRoleIds.length === 0) {
        return res.status(400).json({ message: 'At least one valid role is required.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await connection.query(
            'INSERT INTO users (username, password_hash, role_id) VALUES (?, ?, ?)',
            [username, hashedPassword, normalizedRoleIds[0] || null]
        );

        const values = normalizedRoleIds.map(roleId => [result.insertId, roleId]);
        await connection.query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [values]);

        await connection.commit();
        await logAction(req, 'admin:manage_users', 'User', result.insertId, { created_user: username, role_ids: normalizedRoleIds });
        res.status(201).json({ id: result.insertId, username });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Username already exists.' });
        }
        console.error('Failed to create user:', error);
        res.status(500).json({ message: 'Server error.' });
    } finally {
        connection.release();
    }
};

exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { role_ids, role_id, is_active, password } = req.body;

    let normalizedRoleIds = null;
    if (Array.isArray(role_ids)) {
        normalizedRoleIds = Array.from(new Set(role_ids.map(rid => parseInt(rid, 10)).filter(Number.isInteger)));
        if (role_ids.length > 0 && normalizedRoleIds.length === 0) {
            return res.status(400).json({ message: 'At least one valid role is required.' });
        }
    } else if (role_id !== undefined) {
        const singleRoleId = parseInt(role_id, 10);
        if (!Number.isInteger(singleRoleId)) {
            return res.status(400).json({ message: 'Invalid role provided.' });
        }
        normalizedRoleIds = [singleRoleId];
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [[target]] = await connection.query(
            'SELECT id FROM users WHERE id = ? AND id != ?',
            [id, req.user.id]
        );
        if (!target) {
            await connection.rollback();
            return res.status(404).json({ message: 'User not found or you cannot edit your own account.' });
        }

        let fields = [];
        let params = [];
        let shouldBumpToken = false;

        if (normalizedRoleIds !== null) {
            fields.push('role_id = ?');
            params.push(normalizedRoleIds[0] || null);
            shouldBumpToken = true;
        }

        if (is_active !== undefined) {
            fields.push('is_active = ?');
            params.push(is_active);
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            fields.push('password_hash = ?');
            params.push(hashedPassword);
            shouldBumpToken = true;
        }

        if (shouldBumpToken) {
            fields.push('token_version = token_version + 1');
        }

        if (fields.length === 0 && normalizedRoleIds === null) {
            await connection.rollback();
            return res.status(400).json({ message: 'No fields to update.' });
        }

        if (fields.length > 0) {
            params.push(id);
            const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
            await connection.query(query, params);
        }

        if (normalizedRoleIds !== null) {
            await connection.query('DELETE FROM user_roles WHERE user_id = ?', [id]);
            if (normalizedRoleIds.length > 0) {
                const values = normalizedRoleIds.map(roleId => [id, roleId]);
                await connection.query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [values]);
            }
        }

        await connection.commit();
        await logAction(req, 'admin:manage_users', 'User', id, { updated_fields: req.body });
        res.json({ message: 'User updated successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('Failed to update user:', error);
        res.status(500).json({ message: 'Server error.' });
    } finally {
        connection.release();
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
    const { id: roleId } = req.params;
    const { permissionIds } = req.body;
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
        
        if (permissionIds.length > 0) {
            const values = permissionIds.map(pid => [roleId, pid]);
            await connection.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [values]);
        }
        
        // === THE FIX: Invalidate tokens for all users with this role ===
        await connection.query(
            `UPDATE users 
             SET token_version = token_version + 1 
             WHERE id IN (SELECT user_id FROM user_roles WHERE role_id = ?)
                OR role_id = ?`,
            [roleId, roleId]
        );
        
        await connection.commit();
        await logAction(req, 'admin:manage_roles', 'Role', roleId, { new_permission_count: permissionIds.length });
        res.json({ message: 'Role permissions updated. Affected users will need to log in again.' });
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
