const pool = require('../config/db');
const alfaApiService = require('../services/alfaApiService');
const ExcelJS = require('exceljs');
const { parseFormattedCurrency } = require('../utils/currencyParser');

// This helper function works directly with the time string to avoid timezone issues.
const getBusinessDayFromLocalString = (localDateString) => {
    // e.g., "2025-10-16 16:30:00"
    const datePart = localDateString.split(' ')[0];
    const timePart = localDateString.split(' ')[1] || '00:00:00';
    
    // Create a Date object from the date part only, ensuring it's at midnight UTC to prevent timezone shifts.
    const businessDay = new Date(`${datePart}T00:00:00Z`); 
    const [hour, minute] = timePart.split(':').map(Number);

    // Apply the cutoff logic directly to the plain hours and minutes from the string
    if (hour > 16 || (hour === 16 && minute >= 15)) {
        // Use UTC date functions to avoid timezone interference
        businessDay.setUTCDate(businessDay.getUTCDate() + 1);
    }
    return businessDay;
};


exports.getTransactions = async (req, res) => {
    const {
        page = 1, limit = 50, sortOrder = 'desc',
        search, dateFrom, dateTo, operation // <-- Changed 'date' to 'dateFrom' and 'dateTo'
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
        
        // <-- Logic updated to handle a range -->
        if (dateFrom) {
            query += ' AND DATE(inclusion_date) >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            query += ' AND DATE(inclusion_date) <= ?';
            params.push(dateTo);
        }
        // <-- End of range logic -->

        if (operation) {
            query += ' AND operation = ?';
            params.push(operation);
        }

        const countQuery = `SELECT count(*) as total ${query}`;
        const [countRows] = await pool.query(countQuery, params);
        const total = countRows[0]?.total || 0;

        if (total === 0) {
            return res.json({
                transactions: [], totalPages: 0, currentPage: 1, totalRecords: 0,
            });
        }

        const dataQuery = `
            SELECT id, end_to_end_id, inclusion_date, type, operation, value, title, description, payer_name, raw_details
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
        res.status(500).json({ message: error.message || 'Failed to fetch transactions.' });
    }
};

exports.exportTransactionsExcel = async (req, res) => {
    const { search, dateFrom, dateTo, operation } = req.query; // <-- Changed 'date' to 'dateFrom' and 'dateTo'

    let query = `
        SELECT end_to_end_id, inclusion_date, operation, value, payer_name, payer_document, description, raw_details
        FROM alfa_transactions
        WHERE 1=1
    `;
    const params = [];

    if (search) {
        query += ` AND (end_to_end_id LIKE ? OR payer_name LIKE ? OR value LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }
    
    // <-- Logic updated to handle a range -->
    if (dateFrom) {
        query += ' AND DATE(inclusion_date) >= ?';
        params.push(dateFrom);
    }
    if (dateTo) {
        query += ' AND DATE(inclusion_date) <= ?';
        params.push(dateTo);
    }
    // <-- End of range logic -->

    if (operation) {
        query += ' AND operation = ?';
        params.push(operation);
    }

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
            { header: 'Payer Document', key: 'payer_document', width: 20 },
            { header: 'Recipient Name', key: 'recipient_name', width: 40 },
            { header: 'Amount', key: 'amount', width: 18, style: { numFmt: '#,##0.00', alignment: { horizontal: 'right' } } },
        ];

        worksheet.getRow(1).font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2540' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        
        let lastBusinessDay = null;
        for (const tx of transactions) {
            const currentBusinessDay = getBusinessDayFromLocalString(tx.inclusion_date);

            if (lastBusinessDay && currentBusinessDay.getTime() !== lastBusinessDay.getTime()) {
                const splitterRow = worksheet.addRow({ transaction_id: `--- Business Day of ${currentBusinessDay.toLocaleDateString('en-CA')} ---` });
                splitterRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                worksheet.mergeCells(`B${splitterRow.number}:F${splitterRow.number}`);
                splitterRow.getCell('B').alignment = { horizontal: 'center' };
            }

            let senderName = 'N/A';
            let recipientName = 'N/A';
            let payerDocument = '';
            let details = null;
            try {
                details = JSON.parse(tx.raw_details);
            } catch {
                details = null;
            }

            if (tx.operation === 'C') { // Credit (Money In)
                senderName = tx.payer_name || tx.description || 'N/A';
                recipientName = 'ALFA TRUST (Receiver)';
                payerDocument = tx.payer_document || '';
            } else { // Debit (Money Out)
                senderName = 'ALFA TRUST (Sender)';
                recipientName = details?.detalhes?.nomeRecebedor || tx.description || 'N/A';
                payerDocument = details?.detalhes?.cpfCnpjPagador || '';
            }
            
            worksheet.addRow({
                inclusion_date: tx.inclusion_date,
                transaction_id: tx.end_to_end_id,
                sender_name: senderName,
                payer_document: payerDocument,
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
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="extrato_${dateFrom}_a_${dateTo}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.end(pdfBuffer);

    } catch (error) {
        console.error('[ERROR] Failed to export Alfa Trust PDF:', error.message);
        res.status(500).json({ message: 'Failed to export PDF statement.' });
    }
};

exports.notifyUpdate = (req, res) => {
    req.io.emit('alfa-trust:updated');
    console.log('[SERVER] Emitted alfa-trust:updated event to all clients.');
    res.status(200).json({ message: 'Event emitted.' });
};

exports.triggerManualSync = (req, res) => {
    console.log('[ALFA-SYNC] Manual sync triggered via API.');
    const { format, subDays } = require('date-fns');
    
    const syncNow = async () => {
        console.log('[ALFA-SYNC-MANUAL] Starting manual sync...');
        const dateTo = format(new Date(), 'yyyy-MM-dd');
        const dateFrom = format(subDays(new Date(), 3), 'yyyy-MM-dd');
        const transactions = await alfaApiService.fetchAllTransactions({ dateFrom, dateTo });
        if (transactions.length > 0) {
            const connection = await pool.getConnection();
            try {
                // Logic handled by sync service, but here for completeness if needed locally
            } finally {
                connection.release();
            }
        }
        console.log('[ALFA-SYNC-MANUAL] Manual sync complete.');
    };
    
    syncNow().catch(err => console.error('[ALFA-SYNC-MANUAL-ERROR]', err));

    res.status(202).json({ message: 'Sync process has been triggered.' });
};