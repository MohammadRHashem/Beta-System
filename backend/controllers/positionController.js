const pool = require('../config/db');
const alfaBalanceService = require('../services/alfaBalanceService');

// --- CRUD for Position Counters ---

// GET all counters (permission-gated)
exports.getAllCounters = async (req, res) => {
    try {
        const [counters] = await pool.query(
            'SELECT * FROM position_counters ORDER BY name ASC'
        );
        res.json(counters);
    } catch (error) {
        console.error('[ERROR] Failed to fetch position counters:', error);
        res.status(500).json({ message: 'Failed to fetch counters.' });
    }
};

// POST a new counter
exports.createCounter = async (req, res) => {
    const userId = req.user.id;
    const { name, keyword, type, sub_type } = req.body;
    if (!name || !type) {
        return res.status(400).json({ message: 'Name and Type are required.' });
    }
    if (type === 'local' && !keyword) {
        return res.status(400).json({ message: 'Keyword is required for local counters.' });
    }
    if (type === 'remote' && !sub_type) {
        return res.status(400).json({ message: 'Sub-type is required for remote counters.' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO position_counters (user_id, name, keyword, type, sub_type) VALUES (?, ?, ?, ?, ?)',
            [userId, name, keyword || null, type, sub_type || null]
        );
        res.status(201).json({ id: result.insertId, name, keyword, type, sub_type });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'A counter with this keyword already exists.' });
        }
        console.error('[ERROR] Failed to create position counter:', error);
        res.status(500).json({ message: 'Failed to create counter.' });
    }
};

// PUT (update) an existing counter
exports.updateCounter = async (req, res) => {
    const { id } = req.params;
    const { name, keyword } = req.body;
    if (!name || !keyword) {
        return res.status(400).json({ message: 'Name and Keyword are required.' });
    }
    try {
        const [result] = await pool.query(
            'UPDATE position_counters SET name = ?, keyword = ?, type = ?, sub_type = ? WHERE id = ?',
            [name, keyword || null, type, sub_type || null, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Counter not found.' });
        }
        res.json({ message: 'Counter updated successfully.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'A counter with this keyword already exists.' });
        }
        console.error('[ERROR] Failed to update position counter:', error);
        res.status(500).json({ message: 'Failed to update counter.' });
    }
};

// DELETE a counter
exports.deleteCounter = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM position_counters WHERE id = ?',
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Counter not found.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('[ERROR] Failed to delete position counter:', error);
        res.status(500).json({ message: 'Failed to delete counter.' });
    }
};


// --- UPDATED CALCULATION LOGIC ---

exports.calculateLocalPosition = async (req, res) => {
    const { date, keyword } = req.query;
    if (!date || !keyword) {
        return res.status(400).json({ message: 'A date and keyword are required.' });
    }
    try {
        const targetDate = new Date(date + 'T00:00:00Z');
        const endTime = new Date(targetDate);
        const startTime = new Date(targetDate);
        startTime.setUTCDate(startTime.getUTCDate() - 1);
        startTime.setUTCHours(19, 15, 0, 0); // Corresponds to 16:15 São Paulo time of the previous day
        endTime.setUTCHours(19, 15, 0, 0);   // Corresponds to 16:15 São Paulo time of the selected day

        // === FIX #2: CORRECTED SQL LOGIC ===
        // This new query correctly de-duplicates invoices with a transaction_id
        // while also including all invoices that do NOT have a transaction_id.
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
                    AND recipient_name LIKE ? 
                    AND received_at >= ? 
                    AND received_at < ?
                -- This CASE statement treats every row with a NULL/empty transaction_id as a unique group
                GROUP BY (CASE WHEN transaction_id IS NULL OR transaction_id = '' THEN id ELSE transaction_id END)
            ) latest_invoices ON i.id = latest_invoices.max_id;
        `;
        // ===================================
        
        const [[positionResult]] = await pool.query(positionQuery, [`%${keyword}%`, startTime, endTime]);
        
        // === FIX #1: THE NaN FIX ===
        // Explicitly parse the result to a float. This guarantees the API sends a number,
        // which prevents any ambiguity or parsing errors on the frontend.
        const netPositionAsNumber = parseFloat(positionResult.netPosition || 0);
        // ===========================

        res.json({
            netPosition: netPositionAsNumber, // Send the guaranteed number
            transactionCount: positionResult.transactionCount || 0,
            calculationPeriod: { start: startTime.toISOString(), end: endTime.toISOString() },
        });

    } catch (error) {
        console.error('[ERROR] Failed to calculate local position:', error);
        res.status(500).json({ message: 'Failed to calculate local position.' });
    }
};

exports.calculateRemotePosition = async (req, res) => {
    const { id } = req.params;
    const { date } = req.query; // YYYY-MM-DD

    try {
        const [[counter]] = await pool.query(
            'SELECT type, sub_type FROM position_counters WHERE id = ?',
            [id]
        );

        if (!counter || counter.type !== 'remote') {
            return res.status(404).json({ message: 'Remote counter not found.' });
        }

        let result;

        // --- ALFA LOGIC (Existing) ---
        if (counter.sub_type === 'alfa') {
            result = await alfaBalanceService.getBalance(date); 
        } 
        
        // --- CROSS / TRKBIT LOGIC (New) ---
        else if (counter.sub_type === 'cross') {
            // Default to today if no date provided
            const targetDate = date || new Date().toISOString().split('T')[0];

            const query = `
                SELECT 
                    SUM(CASE WHEN tx_type = 'C' THEN amount ELSE 0 END) as total_in,
                    SUM(CASE WHEN tx_type = 'D' THEN amount ELSE 0 END) as total_out
                FROM trkbit_transactions
                WHERE DATE(tx_date) = ?
            `;
            
            const [[rows]] = await pool.query(query, [targetDate]);
            
            const totalIn = parseFloat(rows.total_in || 0);
            const totalOut = parseFloat(rows.total_out || 0);
            const net = totalIn - totalOut;

            // Structure matches what Frontend expects (result.disponivel)
            result = {
                disponivel: net,
                dataReferencia: targetDate,
                details: { totalIn, totalOut } // Optional extra data
            };
        } 
        
        else {
            return res.status(400).json({ message: 'This remote counter type is not supported.' });
        }
        
        res.json(result);

    } catch (error) {
        console.error('[ERROR] Failed to calculate remote position:', error.message);
        res.status(500).json({ message: 'Failed to fetch remote balance.' });
    }
};
