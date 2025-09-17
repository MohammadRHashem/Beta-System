const pool = require('../config/db');

// We are no longer using the date-fns-tz library here to avoid import issues.

exports.calculatePosition = async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ message: 'A date parameter is required.' });
    }

    try {
        // === THE DEFINITIVE, LIBRARY-FREE FIX ===

        // 1. Create a date object from the user's input, making sure it's interpreted as UTC to start.
        // e.g., '2025-09-06' becomes '2025-09-06T00:00:00.000Z'
        const targetDate = new Date(date + 'T00:00:00Z');

        // 2. Calculate the start and end dates based on the target date.
        // Start time is the PREVIOUS day.
        const startTime = new Date(targetDate);
        startTime.setUTCDate(startTime.getUTCDate() - 1);
        
        // End time is the SELECTED day.
        const endTime = new Date(targetDate);

        // 3. Set the exact time for the period in UTC.
        // 16:15 in São Paulo (GMT-3) is 19:15 in UTC (GMT+0).
        startTime.setUTCHours(19, 15, 0, 0); // 16:15 SP time
        endTime.setUTCHours(19, 14, 59, 999); // 16:14:59 SP time

        // 4. The SQL query remains the same, using these precise UTC timestamps.
        const query = `
            SELECT 
                SUM(CAST(REPLACE(amount, ',', '') AS DECIMAL(20, 2))) AS netPosition,
                COUNT(*) AS transactionCount
            FROM invoices
            WHERE 
                is_deleted = 0 AND
                recipient_name LIKE '%trkbit%' AND
                received_at >= ? AND 
                received_at <= ?
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