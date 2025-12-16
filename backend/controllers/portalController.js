// backend/controllers/portalController.js

const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const axios = require('axios');

const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET;

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
    const { accountType, subaccountNumber, chavePix } = req.client;
    const { date } = req.query;

    if (!date) {
        return res.json({ 
            dailyTotalIn: 0, dailyTotalOut: 0, allTimeBalance: 0,
            dailyCountIn: 0, dailyCountOut: 0, dailyCountTotal: 0 
        });
    }

    try {
        let dailySummary, balance;

        if (accountType === 'cross') {
            // This logic is correct
            const dailySummaryQuery = `SELECT SUM(CASE WHEN tx_type = 'C' THEN amount ELSE 0 END) as dailyTotalIn, SUM(CASE WHEN tx_type = 'D' THEN amount ELSE 0 END) as dailyTotalOut, COUNT(CASE WHEN tx_type = 'C' THEN 1 END) as dailyCountIn, COUNT(CASE WHEN tx_type = 'D' THEN 1 END) as dailyCountOut, COUNT(*) as dailyCountTotal FROM trkbit_transactions WHERE tx_pix_key = ? AND DATE(tx_date) = ?;`;
            [[dailySummary]] = await pool.query(dailySummaryQuery, [chavePix, date]);
            const allTimeBalanceQuery = `SELECT (SUM(CASE WHEN tx_type = 'C' THEN amount ELSE 0 END) - SUM(CASE WHEN tx_type = 'D' THEN amount ELSE 0 END)) as allTimeBalance FROM trkbit_transactions WHERE tx_pix_key = ?;`;
            [[balance]] = await pool.query(allTimeBalanceQuery, [chavePix]);
            
        } else { // 'xpayz'
            const dailySummaryQuery = `SELECT SUM(CASE WHEN operation_direct = 'in' THEN amount ELSE 0 END) as dailyTotalIn, SUM(CASE WHEN operation_direct = 'out' THEN amount ELSE 0 END) as dailyTotalOut, COUNT(CASE WHEN operation_direct = 'in' THEN 1 END) as dailyCountIn, COUNT(CASE WHEN operation_direct = 'out' THEN 1 END) as dailyCountOut, COUNT(*) as dailyCountTotal FROM xpayz_transactions WHERE subaccount_id = ? AND DATE(transaction_date) = ?;`;
            // DEFINITIVE FIX: Use subaccountNumber (the XPayz ID)
            [[dailySummary]] = await pool.query(dailySummaryQuery, [subaccountNumber, date]);

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
    // CORRECTED: Use subaccountNumber for xpayz, chavePix for cross
    const { accountType, subaccountNumber, chavePix } = req.client;
    const { page = 1, limit = 50, search, date } = req.query;

    try {
        let total = 0;
        let transactions = [];

        if (accountType === 'cross') {
            // This logic is correct
            let query = `FROM trkbit_transactions WHERE tx_pix_key = ?`;
            const params = [chavePix];
            if (search) {
                query += ` AND (tx_payer_name LIKE ? OR amount LIKE ? OR tx_id LIKE ?)`;
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }
            if (date) { query += ' AND DATE(tx_date) = ?'; params.push(date); }
            const countQuery = `SELECT count(*) as total ${query}`;
            const [[{ total: queryTotal }]] = await pool.query(countQuery, params);
            total = queryTotal;
            if (total > 0) {
                const dataQuery = `SELECT uid as id, tx_date as transaction_date, tx_payer_name as sender_name, NULL as counterparty_name, amount, tx_type as operation_direct, tx_id as xpayz_transaction_id, raw_data as raw_details, NULL as correlation_id, NULL as bridge_status ${query} ORDER BY tx_date DESC LIMIT ? OFFSET ?`;
                const finalParams = [...params, parseInt(limit), (page - 1) * limit];
                [transactions] = await pool.query(dataQuery, finalParams);
            }
        } else { // 'xpayz'
            
            // === THE CLEAN VIEW FIX ===
            // By using an INNER JOIN, we ONLY select xpayz_transactions that have a successful link.
            // This automatically hides all the unlinked, duplicate bridge orders from the portal.
            let query = `
                FROM xpayz_transactions xt
                INNER JOIN bridge_transactions bt ON xt.id = bt.xpayz_transaction_id
                WHERE xt.subaccount_id = ?
            `;
            const params = [subaccountNumber];

            if (search) {
                query += ` AND (xt.sender_name LIKE ? OR xt.amount LIKE ?)`;
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm);
            }
            if (date) {
                query += ' AND DATE(xt.transaction_date) = ?';
                params.push(date);
            }

            const countQuery = `SELECT count(xt.id) as total ${query}`;
            const [[{ total: queryTotal }]] = await pool.query(countQuery, params);
            total = queryTotal;

            if (total > 0) {
                const dataQuery = `
                    SELECT 
                        xt.id, xt.transaction_date, xt.sender_name, xt.counterparty_name, 
                        xt.amount, xt.operation_direct, xt.xpayz_transaction_id,
                        bt.correlation_id, bt.status as bridge_status
                    ${query}
                    ORDER BY xt.transaction_date DESC
                    LIMIT ? OFFSET ?
                `;
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
    // Correctly get all necessary identifiers from the validated token
    const { accountType, subaccountNumber, chavePix, username } = req.client;
    const { search, date, format = 'excel' } = req.query;

    try {
        let transactions = [];

        // --- BIMODAL LOGIC: Query the correct table based on account type ---
        if (accountType === 'cross') {
            let query = `
                SELECT 
                    tx_date as transaction_date, 
                    tx_payer_name as sender_name, 
                    tx_payee_name as counterparty_name, 
                    amount, 
                    tx_type as operation_direct
                FROM trkbit_transactions 
                WHERE tx_pix_key = ?
            `;
            const params = [chavePix];

            if (search) {
                query += ` AND (tx_payer_name LIKE ? OR amount LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }
            if (date) {
                query += ' AND DATE(tx_date) = ?';
                params.push(date);
            }
            query += ' ORDER BY tx_date DESC';
            [transactions] = await pool.query(query, params);

        } else { // Default to 'xpayz'
            let query = `
                SELECT transaction_date, sender_name, counterparty_name, amount, operation_direct
                FROM xpayz_transactions
                WHERE subaccount_id = ?
            `;
            // Use the correct subaccountNumber (XPayz platform ID)
            const params = [subaccountNumber];

            if (search) {
                query += ` AND (sender_name LIKE ? OR amount LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`);
            }
            if (date) {
                query += ' AND DATE(transaction_date) = ?';
                params.push(date);
            }
            query += ' ORDER BY transaction_date DESC';
            [transactions] = await pool.query(query, params);
        }

        const filename = `accountBalance_${username}`;

        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
            doc.pipe(res);
            
            generatePdfTable(doc, transactions); // Use the helper for PDF generation
            
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

            transactions.forEach(tx => {
                const isCredit = tx.operation_direct.toLowerCase() === 'in' || tx.operation_direct.toLowerCase() === 'c';
                
                // For 'cross' type, tx_date is UTC. For 'xpayz', transaction_date is local.
                // Creating a new Date object correctly handles both string formats.
                const dateObj = new Date(tx.transaction_date);

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
        console.error(`[PORTAL-EXPORT-ERROR] Failed to export for subaccount ${subaccountNumber || chavePix}:`, error);
        res.status(500).json({ message: 'Failed to export transactions.' });
    }
};

// This helper function is now more generic
const generatePdfTable = (doc, transactions) => {
    doc.fontSize(20).font('Helvetica-Bold').text('Transaction Statement', { align: 'center' });
    doc.moveDown(2);

    const tableTop = doc.y;
    const dateX = 50;
    const typeX = 170;
    const partyX = 230;
    const amountX = 420;
    const rowHeight = 25;
    const tableBottomMargin = 50;

    const drawHeader = (y) => {
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Date', dateX, y);
        doc.text('Type', typeX, y);
        doc.text('Counterparty', partyX, y);
        doc.text('Amount (BRL)', amountX, y, { width: 130, align: 'right' });
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
        const formattedDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(date);
        const formattedAmount = (isCredit ? '' : '-') + parseFloat(tx.amount).toFixed(2);
        const counterparty = isCredit ? tx.sender_name : tx.counterparty_name || 'N/A';
        
        doc.text(formattedDate, dateX, y, { width: 110, lineBreak: false });
        doc.font(isCredit ? 'Helvetica-Bold' : 'Helvetica').fillColor(isCredit ? '#00C49A' : '#DE350B').text(isCredit ? 'IN' : 'OUT', typeX, y);
        doc.font('Helvetica').fillColor('#32325D').text(counterparty, partyX, y, { width: 180, lineBreak: false, ellipsis: true });
        doc.text(formattedAmount, amountX, y, { width: 130, align: 'right' });
        
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