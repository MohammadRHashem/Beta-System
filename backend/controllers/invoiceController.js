const pool = require('../config/db');
const { recalculateBalances } = require('../utils/balanceCalculator');
const ExcelJS = require('exceljs');
const { utcToZonedTime, format } = require('date-fns-tz');
const path = require('path');
const fs = require('fs');
const { parseFormattedCurrency } = require('../utils/currencyParser');

const SAO_PAULO_TZ = 'America/Sao_Paulo';

// --- GET All Invoices with Filtering, Sorting, and Pagination ---
exports.getAllInvoices = async (req, res) => {
    const {
        page = 1,
        limit = 50,
        sortBy = 'received_at',
        sortOrder = 'desc',
        search = '',
        dateFrom,
        dateTo,
        timeFrom,
        timeTo,
        sourceGroup,
        recipientName,
        reviewStatus, // 'only_review', 'hide_review'
    } = req.query;

    const offset = (page - 1) * limit;
    let query = `
        FROM invoices i
        LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
        WHERE 1=1
    `;
    const params = [];

    // Search
    if (search) {
        query += ` AND (
            i.transaction_id LIKE ? OR 
            i.sender_name LIKE ? OR 
            i.recipient_name LIKE ? OR 
            i.pix_key LIKE ? OR 
            i.notes LIKE ?
        )`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Date Range
    if (dateFrom) {
        // If time is provided, combine it with the date. Otherwise, use the date alone.
        const startDateTime = timeFrom ? `${dateFrom} ${timeFrom}` : dateFrom;
        query += ' AND i.received_at >= ?';
        params.push(startDateTime);
    }
    if (dateTo) {
        // If time is provided, combine it. Otherwise, add a day to make the date inclusive.
        if (timeTo) {
            const endDateTime = `${dateTo} ${timeTo}`;
            query += ' AND i.received_at <= ?';
            params.push(endDateTime);
        } else {
            const toDate = new Date(dateTo);
            toDate.setDate(toDate.getDate() + 1);
            query += ' AND i.received_at < ?';
            params.push(toDate.toISOString().split('T')[0]);
        }
    }

    // Filters
    if (sourceGroup) {
        query += ' AND i.source_group_jid = ?';
        params.push(sourceGroup);
    }
    if (recipientName) {
        query += ' AND i.recipient_name = ?';
        params.push(recipientName);
    }

    // Review Status
    const reviewCondition = "(i.sender_name IS NULL OR i.sender_name = '' OR i.recipient_name IS NULL OR i.recipient_name = '' OR i.amount IS NULL OR i.amount = '')";
    if (reviewStatus === 'only_review') {
        query += ` AND ${reviewCondition}`;
    } else if (reviewStatus === 'hide_review') {
        query += ` AND NOT ${reviewCondition}`;
    }

    try {
        const countQuery = `SELECT count(*) as total ${query}`;
        const [[{ total }]] = await pool.query(countQuery, params);

        const dataQuery = `
            SELECT i.*, wg.group_name as source_group_name
            ${query}
            ORDER BY ${pool.escapeId(sortBy)} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}, i.id ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
            LIMIT ? OFFSET ?
        `;
        const finalParams = [...params, parseInt(limit), parseInt(offset)];
        
        const [invoices] = await pool.query(dataQuery, finalParams);

        res.json({
            invoices,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            totalRecords: total,
        });

    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ message: 'Failed to fetch invoices.' });
    }
};

// --- Get unique recipient names for filter dropdown ---
exports.getRecipientNames = async (req, res) => {
    try {
        const [recipients] = await pool.query(
            "SELECT DISTINCT recipient_name FROM invoices WHERE recipient_name IS NOT NULL AND recipient_name != '' ORDER BY recipient_name ASC"
        );
        res.json(recipients.map(r => r.recipient_name));
    } catch (error) {
        console.error('Error fetching recipient names:', error);
        res.status(500).json({ message: 'Failed to fetch recipient names.' });
    }
};

// --- CREATE a Manual Invoice/Entry ---
exports.createInvoice = async (req, res) => {
    const { amount, credit, notes, received_at } = req.body;
    
    const receivedAt = received_at ? new Date(received_at) : new Date();

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await connection.query(
            'INSERT INTO invoices (amount, credit, notes, received_at, is_manual, sender_name, recipient_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [amount || null, credit || null, notes, receivedAt, true, req.body.sender_name || '', req.body.recipient_name || '']
        );
        
        await recalculateBalances(connection, receivedAt.toISOString());

        await connection.commit();
        
        req.io.emit('invoices:updated');
        res.status(201).json({ message: 'Invoice created successfully', id: result.insertId });

    } catch (error) {
        await connection.rollback();
        console.error('Error creating invoice:', error);
        res.status(500).json({ message: 'Failed to create invoice.' });
    } finally {
        connection.release();
    }
};

// --- UPDATE an Invoice ---
exports.updateInvoice = async (req, res) => {
    const { id } = req.params;
    const {
        transaction_id, sender_name, recipient_name, pix_key, amount,
        credit, notes, received_at
    } = req.body;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const [[oldInvoice]] = await connection.query('SELECT received_at FROM invoices WHERE id = ?', [id]);
        if (!oldInvoice) {
            throw new Error('Invoice not found');
        }
        
        const oldTimestamp = new Date(oldInvoice.received_at);
        const newTimestamp = new Date(received_at);
        const startRecalcTimestamp = oldTimestamp < newTimestamp ? oldTimestamp : newTimestamp;

        await connection.query(
            `UPDATE invoices SET 
                transaction_id = ?, sender_name = ?, recipient_name = ?, pix_key = ?, 
                amount = ?, credit = ?, notes = ?, received_at = ?
            WHERE id = ?`,
            [transaction_id, sender_name, recipient_name, pix_key, amount, credit, notes, newTimestamp, id]
        );
        
        await recalculateBalances(connection, startRecalcTimestamp.toISOString());

        await connection.commit();

        req.io.emit('invoices:updated');
        res.json({ message: 'Invoice updated successfully.' });

    } catch (error) {
        await connection.rollback();
        if (error.message === 'Invoice not found') {
            return res.status(404).json({ message: 'Invoice not found.' });
        }
        console.error('Error updating invoice:', error);
        res.status(500).json({ message: 'Failed to update invoice.' });
    } finally {
        connection.release();
    }
};

// --- DELETE an Invoice ---
exports.deleteInvoice = async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [[invoice]] = await connection.query('SELECT received_at FROM invoices WHERE id = ?', [id]);
        if (!invoice) {
             throw new Error('Invoice not found');
        }

        await connection.query('DELETE FROM invoices WHERE id = ?', [id]);
        
        await recalculateBalances(connection, new Date(invoice.received_at).toISOString());

        await connection.commit();
        
        req.io.emit('invoices:updated');
        res.status(204).send();

    } catch (error) {
        await connection.rollback();
        if (error.message === 'Invoice not found') {
            return res.status(404).json({ message: 'Invoice not found.' });
        }
        console.error('Error deleting invoice:', error);
        res.status(500).json({ message: 'Failed to delete invoice.' });
    } finally {
        connection.release();
    }
};

// --- SERVE Media File for an Invoice ---
exports.getInvoiceMedia = async (req, res) => {
    try {
        const { id } = req.params;
        const [[invoice]] = await pool.query('SELECT media_path FROM invoices WHERE id = ?', [id]);

        if (!invoice || !invoice.media_path) {
            return res.status(404).send('Media not found.');
        }

        const filePath = path.resolve(invoice.media_path);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('Media file is missing from the server.');
        }
    } catch (error) {
        console.error('Error serving media file:', error);
        res.status(500).send('Server error.');
    }
};

// --- EXPORT Invoices to Excel ---
exports.exportInvoices = async (req, res) => {
    const {
        search = '', dateFrom, dateTo, sourceGroup, recipientName, reviewStatus
    } = req.query;

    let query = `
        SELECT i.*, wg.group_name as source_group_name
        FROM invoices i
        LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
        WHERE 1=1
    `;
    const params = [];

    if (search) {
        query += ` AND (i.transaction_id LIKE ? OR i.sender_name LIKE ? OR i.recipient_name LIKE ? OR i.pix_key LIKE ? OR i.notes LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    if (dateFrom) { query += ' AND i.received_at >= ?'; params.push(dateFrom); }
    if (dateTo) { 
        const toDate = new Date(dateTo);
        toDate.setDate(toDate.getDate() + 1);
        query += ' AND i.received_at < ?';
        params.push(toDate.toISOString().split('T')[0]);
    }
    if (sourceGroup) { query += ' AND i.source_group_jid = ?'; params.push(sourceGroup); }
    if (recipientName) { query += ' AND i.recipient_name = ?'; params.push(recipientName); }
    const reviewCondition = "(i.sender_name IS NULL OR i.sender_name = '' OR i.recipient_name IS NULL OR i.recipient_name = '' OR i.amount IS NULL OR i.amount = '')";
    if (reviewStatus === 'only_review') { query += ` AND ${reviewCondition}`; }
    if (reviewStatus === 'hide_review') { query += ` AND NOT ${reviewCondition}`; }

    query += ' ORDER BY i.received_at ASC, i.id ASC';

    try {
        const [invoices] = await pool.query(query, params);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Invoices');

        worksheet.columns = [
            { header: 'Date', key: 'date', width: 20 },
            { header: 'Description', key: 'description', width: 40 },
            { header: 'Debit', key: 'debit', width: 15, style: { numFmt: '#,##0.00' } },
            { header: 'Credit', key: 'credit', width: 15, style: { numFmt: '#,##0.00' } },
            { header: 'Balance', key: 'balance', width: 15, style: { numFmt: '#,##0.00' } },
        ];
        
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF0A2540'} };
        
        let lastSaoPauloDay = null;
        const saoPauloCutoffHour = 16;
        const saoPauloCutoffMinute = 15;

        for (const invoice of invoices) {
            const receivedAtUTC = new Date(invoice.received_at);
            const receivedAtSP = utcToZonedTime(receivedAtUTC, SAO_PAULO_TZ);
            
            let currentSaoPauloDay = format(receivedAtSP, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });

            const receivedHour = receivedAtSP.getHours();
            const receivedMinute = receivedAtSP.getMinutes();
            
            if (receivedHour > saoPauloCutoffHour || (receivedHour === saoPauloCutoffHour && receivedMinute >= saoPauloCutoffMinute)) {
                receivedAtSP.setDate(receivedAtSP.getDate() + 1);
                currentSaoPauloDay = format(receivedAtSP, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });
            }
            
            if (lastSaoPauloDay && lastSaoPauloDay !== currentSaoPauloDay) {
                const separatorRow = worksheet.addRow({
                    date: `--- ${format(receivedAtSP, 'dd/MM/yyyy', { timeZone: SAO_PAULO_TZ })} ---`
                });
                separatorRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                separatorRow.font = { bold: true };
                worksheet.mergeCells(`A${separatorRow.number}:E${separatorRow.number}`);
                separatorRow.getCell('A').alignment = { horizontal: 'center' };
            }
            
            const description = invoice.is_manual 
                ? invoice.notes 
                : `${invoice.sender_name || 'N/A'} -> ${invoice.recipient_name || 'N/A'}`;
                
            worksheet.addRow({
                date: receivedAtUTC,
                description: description,
                debit: invoice.amount ? parseFormattedCurrency(invoice.amount) : null,
                credit: invoice.credit ? parseFloat(invoice.credit) : null,
                balance: invoice.balance ? parseFloat(invoice.balance) : null
            });

            lastSaoPauloDay = currentSaoPauloDay;
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="invoices.xlsx"');

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error exporting invoices:', error);
        res.status(500).json({ message: 'Failed to export invoices.' });
    }
};