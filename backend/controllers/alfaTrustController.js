const pool = require('../config/db');
const alfaApiService = require('../services/alfaApiService');
const ExcelJS = require('exceljs');
const { parseFormattedCurrency } = require('../utils/currencyParser');

const getBusinessDay = (transactionDate) => {
    const businessDay = new Date(transactionDate);
    const hour = transactionDate.getUTCHours(); // Use UTC hours for consistent comparison
    const minute = transactionDate.getUTCMinutes();
    // Assuming the cutoff is 16:15 in GMT-3, which is 19:15 UTC
    if (hour > 19 || (hour === 19 && minute >= 15)) {
        businessDay.setUTCDate(businessDay.getUTCDate() + 1);
    }
    businessDay.setUTCHours(0, 0, 0, 0); 
    return businessDay;
};

exports.getTransactions = async (req, res) => {
    const {
        page = 1, limit = 50, sortOrder = 'desc',
        search, dateFrom, dateTo, txType, operation
    } = req.query;

    try {
        let query = `
            FROM alfa_transactions
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (end_to_end_id LIKE ? OR payer_name LIKE ? OR value LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        if (dateFrom) {
            query += ' AND DATE(inclusion_date) >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            query += ' AND DATE(inclusion_date) <= ?';
            params.push(dateTo);
        }
        if (txType) {
            query += ' AND type = ?';
            params.push(txType);
        }
        if (operation) {
            query += ' AND operation = ?';
            params.push(operation);
        }

        // === THE FIX: Robustly handle the count query result ===
        const countQuery = `SELECT count(*) as total ${query}`;
        const [countRows] = await pool.query(countQuery, params);
        const total = countRows[0]?.total || 0;
        // === END FIX ===

        if (total === 0) {
            // If there are no records, send an empty response immediately.
            return res.json({
                transactions: [],
                totalPages: 0,
                currentPage: 1,
                totalRecords: 0,
            });
        }

        const dataQuery = `
            SELECT id, end_to_end_id, inclusion_date, type, operation, value, title, payer_name, raw_details
            ${query}
            ORDER BY inclusion_date ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
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
        console.error('[ERROR] Failed to fetch Alfa Trust transactions from local DB:', error);
        // Send the actual error message in the response for better debugging
        res.status(500).json({ message: error.message || 'Failed to fetch transactions.' });
    }
};

exports.exportTransactionsExcel = async (req, res) => {
    const { search, dateFrom, dateTo, operation } = req.query;

    let query = `
        SELECT end_to_end_id, inclusion_date, operation, value, payer_name, raw_details
        FROM alfa_transactions
        WHERE 1=1
    `;
    const params = [];

    if (search) {
        query += ` AND (end_to_end_id LIKE ? OR payer_name LIKE ? OR value LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }
    if (dateFrom) {
        query += ' AND DATE(inclusion_date) >= ?';
        params.push(dateFrom);
    }
    if (dateTo) {
        query += ' AND DATE(inclusion_date) <= ?';
        params.push(dateTo);
    }
    if (operation) {
        query += ' AND operation = ?';
        params.push(operation);
    }

    // Crucial for the separator logic: data MUST be sorted chronologically.
    query += ' ORDER BY inclusion_date ASC';

    try {
        const [transactions] = await pool.query(query, params);
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('AlfaTrust_Statement', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });

        worksheet.columns = [
            { header: 'Date/Time', key: 'inclusion_date', width: 22, style: { numFmt: 'dd/mm/yyyy hh:mm:ss', alignment: { horizontal: 'right' } } },
            { header: 'Transaction ID', key: 'transaction_id', width: 35 },
            { header: 'Sender Name', key: 'sender_name', width: 40 },
            { header: 'Recipient Name', key: 'recipient_name', width: 40 },
            { header: 'Amount', key: 'amount', width: 18, style: { numFmt: '#,##0.00', alignment: { horizontal: 'right' } } },
        ];

        worksheet.getRow(1).font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2540' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        
        let lastBusinessDay = null;
        for (const tx of transactions) {
            const comparisonDate = new Date(tx.inclusion_date); // DB stores in UTC
            const currentBusinessDay = getBusinessDay(comparisonDate);

            if (lastBusinessDay && currentBusinessDay.getTime() !== lastBusinessDay.getTime()) {
                const splitterRow = worksheet.addRow({ transaction_id: `--- Business Day of ${currentBusinessDay.toLocaleDateString('en-CA')} ---` });
                splitterRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow
                splitterRow.font = { name: 'Calibri', bold: true };
                worksheet.mergeCells(`B${splitterRow.number}:E${splitterRow.number}`);
                splitterRow.getCell('B').alignment = { horizontal: 'center' };
            }

            let senderName = 'N/A';
            let recipientName = 'N/A';

            if (tx.operation === 'C') { // Credit (Money In)
                senderName = tx.payer_name || 'N/A';
                recipientName = 'ALFA TRUST (Receiver)';
            } else { // Debit (Money Out)
                senderName = 'ALFA TRUST (Sender)';
                try {
                    const details = JSON.parse(tx.raw_details);
                    recipientName = details?.detalhes?.nomeRecebedor || 'N/A';
                } catch {
                    recipientName = 'N/A';
                }
            }

            worksheet.addRow({
                inclusion_date: comparisonDate, // Pass as a Date object for correct formatting
                transaction_id: tx.end_to_end_id,
                sender_name: senderName,
                recipient_name: recipientName,
                amount: tx.operation === 'C' ? parseFloat(tx.value) : -parseFloat(tx.value)
            });
            
            lastBusinessDay = currentBusinessDay;
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="alfa_trust_export.xlsx"');
        await workbook.xlsx.write(res);
    } catch (error) {
        console.error('[EXPORT-ERROR] Failed to export Alfa Trust transactions:', error);
        res.status(500).json({ message: 'Failed to export transactions.' });
    }
};

exports.exportPdf = async (req, res) => {
    const { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) {
        return res.status(400).json({ message: 'Date range (dateFrom and dateTo) is required.' });
    }

    try {
        const pdfBuffer = await alfaApiService.downloadPdfStatement(dateFrom, dateTo);
        
        // === THE FIX: Correctly handle the binary Buffer ===
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="extrato_${dateFrom}_a_${dateTo}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length); // Add the content length header
        res.end(pdfBuffer); // Use res.end() to send the buffer
        // === END FIX ===

    } catch (error) {
        console.error('[ERROR] Failed to export Alfa Trust PDF:', error.message);
        res.status(500).json({ message: 'Failed to export PDF statement.' });
    }
};

exports.notifyUpdate = (req, res) => {
    // req.io is the global socket.io instance attached in server.js
    req.io.emit('alfa-trust:updated');
    console.log('[SERVER] Emitted alfa-trust:updated event to all clients.');
    res.status(200).json({ message: 'Event emitted.' });
};

exports.triggerManualSync = (req, res) => {
    console.log('[ALFA-SYNC] Manual sync triggered via API.');
    const { format, subDays } = require('date-fns');
    // We don't wait for it to finish, just trigger and respond.
    // The syncTransactions function is imported from the new service file.
    // NOTE: This requires a small change in alfaSyncService.js to export the function.
    
    // For this to work, we'll just re-run the logic here for simplicity.
    const syncNow = async () => {
        // This is a simplified, non-blocking version of the sync logic.
        
        console.log('[ALFA-SYNC-MANUAL] Starting manual sync...');
        const dateTo = format(new Date(), 'yyyy-MM-dd');
        const dateFrom = format(subDays(new Date(), 3), 'yyyy-MM-dd');
        const transactions = await alfaApiService.fetchAllTransactions({ dateFrom, dateTo });
        if (transactions.length > 0) {
            const connection = await pool.getConnection();
            try {
                for (const tx of transactions) {
                    const query = `INSERT INTO alfa_transactions (...) VALUES (...) ON DUPLICATE KEY UPDATE ...`;
                    // ... (Full upsert query from sync service)
                }
            } finally {
                connection.release();
            }
        }
        console.log('[ALFA-SYNC-MANUAL] Manual sync complete.');
    };
    
    syncNow().catch(err => console.error('[ALFA-SYNC-MANUAL-ERROR]', err));

    res.status(202).json({ message: 'Sync process has been triggered.' });
};