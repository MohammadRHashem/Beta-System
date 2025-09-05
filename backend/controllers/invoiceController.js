const pool = require('../config/db');
const { recalculateBalances } = require('../utils/balanceCalculator');
const ExcelJS = require('exceljs');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { parseFormattedCurrency, formatNumberToCustomCurrency } = require('../utils/currencyParser');

// (getAllInvoices, getRecipientNames, createInvoice, updateInvoice, deleteInvoice, getInvoiceMedia remain unchanged from the previous step)
// ... I am keeping them here for completeness as per your request for full unabridged files.

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
        console.error('[ERROR] Failed to fetch invoices:', error);
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
        console.error('[ERROR] Failed to fetch recipient names:', error);
        res.status(500).json({ message: 'Failed to fetch recipient names.' });
    }
};

exports.createInvoice = async (req, res) => {
    const { 
        amount, credit, notes, received_at, 
        sender_name, recipient_name, transaction_id, pix_key
    } = req.body;
    
    if (!received_at) {
        return res.status(400).json({ message: "A timestamp (received_at) is required for all new entries." });
    }
    
    const receivedAt = new Date(received_at);
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const final_sort_order = receivedAt.getTime();

        const creditValue = (credit === null || credit === undefined || credit === '') ? '0.00' : credit;
        const amountValue = (amount === null || amount === undefined || amount === '') ? '0.00' : amount;

        const [result] = await connection.query(
            `INSERT INTO invoices (amount, credit, notes, received_at, sort_order, is_manual, sender_name, recipient_name, transaction_id, pix_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [amountValue, creditValue, notes, receivedAt, final_sort_order, true, sender_name || '', recipient_name || '', transaction_id || null, pix_key || null]
        );
        
        await recalculateBalances(connection, receivedAt.toISOString());
        
        await connection.commit();
        console.log(`[INFO] Successfully created manual invoice ID: ${result.insertId}`);
        req.io.emit('invoices:updated');
        res.status(201).json({ message: 'Invoice created successfully', id: result.insertId });
    } catch (error) {
        await connection.rollback();
        console.error('[ERROR] Failed to create manual invoice:', error);
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
        const newSortOrder = newTimestamp ? newTimestamp.getTime() : null;
        const startRecalcTimestamp = oldTimestamp < newTimestamp ? oldTimestamp : newTimestamp;

        const amountValue = (amount === null || amount === undefined || amount === '') ? '0.00' : amount;
        const creditValue = (credit === null || credit === undefined || credit === '') ? '0.00' : credit;

        await connection.query(
            `UPDATE invoices SET 
                transaction_id = ?, sender_name = ?, recipient_name = ?, pix_key = ?, 
                amount = ?, credit = ?, notes = ?, received_at = ?, sort_order = ?
            WHERE id = ?`,
            [transaction_id, sender_name, recipient_name, pix_key, amountValue, creditValue, notes, newTimestamp, newSortOrder, id]
        );
        
        await recalculateBalances(connection, startRecalcTimestamp.toISOString());
        
        await connection.commit();
        console.log(`[INFO] Successfully updated invoice ID: ${id}`);
        req.io.emit('invoices:updated');
        res.json({ message: 'Invoice updated successfully.' });
    } catch (error) {
        await connection.rollback();
        if (error.message === 'Invoice not found') {
            return res.status(404).json({ message: 'Invoice not found.' });
        }
        console.error(`[ERROR] Failed to update invoice ID ${id}:`, error);
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
        
        console.log(`[INFO] Permanently deleted invoice ID: ${id}`);
        req.io.emit('invoices:updated');
        res.status(204).send();

    } catch (error) {
        await connection.rollback();
        if (error.message === 'Invoice not found') {
            return res.status(404).json({ message: 'Invoice not found.' });
        }
        console.error(`[ERROR] Failed to delete invoice ID ${id}:`, error);
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
        console.error('[ERROR] Failed to serve media file:', error);
        res.status(500).send('Server error.');
    }
};

exports.exportInvoices = async (req, res) => {
    const {
        search = '', dateFrom, dateTo, timeFrom, timeTo,
        sourceGroups, recipientNames, reviewStatus, status
    } = req.query;

    console.log('[EXPORT] Received export request with filters:', req.query);

    let query = `
        SELECT i.received_at, i.transaction_id, i.sender_name, i.recipient_name, wg.group_name as source_group_name, i.amount
        FROM invoices i
        LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
        WHERE 1=1
    `;
    const params = [];

    // Apply all filters from the frontend
    if (search) {
        query += ` AND (i.transaction_id LIKE ? OR i.sender_name LIKE ? OR i.recipient_name LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
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
    if (sourceGroups && typeof sourceGroups === 'string' && sourceGroups.length > 0) {
        query += ' AND i.source_group_jid IN (?)';
        params.push(sourceGroups.split(','));
    }
    if (recipientNames && typeof recipientNames === 'string' && recipientNames.length > 0) {
        query += ' AND i.recipient_name IN (?)';
        params.push(recipientNames.split(','));
    }
    const reviewCondition = "(i.sender_name IS NULL OR i.sender_name = '' OR i.recipient_name IS NULL OR i.recipient_name = '')";
    if (reviewStatus === 'only_review') { query += ` AND ${reviewCondition}`; }
    if (reviewStatus === 'hide_review') { query += ` AND NOT ${reviewCondition}`; }
    if (status === 'only_deleted') { query += ' AND i.is_deleted = 1'; }
    if (status === 'only_duplicates') { query += ` AND i.transaction_id IS NOT NULL AND i.transaction_id != '' AND i.transaction_id IN (SELECT transaction_id FROM invoices WHERE transaction_id IS NOT NULL AND transaction_id != '' GROUP BY transaction_id HAVING COUNT(*) > 1)`; }

    query += ' ORDER BY i.sort_order ASC, i.id ASC';

    try {
        const [invoicesFromDb] = await pool.query(query, params);
        console.log(`[EXPORT] Found ${invoicesFromDb.length} records to export based on filters.`);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Invoices', {
            views: [{ state: 'frozen', ySplit: 1 }] // Freeze header row
        });

        // Define columns with new order and styling
        worksheet.columns = [
            { header: 'TimeDate', key: 'received_at', width: 22, style: { numFmt: 'dd/mm/yyyy hh:mm:ss', alignment: { horizontal: 'right' } } },
            { header: 'Transaction ID', key: 'transaction_id', width: 35, style: { alignment: { horizontal: 'left' } } },
            { header: 'Sender', key: 'sender_name', width: 30, style: { alignment: { horizontal: 'left' } } },
            { header: 'Recipient', key: 'recipient_name', width: 30, style: { alignment: { horizontal: 'left' } } },
            { header: 'Source Grp Name', key: 'source_group_name', width: 25, style: { alignment: { horizontal: 'left' } } },
            { header: 'Amount', key: 'amount', width: 18, style: { numFmt: '#,##0.00', alignment: { horizontal: 'right' } } },
        ];

        // Style the header row
        worksheet.getRow(1).font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF0A2540'} };

        let lastDate = null;
        for (const invoice of invoicesFromDb) {
            // Because of `dateStrings: true`, received_at is a string 'YYYY-MM-DD HH:MM:SS'
            const currentDate = new Date(invoice.received_at);

            // Yellow Separator Logic
            if (lastDate) {
                const lastDayMarker = new Date(lastDate);
                lastDayMarker.setHours(16, 15, 0, 0);
                if (lastDate < lastDayMarker && currentDate >= lastDayMarker) {
                    worksheet.addRow([]); // Add an empty row for visual separation
                    const splitterRow = worksheet.addRow({ transaction_id: `--- Day of ${currentDate.toLocaleDateString('en-CA')} ---` });
                    splitterRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                    splitterRow.font = { name: 'Calibri', bold: true };
                    worksheet.mergeCells(`B${splitterRow.number}:F${splitterRow.number}`);
                }
            }
            
            // Add the main data row
            const newRow = worksheet.addRow({
                received_at: currentDate,
                transaction_id: invoice.transaction_id,
                sender_name: invoice.sender_name,
                recipient_name: invoice.recipient_name,
                source_group_name: invoice.source_group_name,
                amount: parseFormattedCurrency(invoice.amount) // Use the robust parser here
            });
            
            // Apply default font and borders to the new row
            newRow.font = { name: 'Calibri', size: 11 };
            newRow.eachCell({ includeEmpty: true }, (cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });

            lastDate = currentDate;
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="invoices_export.xlsx"');

        await workbook.xlsx.write(res);
        console.log('[EXPORT] Successfully sent Excel file to client.');
        res.end();

    } catch (error) {
        console.error('[EXPORT-ERROR] Failed to export invoices:', error);
        res.status(500).json({ message: 'Failed to export invoices.' });
    }
};

// === NEW: Function to import and sync from Excel ===
exports.importInvoices = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }
    console.log('[IMPORT] Received Excel file for import and sync.');

    const connection = await pool.getConnection();
    try {
        // --- 1. Read and Parse the Excel File ---
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Skip header row
        const dataRows = rows.slice(1);
        let earliestChangeTimestamp = new Date();

        await connection.beginTransaction();
        console.log('[IMPORT] Database transaction started.');

        // --- 2. Process Rows and Build Database Queries ---
        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const id = row[0]; // Hidden ID is in the first column
            const receivedAt = new Date(row[1]);
            const description = row[2];
            const debit = row[3];
            const credit = row[4];
            
            // Skip yellow splitter rows
            if (description && description.startsWith('--- Day of')) continue;
            
            // Generate a new, sequential sort_order based on the row's position
            const sortOrder = (i + 1) * 1000;
            
            // Track the earliest timestamp for recalculation
            if (receivedAt < earliestChangeTimestamp) {
                earliestChangeTimestamp = receivedAt;
            }

            const formattedDebit = formatNumberToCustomCurrency(debit);
            const formattedCredit = formatNumberToCustomCurrency(credit);

            if (id) {
                // --- UPDATE existing invoice ---
                await connection.query(
                    `UPDATE invoices SET received_at = ?, notes = ?, amount = ?, credit = ?, sort_order = ? WHERE id = ?`,
                    [receivedAt, description, formattedDebit, formattedCredit, sortOrder, id]
                );
            } else if (receivedAt && description) {
                // --- INSERT new invoice ---
                await connection.query(
                    `INSERT INTO invoices (received_at, notes, amount, credit, sort_order, is_manual) VALUES (?, ?, ?, ?, ?, ?)`,
                    [receivedAt, description, formattedDebit, formattedCredit, sortOrder, true]
                );
            }
        }
        console.log(`[IMPORT] Processed ${dataRows.length} rows from Excel.`);

        // --- 3. Recalculate Balances ---
        await recalculateBalances(connection, earliestChangeTimestamp.toISOString());
        
        // --- 4. Commit Transaction ---
        await connection.commit();
        console.log('[IMPORT] Database transaction committed successfully.');

        req.io.emit('invoices:updated');
        res.status(200).json({ message: 'Successfully imported and synced data from Excel.' });

    } catch (error) {
        await connection.rollback();
        console.error('[IMPORT-ERROR] Transaction rolled back due to error:', error);
        res.status(500).json({ message: `Failed to import file. Error: ${error.message}` });
    } finally {
        connection.release();
    }
};