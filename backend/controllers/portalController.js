const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const axios = require('axios');
const transactionService = require('../services/subaccountTransactionService');

const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET;
const PORTAL_UNCONFIRM_PASSCODE = process.env.PORTAL_UNCONFIRM_PASSCODE || '1234';
const PARTNER_USERNAME = 'xplus'; // Define the partner username as a constant

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

const buildRangeParams = (dateFrom, dateTo) => {
    if (!isValidDate(dateFrom) || !isValidDate(dateTo)) return null;
    return {
        start: `${dateFrom} 00:00:00`,
        end: `${dateTo} 23:59:59`
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

const logImpersonationAction = async (client, action, targetType, targetId, details) => {
    const adminUserId = client?.adminUserId;
    const adminUsername = client?.adminUsername;
    if (!adminUserId || !adminUsername) return;
    try {
        await pool.query(
            'INSERT INTO audit_log (user_id, username, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
            [adminUserId, adminUsername, action, targetType, targetId, JSON.stringify(details)]
        );
    } catch (error) {
        console.error('[PORTAL-AUDIT] Failed to log impersonation action:', error);
    }
};

if (PORTAL_UNCONFIRM_PASSCODE === '1234') {
    console.warn('\x1b[33m%s\x1b[0m', '[SECURITY-WARN] Using default portal un-confirmation passcode. Please set PORTAL_UNCONFIRM_PASSCODE in your .env file.');
}

// Client Login Endpoint
exports.login = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    try {
        const [clients] = await pool.query('SELECT * FROM clients WHERE username = ?', [username]);
        const client = clients[0];

        if (!client) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        let accessLevel = null;

        if (await bcrypt.compare(password, client.password_hash)) {
            accessLevel = 'full';
        } 
        else if (client.view_only_password_hash && await bcrypt.compare(password, client.view_only_password_hash)) {
            accessLevel = 'view_only';
        } else {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const [[subaccount]] = await pool.query(
            'SELECT id, name, account_type, subaccount_number, chave_pix, assigned_group_name FROM subaccounts WHERE id = ?', 
            [client.subaccount_id]
        );

        const tokenPayload = {
            id: client.id,
            username: client.username,
            subaccountId: subaccount.id,
            subaccountNumber: subaccount.subaccount_number, // This is the XPayz Platform ID
            groupName: subaccount.assigned_group_name,
            accessLevel: accessLevel,
            impersonation: false,
            accountType: subaccount.account_type,
            chavePix: subaccount.chave_pix
        };
        
        const token = jwt.sign(tokenPayload, PORTAL_JWT_SECRET, { expiresIn: '8h' });
        
        res.json({ 
            token, 
            accessLevel,
            client: { 
                username: client.username, 
                name: subaccount.name,
                groupName: subaccount.assigned_group_name
            } 
        });
    } catch (error) {
        console.error('[PORTAL-LOGIN-ERROR]', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};

exports.getDashboardSummary = async (req, res) => {
    try {
        const subaccount = await transactionService.getPortalSubaccount(req.client);
        const viewerMode = transactionService.getViewerMode(req.client);
        const summary = await transactionService.getDashboardSummary({
            subaccount,
            filters: req.query,
            viewerMode
        });
        res.json(summary);
    } catch (error) {
        console.error('[PORTAL-SUMMARY-ERROR]', error);
        res.status(500).json({ message: 'Failed to calculate dashboard summary.' });
    }
};

exports.getTransactions = async (req, res) => {
    try {
        const result = await transactionService.listPortalTransactions(req.client, req.query);
        res.json({
            transactions: result.transactions,
            totalPages: result.pagination.totalPages,
            currentPage: result.pagination.currentPage,
            totalRecords: result.pagination.totalRecords,
            limit: result.pagination.limit,
            pool: result.pool
        });
    } catch (error) {
        console.error('[PORTAL-TRANSACTIONS-ERROR] Failed to fetch transactions:', error);
        res.status(500).json({ message: 'Failed to fetch transactions.' });
    }
};

exports.exportTransactions = async (req, res) => {
    try {
        const exportResult = await transactionService.listPortalTransactions(req.client, { ...req.query, limit: 'all' });
        const exportRows = exportResult.transactions;
        const filenameDate = (req.query.dateFrom && req.query.dateTo)
            ? `${req.query.dateFrom}_to_${req.query.dateTo}`
            : (req.query.date || 'all_time');
        const exportFilename = `statement_${req.client.username}_${filenameDate}_${exportResult.pool}`;
        const exportAccountType = req.client.accountType;

        if (req.query.format === 'pdf') {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${exportFilename}.pdf"`);
            doc.pipe(res);
            const timeOffsetHours = exportAccountType === 'cross' ? -3 : 0;
            generatePdfTable(doc, exportRows, req.client.username, timeOffsetHours);
            doc.end();
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Transactions');
        worksheet.columns = [
            { header: 'Date', key: 'date', width: 25, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
            { header: 'Type', key: 'type', width: 10 },
            { header: 'Counterparty', key: 'counterparty', width: 40 },
            { header: 'Amount (BRL)', key: 'amount', width: 20, style: { numFmt: '#,##0.00' } },
        ];
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2540' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        const timeOffsetHours = exportAccountType === 'cross' ? -3 : 0;
        exportRows.forEach((tx) => {
            const isCredit = String(tx.operation_direct || '').toLowerCase() === 'in' || String(tx.operation_direct || '').toLowerCase() === 'c';
            const dateObj = new Date(tx.transaction_date);
            if (Number.isFinite(dateObj.getTime()) && timeOffsetHours) {
                dateObj.setHours(dateObj.getHours() + timeOffsetHours);
            }
            worksheet.addRow({
                date: dateObj,
                type: isCredit ? 'IN' : 'OUT',
                counterparty: isCredit ? tx.sender_name : (tx.counterparty_name || 'N/A'),
                amount: isCredit ? parseFloat(tx.amount) : -parseFloat(tx.amount)
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${exportFilename}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
        return;
    } catch (overrideError) {
        console.error('[PORTAL-EXPORT-OVERRIDE-ERROR]', overrideError);
    }

    const { accountType, subaccountNumber, chavePix, username, impersonation } = req.client;
    const { search, date, dateFrom, dateTo, direction, confirmation, format = 'excel' } = req.query;
    const canUseRange = impersonation === true && dateFrom && dateTo;
    const range = canUseRange ? buildRangeParams(dateFrom, dateTo) : null;
    const normalizedDirection = impersonation === true && (direction === 'in' || direction === 'out') ? direction : null;
    const normalizedConfirmation = confirmation === 'confirmed'
        ? 'confirmed'
        : (confirmation === 'pending' ? 'pending' : null);

    if (canUseRange && !range) {
        return res.status(400).json({ message: 'Invalid date range.' });
    }

    try {
        let transactions = [];

        // --- BIMODAL LOGIC: Query the correct table based on account type ---
        if (accountType === 'cross') {
            let query = `
                SELECT 
                    uid as id, 
                    tx_date as transaction_date, 
                    amount, 
                    tx_type as operation_direct,
                    CASE WHEN tx_type = 'C' THEN tx_payer_name ELSE 'CROSS INTERMEDIAÇÃO LTDA' END AS sender_name,
                    CASE WHEN tx_type = 'D' THEN JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.tx_payee_name')) ELSE 'CROSS INTERMEDIAÇÃO LTDA' END AS counterparty_name
                FROM trkbit_transactions 
                WHERE tx_pix_key = ?
            `;
            const params = [chavePix];
            if (search) {
                query += ` AND (tx_payer_name LIKE ? OR amount LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }
            if (range) {
                query += ' AND tx_date BETWEEN ? AND ?';
                params.push(range.start, range.end);
            } else if (date) {
                query += ' AND DATE(tx_date) = ?';
                params.push(date);
            }
            if (normalizedDirection) {
                query += ' AND tx_type = ?';
                params.push(normalizedDirection === 'in' ? 'C' : 'D');
            }
            if (normalizedConfirmation) {
                query += ' AND is_portal_confirmed = ?';
                params.push(normalizedConfirmation === 'confirmed' ? 1 : 0);
            }
            query += ' ORDER BY tx_date DESC';
            [transactions] = await pool.query(query, params);

        } else { // 'xpayz'
            let query = `
                SELECT transaction_date, sender_name, counterparty_name, amount, operation_direct
                FROM xpayz_transactions
                WHERE subaccount_id = ?
            `;
            const params = [subaccountNumber];
            if (search) {
                query += ` AND (sender_name LIKE ? OR amount LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }
            if (range) {
                query += ' AND transaction_date BETWEEN ? AND ?';
                params.push(range.start, range.end);
            } else if (date) {
                query += ' AND DATE(transaction_date) = ?';
                params.push(date);
            }
            if (normalizedDirection) {
                query += ' AND operation_direct = ?';
                params.push(normalizedDirection);
            }
            if (normalizedConfirmation) {
                query += ' AND is_portal_confirmed = ?';
                params.push(normalizedConfirmation === 'confirmed' ? 1 : 0);
            }
            query += ' ORDER BY transaction_date DESC';
            [transactions] = await pool.query(query, params);
        }

        const filenameDate = range ? `${dateFrom}_to_${dateTo}` : (date || 'all_time');
        const filename = `statement_${username}_${filenameDate}`;

        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
            doc.pipe(res);
            const timeOffsetHours = accountType === 'cross' ? -3 : 0;
            generatePdfTable(doc, transactions, username, timeOffsetHours); // Use the universal helper
            doc.end();

        } else { // Excel export
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Transactions');

            worksheet.columns = [
                { header: 'Date', key: 'date', width: 25, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
                { header: 'Type', key: 'type', width: 10 },
                { header: 'Counterparty', key: 'counterparty', width: 40 },
                { header: 'Amount (BRL)', key: 'amount', width: 20, style: { numFmt: '#,##0.00' } },
            ];

            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2540' } };
            worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

            const timeOffsetHours = accountType === 'cross' ? -3 : 0;
            transactions.forEach(tx => {
                const isCredit = tx.operation_direct.toLowerCase() === 'in' || tx.operation_direct.toLowerCase() === 'c';
                const dateObj = new Date(tx.transaction_date);
                if (Number.isFinite(dateObj.getTime()) && timeOffsetHours) {
                    dateObj.setHours(dateObj.getHours() + timeOffsetHours);
                }
                worksheet.addRow({
                    date: dateObj,
                    type: isCredit ? 'IN' : 'OUT',
                    counterparty: isCredit ? tx.sender_name : tx.counterparty_name || 'N/A',
                    amount: isCredit ? parseFloat(tx.amount) : -parseFloat(tx.amount)
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
            await workbook.xlsx.write(res);
            res.end();
        }

    } catch (error) {
        console.error(`[PORTAL-EXPORT-ERROR] Failed to export for ${username}:`, error);
        res.status(500).json({ message: 'Failed to export transactions.' });
    }
};

exports.getTrkbitTransactionsForTransfer = async (req, res) => {
    const { accountType } = req.client;
    const { page = 1, limit = 50, search, dateFrom, dateTo, amountExact, pixKey } = req.query;
    const offset = (page - 1) * limit;

    if (req.client.impersonation !== true || accountType !== 'cross') {
        return res.status(403).json({ message: 'Impersonation access required for Cross accounts.' });
    }

    try {
        const subaccount = await transactionService.getPortalSubaccount(req.client);
        let query = `
            FROM trkbit_transactions tt
            LEFT JOIN subaccounts owner_sub ON owner_sub.chave_pix = tt.tx_pix_key
            WHERE COALESCE(tt.display_subaccount_id, owner_sub.id) <> ?
              AND tt.sync_control_state <> 'hidden'
        `;
        const params = [subaccount.id];

        if (search) {
            query += " AND (tt.tx_payer_name LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(tt.raw_data, '$.tx_payee_name')) LIKE ?)";
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }
        if (dateFrom) {
            query += " AND DATE(tt.tx_date) >= ?";
            params.push(dateFrom);
        }
        if (dateTo) {
            query += " AND DATE(tt.tx_date) <= ?";
            params.push(dateTo);
        }
        if (pixKey) {
            query += " AND COALESCE(tt.tx_pix_key, '') LIKE ?";
            params.push(`%${pixKey}%`);
        }
        if (amountExact !== undefined && amountExact !== null && String(amountExact).trim() !== '') {
            const parsedAmount = parseFloat(amountExact);
            if (Number.isFinite(parsedAmount)) {
                query += " AND tt.amount = ?";
                params.push(parsedAmount);
            }
        }

        const countQuery = `SELECT count(*) as total ${query}`;
        const [[{ total }]] = await pool.query(countQuery, params);

        const dataQuery = `
            SELECT 
                tt.uid as id,
                tt.tx_date as transaction_date,
                tt.tx_id,
                tt.tx_payer_name,
                tt.amount,
                tt.tx_type,
                tt.tx_pix_key
            ${query}
            ORDER BY tt.tx_date DESC
            LIMIT ? OFFSET ?
        `;

        const finalParams = [...params, parseInt(limit), parseInt(offset)];
        const [transactions] = await pool.query(dataQuery, finalParams);

        res.json({
            transactions,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            totalRecords: total
        });
    } catch (error) {
        console.error('[PORTAL-TRKBIT-TRANSFER-LIST] Failed to fetch transactions:', error);
        res.status(500).json({ message: 'Failed to fetch Trkbit transactions.' });
    }
};

exports.claimTrkbitTransaction = async (req, res) => {
    const { accountType, subaccountId } = req.client;
    const { transactionId } = req.body;

    if (!req.client.impersonation || accountType !== 'cross') {
        return res.status(403).json({ message: 'Impersonation access required for Cross accounts.' });
    }
    if (!transactionId) {
        return res.status(400).json({ message: 'Transaction ID is required.' });
    }

    try {
        const [[existing]] = await pool.query('SELECT uid, tx_pix_key, tx_id, amount, tx_date FROM trkbit_transactions WHERE uid = ?', [transactionId]);
        if (!existing) return res.status(404).json({ message: 'Transaction not found.' });

        await transactionService.moveStatementTransaction({
            source: 'trkbit',
            transactionId,
            targetSubaccountId: subaccountId,
            actorUserId: req.client.adminUserId || null,
            badgeLabel: 'added'
        });

        await logImpersonationAction(req.client, 'subaccount:transfer_trkbit', 'TrkbitTransaction', existing.uid, {
            tx_id: existing.tx_id,
            amount: existing.amount,
            tx_date: existing.tx_date,
            from_pix_key: existing.tx_pix_key,
            to_subaccount_id: subaccountId
        });

        res.json({ message: 'Transaction transferred successfully.' });
    } catch (error) {
        console.error('[PORTAL-TRKBIT-TRANSFER] Failed to transfer transaction:', error);
        res.status(500).json({ message: 'Failed to transfer transaction.' });
    }
};

exports.updateTransactionNotes = async (req, res) => {
    const { transactionId, source, op_comment, pool: poolName = 'statement' } = req.body;

    if (!transactionId) {
        return res.status(400).json({ message: 'Transaction ID is required.' });
    }

    try {
        const subaccount = await transactionService.getPortalSubaccount(req.client);
        await transactionService.setTransactionNotes({
            subaccount,
            transactionId,
            poolName,
            notes: op_comment
        });
        res.json({ message: 'Note updated successfully.' });
    } catch (error) {
        console.error(`[PORTAL-NOTES-ERROR] Failed to update note for ${transactionId}:`, error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to update note.' });
    }
};

exports.updateTransactionConfirmation = async (req, res) => {
    const { transactionId, confirmed, passcode, pool: poolName = 'statement' } = req.body;

    if (!transactionId || typeof confirmed !== 'boolean') {
        return res.status(400).json({ message: 'Transaction ID, source, and confirmation status are required.' });
    }
    
    if (confirmed === false) {
        if (passcode !== PORTAL_UNCONFIRM_PASSCODE) {
            console.error('[PORTAL CONTROLLER] SECURITY FAILED: Invalid passcode for un-confirmation.');
            return res.status(403).json({ message: 'Invalid passcode.' });
        }
    }

    try {
        const subaccount = await transactionService.getPortalSubaccount(req.client);
        await transactionService.setTransactionConfirmation({
            subaccount,
            transactionId,
            poolName,
            confirmed
        });
        res.json({ message: `Transaction successfully ${confirmed ? 'confirmed' : 'unconfirmed'}.` });
    } catch (error) {
        console.error('[PORTAL-CONFIRMATION-ERROR]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to update transaction status.' });
    }
};

exports.createTransaction = async (req, res) => {
    const { pool: poolName = 'manual' } = req.body;

    try {
        transactionService.assertImpersonation(req.client);
        const subaccount = await transactionService.getPortalSubaccount(req.client);
        if (poolName === 'statement') {
            const created = await transactionService.createStatementTransaction({
                subaccount,
                actorUserId: req.client.adminUserId || null,
                payload: req.body
            });
            return res.status(201).json({ message: 'Statement transaction created successfully.', transactionId: created.id });
        }

        const created = await transactionService.createManualTransaction({
            subaccount,
            actorUserId: req.client.adminUserId || null,
            payload: req.body
        });
        res.status(201).json({ message: 'Manual transaction created successfully.', transactionId: created.id });
    } catch (error) {
        console.error('[PORTAL-CREATE-TRANSACTION]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to create transaction.' });
    }
};

exports.updateTransaction = async (req, res) => {
    const { id } = req.params;
    const { pool: poolName = 'manual' } = req.body;

    try {
        transactionService.assertImpersonation(req.client);
        const subaccount = await transactionService.getPortalSubaccount(req.client);
        if (poolName === 'statement') {
            await transactionService.updateStatementTransaction({
                subaccount,
                actorUserId: req.client.adminUserId || null,
                transactionId: id,
                payload: req.body
            });
            return res.json({ message: 'Statement transaction updated successfully.' });
        }

        await transactionService.updateManualTransaction({
            subaccount,
            actorUserId: req.client.adminUserId || null,
            transactionId: id,
            payload: req.body
        });
        res.json({ message: 'Manual transaction updated successfully.' });
    } catch (error) {
        console.error('[PORTAL-UPDATE-TRANSACTION]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to update transaction.' });
    }
};

exports.deleteTransaction = async (req, res) => {
    const { id } = req.params;
    const { pool: poolName = 'manual' } = req.query;

    try {
        transactionService.assertImpersonation(req.client);
        const subaccount = await transactionService.getPortalSubaccount(req.client);
        if (poolName === 'statement') {
            await transactionService.deleteStatementTransaction({
                subaccount,
                actorUserId: req.client.adminUserId || null,
                transactionId: id
            });
            return res.json({ message: 'Statement transaction deleted successfully.' });
        }

        await transactionService.deleteManualTransaction({
            subaccount,
            transactionId: id
        });
        res.json({ message: 'Manual transaction deleted successfully.' });
    } catch (error) {
        console.error('[PORTAL-DELETE-TRANSACTION]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to delete transaction.' });
    }
};

exports.updateTransactionVisibility = async (req, res) => {
    const { transactionId, pool: poolName = 'statement', visibleInMaster, visibleInViewOnly } = req.body;

    try {
        transactionService.assertImpersonation(req.client);
        const subaccount = await transactionService.getPortalSubaccount(req.client);
        await transactionService.setTransactionVisibility({
            subaccount,
            transactionId,
            poolName,
            visibleInMaster: typeof visibleInMaster === 'boolean' ? (visibleInMaster ? 1 : 0) : null,
            visibleInViewOnly: typeof visibleInViewOnly === 'boolean' ? (visibleInViewOnly ? 1 : 0) : null
        });
        res.json({ message: 'Transaction visibility updated successfully.' });
    } catch (error) {
        console.error('[PORTAL-VISIBILITY-TRANSACTION]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to update visibility.' });
    }
};

exports.updateTransactionBadge = async (req, res) => {
    const { transactionId, pool: poolName = 'statement', badgeLabel } = req.body;

    try {
        transactionService.assertImpersonation(req.client);
        const subaccount = await transactionService.getPortalSubaccount(req.client);
        await transactionService.setTransactionBadgeLabel({
            subaccount,
            transactionId,
            poolName,
            badgeLabel,
            actorUserId: req.client.adminUserId || null
        });
        res.json({ message: 'Badge label updated successfully.' });
    } catch (error) {
        console.error('[PORTAL-BADGE-TRANSACTION]', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to update badge label.' });
    }
};


// ===================================================================
// === THIS IS THE CORRECTED PDF HELPER FUNCTION ===
// ===================================================================
const generatePdfTable = (doc, transactions, clientName, timeOffsetHours = 0) => {
    const computeRunningBalances = (rows) => {
        const ordered = [...rows].sort((a, b) => {
            const timeA = new Date(a.transaction_date).getTime();
            const timeB = new Date(b.transaction_date).getTime();
            return timeA - timeB;
        });
        let balance = 0;
        ordered.forEach(tx => {
            const isCredit = tx.operation_direct.toLowerCase() === 'in' || tx.operation_direct.toLowerCase() === 'c';
            const amountValue = parseFloat(tx.amount);
            const signedAmount = Number.isFinite(amountValue) ? (isCredit ? amountValue : -amountValue) : 0;
            balance += signedAmount;
            tx.running_balance = balance;
        });
    };

    computeRunningBalances(transactions);

    doc.fontSize(20).font('Helvetica-Bold').text('Transaction Statement', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`Client: ${clientName}`, { align: 'center' });
    doc.moveDown(2);

    const tableTop = doc.y;
    const dateX = 50;
    const typeX = 150;
    const partyX = 210;
    const amountX = 380;
    const saldoX = 470;
    const rowHeight = 25;
    const tableBottomMargin = 50;

    const drawHeader = (y) => {
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Date', dateX, y);
        doc.text('Type', typeX, y);
        doc.text('Counterparty', partyX, y);
        doc.text('Amount (BRL)', amountX, y, { width: 80, align: 'right' });
        doc.text('Saldo (BRL)', saldoX, y, { width: 80, align: 'right' });
        doc.moveTo(dateX, y + 15).lineTo(550, y + 15).strokeColor("#cccccc").stroke();
    };
    
    drawHeader(tableTop);
    let y = tableTop + 30;

    doc.fontSize(9).font('Helvetica');
    transactions.forEach(tx => {
        if (y + rowHeight > doc.page.height - tableBottomMargin) {
            doc.addPage();
            y = tableTop;
            drawHeader(y - 15);
            y += 15;
        }
        
        const isCredit = tx.operation_direct.toLowerCase() === 'in' || tx.operation_direct.toLowerCase() === 'c';
        const date = new Date(tx.transaction_date);
        if (Number.isFinite(date.getTime()) && timeOffsetHours) {
            date.setHours(date.getHours() + timeOffsetHours);
        }
        const formattedDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(date);
        const amountValue = parseFloat(tx.amount);
        const signedAmount = Number.isFinite(amountValue) ? (isCredit ? amountValue : -amountValue) : 0;
        const formattedAmount = (signedAmount < 0 ? '-' : '') + Math.abs(signedAmount).toFixed(2);
        const formattedSaldo = Number.isFinite(tx.running_balance) ? tx.running_balance.toFixed(2) : '0.00';
        const counterparty = isCredit ? tx.sender_name : tx.counterparty_name || 'N/A';
        
        doc.text(formattedDate, dateX, y, { width: 110, lineBreak: false });
        doc.font(isCredit ? 'Helvetica-Bold' : 'Helvetica').fillColor(isCredit ? '#00C49A' : '#DE350B').text(isCredit ? 'IN' : 'OUT', typeX, y);
        doc.font('Helvetica').fillColor('#32325D').text(counterparty, partyX, y, { width: 180, lineBreak: false, ellipsis: true });
        doc.text(formattedAmount, amountX, y, { width: 80, align: 'right' });
        doc.text(formattedSaldo, saldoX, y, { width: 80, align: 'right' });
        
        y += rowHeight;
    });
};

exports.triggerPartnerConfirmation = async (req, res) => {
    // This is the new secure endpoint for the portal
    const { correlation_id } = req.body;
    const clientUsername = req.client.username;

    // Security Check: Only allow the 'xplus' user to perform this action
    if (clientUsername !== 'xplus') {
        return res.status(403).json({ message: 'Forbidden: You do not have permission to perform this action.' });
    }

    if (!correlation_id) {
        return res.status(400).json({ message: 'Correlation ID is required.' });
    }

    const BRIDGE_API_URL = process.env.BRIDGE_API_URL;
    const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY;

    if (!BRIDGE_API_URL || !BRIDGE_API_KEY) {
        console.error('[PORTAL-BRIDGE-CONFIRM] Bridge API URL or Key is not configured on the server.');
        return res.status(500).json({ message: 'Bridge API is not configured on the server.' });
    }

    const connection = await pool.getConnection();
    
    try {
        // === THE API HARDENING FIX ===
        await connection.beginTransaction();

        // Step 1: Check the current status of the order.
        const [[order]] = await connection.query(
            'SELECT status FROM bridge_transactions WHERE correlation_id = ? FOR UPDATE', // Lock the row
            [correlation_id]
        );

        if (!order) {
            await connection.rollback();
            return res.status(404).json({ message: 'Order not found.' });
        }
        
        // Step 2: If already paid, reject the request.
        if (order.status === 'paid' || order.status === 'paid_manual') {
            await connection.rollback();
            return res.status(409).json({ message: 'This order has already been confirmed.' });
        }

        // Step 3: If pending, proceed to send the webhook.
        const response = await axios.post(
            `${BRIDGE_API_URL}/webhook/trigger`,
            { correlation_id },
            { headers: { 'api-key': BRIDGE_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        
        // Step 4: After a successful webhook, update our database status.
        await connection.query(
            "UPDATE bridge_transactions SET status = 'paid_manual' WHERE correlation_id = ?",
            [correlation_id]
        );

        await connection.commit();
        res.status(200).json(response.data);

    } catch (error) {
        await connection.rollback();
        console.error('[PORTAL-BRIDGE-CONFIRM] Error:', error.response?.data || error.message);
        const status = error.response?.status || 502;
        const message = error.response?.data?.message || 'Failed to communicate with the payment bridge.';
        res.status(status).json({ message });
    } finally {
        connection.release();
    }
};

exports.createCrossDebit = async (req, res) => {
    const { impersonation, accountType, subaccountId } = req.client;
    const { amount, tx_date, description } = req.body;

    if (impersonation !== true) {
        return res.status(403).json({ message: 'Impersonation access required.' });
    }
    if (accountType !== 'cross') {
        return res.status(400).json({ message: 'Debits can only be created for Cross accounts.' });
    }
    try {
        const subaccount = await transactionService.getPortalSubaccount(req.client);
        const created = await transactionService.createStatementTransaction({
            subaccount,
            actorUserId: req.client.adminUserId || null,
            payload: {
                amount,
                tx_date,
                description,
                operation_direct: 'out',
                sender_name: 'CROSS INTERMEDIAÇÃO LTDA',
                counterparty_name: description || 'USD BETA OUT / C'
            }
        });
        await logImpersonationAction(req.client, 'subaccount:debit_cross', 'Subaccount', subaccountId, {
            amount: parseFloat(amount),
            tx_date,
            description,
            created_transaction_id: created.id
        });

        res.status(201).json({ message: 'Debit created successfully.' });
    } catch (error) {
        console.error('[PORTAL-DEBIT] Failed to create debit:', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to create debit.' });
    }
};
