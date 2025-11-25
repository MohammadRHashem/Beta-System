const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// GET all subaccounts for the logged-in user
exports.getAll = async (req, res) => {
    const userId = req.user.id;
    try {
        const [subaccounts] = await pool.query(
            'SELECT * FROM subaccounts WHERE user_id = ? ORDER BY name ASC',
            [userId]
        );
        res.json(subaccounts);
    } catch (error) {
        console.error('[ERROR] Failed to fetch subaccounts:', error);
        res.status(500).json({ message: 'Failed to fetch subaccounts.' });
    }
};

// POST a new subaccount
exports.create = async (req, res) => {
    const userId = req.user.id;
    const { name, subaccount_number, chave_pix, assigned_group_jid } = req.body;

    if (!name || !subaccount_number) {
        return res.status(400).json({ message: 'Subaccount name and number are required.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        let groupName = null;
        if (assigned_group_jid) {
            const [[group]] = await connection.query('SELECT group_name FROM whatsapp_groups WHERE group_jid = ?', [assigned_group_jid]);
            if (group) {
                groupName = group.group_name;
            }
        }
        
        const [result] = await connection.query(
            'INSERT INTO subaccounts (user_id, name, subaccount_number, chave_pix, assigned_group_jid, assigned_group_name) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, name, subaccount_number, chave_pix || null, assigned_group_jid || null, groupName]
        );
        
        await connection.commit();
        res.status(201).json({ id: result.insertId, message: 'Subaccount created successfully.' });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('unique_subaccount_number')) {
                return res.status(409).json({ message: 'This subaccount number already exists.' });
            }
            if (error.message.includes('unique_assigned_group_jid')) {
                return res.status(409).json({ message: 'This WhatsApp group is already assigned to another subaccount.' });
            }
        }
        console.error('[ERROR] Failed to create subaccount:', error);
        res.status(500).json({ message: 'Failed to create subaccount.' });
    } finally {
        connection.release();
    }
};

// PUT (update) an existing subaccount
exports.update = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, subaccount_number, chave_pix, assigned_group_jid } = req.body;

    if (!name || !subaccount_number) {
        return res.status(400).json({ message: 'Subaccount name and number are required.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        let groupName = null;
        if (assigned_group_jid) {
            const [[group]] = await connection.query('SELECT group_name FROM whatsapp_groups WHERE group_jid = ?', [assigned_group_jid]);
            if (group) {
                groupName = group.group_name;
            }
        }

        const [result] = await connection.query(
            'UPDATE subaccounts SET name = ?, subaccount_number = ?, chave_pix = ?, assigned_group_jid = ?, assigned_group_name = ? WHERE id = ? AND user_id = ?',
            [name, subaccount_number, chave_pix || null, assigned_group_jid || null, groupName, id, userId]
        );

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Subaccount not found or you do not have permission to edit it.' });
        }

        await connection.commit();
        res.json({ message: 'Subaccount updated successfully.' });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
             if (error.message.includes('unique_subaccount_number')) {
                return res.status(409).json({ message: 'This subaccount number already exists.' });
            }
            if (error.message.includes('unique_assigned_group_jid')) {
                return res.status(409).json({ message: 'This WhatsApp group is already assigned to another subaccount.' });
            }
        }
        console.error('[ERROR] Failed to update subaccount:', error);
        res.status(500).json({ message: 'Failed to update subaccount.' });
    } finally {
        connection.release();
    }
};

// DELETE a subaccount
exports.delete = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM subaccounts WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Subaccount not found or you do not have permission to delete it.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('[ERROR] Failed to delete subaccount:', error);
        res.status(500).json({ message: 'Failed to delete subaccount.' });
    }
};


exports.getCredentials = async (req, res) => {
    const userId = req.user.id;
    const { id: subaccountId } = req.params;

    try {
        const [[subaccount]] = await pool.query(
            'SELECT name, assigned_group_name FROM subaccounts WHERE id = ? AND user_id = ?', 
            [subaccountId, userId]
        );

        if (!subaccount) {
            return res.status(404).json({ message: 'Subaccount not found.' });
        }
        if (!subaccount.assigned_group_name) {
            return res.status(404).json({ message: 'No WhatsApp group is assigned. Cannot generate credentials.' });
        }
        
        const username = subaccount.assigned_group_name.split(' ')[0].replace(/[\s\W-]+/g, '').toLowerCase();

        const [[existingClient]] = await pool.query('SELECT password_hash, view_only_password_hash FROM clients WHERE subaccount_id = ?', [subaccountId]);

        let masterPassword = null;
        let viewOnlyPassword = null;
        let message = "";

        if (existingClient) {
            // Mask existing passwords
            masterPassword = existingClient.password_hash ? '••••••••••' : null;
            viewOnlyPassword = existingClient.view_only_password_hash ? '••••••••••' : null;
            message = "Credentials exist.";
            
            // If view-only is missing, generate it transparently
            if (!existingClient.view_only_password_hash) {
                const newVoPass = crypto.randomBytes(4).toString('hex');
                const hashedVoPass = await bcrypt.hash(newVoPass, 10);
                await pool.query('UPDATE clients SET view_only_password_hash = ? WHERE subaccount_id = ?', [hashedVoPass, subaccountId]);
                viewOnlyPassword = newVoPass; // Return plain text just this once
                message += " Generated missing View-Only password.";
            }
        } else {
            // Generate BOTH fresh
            const mPass = crypto.randomBytes(4).toString('hex');
            const voPass = crypto.randomBytes(4).toString('hex');
            const hashM = await bcrypt.hash(mPass, 10);
            const hashV = await bcrypt.hash(voPass, 10);

            try {
                await pool.query(
                    'INSERT INTO clients (subaccount_id, username, password_hash, view_only_password_hash) VALUES (?, ?, ?, ?)',
                    [subaccountId, username, hashM, hashV]
                );
                masterPassword = mPass;
                viewOnlyPassword = voPass;
                message = "New credentials generated for both modes.";
            } catch (insertError) {
                // Handle unique username collision
                if (insertError.code === 'ER_DUP_ENTRY') {
                    const newUsername = `${username}${subaccountId}`;
                    await pool.query(
                        'INSERT INTO clients (subaccount_id, username, password_hash, view_only_password_hash) VALUES (?, ?, ?, ?)',
                        [subaccountId, newUsername, hashM, hashV]
                    );
                    return res.status(201).json({
                        username: newUsername,
                        masterPassword: mPass,
                        viewOnlyPassword: voPass,
                        message: 'Credentials generated. Username adjusted.'
                    });
                }
                throw insertError;
            }
        }

        res.json({
            username,
            masterPassword,
            viewOnlyPassword,
            message
        });

    } catch (error) {
        console.error('[ERROR] Failed to get/create client credentials:', error);
        res.status(500).json({ message: 'Failed to process credentials.' });
    }
};

exports.resetPassword = async (req, res) => {
    const userId = req.user.id;
    const { id: subaccountId } = req.params;
    const { type } = req.body; // 'master' or 'view_only'

    if (!type || !['master', 'view_only'].includes(type)) {
        return res.status(400).json({ message: 'Invalid password type.' });
    }

    try {
        const [[subaccount]] = await pool.query('SELECT id FROM subaccounts WHERE id = ? AND user_id = ?', [subaccountId, userId]);
        if (!subaccount) return res.status(404).json({ message: 'Subaccount not found.' });
        
        const newPassword = crypto.randomBytes(4).toString('hex');
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const column = type === 'master' ? 'password_hash' : 'view_only_password_hash';
        
        const [result] = await pool.query(
            `UPDATE clients SET ${column} = ? WHERE subaccount_id = ?`,
            [hashedPassword, subaccountId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'No existing client found to reset.' });
        }

        res.json({
            password: newPassword,
            type: type,
            message: `Successfully reset ${type === 'master' ? 'Master' : 'View-Only'} password.`
        });

    } catch (error) {
        console.error('[ERROR] Failed to reset client password:', error);
        res.status(500).json({ message: 'Failed to reset password.' });
    }
};