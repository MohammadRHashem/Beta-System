const pool = require('../config/db');
const ExcelJS = require('exceljs');
const { logAction } = require('../services/auditService');

exports.getTransactions = async (req, res) => {
    const { page = 1, limit = 50, search, dateFrom, dateTo } = req.query;
    const offset = (page - 1) * limit;

    try {
        let query = `
            FROM trkbit_transactions tt
            LEFT JOIN invoices i ON tt.uid = i.linked_transaction_id AND i.linked_transaction_source = 'Trkbit'
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += " AND (tt.tx_payer_name LIKE ? OR tt.tx_id LIKE ? OR tt.e2e_id LIKE ? OR tt.amount LIKE ?)";
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        if (dateFrom) { query += " AND DATE(tt.tx_date) >= ?"; params.push(dateFrom); }
        if (dateTo) { query += " AND DATE(tt.tx_date) <= ?"; params.push(dateTo); }

        const countQuery = `SELECT count(DISTINCT tt.id) as total ${query}`;
        const [[{ total }]] = await pool.query(countQuery, params);

        // === THIS IS THE FIX: Use MAX() to resolve GROUP BY ambiguity ===
        const dataQuery = `
            SELECT 
                tt.*,
                MAX(i.id) as linked_invoice_id,
                MAX(i.message_id) as linked_invoice_message_id
            ${query}
            GROUP BY tt.id
            ORDER BY tt.tx_date DESC
            LIMIT ? OFFSET ?
        `;
        // =============================================================

        const finalParams = [...params, parseInt(limit), parseInt(offset)];
        const [transactions] = await pool.query(dataQuery, finalParams);

        res.json({
            transactions,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            totalRecords: total
        });

    } catch (error) {
        console.error('[TRKBIT-ERROR]', error);
        res.status(500).json({ message: 'Failed to fetch Trkbit transactions.' });
    }
};

exports.exportExcel = async (req, res) => {
    const { search, dateFrom, dateTo } = req.query;

    try {
        let query = "SELECT tx_date, tx_id, tx_payer_name, amount, tx_type, e2e_id FROM trkbit_transactions WHERE 1=1";
        const params = [];

        if (search) {
            query += " AND (tx_payer_name LIKE ? OR tx_id LIKE ? OR e2e_id LIKE ? OR amount LIKE ?)";
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        if (dateFrom) {
            query += " AND DATE(tx_date) >= ?";
            params.push(dateFrom);
        }
        if (dateTo) {
            query += " AND DATE(tx_date) <= ?";
            params.push(dateTo);
        }
        query += " ORDER BY tx_date ASC";

        const [transactions] = await pool.query(query, params);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Trkbit Transactions');

        worksheet.columns = [
            { header: 'Date', key: 'tx_date', width: 20 },
            { header: 'Tx ID', key: 'tx_id', width: 35 },
            { header: 'Payer Name', key: 'tx_payer_name', width: 30 },
            { header: 'Type', key: 'tx_type', width: 10 },
            { header: 'Amount', key: 'amount', width: 15, style: { numFmt: '#,##0.00' } }
        ];

        transactions.forEach(tx => {
            worksheet.addRow({
                tx_date: tx.tx_date,
                tx_id: tx.tx_id,
                tx_payer_name: tx.tx_payer_name,
                tx_type: tx.tx_type,
                amount: parseFloat(tx.amount)
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="trkbit_export.xlsx"');
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('[TRKBIT-EXPORT-ERROR]', error);
        res.status(500).json({ message: 'Failed to export.' });
    }
};

exports.reassignTransaction = async (req, res) => {
    const { transactionId, targetPixKey, reason } = req.body;

    if (!transactionId || !targetPixKey) {
        return res.status(400).json({ message: 'Transaction ID and target PIX key are required.' });
    }

    try {
        const [[tx]] = await pool.query(
            'SELECT id, tx_pix_key FROM trkbit_transactions WHERE id = ?',
            [transactionId]
        );
        if (!tx) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        const [[validKey]] = await pool.query(
            `SELECT id FROM subaccounts 
             WHERE account_type = 'cross' 
               AND (chave_pix = ? OR geral_pix_key = ?)
             LIMIT 1`,
            [targetPixKey, targetPixKey]
        );
        if (!validKey) {
            return res.status(400).json({ message: 'Target PIX key is not a valid Cross key.' });
        }

        await pool.query(
            'UPDATE trkbit_transactions SET tx_pix_key = ? WHERE id = ?',
            [targetPixKey, transactionId]
        );

        await pool.query(
            `INSERT INTO trkbit_reassign_log 
                (trkbit_transaction_id, old_pix_key, new_pix_key, reason, user_id, username)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                transactionId,
                tx.tx_pix_key || null,
                targetPixKey,
                reason || null,
                req.user?.id || null,
                req.user?.username || null
            ]
        );

        await logAction(req, 'trkbit:reassign', 'TrkbitTransaction', transactionId, {
            oldPixKey: tx.tx_pix_key || null,
            newPixKey: targetPixKey,
            reason: reason || null
        });

        res.json({ message: 'Transaction successfully reassigned.' });
    } catch (error) {
        console.error('[TRKBIT-REASSIGN-ERROR]', error);
        res.status(500).json({ message: 'Failed to reassign transaction.' });
    }
};
