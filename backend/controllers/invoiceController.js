const pool = require('../config/db');
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

    // === THE EDIT: Added 'i.amount LIKE ?' to the search conditions ===
    if (search) {
        query += ` AND (i.transaction_id LIKE ? OR i.sender_name LIKE ? OR i.recipient_name LIKE ? OR i.pix_key LIKE ? OR i.notes LIKE ? OR i.amount LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (dateFrom) {
        // Since DB is now UTC, we must convert the DB time to compare against the user's local date input
        const startDateTime = `${dateFrom} ${timeFrom || '00:00:00'}`;
        query += ' AND CONVERT_TZ(i.received_at, "+00:00", "-03:00") >= ?';
        params.push(startDateTime);
    }
    if (dateTo) {
        const endDateTime = `${dateTo} ${timeTo || '23:59:59'}`;
        query += ' AND CONVERT_TZ(i.received_at, "+00:00", "-03:00") <= ?';
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

    const orderByClause = `i.received_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;

    try {
        const countQuery = `SELECT count(*) as total ${query}`;
        const [[{ total }]] = await pool.query(countQuery, params);

        const dataQuery = `
            SELECT i.id, i.message_id, i.transaction_id, i.sender_name, i.recipient_name, i.pix_key, i.amount, i.notes, i.is_manual, i.is_deleted, i.source_group_jid, i.received_at, i.media_path, wg.group_name as source_group_name
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


const getBusinessDay = (transactionDate) => {
    const businessDay = new Date(transactionDate);
    const hour = transactionDate.getHours();
    const minute = transactionDate.getMinutes();
    if (hour > 16 || (hour === 16 && minute >= 15)) {
        businessDay.setDate(businessDay.getDate() + 1);
    }
    businessDay.setHours(0, 0, 0, 0); 
    return businessDay;
};


exports.exportInvoices = async (req, res) => {
    const {
        search = '', dateFrom, dateTo,
        sourceGroups, recipientNames,
    } = req.query;

    let query = `
        SELECT 
            CONVERT_TZ(i.received_at, '+00:00', '-03:00') AS received_at, 
            i.transaction_id, 
            i.sender_name, 
            i.recipient_name, 
            wg.group_name as source_group_name, 
            i.amount
        FROM invoices i
        LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
        WHERE 1=1 
        AND i.is_deleted = 0
    `; // === THE EDIT: Added 'AND i.is_deleted = 0' as a permanent rule for exports ===
    
    const params = [];

    if (search) {
        query += ` AND (i.transaction_id LIKE ? OR i.sender_name LIKE ? OR i.recipient_name LIKE ? OR i.amount LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    if (dateFrom) {
        query += ' AND DATE(CONVERT_TZ(i.received_at, "+00:00", "-03:00")) >= ?';
        params.push(dateFrom);
    }
    if (dateTo) {
        query += ' AND DATE(CONVERT_TZ(i.received_at, "+00:00", "-03:00")) <= ?';
        params.push(dateTo);
    }
    if (sourceGroups && typeof sourceGroups === 'string' && sourceGroups.length > 0) {
        query += ' AND i.source_group_jid IN (?)';
        params.push(sourceGroups.split(','));
    }
    if (recipientNames && typeof recipientNames === 'string' && recipientNames.length > 0) {
        query += ' AND i.recipient_name IN (?)';
        params.push(recipientNames.split(','));
    }
    
    query += ' ORDER BY i.received_at ASC';

    try {
        const [invoicesFromDb] = await pool.query(query, params);
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Invoices', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });

        worksheet.columns = [
            { header: 'TimeDate', key: 'received_at', width: 22, style: { numFmt: 'dd/mm/yyyy hh:mm:ss', alignment: { horizontal: 'right' } } },
            { header: 'Transaction ID', key: 'transaction_id', width: 35, style: { alignment: { horizontal: 'left' } } },
            { header: 'Sender', key: 'sender_name', width: 30, style: { alignment: { horizontal: 'left' } } },
            { header: 'Recipient', key: 'recipient_name', width: 30, style: { alignment: { horizontal: 'left' } } },
            { header: 'Source Grp Name', key: 'source_group_name', width: 25, style: { alignment: { horizontal: 'left' } } },
            { header: 'Amount', key: 'amount', width: 18, style: { numFmt: '#,##0.00;[Red]-#,##0.00', alignment: { horizontal: 'right' } } },
        ];

        worksheet.getRow(1).font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF0A2540'} };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        let lastBusinessDay = null;
        for (const invoice of invoicesFromDb) {
            
            const saoPauloDateString = invoice.received_at;
            const comparisonDate = new Date(saoPauloDateString + '-03:00');
            const currentBusinessDay = getBusinessDay(comparisonDate);

            if (lastBusinessDay && currentBusinessDay.getTime() !== lastBusinessDay.getTime()) {
                const splitterRow = worksheet.addRow({ transaction_id: `--- Day of ${currentBusinessDay.toLocaleDateString('en-CA')} ---` });
                splitterRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                splitterRow.font = { name: 'Calibri', bold: true };
                worksheet.mergeCells(`B${splitterRow.number}:F${splitterRow.number}`);
                splitterRow.getCell('B').alignment = { horizontal: 'center' };
            }
            
            const newRow = worksheet.addRow({
                received_at: saoPauloDateString,
                transaction_id: invoice.transaction_id,
                sender_name: invoice.sender_name,
                recipient_name: invoice.recipient_name,
                source_group_name: invoice.source_group_name,
                amount: parseFormattedCurrency(invoice.amount)
            });
            
            newRow.font = { name: 'Calibri', size: 11 };
            newRow.eachCell({ includeEmpty: true }, (cell) => {
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            lastBusinessDay = currentBusinessDay;
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="invoices_export.xlsx"');

        await workbook.xlsx.write(res);

    } catch (error) {
        console.error('[EXPORT-ERROR] Failed to export invoices:', error);
        res.status(500).json({ message: 'Failed to export invoices.' });
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
        amount, notes, received_at, 
        sender_name, recipient_name, transaction_id, pix_key
    } = req.body;
    
    if (!received_at) {
        return res.status(400).json({ message: "A timestamp (received_at) is required for all new entries." });
    }
    
    const receivedAt = new Date(received_at);
    const amountValue = (amount === null || amount === undefined || amount === '') ? '0.00' : amount;

    try {
        const [result] = await pool.query(
            `INSERT INTO invoices (amount, notes, received_at, is_manual, sender_name, recipient_name, transaction_id, pix_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [amountValue, notes, receivedAt, true, sender_name || '', recipient_name || '', transaction_id || null, pix_key || null]
        );
        
        console.log(`[INFO] Successfully created manual invoice ID: ${result.insertId}`);
        req.io.emit('invoices:updated');
        res.status(201).json({ message: 'Invoice created successfully', id: result.insertId });
    } catch (error) {
        console.error('[ERROR] Failed to create manual invoice:', error);
        res.status(500).json({ message: 'Failed to create invoice.' });
    }
};

exports.updateInvoice = async (req, res) => {
    const { id } = req.params;
    const {
        transaction_id, sender_name, recipient_name, pix_key, amount,
        notes, received_at, is_deleted
    } = req.body;

    const newTimestamp = received_at ? new Date(received_at) : null;
    const amountValue = (amount === null || amount === undefined || amount === '') ? '0.00' : amount;

    try {
        await pool.query(
            `UPDATE invoices SET 
                transaction_id = ?, sender_name = ?, recipient_name = ?, pix_key = ?, 
                amount = ?, notes = ?, received_at = ?, is_deleted = ?
            WHERE id = ?`,
            [transaction_id, sender_name, recipient_name, pix_key, amountValue, notes, newTimestamp, !!is_deleted, id]
        );
        
        console.log(`[INFO] Successfully updated invoice ID: ${id}`);
        req.io.emit('invoices:updated');
        res.json({ message: 'Invoice updated successfully.' });
    } catch (error) {
        console.error(`[ERROR] Failed to update invoice ID ${id}:`, error);
        res.status(500).json({ message: 'Failed to update invoice.' });
    }
};

exports.deleteInvoice = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM invoices WHERE id = ?', [id]);
        console.log(`[INFO] Permanently deleted invoice ID: ${id}`);
        req.io.emit('invoices:updated');
        res.status(204).send();
    } catch (error) {
        console.error(`[ERROR] Failed to delete invoice ID ${id}:`, error);
        res.status(500).json({ message: 'Failed to delete invoice.' });
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