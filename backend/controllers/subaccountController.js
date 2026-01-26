const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { syncSingleSubaccount } = require('../xpayzSyncService');

// GET all subaccounts (permission-gated)
exports.getAll = async (req, res) => {
    try {
        const [subaccounts] = await pool.query(
            // --- MODIFIED: Select account_type ---
            'SELECT id, name, account_type, subaccount_number, chave_pix, assigned_group_name FROM subaccounts ORDER BY name ASC'
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
    const { name, account_type, subaccount_number, chave_pix, assigned_group_jid } = req.body;

    if (!name || !account_type) {
        return res.status(400).json({ message: 'Subaccount name and type are required.' });
    }
    if (account_type === 'xpayz' && !subaccount_number) {
        return res.status(400).json({ message: 'Subaccount Number is required for XPayz type.' });
    }
    if (account_type === 'cross' && !chave_pix) {
        return res.status(400).json({ message: 'Chave PIX is required for Cross type.' });
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
            'INSERT INTO subaccounts (user_id, name, account_type, subaccount_number, chave_pix, assigned_group_jid, assigned_group_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, name, account_type, subaccount_number || null, chave_pix || null, assigned_group_jid || null, groupName]
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
    const { id } = req.params;
    const { name, account_type, subaccount_number, chave_pix, assigned_group_jid } = req.body;

    if (!name || !account_type) {
        return res.status(400).json({ message: 'Subaccount name and type are required.' });
    }
    if (account_type === 'xpayz' && !subaccount_number) {
        return res.status(400).json({ message: 'Subaccount Number is required for XPayz type.' });
    }
    if (account_type === 'cross' && !chave_pix) {
        return res.status(400).json({ message: 'Chave PIX is required for Cross type.' });
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
            'UPDATE subaccounts SET name = ?, account_type = ?, subaccount_number = ?, chave_pix = ?, assigned_group_jid = ?, assigned_group_name = ? WHERE id = ?',
            [name, account_type, subaccount_number || null, chave_pix || null, assigned_group_jid || null, groupName, id]
        );

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Subaccount not found.' });
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
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM subaccounts WHERE id = ?',
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Subaccount not found.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('[ERROR] Failed to delete subaccount:', error);
        res.status(500).json({ message: 'Failed to delete subaccount.' });
    }
};


exports.getCredentials = async (req, res) => {
    const { id: subaccountId } = req.params;

    try {
        const [[subaccount]] = await pool.query(
            'SELECT name, assigned_group_name FROM subaccounts WHERE id = ?', 
            [subaccountId]
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

exports.triggerHardRefresh = async (req, res) => {
    const { id: subaccountId } = req.params;

    try {
        // Find the subaccount to get its platform-specific number
        const [[subaccount]] = await pool.query(
            'SELECT subaccount_number, account_type FROM subaccounts WHERE id = ?',
            [subaccountId]
        );

        if (!subaccount) {
            return res.status(404).json({ message: 'Subaccount not found.' });
        }

        if (subaccount.account_type !== 'xpayz' || !subaccount.subaccount_number) {
            return res.status(400).json({ message: 'This operation is only available for XPayz subaccounts with a valid number.' });
        }

        // We don't wait for the sync to finish. We trigger it and respond immediately.
        // We pass the new 'historical' flag.
        syncSingleSubaccount(subaccount.subaccount_number, true); // true for historical

        res.status(202).json({ message: `A full historical sync has been started for subaccount ${subaccount.subaccount_number}. It will run in the background.` });

    } catch (error) {
        console.error(`[HARD-REFRESH-ERROR] for subaccount ID ${subaccountId}:`, error);
        res.status(500).json({ message: 'Failed to start the hard refresh process.' });
    }
};

exports.resetPassword = async (req, res) => {
    const { id: subaccountId } = req.params;
    const { type } = req.body; // 'master' or 'view_only'

    if (!type || !['master', 'view_only'].includes(type)) {
        return res.status(400).json({ message: 'Invalid password type.' });
    }

    try {
        const [[subaccount]] = await pool.query('SELECT id FROM subaccounts WHERE id = ?', [subaccountId]);
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

exports.getRecibosTransactions = async (req, res) => {
    const { subaccountId } = req.params;

    try {
        // 1. Get transactions currently in this "Recibos" subaccount
        const [transactions] = await pool.query(
            `SELECT id, sender_name, amount, transaction_date 
             FROM xpayz_transactions 
             WHERE subaccount_id = ? 
             ORDER BY transaction_date DESC 
             LIMIT 200`,
            [subaccountId]
        );

        // 2. Smart Matching: For each transaction, check history
        const enhancedTransactions = await Promise.all(transactions.map(async (tx) => {
            if (!tx.sender_name) return { ...tx, suggestion: null };

            // Find where this sender sends money most often (excluding the Recibos account itself)
            const query = `
                SELECT s.id, s.name, COUNT(*) as match_count
                FROM xpayz_transactions xt
                JOIN subaccounts s ON xt.subaccount_id = s.subaccount_number
                WHERE xt.sender_name = ? 
                AND xt.subaccount_id != ?
                GROUP BY s.id, s.name
                ORDER BY match_count DESC
                LIMIT 1
            `;
            const [[bestMatch]] = await pool.query(query, [tx.sender_name, subaccountId]);

            let suggestion = null;
            if (bestMatch) {
                // Calculate a rudimentary confidence based on count
                const confidence = Math.min(bestMatch.match_count * 10, 100); 
                suggestion = {
                    subaccountId: bestMatch.id,
                    subaccountName: bestMatch.name,
                    confidence: confidence,
                    reason: `${bestMatch.match_count} prev. txs`
                };
            }

            return { ...tx, suggestion };
        }));

        res.json(enhancedTransactions);

    } catch (error) {
        console.error('[RECIBOS-ERROR]', error);
        res.status(500).json({ message: 'Failed to fetch Recibos transactions.' });
    }
};

// === NEW: Reassign Transaction Logic ===
exports.reassignTransaction = async (req, res) => {
    const { transactionId, targetSubaccountNumber } = req.body;

    if (!transactionId || !targetSubaccountNumber) {
        return res.status(400).json({ message: 'Missing Transaction ID or Target Subaccount.' });
    }

    try {
        // Simply update the subaccount_id link in the database
        const [result] = await pool.query(
            `UPDATE xpayz_transactions SET subaccount_id = ? WHERE id = ?`,
            [targetSubaccountNumber, transactionId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        res.json({ message: 'Transaction successfully reassigned.' });

    } catch (error) {
        console.error('[REASSIGN-ERROR]', error);
        res.status(500).json({ message: 'Failed to reassign transaction.' });
    }
};
