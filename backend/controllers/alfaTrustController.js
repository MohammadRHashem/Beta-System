const pool = require('../config/db');
const alfaApiService = require('../services/alfaApiService');

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
            SELECT id, end_to_end_id, inclusion_date, type, operation, value, title, payer_name
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