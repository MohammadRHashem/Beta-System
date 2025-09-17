const pool = require('../config/db');
// === THE PERMANENT FIX: Import the entire library object directly. ===
const dateFnsTz = require('date-fns-tz');

const SAO_PAULO_TZ = 'America/Sao_Paulo';

exports.calculatePosition = async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ message: 'A date parameter is required.' });
    }

    try {
        // === THE FIX: Precise Business Day Calculation ===
        // 1. Parse the user-selected date (e.g., '2025-09-06'). This will be treated as the END of the business day.
        const targetDate = new Date(date);
        targetDate.setHours(12, 0, 0, 0); // Avoid timezone/DST issues by setting time to midday

        // 2. The start time is the PREVIOUS day at 16:15 São Paulo time.
        const startTimeSp = new Date(targetDate);
        startTimeSp.setDate(startTimeSp.getDate() - 1);
        startTimeSp.setHours(16, 15, 0, 0);

        // 3. The end time is the SELECTED day at 16:14:59 São Paulo time.
        const endTimeSp = new Date(targetDate);
        endTimeSp.setHours(16, 14, 59, 999);
        
        // 4. Convert our calculated São Paulo times to UTC for the database query.
        //    We now correctly access the functions as properties of the imported object.
        const startTimeUtc = dateFnsTz.zonedTimeToUtc(startTimeSp, SAO_PAULO_TZ);
        const endTimeUtc = dateFnsTz.zonedTimeToUtc(endTimeSp, SAO_PAULO_TZ);
        
        // === THE FIX: Add recipient filter and update SUM logic ===
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
        
        const [[result]] = await pool.query(query, [startTimeUtc, endTimeUtc]);

        res.json({
            netPosition: result.netPosition || 0,
            transactionCount: result.transactionCount || 0,
            calculationPeriod: {
                start: dateFnsTz.format(startTimeSp, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: SAO_PAULO_TZ }),
                end: dateFnsTz.format(endTimeSp, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: SAO_PAULO_TZ }),
            }
        });

    } catch (error) {
        console.error('[ERROR] Failed to calculate position:', error);
        res.status(500).json({ message: 'Failed to calculate position.' });
    }
};