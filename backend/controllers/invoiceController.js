const pool = require('../config/db');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { parseFormattedCurrency } = require('../utils/currencyParser');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const {
    normalizeExactAmountInput,
    toInvoiceAmountDecimal,
    toStoredInvoiceAmount,
    buildUtcRangeFromSaoPauloInput
} = require('../utils/invoiceQueryUtils');
const {
    getCachedInvoiceRecipientNames,
    invalidateInvoiceReadCaches
} = require('../services/readCacheService');

const parseInvoiceTimestampInput = (value) => {
    if (!value) return null;
    const normalized = String(value).trim().replace(' ', 'T');
    const saoPauloDate = new Date(`${normalized}-03:00`);
    if (!Number.isNaN(saoPauloDate.getTime())) {
        return saoPauloDate;
    }
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const parseArrayFilter = (value) => {
    if (Array.isArray(value)) {
        return value.filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
    }
    return [];
};

const applyInvoiceFilters = ({ queryParts, params, filters }) => {
    const {
        search,
        dateFrom,
        dateTo,
        timeFrom,
        timeTo,
        sourceGroups,
        recipientNames,
        reviewStatus,
        status,
        amountExact
    } = filters;

    if (search) {
        queryParts.push('AND (i.transaction_id LIKE ? OR i.sender_name LIKE ? OR i.recipient_name LIKE ? OR i.pix_key LIKE ? OR i.notes LIKE ?)');
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const normalizedAmountFilter = normalizeExactAmountInput(amountExact);
    if (!normalizedAmountFilter.isEmpty) {
        if (normalizedAmountFilter.isValid) {
            queryParts.push('AND i.amount_decimal = ?');
            params.push(normalizedAmountFilter.value);
        } else {
            queryParts.push('AND 1 = 0');
        }
    }

    const { utcStart, utcEnd } = buildUtcRangeFromSaoPauloInput({ dateFrom, dateTo, timeFrom, timeTo });
    if (utcStart) {
        queryParts.push('AND i.received_at >= ?');
        params.push(utcStart);
    }
    if (utcEnd) {
        queryParts.push('AND i.received_at <= ?');
        params.push(utcEnd);
    }

    const sourceGroupList = parseArrayFilter(sourceGroups);
    if (sourceGroupList.length > 0) {
        queryParts.push('AND i.source_group_jid IN (?)');
        params.push(sourceGroupList);
    }

    const recipientList = parseArrayFilter(recipientNames);
    if (recipientList.length > 0) {
        queryParts.push('AND i.recipient_name IN (?)');
        params.push(recipientList);
    }

    const reviewCondition = "(i.sender_name IS NULL OR i.sender_name = '' OR i.recipient_name IS NULL OR i.recipient_name = '' OR i.amount IS NULL OR i.amount = '0.00')";
    if (reviewStatus === 'only_review') {
        queryParts.push(`AND ${reviewCondition}`);
    } else if (reviewStatus === 'hide_review') {
        queryParts.push(`AND NOT ${reviewCondition}`);
    }

    if (status === 'only_deleted') {
        queryParts.push('AND i.is_deleted = 1');
    } else if (status === 'only_duplicates') {
        queryParts.push("AND i.transaction_id IS NOT NULL AND i.transaction_id != ''");
        queryParts.push('AND i.id NOT IN (SELECT MIN(id) FROM invoices WHERE transaction_id IS NOT NULL AND transaction_id != \'\' GROUP BY transaction_id, amount)');
    } else if (status !== 'only_deleted') {
        queryParts.push('AND i.is_deleted = 0');
    }
};

exports.createInvoice = async (req, res) => {
    const { 
        amount, notes, received_at, 
        sender_name, recipient_name, transaction_id, pix_key,
        source_group_jid // <--- NEW PARAMETER
    } = req.body;
    
    if (!received_at) {
        return res.status(400).json({ message: "A timestamp (received_at) is required for all new entries." });
    }
    
    const receivedAt = parseInvoiceTimestampInput(received_at);
    const amountValue = toStoredInvoiceAmount(amount);
    const amountDecimal = toInvoiceAmountDecimal(amount);

    try {
        const [result] = await pool.query(
            `INSERT INTO invoices 
            (amount, amount_decimal, notes, received_at, is_manual, sender_name, recipient_name, transaction_id, pix_key, source_group_jid) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                amountValue, 
                amountDecimal,
                notes, 
                receivedAt, 
                true, 
                sender_name || '', 
                recipient_name || '', 
                transaction_id || null, 
                pix_key || null,
                source_group_jid || null // <--- INSERT VALUE
            ]
        );
        
        console.log(`[INFO] Successfully created manual invoice ID: ${result.insertId}`);
        
        // === BUG FIX: Safely emit event so it doesn't crash request if socket fails ===
        try {
            if (req.io) req.io.emit('invoices:updated');
        } catch (socketError) {
            console.error('[SOCKET-WARN] Failed to emit update event:', socketError.message);
        }
        invalidateInvoiceReadCaches();

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
        notes, received_at, is_deleted, source_group_jid // <--- NEW PARAMETER
    } = req.body;

    const newTimestamp = received_at ? parseInvoiceTimestampInput(received_at) : null;
    const amountValue = toStoredInvoiceAmount(amount);
    const amountDecimal = toInvoiceAmountDecimal(amount);

    try {
        await pool.query(
            `UPDATE invoices SET 
                transaction_id = ?, sender_name = ?, recipient_name = ?, pix_key = ?, 
                amount = ?, amount_decimal = ?, notes = ?, received_at = ?, is_deleted = ?, source_group_jid = ?
            WHERE id = ?`,
            [
                transaction_id, 
                sender_name, 
                recipient_name, 
                pix_key, 
                amountValue, 
                amountDecimal,
                notes, 
                newTimestamp, 
                !!is_deleted, 
                source_group_jid || null, // <--- UPDATE VALUE
                id
            ]
        );
        
        console.log(`[INFO] Successfully updated invoice ID: ${id}`);

        // === BUG FIX: Safely emit event ===
        try {
            if (req.io) req.io.emit('invoices:updated');
        } catch (socketError) {
            console.error('[SOCKET-WARN] Failed to emit update event:', socketError.message);
        }
        invalidateInvoiceReadCaches();

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
        
        // === BUG FIX: Safely emit event ===
        try {
            if (req.io) req.io.emit('invoices:updated');
        } catch (socketError) {
            console.error('[SOCKET-WARN] Failed to emit update event:', socketError.message);
        }
        invalidateInvoiceReadCaches();

        res.status(204).send();
    } catch (error) {
        console.error(`[ERROR] Failed to delete invoice ID ${id}:`, error);
        res.status(500).json({ message: 'Failed to delete invoice.' });
    }
};

// ... (getInvoiceMedia remains unchanged) ...
exports.getAllInvoices = async (req, res) => {
    const {
        sortOrder = 'desc',
        search, dateFrom, dateTo, timeFrom, timeTo,
        sourceGroups, recipientNames, reviewStatus, status, amountExact,
    } = req.query;
    const pagination = parsePagination(req.query, { defaultLimit: 50 });

    const queryParts = [
        'FROM invoices i',
        'LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid',
        'WHERE 1=1'
    ];
    const params = [];
    applyInvoiceFilters({
        queryParts,
        params,
        filters: { search, dateFrom, dateTo, timeFrom, timeTo, sourceGroups, recipientNames, reviewStatus, status, amountExact }
    });

    const orderByClause = `i.received_at ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
    const query = queryParts.join(' ');

    try {
        const countQuery = `SELECT count(*) as total ${query}`;
        const [[{ total }]] = await pool.query(countQuery, params);

        const dataQuery = `
            SELECT 
                i.id,
                i.message_id,
                i.received_at,
                i.transaction_id,
                i.sender_name,
                i.recipient_name,
                i.pix_key,
                i.amount,
                i.notes,
                i.source_group_jid,
                i.media_path,
                i.is_deleted,
                i.is_manual,
                i.linked_transaction_id,
                i.linked_transaction_source,
                wg.group_name as source_group_name
            ${query}
            ORDER BY ${orderByClause}, i.id ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
        `;
        const finalParams = [...params];
        let finalDataQuery = dataQuery;
        if (!pagination.isAll) {
            finalDataQuery += ' LIMIT ? OFFSET ?';
            finalParams.push(pagination.limitValue, pagination.offset);
        }

        const [invoices] = await pool.query(finalDataQuery, finalParams);
        
        res.json({
            invoices,
            ...buildPaginationMeta(total, pagination)
        });
    } catch (error) {
        console.error('[ERROR] Failed to fetch invoices:', error);
        res.status(500).json({ message: 'Failed to fetch invoices.' });
    }
};


// getBusinessDay function remains the same...
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


// === THIS IS THE ONLY FUNCTION WITH CHANGES ===
exports.exportInvoices = async (req, res) => {
    const {
        search, dateFrom, dateTo, timeFrom, timeTo,
        sourceGroups, recipientNames, reviewStatus, status, amountExact,
    } = req.query;

    const queryParts = [
        'SELECT',
        "CONVERT_TZ(i.received_at, '+00:00', '-03:00') AS received_at,",
        'i.transaction_id,',
        'i.sender_name,',
        'i.recipient_name,',
        'wg.group_name as source_group_name,',
        'i.amount',
        'FROM invoices i',
        'LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid',
        'WHERE 1=1'
    ];
    
    const params = [];
    applyInvoiceFilters({
        queryParts,
        params,
        filters: { search, dateFrom, dateTo, timeFrom, timeTo, sourceGroups, recipientNames, reviewStatus, status: '', amountExact }
    });

    if (status === 'only_deleted') {
        queryParts.push('AND i.is_deleted = 1');
    } else if (status === 'only_duplicates') {
        queryParts.push('AND i.is_deleted = 0');
        queryParts.push("AND i.transaction_id IS NOT NULL AND i.transaction_id != ''");
        queryParts.push(`AND i.id NOT IN (
            SELECT min_id FROM (
                SELECT MIN(id) as min_id
                FROM invoices
                WHERE transaction_id IS NOT NULL AND transaction_id != '' AND is_deleted = 0
                GROUP BY transaction_id, amount
            ) as t
        )`);
    } else {
        queryParts.push(`AND i.is_deleted = 0 AND (
            (i.transaction_id IS NULL OR i.transaction_id = '')
            OR i.id IN (
                SELECT min_id FROM (
                    SELECT MIN(id) as min_id
                    FROM invoices
                    WHERE transaction_id IS NOT NULL AND transaction_id != '' AND is_deleted = 0
                    GROUP BY transaction_id, amount
                ) as t
            )
        )`);
    }
    queryParts.push('ORDER BY i.received_at ASC');
    const query = queryParts.join(' ');

    try {
        const [invoicesFromDb] = await pool.query(query, params);
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Invoices', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });

        worksheet.columns = [
            { header: 'TimeDate', key: 'received_at', width: 22, style: { numFmt: 'dd/mm/yyyy hh:mm:ss', alignment: { horizontal: 'right' } } },
            { header: 'Transaction ID', key: 'transaction_id', width: 35 },
            { header: 'Sender', key: 'sender_name', width: 30 },
            { header: 'Recipient', key: 'recipient_name', width: 30 },
            { header: 'Source Grp Name', key: 'source_group_name', width: 25 },
            { header: 'Amount', key: 'amount', width: 18, style: { numFmt: '#,##0.00', alignment: { horizontal: 'right' } } },
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
                const splitterRow = worksheet.addRow({ transaction_id: `--- Business Day of ${currentBusinessDay.toLocaleDateString('en-CA')} ---` });
                splitterRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                splitterRow.font = { name: 'Calibri', bold: true };
                worksheet.mergeCells(`B${splitterRow.number}:F${splitterRow.number}`);
                splitterRow.getCell('B').alignment = { horizontal: 'center' };
            }
            
            worksheet.addRow({
                received_at: saoPauloDateString,
                transaction_id: invoice.transaction_id,
                sender_name: invoice.sender_name,
                recipient_name: invoice.recipient_name,
                source_group_name: invoice.source_group_name,
                amount: parseFormattedCurrency(invoice.amount)
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
        const recipientNames = await getCachedInvoiceRecipientNames(async () => {
            const [recipients] = await pool.query(
                "SELECT DISTINCT recipient_name FROM invoices WHERE recipient_name IS NOT NULL AND recipient_name != '' ORDER BY recipient_name ASC"
            );
            return recipients.map((row) => row.recipient_name);
        });
        res.setHeader('Cache-Control', 'private, max-age=60');
        res.json(recipientNames);
    } catch (error) {
        console.error('[ERROR] Failed to fetch recipient names:', error);
        res.status(500).json({ message: 'Failed to fetch recipient names.' });
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
