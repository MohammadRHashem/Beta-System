const pool = require('../config/db');
// === THE DEFINITIVE FIX: Correctly destructure all needed functions from the library ===
const { zonedTimeToUtc, utcToZonedTime, format } = require('date-fns-tz');

const SAO_PAULO_TZ = 'America/Sao_Paulo';

exports.calculatePosition = async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ message: 'A date parameter is required.' });
    }

    try {
        // --- Smart Timestamp Calculation ---
        const targetDate = new Date(date);
        const todayInSaoPaulo = utcToZonedTime(new Date(), SAO_PAULO_TZ);

        targetDate.setHours(12, 0, 0, 0);

        const startTimeSp = new Date(targetDate);
        startTimeSp.setDate(startTimeSp.getDate() - 1);
        startTimeSp.setHours(16, 15, 0, 0);

        let endTimeSp;

        if (targetDate.toDateString() === todayInSaoPaulo.toDateString()) {
            endTimeSp = todayInSaoPaulo;
        } else {
            endTimeSp = new Date(targetDate);
            endTimeSp.setHours(16, 14, 59, 999);
        }
        
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