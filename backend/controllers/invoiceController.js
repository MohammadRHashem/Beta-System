const pool = require('../config/db');
const { recalculateBalances } = require('../utils/balanceCalculator');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { parseFormattedCurrency } = require('../utils/currencyParser');

exports.getAllInvoices = async (req, res) => {
    const {
        page = 1, limit = 50, sortOrder = 'desc',
        search = '', dateFrom, dateTo, timeFrom, timeTo,
        sourceGroups, recipientNames, reviewStatus, status,
    } = req.query;

    const offset = (page - 1) * limit;
    let query = `
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
    if (dateFrom) {
        const startDateTime = `${dateFrom} ${timeFrom || '00:00:00'}`;
        query += ' AND i.received_at >= ?';
        params.push(startDateTime);
    }
    if (dateTo) {
        const endDateTime = `${dateTo} ${timeTo || '23:59:59'}`;
        query += ' AND i.received_at <= ?';
        params.push(endDateTime);
    }
    if (sourceGroups && sourceGroups.length > 0) {
        query += ` AND i.source_group_jid IN (?)`;
        params.push(sourceGroups);
    }
    if (recipientNames && recipientNames.length > 0) {
        query += ` AND i.recipient_name IN (?)`;
        params.push(recipientNames);
    }
    
    const reviewCondition = "(i.sender_name IS NULL OR i.sender_name = '' OR i.recipient_name IS NULL OR i.recipient_name = '' OR i.amount IS NULL OR i.amount = '0.00')";
    if (reviewStatus === 'only_review') {
        query += ` AND ${reviewCondition}`;
    } else if (reviewStatus === 'hide_review') {
        query += ` AND NOT ${reviewCondition}`;
    }
    if (status === 'only_deleted') {
        query += ' AND i.is_deleted = 1';
    } else if (status === 'only_duplicates') {
        query += ` AND i.transaction_id IS NOT NULL AND i.transaction_id != '' AND i.transaction_id IN (SELECT transaction_id FROM invoices WHERE transaction_id IS NOT NULL AND transaction_id != '' GROUP BY transaction_id HAVING COUNT(*) > 1)`;
    }

    const orderByClause = `i.sort_order ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;

    try {
        const countQuery = `SELECT count(*) as total ${query}`;
        const [[{ total }]] = await pool.query(countQuery, params);

        const dataQuery = `
            SELECT i.*, wg.group_name as source_group_name
            ${query}
            ORDER BY ${orderByClause}, i.id ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
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

exports.createInvoice = async (req, res) => {
    const { 
        amount, credit, notes, received_at, 
        sender_name, recipient_name, transaction_id, pix_key, 
        insertAfterId 
    } = req.body;
    
    // received_at is optional for "insert between" entries.
    const receivedAt = received_at ? new Date(received_at) : null;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        let final_sort_order;

        if (insertAfterId) {
            console.log(`[SORT] Received request to insert after ID: ${insertAfterId}`);
            if (insertAfterId === 'START') {
                const [[{ min_sort }]] = await connection.query('SELECT MIN(sort_order) as min_sort FROM invoices');
                final_sort_order = min_sort ? min_sort - 10000 : new Date().getTime(); // Subtract 10 seconds
                console.log(`[SORT] Inserting at START. New sort_order: ${final_sort_order}`);
            } else {
                const [[prevInvoice]] = await connection.query('SELECT sort_order FROM invoices WHERE id = ?', [insertAfterId]);
                if (!prevInvoice) {
                    throw new Error(`Previous invoice for sorting (ID: ${insertAfterId}) not found.`);
                }
                const prevSort = BigInt(prevInvoice.sort_order);
                console.log(`[SORT] Found previous invoice sort_order: ${prevSort}`);

                const [[nextInvoice]] = await connection.query('SELECT sort_order FROM invoices WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1', [prevSort]);
                
                let nextSort;
                if (nextInvoice) {
                    nextSort = BigInt(nextInvoice.sort_order);
                    console.log(`[SORT] Found next invoice sort_order: ${nextSort}`);
                } else {
                    nextSort = prevSort + BigInt(10000); // Add 10 seconds if it's the last item
                    console.log(`[SORT] No next invoice found. Creating new sort_order at the end: ${nextSort}`);
                }

                // Use BigInt for calculation to prevent precision errors
                final_sort_order = (prevSort + nextSort) / BigInt(2);
                console.log(`[SORT] Calculated midpoint sort_order: ${final_sort_order}`);
            }
        } else {
            if (!receivedAt) throw new Error("A timestamp is required for a new standard entry.");
            final_sort_order = receivedAt.getTime();
            console.log(`[SORT] Standard entry. Creating sort_order from timestamp: ${final_sort_order}`);
        }

        const creditValue = (credit === null || credit === undefined || credit === '') ? '0.00' : credit;
        const amountValue = (amount === null || amount === undefined || amount === '') ? '0.00' : amount;

        const [result] = await connection.query(
            `INSERT INTO invoices (amount, credit, notes, received_at, sort_order, is_manual, sender_name, recipient_name, transaction_id, pix_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [amountValue, creditValue, notes, receivedAt, final_sort_order, true, sender_name || '', recipient_name || '', transaction_id || null, pix_key || null]
        );
        
        const recalcStartTime = receivedAt || new Date();
        await recalculateBalances(connection, recalcStartTime.toISOString());
        
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
        if (!oldInvoice) { throw new Error('Invoice not found'); }
        
        const oldTimestamp = new Date(oldInvoice.received_at);
        const newTimestamp = received_at ? new Date(received_at) : null;
        const startRecalcTimestamp = oldTimestamp < newTimestamp ? oldTimestamp : newTimestamp;

        const amountValue = (amount === null || amount === undefined || amount === '') ? '0.00' : amount;
        const creditValue = (credit === null || credit === undefined || credit === '') ? '0.00' : credit;

        await connection.query(
            `UPDATE invoices SET 
                transaction_id = ?, sender_name = ?, recipient_name = ?, pix_key = ?, 
                amount = ?, credit = ?, notes = ?, received_at = ?
            WHERE id = ?`,
            [transaction_id, sender_name, recipient_name, pix_key, amountValue, creditValue, notes, newTimestamp, id]
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

exports.exportInvoices = async (req, res) => {
    const {
        search = '', dateFrom, dateTo, sourceGroups, recipientNames, reviewStatus, status
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
    if (sourceGroups && sourceGroups.length > 0) { query += ' AND i.source_group_jid IN (?)'; params.push(sourceGroups); }
    if (recipientNames && recipientNames.length > 0) { query += ' AND i.recipient_name IN (?)'; params.push(recipientNames); }
    const reviewCondition = "(i.sender_name IS NULL OR i.sender_name = '' OR i.recipient_name IS NULL OR i.recipient_name = '' OR i.amount IS NULL OR i.amount = '0.00')";
    if (reviewStatus === 'only_review') { query += ` AND ${reviewCondition}`; }
    if (reviewStatus === 'hide_review') { query += ` AND NOT ${reviewCondition}`; }
    if (status === 'only_deleted') { query += ' AND i.is_deleted = 1'; }
    if (status === 'only_duplicates') { query += ` AND i.transaction_id IS NOT NULL AND i.transaction_id != '' AND i.transaction_id IN (SELECT transaction_id FROM invoices WHERE transaction_id IS NOT NULL AND transaction_id != '' GROUP BY transaction_id HAVING COUNT(*) > 1)`; }

    query += ' ORDER BY i.sort_order ASC, i.id ASC';

    try {
        const [invoices] = await pool.query(query, params);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Invoices');

        worksheet.columns = [
            { header: 'Date', key: 'date', width: 20, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
            { header: 'Description', key: 'description', width: 40 },
            { header: 'Debit', key: 'debit', width: 15, style: { numFmt: '#,##0.00' } },
            { header: 'Credit', key: 'credit', width: 15, style: { numFmt: '#,##0.00' } },
            { header: 'Balance', key: 'balance', width: 15, style: { numFmt: '#,##0.00' } },
        ];
        
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF0A2540'} };
        
        for (const invoice of invoices) {
            const description = invoice.is_manual 
                ? invoice.notes 
                : `${invoice.sender_name || 'N/A'} -> ${invoice.recipient_name || 'N/A'}`;
                
            worksheet.addRow({
                date: invoice.received_at ? new Date(invoice.received_at) : null,
                description: description,
                debit: invoice.amount ? parseFormattedCurrency(invoice.amount) : null,
                credit: invoice.credit ? parseFormattedCurrency(invoice.credit) : null,
                balance: invoice.balance ? parseFormattedCurrency(invoice.balance) : null
            });
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