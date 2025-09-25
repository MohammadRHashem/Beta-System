const pool = require('../config/db');

exports.calculatePosition = async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ message: 'A date parameter is required.' });
    }

    try {
        // --- Date and Time Calculation (Unchanged) ---
        const targetDate = new Date(date + 'T00:00:00Z');
        const endTime = new Date(targetDate);
        const startTime = new Date(targetDate);
        startTime.setUTCDate(startTime.getUTCDate() - 1);
        startTime.setUTCHours(19, 15, 0, 0);      
        endTime.setUTCHours(19, 15, 0, 0);        

        // --- Main Position Calculation Query (Unchanged) ---
        const positionQuery = `
            SELECT
                SUM(CAST(REPLACE(i.amount, ',', '') AS DECIMAL(20, 2))) AS netPosition,
                COUNT(i.id) AS transactionCount
            FROM invoices i
            INNER JOIN (
                SELECT MAX(id) as max_id
                FROM invoices
                WHERE
                    is_deleted = 0
                    AND recipient_name LIKE '%trkbit%'
                    AND received_at >= ?
                    AND received_at <= ?
                GROUP BY transaction_id
            ) latest_invoices ON i.id = latest_invoices.max_id;
        `;
        const [[positionResult]] = await pool.query(positionQuery, [startTime, endTime]);

        // === THE EDIT: Add queries to find the first and last invoices ===
        const invoiceDetailsQuery = `
            SELECT id, CONVERT_TZ(received_at, '+00:00', '-03:00') as received_at_sao_paulo, amount, sender_name, transaction_id
            FROM invoices
            WHERE
                is_deleted = 0
                AND recipient_name LIKE '%trkbit%'
                AND received_at >= ?
                AND received_at <= ?
        `;

        // Query for the First Invoice
        const firstInvoiceQuery = `${invoiceDetailsQuery} ORDER BY received_at ASC, id ASC LIMIT 1;`;
        const [[firstInvoice]] = await pool.query(firstInvoiceQuery, [startTime, endTime]);

        // Query for the Last Invoice
        const lastInvoiceQuery = `${invoiceDetailsQuery} ORDER BY received_at DESC, id DESC LIMIT 1;`;
        const [[lastInvoice]] = await pool.query(lastInvoiceQuery, [startTime, endTime]);

        res.json({
            netPosition: positionResult.netPosition || 0,
            transactionCount: positionResult.transactionCount || 0,
            calculationPeriod: {
                start: startTime.toISOString(),
                end: endTime.toISOString(),
            },
            // Add the new fields to the response
            firstInvoice: firstInvoice || null,
            lastInvoice: lastInvoice || null
        });

    } catch (error) {
        console.error('[ERROR] Failed to calculate position:', error);
        res.status(500).json({ message: 'Failed to calculate position.' });
    }
};