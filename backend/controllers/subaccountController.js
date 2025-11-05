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
            return res.status(404).json({ message: 'No WhatsApp group is assigned to this subaccount. Credentials cannot be generated or viewed.' });
        }
        
        // === THE FIX: Generate username from the FIRST word of the group name ===
        const username = subaccount.assigned_group_name.split(' ')[0].replace(/[\s\W-]+/g, '').toLowerCase();

        const [[existingClient]] = await pool.query('SELECT password_hash FROM clients WHERE subaccount_id = ?', [subaccountId]);

        if (existingClient) {
            res.json({
                username: username,
                password: '•••••••••• (Hidden for security)',
                message: 'Credentials already exist.'
            });
        } else {
            const password = crypto.randomBytes(4).toString('hex');
            const hashedPassword = await bcrypt.hash(password, 10);

            // Here we check if the username already exists before inserting
            try {
                await pool.query(
                    'INSERT INTO clients (subaccount_id, username, password_hash) VALUES (?, ?, ?)',
                    [subaccountId, username, hashedPassword]
                );
            } catch (insertError) {
                if (insertError.code === 'ER_DUP_ENTRY' && insertError.message.includes('unique_username')) {
                    // If the auto-generated username already exists, append a number
                    const newUsername = `${username}${subaccountId}`;
                    await pool.query(
                        'INSERT INTO clients (subaccount_id, username, password_hash) VALUES (?, ?, ?)',
                        [subaccountId, newUsername, hashedPassword]
                    );
                     res.status(201).json({
                        username: newUsername,
                        password: password,
                        message: 'New credentials generated. Username was adjusted for uniqueness.'
                    });
                    return;
                }
                throw insertError; // Re-throw other errors
            }
            
            res.status(201).json({
                username: username,
                password: password,
                message: 'New credentials generated. Save the password now.'
            });
        }
    } catch (error) {
        console.error('[ERROR] Failed to get/create client credentials:', error);
        res.status(500).json({ message: 'Failed to process credentials.' });
    }
};

// POST /api/subaccounts/:id/reset-password
exports.resetPassword = async (req, res) => {
    const userId = req.user.id;
    const { id: subaccountId } = req.params;

    try {
        const [[subaccount]] = await pool.query(
            'SELECT id FROM subaccounts WHERE id = ? AND user_id = ?', 
            [subaccountId, userId]
        );

        if (!subaccount) {
            return res.status(404).json({ message: 'Subaccount not found.' });
        }
        
        // Generate a new simple password
        const newPassword = crypto.randomBytes(4).toString('hex');
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the password in the clients table
        const [result] = await pool.query(
            'UPDATE clients SET password_hash = ? WHERE subaccount_id = ?',
            [hashedPassword, subaccountId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'No existing credentials found to reset. Please generate them first.' });
        }

        // Return the NEW password so the admin can copy it
        res.json({
            password: newPassword,
            message: 'Password has been reset successfully. Save the new password now.'
        });

    } catch (error) {
        console.error('[ERROR] Failed to reset client password:', error);
        res.status(500).json({ message: 'Failed to reset password.' });
    }
};