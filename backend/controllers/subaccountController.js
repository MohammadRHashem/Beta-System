const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { syncSingleSubaccount } = require('../xpayzSyncService');
const { logAction } = require('../services/auditService');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const transactionService = require('../services/subaccountTransactionService');
const profileService = require('../services/subaccountProfileService');
require('dotenv').config();

const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET;

const hasAdvancedPortalAccess = (user = {}) => {
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    const roles = Array.isArray(user.roles)
        ? user.roles
        : (user.role ? [user.role] : []);
    return roles.includes('Administrator') || permissions.includes('subaccount:portal_advanced');
};

const normalizePortalSourceType = (value) => (value === 'invoices' ? 'invoices' : 'transactions');

const sanitizeInvoicePattern = (value) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed.slice(0, 255) : null;
};

const sanitizePortalUsername = (value) => {
    if (value == null) return null;
    const trimmed = String(value).trim().toLowerCase();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/[^a-z0-9._-]/g, '');
    if (normalized.length < 3 || normalized.length > 50) return null;
    return normalized;
};

const resolvePortalConfig = ({ user, body, currentSubaccount = null }) => {
    const advancedAccess = hasAdvancedPortalAccess(user);

    if (!advancedAccess) {
        if (currentSubaccount) {
            return {
                portalSourceType: currentSubaccount.portal_source_type || 'transactions',
                invoiceRecipientPattern: currentSubaccount.invoice_recipient_pattern || null
            };
        }
        return {
            portalSourceType: 'transactions',
            invoiceRecipientPattern: null
        };
    }

    const portalSourceType = normalizePortalSourceType(body.portal_source_type);
    const invoiceRecipientPattern = portalSourceType === 'invoices'
        ? sanitizeInvoicePattern(body.invoice_recipient_pattern)
        : null;

    if (portalSourceType === 'invoices' && !invoiceRecipientPattern) {
        const error = new Error('Invoice recipient pattern is required for invoice-driven portal subaccounts.');
        error.status = 400;
        throw error;
    }

    return {
        portalSourceType,
        invoiceRecipientPattern
    };
};

const normalizeDateTime = (value) => {
    if (!value || typeof value !== 'string') return null;
    let trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.includes('T')) trimmed = trimmed.replace('T', ' ');
    if (trimmed.endsWith('Z')) trimmed = trimmed.slice(0, -1);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) {
        trimmed += ':00';
    }
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
        return null;
    }
    return trimmed;
};

const generateUuid = () => {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }
    const bytes = crypto.randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// GET all subaccounts (permission-gated)
exports.getAll = async (req, res) => {
    try {
        const [subaccounts] = await pool.query(
            `
                SELECT
                    id,
                    name,
                    account_type,
                    portal_source_type,
                    invoice_recipient_pattern,
                    subaccount_number,
                    chave_pix,
                    assigned_group_jid,
                    assigned_group_name
                FROM subaccounts
                ORDER BY name ASC
            `
        );
        if (!hasAdvancedPortalAccess(req.user)) {
            return res.json(subaccounts.map((subaccount) => ({
                ...subaccount,
                portal_source_type: 'transactions',
                invoice_recipient_pattern: null
            })));
        }
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
        const { portalSourceType, invoiceRecipientPattern } = resolvePortalConfig({
            user: req.user,
            body: req.body
        });

        let groupName = null;
        if (assigned_group_jid) {
            const [[group]] = await connection.query('SELECT group_name FROM whatsapp_groups WHERE group_jid = ?', [assigned_group_jid]);
            if (group) {
                groupName = group.group_name;
            }
        }
        
        const [result] = await connection.query(
            `
                INSERT INTO subaccounts (
                    user_id, name, account_type, portal_source_type, invoice_recipient_pattern,
                    subaccount_number, chave_pix, assigned_group_jid, assigned_group_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                userId,
                name,
                account_type,
                portalSourceType,
                invoiceRecipientPattern,
                subaccount_number || null,
                chave_pix || null,
                assigned_group_jid || null,
                groupName
            ]
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
        const [[existingSubaccount]] = await connection.query(
            'SELECT id, portal_source_type, invoice_recipient_pattern FROM subaccounts WHERE id = ?',
            [id]
        );

        if (!existingSubaccount) {
            await connection.rollback();
            return res.status(404).json({ message: 'Subaccount not found.' });
        }

        const { portalSourceType, invoiceRecipientPattern } = resolvePortalConfig({
            user: req.user,
            body: req.body,
            currentSubaccount: existingSubaccount
        });

        let groupName = null;
        if (assigned_group_jid) {
            const [[group]] = await connection.query('SELECT group_name FROM whatsapp_groups WHERE group_jid = ?', [assigned_group_jid]);
            if (group) {
                groupName = group.group_name;
            }
        }

        const [result] = await connection.query(
            `
                UPDATE subaccounts
                SET name = ?,
                    account_type = ?,
                    portal_source_type = ?,
                    invoice_recipient_pattern = ?,
                    subaccount_number = ?,
                    chave_pix = ?,
                    assigned_group_jid = ?,
                    assigned_group_name = ?
                WHERE id = ?
            `,
            [
                name,
                account_type,
                portalSourceType,
                invoiceRecipientPattern,
                subaccount_number || null,
                chave_pix || null,
                assigned_group_jid || null,
                groupName,
                id
            ]
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
    const customUsername = sanitizePortalUsername(req.query.username);

    if (req.query.username && !customUsername) {
        return res.status(400).json({ message: 'Please enter a valid username (3-50 letters, numbers, dot, dash, or underscore).' });
    }

    try {
        const [[subaccount]] = await pool.query(
            'SELECT id, name, assigned_group_name FROM subaccounts WHERE id = ?', 
            [subaccountId]
        );

        if (!subaccount) {
            return res.status(404).json({ message: 'Subaccount not found.' });
        }

        const [[existingClient]] = await pool.query(
            'SELECT username, password_hash, view_only_password_hash FROM clients WHERE subaccount_id = ?',
            [subaccountId]
        );

        let masterPassword = null;
        let viewOnlyPassword = null;
        let message = "";
        let username = existingClient?.username || null;

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
            const rawBase = (subaccount.assigned_group_name || subaccount.name || `client${subaccountId}`).trim();
            const baseToken = rawBase.split(' ')[0] || rawBase;
            const derivedUsername = sanitizePortalUsername(baseToken) || `client${subaccountId}`;
            const requestedUsername = customUsername || derivedUsername;

            if (!subaccount.assigned_group_name && !customUsername) {
                return res.status(400).json({
                    code: 'CUSTOM_USERNAME_REQUIRED',
                    message: 'No WhatsApp group is assigned. Enter a custom username to generate portal credentials.'
                });
            }

            const [[usernameOwner]] = await pool.query(
                'SELECT subaccount_id FROM clients WHERE username = ? LIMIT 1',
                [requestedUsername]
            );
            if (usernameOwner && Number(usernameOwner.subaccount_id) !== Number(subaccountId)) {
                return res.status(409).json({ message: 'This username is already in use. Please choose another one.' });
            }

            // Generate BOTH fresh
            const mPass = crypto.randomBytes(4).toString('hex');
            const voPass = crypto.randomBytes(4).toString('hex');
            const hashM = await bcrypt.hash(mPass, 10);
            const hashV = await bcrypt.hash(voPass, 10);

            username = requestedUsername;
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
                if (insertError.code === 'ER_DUP_ENTRY' && !customUsername) {
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

// === NEW: Admin debit entry for Cross subaccounts ===
exports.createCrossDebit = async (req, res) => {
    const { id: subaccountId } = req.params;
    const { amount, tx_date, description } = req.body;

    try {
        const subaccount = await transactionService.getSubaccountById(subaccountId);

        if (!subaccount) {
            return res.status(404).json({ message: 'Subaccount not found.' });
        }
        if (subaccount.account_type !== 'cross') {
            return res.status(400).json({ message: 'Debits can only be added to Cross subaccounts.' });
        }
        const created = await transactionService.createStatementTransaction({
            subaccount,
            actorUserId: req.user.id,
            payload: {
                amount,
                tx_date,
                description,
                operation_direct: 'out',
                sender_name: 'CROSS INTERMEDIAÇÃO LTDA',
                counterparty_name: description || 'USD BETA OUT / C'
            }
        });

        await logAction(req, 'subaccount:debit_cross', 'Subaccount', subaccount.id, {
            subaccount_name: subaccount.name,
            amount: parseFloat(amount),
            tx_date,
            description,
            created_transaction_id: created.id
        });

        res.status(201).json({ message: 'Cross debit created successfully.' });
    } catch (error) {
        console.error('[DEBIT-CROSS] Failed to create debit:', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to create debit.' });
    }
};

// === NEW: Admin portal access token for a subaccount ===
exports.createPortalAccessSession = async (req, res) => {
    const { id: subaccountId } = req.params;

    if (!PORTAL_JWT_SECRET) {
        console.error('[PORTAL-ACCESS] Missing PORTAL_JWT_SECRET.');
        return res.status(500).json({ message: 'Portal configuration error.' });
    }

    try {
        const [[subaccount]] = await pool.query(
            'SELECT id, name, account_type, portal_source_type, subaccount_number, chave_pix, assigned_group_name FROM subaccounts WHERE id = ?',
            [subaccountId]
        );

        if (!subaccount) {
            return res.status(404).json({ message: 'Subaccount not found.' });
        }

        let [[client]] = await pool.query(
            'SELECT id, username FROM clients WHERE subaccount_id = ?',
            [subaccountId]
        );

        if (!client) {
            const rawBase = (subaccount.assigned_group_name || subaccount.name || `client${subaccountId}`).trim();
            const baseToken = rawBase.split(' ')[0] || rawBase;
            const normalized = baseToken.toLowerCase().replace(/[^a-z0-9]/g, '');
            const baseUsername = normalized || `client${subaccountId}`;

            const randomPassword = crypto.randomBytes(16).toString('hex');
            const passwordHash = await bcrypt.hash(randomPassword, 10);

            let username = baseUsername;
            try {
                const [insertResult] = await pool.query(
                    'INSERT INTO clients (subaccount_id, username, password_hash) VALUES (?, ?, ?)',
                    [subaccountId, username, passwordHash]
                );
                client = { id: insertResult.insertId, username };
            } catch (insertError) {
                if (insertError.code === 'ER_DUP_ENTRY') {
                    username = `${baseUsername}${subaccountId}`;
                    const [insertResult] = await pool.query(
                        'INSERT INTO clients (subaccount_id, username, password_hash) VALUES (?, ?, ?)',
                        [subaccountId, username, passwordHash]
                    );
                    client = { id: insertResult.insertId, username };
                } else {
                    throw insertError;
                }
            }
        }

        const tokenPayload = {
            id: client.id,
            username: client.username,
            subaccountId: subaccount.id,
            subaccountNumber: subaccount.subaccount_number,
            groupName: subaccount.assigned_group_name,
            accessLevel: 'full',
            impersonation: true,
            adminUserId: req.user?.id,
            adminUsername: req.user?.username,
            accountType: subaccount.account_type,
            chavePix: subaccount.chave_pix,
            portalSourceType: subaccount.portal_source_type || 'transactions'
        };

        const token = jwt.sign(tokenPayload, PORTAL_JWT_SECRET, { expiresIn: '8h' });

        await logAction(req, 'client_portal:access', 'Subaccount', subaccount.id, {
            client_id: client.id,
            client_username: client.username,
            accessLevel: 'full'
        });

        res.json({
            token,
            accessLevel: 'full',
            impersonation: true,
            client: {
                username: client.username,
                name: subaccount.name,
                groupName: subaccount.assigned_group_name
            }
        });
    } catch (error) {
        console.error('[PORTAL-ACCESS] Failed to create portal session:', error);
        res.status(500).json({ message: 'Failed to create portal session.' });
    }
};

exports.getRecibosTransactions = async (req, res) => {
    const { subaccountId } = req.params;

    try {
        const sourceSubaccount = await transactionService.getSubaccountByNumber(subaccountId);
        if (!sourceSubaccount) {
            return res.status(404).json({ message: 'Source subaccount not found.' });
        }
        const result = await transactionService.listRecibosTransactions({
            sourceSubaccountId: sourceSubaccount.id,
            query: req.query
        });
        res.json({
            items: result.transactions,
            ...result.pagination
        });

    } catch (error) {
        console.error('[RECIBOS-ERROR]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to fetch Recibos transactions.' });
    }
};

exports.getProfileEntries = async (req, res) => {
    const { id: subaccountId } = req.params;

    try {
        const result = await profileService.listAdminProfileEntries(subaccountId);
        res.json({
            subaccount: result.subaccount,
            entries: result.entries,
        });
    } catch (error) {
        console.error('[SUBACCOUNT-PROFILE-LIST-ERROR]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to fetch profile entries.' });
    }
};

exports.createProfileEntry = async (req, res) => {
    const { id: subaccountId } = req.params;

    try {
        const entry = await profileService.createProfileEntry(subaccountId, req.body);
        res.status(201).json(entry);
    } catch (error) {
        console.error('[SUBACCOUNT-PROFILE-CREATE-ERROR]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to create profile entry.' });
    }
};

exports.updateProfileEntry = async (req, res) => {
    const { id: subaccountId, entryId } = req.params;

    try {
        const entry = await profileService.updateProfileEntry(subaccountId, entryId, req.body);
        res.json(entry);
    } catch (error) {
        console.error('[SUBACCOUNT-PROFILE-UPDATE-ERROR]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to update profile entry.' });
    }
};

exports.deleteProfileEntry = async (req, res) => {
    const { id: subaccountId, entryId } = req.params;

    try {
        await profileService.deleteProfileEntry(subaccountId, entryId);
        res.status(204).send();
    } catch (error) {
        console.error('[SUBACCOUNT-PROFILE-DELETE-ERROR]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to delete profile entry.' });
    }
};

// === NEW: Reassign Transaction Logic ===
exports.reassignTransaction = async (req, res) => {
    const { transactionId, targetSubaccountNumber } = req.body;

    if (!transactionId || !targetSubaccountNumber) {
        return res.status(400).json({ message: 'Missing Transaction ID or Target Subaccount.' });
    }

    try {
        const [[targetSubaccount]] = await pool.query(
            'SELECT id FROM subaccounts WHERE subaccount_number = ?',
            [targetSubaccountNumber]
        );
        if (!targetSubaccount) {
            return res.status(404).json({ message: 'Target subaccount not found.' });
        }

        await transactionService.moveStatementTransaction({
            source: 'xpayz',
            transactionId,
            targetSubaccountId: targetSubaccount.id,
            actorUserId: req.user.id,
            badgeLabel: 'added'
        });

        res.json({ message: 'Transaction successfully reassigned.' });

    } catch (error) {
        console.error('[REASSIGN-ERROR]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to reassign transaction.' });
    }
};
