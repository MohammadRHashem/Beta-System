const pool = require('../config/db');
const { zonedTimeToUtc, utcToZonedTime, format } = require('date-fns-tz');

const SAO_PAULO_TZ = 'America/Sao_Paulo';

exports.calculatePosition = async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ message: 'A date parameter is required.' });
    }

    try {
        // --- Smart Timestamp Calculation ---
        const targetDate = new Date(date); // e.g., '2025-09-11' becomes Sep 11 at 00:00 local time
        const todayInSaoPaulo = utcToZonedTime(new Date(), SAO_PAULO_TZ);

        // Set hours to noon to avoid DST off-by-one errors
        targetDate.setHours(12, 0, 0, 0);

        // Start time is ALWAYS the previous day at 16:15 São Paulo time
        const startTimeSp = new Date(targetDate);
        startTimeSp.setDate(startTimeSp.getDate() - 1);
        startTimeSp.setHours(16, 15, 0, 0);

        let endTimeSp;

        // Check if the target date is today (ignoring time)
        if (targetDate.toDateString() === todayInSaoPaulo.toDateString()) {
            // If it's today, the end time is NOW
            endTimeSp = todayInSaoPaulo;
        } else {
            // If it's a past date, the end time is the target day at 16:14:59
            endTimeSp = new Date(targetDate);
            endTimeSp.setHours(16, 14, 59, 999);
        }
        
        // Convert our calculated São Paulo times to UTC for the database query
        const startTimeUtc = zonedTimeToUtc(startTimeSp, SAO_PAULO_TZ);
        const endTimeUtc = zonedTimeToUtc(endTimeSp, SAO_PAULO_TZ);
        
        const query = `
            SELECT 
                SUM(CAST(REPLACE(amount, ',', '') AS DECIMAL(10, 2))) AS netPosition,
                COUNT(*) AS transactionCount
            FROM invoices
            WHERE 
                is_deleted = 0 AND
                received_at >= ? AND 
                received_at <= ?
        `;
        
        const [[result]] = await pool.query(query, [startTimeUtc, endTimeUtc]);

        res.json({
            netPosition: result.netPosition || 0,
            transactionCount: result.transactionCount || 0,
            calculationPeriod: {
                start: format(startTimeSp, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: SAO_PAULO_TZ }),
                end: format(endTimeSp, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: SAO_PAULO_TZ }),
            }
        });

    } catch (error) {
        console.error('[ERROR] Failed to calculate position:', error);
        res.status(500).json({ message: 'Failed to calculate position.' });
    }
};