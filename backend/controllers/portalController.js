const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const axios = require('axios');

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
    // CORRECTED: Use subaccountNumber for xpayz, chavePix for cross
    const { accountType, subaccountNumber, chavePix, impersonation } = req.client;
    const { date, dateFrom, dateTo } = req.query;
    const canUseRange = impersonation === true && dateFrom && dateTo;
    const range = canUseRange ? buildRangeParams(dateFrom, dateTo) : null;

    if (canUseRange && !range) {
        return res.status(400).json({ message: 'Invalid date range.' });
    }

    if (!date && !range) {
        return res.json({ 
            dailyTotalIn: 0, dailyTotalOut: 0, allTimeBalance: 0,
            dailyCountIn: 0, dailyCountOut: 0, dailyCountTotal: 0 
        });
    }

    try {
        let dailySummary, balance;

        if (accountType === 'cross') {
            // This logic is correct
            let dailySummaryQuery = `SELECT SUM(CASE WHEN tx_type = 'C' THEN amount ELSE 0 END) as dailyTotalIn, SUM(CASE WHEN tx_type = 'D' THEN amount ELSE 0 END) as dailyTotalOut, COUNT(CASE WHEN tx_type = 'C' THEN 1 END) as dailyCountIn, COUNT(CASE WHEN tx_type = 'D' THEN 1 END) as dailyCountOut, COUNT(*) as dailyCountTotal FROM trkbit_transactions WHERE tx_pix_key = ?`;
            const summaryParams = [chavePix];
            if (range) {
                dailySummaryQuery += ' AND tx_date BETWEEN ? AND ?';
                summaryParams.push(range.start, range.end);
            } else {
                dailySummaryQuery += ' AND DATE(tx_date) = ?';
                summaryParams.push(date);
            }
            dailySummaryQuery += ';';
            [[dailySummary]] = await pool.query(dailySummaryQuery, summaryParams);
            const allTimeBalanceQuery = `
                SELECT SUM(CASE 
                                WHEN tx_type = 'C' THEN amount 
                                WHEN tx_type = 'D' THEN -amount 
                                ELSE 0 
                            END) as allTimeBalance 
                FROM trkbit_transactions 
                WHERE tx_pix_key = ?;
            `;
            [[balance]] = await pool.query(allTimeBalanceQuery, [chavePix]);
            
        } else { // 'xpayz'
            let dailySummaryQuery = `SELECT SUM(CASE WHEN operation_direct = 'in' THEN amount ELSE 0 END) as dailyTotalIn, SUM(CASE WHEN operation_direct = 'out' THEN amount ELSE 0 END) as dailyTotalOut, COUNT(CASE WHEN operation_direct = 'in' THEN 1 END) as dailyCountIn, COUNT(CASE WHEN operation_direct = 'out' THEN 1 END) as dailyCountOut, COUNT(*) as dailyCountTotal FROM xpayz_transactions WHERE subaccount_id = ?`;
            const summaryParams = [subaccountNumber];
            if (range) {
                dailySummaryQuery += ' AND transaction_date BETWEEN ? AND ?';
                summaryParams.push(range.start, range.end);
            } else {
                dailySummaryQuery += ' AND DATE(transaction_date) = ?';
                summaryParams.push(date);
            }
            dailySummaryQuery += ';';
            // DEFINITIVE FIX: Use subaccountNumber (the XPayz ID)
            [[dailySummary]] = await pool.query(dailySummaryQuery, summaryParams);

            const allTimeBalanceQuery = `SELECT (SUM(CASE WHEN operation_direct = 'in' THEN amount ELSE 0 END) - SUM(CASE WHEN operation_direct = 'out' THEN amount ELSE 0 END)) as allTimeBalance FROM xpayz_transactions WHERE subaccount_id = ?;`;
            // DEFINITIVE FIX: Use subaccountNumber (the XPayz ID)
            [[balance]] = await pool.query(allTimeBalanceQuery, [subaccountNumber]);
        }

        res.json({ 
            dailyTotalIn: parseFloat(dailySummary.dailyTotalIn || 0),
            dailyTotalOut: parseFloat(dailySummary.dailyTotalOut || 0),
            allTimeBalance: parseFloat(balance.allTimeBalance || 0),
            dailyCountIn: parseInt(dailySummary.dailyCountIn || 0),
            dailyCountOut: parseInt(dailySummary.dailyCountOut || 0),
            dailyCountTotal: parseInt(dailySummary.dailyCountTotal || 0)
        });

    } catch (error) {
        console.error(`[PORTAL-SUMMARY-ERROR] for subaccount number ${subaccountNumber}:`, error);
        res.status(500).json({ message: 'Failed to calculate dashboard summary.' });
    }
};

exports.getTransactions = async (req, res) => {
    const { accountType, subaccountNumber, chavePix, username, impersonation } = req.client;
    const { page = 1, limit = 50, search, date, dateFrom, dateTo, direction } = req.query;
    const canUseRange = impersonation === true && dateFrom && dateTo;
    const range = canUseRange ? buildRangeParams(dateFrom, dateTo) : null;
    const normalizedDirection = impersonation === true && (direction === 'in' || direction === 'out') ? direction : null;

    if (canUseRange && !range) {
        return res.status(400).json({ message: 'Invalid date range.' });
    }

    try {
        let total = 0;
        let transactions = [];

        if (accountType === 'cross') {
            let query = `FROM trkbit_transactions tt WHERE tt.tx_pix_key = ?`;
            const params = [chavePix];
            if (search) {
                query += ` AND (tt.tx_payer_name LIKE ? OR tt.amount LIKE ? OR tt.tx_id LIKE ?)`;
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }
            if (range) {
                query += ' AND tt.tx_date BETWEEN ? AND ?';
                params.push(range.start, range.end);
            } else if (date) {
                query += ' AND DATE(tt.tx_date) = ?';
                params.push(date);
            }
            if (normalizedDirection) {
                query += ' AND tt.tx_type = ?';
                params.push(normalizedDirection === 'in' ? 'C' : 'D');
            }
            
            const countQuery = `SELECT count(*) as total ${query}`;
            const [[{ total: queryTotal }]] = await pool.query(countQuery, params);
            total = queryTotal;

            if (total > 0) {
                const dataQuery = `
                    SELECT 
                        tt.uid as id, 
                        tt.tx_date as transaction_date, 
                        tt.amount, 
                        tt.tx_type as operation_direct,
                        tt.is_portal_confirmed,
                        tt.portal_notes,
                        'trkbit' as source, -- <<< ADD THIS LINE
                        CASE
                            WHEN tt.tx_type = 'C' THEN tt.tx_payer_name
                            ELSE 'CROSS INTERMEDIAÇÃO LTDA' 
                        END AS sender_name,
                        CASE
                            WHEN tt.tx_type = 'D' THEN JSON_UNQUOTE(JSON_EXTRACT(tt.raw_data, '$.tx_payee_name'))
                            ELSE 'CROSS INTERMEDIAÇÃO LTDA'
                        END AS counterparty_name
                    ${query} 
                    ORDER BY tt.tx_date DESC 
                    LIMIT ? OFFSET ?
                `;
                const finalParams = [...params, parseInt(limit), (page - 1) * limit];
                [transactions] = await pool.query(dataQuery, finalParams);
            }
        } 
        else { 
            let query = `FROM xpayz_transactions xt `;
            let params = [];
            // <<< ADD 'xpayz' as source TO THE SELECT FIELDS
            let selectFields = `xt.id, xt.transaction_date, xt.sender_name, xt.counterparty_name, xt.amount, xt.operation_direct, xt.is_portal_confirmed, xt.portal_notes, 'xpayz' as source `;

            if (username === PARTNER_USERNAME) {
                query += `INNER JOIN bridge_transactions bt ON xt.id = bt.xpayz_transaction_id WHERE xt.subaccount_id = ?`;
                params.push(subaccountNumber);
                selectFields += `, bt.correlation_id, bt.status as bridge_status`;
            } 
            else {
                query += `WHERE xt.subaccount_id = ?`;
                params.push(subaccountNumber);
            }

            if (search) {
                query += ` AND (xt.sender_name LIKE ? OR xt.amount LIKE ?)`;
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm);
            }
            if (range) {
                query += ' AND xt.transaction_date BETWEEN ? AND ?';
                params.push(range.start, range.end);
            } else if (date) {
                query += ' AND DATE(xt.transaction_date) = ?';
                params.push(date);
            }
            if (normalizedDirection) {
                query += ' AND xt.operation_direct = ?';
                params.push(normalizedDirection);
            }

            const countQuery = `SELECT count(xt.id) as total ${query}`;
            const [[{ total: queryTotal }]] = await pool.query(countQuery, params);
            total = queryTotal;

            if (total > 0) {
                const dataQuery = `SELECT ${selectFields} ${query} ORDER BY xt.transaction_date DESC LIMIT ? OFFSET ?`;
                const finalParams = [...params, parseInt(limit), (page - 1) * limit];
                [transactions] = await pool.query(dataQuery, finalParams);
            }
        }
        
        res.json({
            transactions,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            totalRecords: total,
        });
    } catch (error) {
        console.error(`[PORTAL-TRANSACTIONS-ERROR] Failed to fetch transactions:`, error);
        res.status(500).json({ message: 'Failed to fetch transactions.' });
    }
};

exports.exportTransactions = async (req, res) => {
    const { accountType, subaccountNumber, chavePix, username, impersonation } = req.client;
    const { search, date, dateFrom, dateTo, direction, format = 'excel' } = req.query;
    const canUseRange = impersonation === true && dateFrom && dateTo;
    const range = canUseRange ? buildRangeParams(dateFrom, dateTo) : null;
    const normalizedDirection = impersonation === true && (direction === 'in' || direction === 'out') ? direction : null;

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
            query += ' ORDER BY transaction_date DESC';
            [transactions] = await pool.query(query, params);
        }

        const filenameDate = range ? `${dateFrom}_to_${dateTo}` : (date || 'all_time');
        const filename = `statement_${username}_${filenameDate}`;

        if (format === 'pdf') {
            let startingBalance = 0;
            if (transactions.length > 0) {
                const earliestDate = transactions.reduce((minDate, tx) => {
                    const txDate = new Date(tx.transaction_date);
                    if (!Number.isFinite(txDate.getTime())) return minDate;
                    if (!minDate || txDate < minDate) return txDate;
                    return minDate;
                }, null);

                if (earliestDate) {
                    if (accountType === 'cross') {
                        const [[balanceRow]] = await pool.query(
                            `SELECT SUM(CASE 
                                            WHEN tx_type = 'C' THEN amount 
                                            WHEN tx_type = 'D' THEN -amount 
                                            ELSE 0 
                                        END) AS balance
                             FROM trkbit_transactions
                             WHERE tx_pix_key = ? AND tx_date < ?`,
                            [chavePix, earliestDate]
                        );
                        startingBalance = parseFloat(balanceRow.balance || 0);
                    } else {
                        const [[balanceRow]] = await pool.query(
                            `SELECT (SUM(CASE WHEN operation_direct = 'in' THEN amount ELSE 0 END) -
                                     SUM(CASE WHEN operation_direct = 'out' THEN amount ELSE 0 END)) AS balance
                             FROM xpayz_transactions
                             WHERE subaccount_id = ? AND transaction_date < ?`,
                            [subaccountNumber, earliestDate]
                        );
                        startingBalance = parseFloat(balanceRow.balance || 0);
                    }
                }
            }

            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
            doc.pipe(res);
            const timeOffsetHours = accountType === 'cross' ? -3 : 0;
            generatePdfTable(doc, transactions, username, startingBalance, timeOffsetHours); // Use the universal helper
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

exports.updateTransactionNotes = async (req, res) => {
    // === THE FIX: Read transactionId from the request body, not params ===
    const { transactionId, source, op_comment } = req.body;
    const { accountType, subaccountNumber, chavePix } = req.client;

    if (!transactionId || !source) {
        return res.status(400).json({ message: 'Transaction ID and source are required.' });
    }

    // Sanitize and truncate notes
    const finalNotes = (op_comment || '').trim().slice(0, 30);

    let table, idColumn, ownershipColumn, ownershipValue;

    if (source === 'xpayz' && accountType === 'xpayz') {
        table = 'xpayz_transactions';
        idColumn = 'id';
        ownershipColumn = 'subaccount_id';
        ownershipValue = subaccountNumber;
    } else if (source === 'trkbit' && accountType === 'cross') {
        table = 'trkbit_transactions';
        idColumn = 'uid';
        ownershipColumn = 'tx_pix_key';
        ownershipValue = chavePix;
    } else {
        return res.status(400).json({ message: 'Invalid source or mismatched account type.' });
    }

    try {
        const query = `
            UPDATE ${table} 
            SET portal_notes = ? 
            WHERE ${idColumn} = ? AND ${ownershipColumn} = ?
        `;
        const [result] = await pool.query(query, [finalNotes, transactionId, ownershipValue]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Transaction not found or permission denied.' });
        }

        res.json({ message: 'Note updated successfully.' });
    } catch (error) {
        console.error(`[PORTAL-NOTES-ERROR] Failed to update note for ${transactionId}:`, error);
        res.status(500).json({ message: 'Failed to update note.' });
    }
};

exports.updateTransactionConfirmation = async (req, res) => {
    // Logging is still here, which is good.
    console.log(`\n--- [PORTAL CONTROLLER] updateTransactionConfirmation triggered ---`);
    console.log('[PORTAL CONTROLLER] Request Body (Payload):', req.body);
    console.log('[PORTAL CONTROLLER] Client Data (from JWT):', req.client);

    // === THE FIX: Read the ID from the request BODY, not the URL params ===
    const { transactionId, source, confirmed, passcode } = req.body;
    const { accountType, subaccountNumber, chavePix } = req.client;

    if (!transactionId || !source || typeof confirmed !== 'boolean') {
        console.error('[PORTAL CONTROLLER] VALIDATION FAILED: Missing `transactionId`, `source`, or `confirmed` boolean in the request body.');
        return res.status(400).json({ message: 'Transaction ID, source, and confirmation status are required.' });
    }
    
    if (confirmed === false) {
        if (passcode !== PORTAL_UNCONFIRM_PASSCODE) {
            console.error('[PORTAL CONTROLLER] SECURITY FAILED: Invalid passcode for un-confirmation.');
            return res.status(403).json({ message: 'Invalid passcode.' });
        }
    }

    let table, idColumn, ownershipColumn, ownershipValue;

    if (source === 'xpayz' && accountType === 'xpayz') {
        table = 'xpayz_transactions';
        idColumn = 'id';
        ownershipColumn = 'subaccount_id';
        ownershipValue = subaccountNumber;
    } else if (source === 'trkbit' && accountType === 'cross') {
        table = 'trkbit_transactions';
        idColumn = 'uid'; 
        ownershipColumn = 'tx_pix_key';
        ownershipValue = chavePix;
    } else {
        console.error(`[PORTAL CONTROLLER] LOGIC FAILED: Mismatch between source ('${source}') and accountType ('${accountType}').`);
        return res.status(400).json({ message: 'Invalid source or mismatched account type.' });
    }

    try {
        const query = `
            UPDATE ${table} 
            SET is_portal_confirmed = ? 
            WHERE ${idColumn} = ? AND ${ownershipColumn} = ?
        `;
        const params = [confirmed, transactionId, ownershipValue];

        console.log(`[PORTAL CONTROLLER] Executing SQL: ${query.replace(/\s\s+/g, ' ')} with params [${params.join(', ')}]`);
        
        const [result] = await pool.query(query, params);

        console.log('[PORTAL CONTROLLER] SQL Result:', result);

        if (result.affectedRows === 0) {
            console.error('[PORTAL CONTROLLER] DB FAILED: Query executed but no rows were updated. Check ownership and ID.');
            return res.status(404).json({ message: 'Transaction not found or you do not have permission to modify it.' });
        }
        
        console.log('[PORTAL CONTROLLER] SUCCESS: Transaction updated.');
        res.json({ message: `Transaction successfully ${confirmed ? 'confirmed' : 'unconfirmed'}.` });
    } catch (error) {
        console.error(`[PORTAL CONTROLLER] DB FAILED: SQL execution threw an error.`, error);
        res.status(500).json({ message: 'Failed to update transaction status.' });
    }
};


// ===================================================================
// === THIS IS THE CORRECTED PDF HELPER FUNCTION ===
// ===================================================================
const generatePdfTable = (doc, transactions, clientName, startingBalance = 0, timeOffsetHours = 0) => {
    const computeRunningBalances = (rows, openingBalance) => {
        const ordered = [...rows].sort((a, b) => {
            const timeA = new Date(a.transaction_date).getTime();
            const timeB = new Date(b.transaction_date).getTime();
            return timeA - timeB;
        });
        let balance = openingBalance;
        ordered.forEach(tx => {
            const isCredit = tx.operation_direct.toLowerCase() === 'in' || tx.operation_direct.toLowerCase() === 'c';
            const amount = parseFloat(tx.amount);
            if (Number.isFinite(amount)) {
                balance += isCredit ? amount : -amount;
            }
            tx.running_balance = balance;
        });
    };

    computeRunningBalances(transactions, startingBalance);

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
        const formattedAmount = (isCredit ? '' : '-') + parseFloat(tx.amount).toFixed(2);
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
    const { impersonation, accountType, chavePix, subaccountId } = req.client;
    const { amount, tx_date, description } = req.body;

    if (impersonation !== true) {
        return res.status(403).json({ message: 'Impersonation access required.' });
    }
    if (accountType !== 'cross') {
        return res.status(400).json({ message: 'Debits can only be created for Cross accounts.' });
    }
    if (!chavePix) {
        return res.status(400).json({ message: 'Cross account is missing a PIX key.' });
    }

    const normalizedDate = normalizeDateTime(tx_date);
    const numericAmount = parseFloat(amount);
    const note = (description || 'USD BETA OUT / C').trim() || 'USD BETA OUT / C';

    if (!normalizedDate) {
        return res.status(400).json({ message: 'Valid date/time is required.' });
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ message: 'Amount must be greater than zero.' });
    }

    try {
        const uid = generateUuid();
        const txId = generateUuid();

        const insertQuery = `
            INSERT INTO trkbit_transactions (
                uid, tx_id, e2e_id, tx_date, amount, tx_pix_key, tx_type,
                tx_payer_name, tx_payer_id, raw_data, is_used
            ) VALUES (
                ?, ?, NULL, ?, ?, ?, 'D',
                ?, 'SYSTEM_ARCHIVE',
                JSON_OBJECT(
                    'ag', '0001',
                    'uid', ?,
                    'tx_id', ?,
                    'amount', ?,
                    'e2e_id', NULL,
                    'account', '5602362',
                    'tx_date', DATE_FORMAT(?, '%Y-%m-%d %H:%i:%s'),
                    'tx_type', 'D',
                    'tx_status', 'done',
                    'created_at', UNIX_TIMESTAMP(?) * 1000,
                    'tx_pix_key', ?,
                    'tx_payee_id', '52006135000168',
                    'tx_payer_id', '000000001',
                    'tx_payee_name', ?,
                    'tx_payer_name', ?
                ),
                1
            )
        `;

        const params = [
            uid,
            txId,
            normalizedDate,
            numericAmount,
            chavePix,
            note,
            uid,
            txId,
            numericAmount,
            normalizedDate,
            normalizedDate,
            chavePix,
            note,
            note
        ];

        await pool.query(insertQuery, params);
        await logImpersonationAction(req.client, 'subaccount:debit_cross', 'Subaccount', subaccountId, {
            amount: numericAmount,
            tx_date: normalizedDate,
            tx_pix_key: chavePix,
            description: note,
            uid,
            tx_id: txId
        });

        res.status(201).json({ message: 'Debit created successfully.' });
    } catch (error) {
        console.error('[PORTAL-DEBIT] Failed to create debit:', error);
        res.status(500).json({ message: 'Failed to create debit.' });
    }
};
