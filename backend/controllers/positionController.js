const pool = require('../config/db');

// We are no longer using the date-fns-tz library here to avoid import issues.

exports.calculatePosition = async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ message: 'A date parameter is required.' });
    }

    try {
        // === THE NEW LOGIC FOR PRECISE DATE CALCULATION ===

        // 1. Create a date object from the user's input, making sure it's interpreted as UTC to start.
        // e.g., '2025-09-06' becomes '2025-09-06T00:00:00.000Z'
        const targetDate = new Date(date + 'T00:00:00Z');

        // 2. Calculate the end time, which is the selected day.
        const endTime = new Date(targetDate);
        
        // 3. Calculate the start time, which is the PREVIOUS day.
        const startTime = new Date(targetDate);
        startTime.setUTCDate(startTime.getUTCDate() - 1);

        // 4. Set the exact time for the period in UTC.
        // 16:15 in São Paulo (GMT-3) is 19:15 in UTC (GMT+0).
        startTime.setUTCHours(19, 15, 0, 0);      // e.g., 2025-09-05T19:15:00.000Z
        endTime.setUTCHours(19, 15, 0, 0);        // e.g., 2025-09-06T19:15:00.000Z

        // 5. The new SQL query that handles all conditions, including fetching the latest duplicate.
        const query = `
            SELECT
                SUM(CAST(REPLACE(i.amount, ',', '') AS DECIMAL(20, 2))) AS netPosition,
                COUNT(i.id) AS transactionCount
            FROM invoices i
            INNER JOIN (
                -- This subquery finds the latest ID for each transaction_id within the date range and other conditions
                SELECT MAX(id) as max_id
                FROM invoices
                WHERE
                    is_deleted = 0
                    AND recipient_name LIKE '%trkbit%'
                    AND received_at >= ?  -- Start Time in UTC
                    AND received_at <= ?  -- End Time in UTC
                GROUP BY transaction_id
            ) latest_invoices ON i.id = latest_invoices.max_id;
        `;
        
        const [[result]] = await pool.query(query, [startTime, endTime]);

        res.json({
            netPosition: result.netPosition || 0,
            transactionCount: result.transactionCount || 0,
            // For display, we can format the calculated UTC dates back to ISO strings
            calculationPeriod: {
                start: startTime.toISOString(),
                end: endTime.toISOString(),
            }
        });

    } catch (error) {
        console.error('[ERROR] Failed to calculate position:', error);
        res.status(500).json({ message: 'Failed to calculate position.' });
    }
};