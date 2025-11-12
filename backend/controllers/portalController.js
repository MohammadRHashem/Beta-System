const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

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

        if (!client || !(await bcrypt.compare(password, client.password_hash))) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const [[subaccount]] = await pool.query(
            'SELECT id, name, subaccount_number, assigned_group_name FROM subaccounts WHERE id = ?', 
            [client.subaccount_id]
        );

        const tokenPayload = {
            id: client.id,
            username: client.username,
            subaccountId: subaccount.id,
            subaccountNumber: subaccount.subaccount_number,
            groupName: subaccount.assigned_group_name
        };
        
        const token = jwt.sign(tokenPayload, PORTAL_JWT_SECRET, { expiresIn: '8h' });
        
        res.json({ 
            token, 
            client: { 
                username: client.username, 
                name: subaccount.name,
                groupName: subaccount.assigned_group_name // This is the new piece of data
            } 
        });
    } catch (error) {
        console.error('[PORTAL-LOGIN-ERROR]', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
};

// Get Transactions Endpoint (Protected)
exports.getTransactions = async (req, res) => {
    // req.client is added by the portalAuthMiddleware
    const subaccountNumber = req.client.subaccountNumber;

    // Use a single 'date' filter now
    const { page = 1, limit = 50, search, date } = req.query;

    try {
        let query = `
            FROM xpayz_transactions
            WHERE subaccount_id = ?
        `;
        const params = [subaccountNumber];

        if (search) {
            query += ` AND (sender_name LIKE ? OR amount LIKE ? OR xpayz_transaction_id LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        // MODIFICATION: Filter by a single date if provided
        if (date) {
            query += ' AND DATE(transaction_date) = ?';
            params.push(date);
        }

        const countQuery = `SELECT count(*) as total ${query}`;
        const [[{ total }]] = await pool.query(countQuery, params);

        const dataQuery = `
            SELECT id, transaction_date, sender_name, amount, xpayz_transaction_id, raw_details
            ${query}
            ORDER BY transaction_date DESC
            LIMIT ? OFFSET ?
        `;
        const finalParams = [...params, parseInt(limit), (page - 1) * limit];
        const [transactions] = await pool.query(dataQuery, finalParams);
        
        res.json({
            transactions,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            totalRecords: total,
        });

    } catch (error) {
        console.error(`[PORTAL-TRANSACTIONS-ERROR] Failed to fetch transactions for subaccount ${subaccountNumber}:`, error);
        res.status(500).json({ message: 'Failed to fetch transactions.' });
    }
};

// === ADD THIS NEW FUNCTION for the volume counter ===
exports.getFilteredVolume = async (req, res) => {
    const subaccountNumber = req.client.subaccountNumber;
    const { search, date } = req.query; 

    try {
        let query = `
            SELECT SUM(amount) as totalVolume 
            FROM xpayz_transactions
            WHERE subaccount_id = ?
        `;
        const params = [subaccountNumber];

        if (search) {
            query += ` AND (sender_name LIKE ? OR amount LIKE ? OR xpayz_transaction_id LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        if (date) {
            query += ' AND DATE(transaction_date) = ?';
            params.push(date);
        }

        const [[{ totalVolume }]] = await pool.query(query, params);
        res.json({ totalVolume: totalVolume || 0 });

    } catch (error) {
        console.error(`[PORTAL-VOLUME-ERROR] Failed to calculate filtered volume for subaccount ${subaccountNumber}:`, error);
        res.status(500).json({ message: 'Failed to calculate volume.' });
    }
};


const generatePdfTable = (doc, transactions, clientName) => {
    // --- Header ---
    doc.fontSize(20).font('Helvetica-Bold').text('Account Balance', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`Client: ${clientName}`, { align: 'center' });
    doc.moveDown(2);

    // --- Table Constants ---
    const tableTop = doc.y;
    const dateX = 50;
    const senderX = 170;
    const amountX = 420;
    const rowHeight = 25;
    const tableBottomMargin = 50;

    // --- Draw Table Header ---
    const drawHeader = (y) => {
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Date', dateX, y);
        doc.text('Sender', senderX, y);
        doc.text('Amount (BRL)', amountX, y, { width: 130, align: 'right' });
        doc.moveTo(dateX, y + 15).lineTo(550, y + 15).strokeColor("#cccccc").stroke();
    };
    
    drawHeader(tableTop);
    let y = tableTop + 30;

    // --- Draw Table Rows ---
    doc.fontSize(9).font('Helvetica');
    transactions.forEach(tx => {
        // Check if a new page is needed BEFORE drawing the row
        if (y + rowHeight > doc.page.height - tableBottomMargin) {
            doc.addPage();
            y = tableTop; // Reset Y position to the top of the new page
            drawHeader(y - 15); // Redraw the header
            y += 15;
        }
        
        const date = new Date(tx.transaction_date);
        const formattedDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(date);
        const formattedAmount = parseFloat(tx.amount).toFixed(2);

        doc.text(formattedDate, dateX, y, { width: 110, lineBreak: false });
        doc.text(tx.sender_name, senderX, y, { width: 240, lineBreak: false, ellipsis: true });
        doc.text(formattedAmount, amountX, y, { width: 130, align: 'right' });
        
        y += rowHeight;
    });
};

exports.exportTransactions = async (req, res) => {
    // === MODIFICATION: Get the full groupName from the JWT token ===
    const { subaccountNumber, username } = req.client;
    const { search, date, format = 'excel' } = req.query;

    try {
        let query = `
            SELECT transaction_date, sender_name, amount
            FROM xpayz_transactions
            WHERE subaccount_id = ?
        `;
        const params = [subaccountNumber];

        if (search) {
            query += ` AND (sender_name LIKE ? OR amount LIKE ? OR xpayz_transaction_id LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        if (date) {
            query += ' AND DATE(transaction_date) = ?';
            params.push(date);
        }
        
        query += ' ORDER BY transaction_date DESC';
        const [transactions] = await pool.query(query, params);

        const filename = `accountBalance_${username}`;

        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 50, size: 'A4' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
            doc.pipe(res);
            
            // === FIX 1: Pass the full groupName (or username fallback) to the PDF generator ===
            generatePdfTable(doc, transactions, username);
            
            doc.end();

        } else { // Excel export
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Transactions');

            worksheet.columns = [
                { header: 'Date', key: 'date', width: 25, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
                { header: 'Sender', key: 'sender', width: 40 },
                { header: 'Amount (BRL)', key: 'amount', width: 20, style: { numFmt: '#,##0.00' } },
            ];

            worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2540' } };
            worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

            transactions.forEach(tx => {
                // === FIX 2: Prevent timezone conversion for Excel ===
                // The database gives a DATETIME object. We format it to a timezone-naive ISO string
                // WITHOUT the 'Z' (which signifies UTC). ExcelJS will parse this correctly as local time.
                const naiveDate = new Date(tx.transaction_date);
                const year = naiveDate.getFullYear();
                const month = String(naiveDate.getMonth() + 1).padStart(2, '0');
                const day = String(naiveDate.getDate()).padStart(2, '0');
                const hours = String(naiveDate.getHours()).padStart(2, '0');
                const minutes = String(naiveDate.getMinutes()).padStart(2, '0');
                const seconds = String(naiveDate.getSeconds()).padStart(2, '0');
                // Format: YYYY-MM-DDTHH:MM:SS
                const excelDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

                const dateObj = new Date(excelDate);
                dateObj.setHours(dateObj.getHours() - 3);

                worksheet.addRow({
                    date: dateObj,
                    sender: tx.sender_name,
                    amount: parseFloat(tx.amount)
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
            await workbook.xlsx.write(res);
            res.end();
        }

    } catch (error) {
        console.error(`[PORTAL-EXPORT-ERROR] Failed to export for subaccount ${subaccountNumber}:`, error);
        res.status(500).json({ message: 'Failed to export transactions.' });
    }
};