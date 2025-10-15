const pool = require('../config/db');
const alfaBalanceService = require('../services/alfaBalanceService');

// --- CRUD for Position Counters ---

// GET all counters for the logged-in user
exports.getAllCounters = async (req, res) => {
    const userId = req.user.id;
    try {
        const [counters] = await pool.query(
            'SELECT * FROM position_counters WHERE user_id = ? ORDER BY name ASC',
            [userId]
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
    const userId = req.user.id;
    const { id } = req.params;
    const { name, keyword } = req.body;
    if (!name || !keyword) {
        return res.status(400).json({ message: 'Name and Keyword are required.' });
    }
    try {
        const [result] = await pool.query(
            'UPDATE position_counters SET name = ?, keyword = ?, type = ?, sub_type = ? WHERE id = ? AND user_id = ?',
            [name, keyword || null, type, sub_type || null, id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Counter not found or you do not have permission to edit it.' });
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
    const userId = req.user.id;
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM position_counters WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Counter not found or you do not have permission to delete it.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('[ERROR] Failed to delete position counter:', error);
        res.status(500).json({ message: 'Failed to delete counter.' });
    }
};


// --- UPDATED CALCULATION LOGIC ---

exports.calculateLocalPosition = async (req, res) => {
    // This is the same logic as the old calculatePosition function
    const { date, keyword } = req.query;
    if (!date || !keyword) {
        return res.status(400).json({ message: 'A date and keyword are required.' });
    }
    try {
        // ... ALL the calculation logic from the previous version remains here ...
        const targetDate = new Date(date + 'T00:00:00Z');
        const endTime = new Date(targetDate);
        const startTime = new Date(targetDate);
        startTime.setUTCDate(startTime.getUTCDate() - 1);
        startTime.setUTCHours(19, 15, 0, 0);      
        endTime.setUTCHours(19, 15, 0, 0);        

        const positionQuery = `
            SELECT SUM(CAST(REPLACE(i.amount, ',', '') AS DECIMAL(20, 2))) AS netPosition, COUNT(i.id) AS transactionCount
            FROM invoices i INNER JOIN ( SELECT MAX(id) as max_id FROM invoices
                WHERE is_deleted = 0 AND recipient_name LIKE ? AND received_at >= ? AND received_at <= ?
                GROUP BY transaction_id
            ) latest_invoices ON i.id = latest_invoices.max_id;
        `;
        
        const [[positionResult]] = await pool.query(positionQuery, [`%${keyword}%`, startTime, endTime]);
        res.json({
            netPosition: positionResult.netPosition || 0,
            transactionCount: positionResult.transactionCount || 0,
            calculationPeriod: { start: startTime.toISOString(), end: endTime.toISOString() },
        });
    } catch (error) {
        console.error('[ERROR] Failed to calculate local position:', error);
        res.status(500).json({ message: 'Failed to calculate local position.' });
    }
};

exports.calculateRemotePosition = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { date } = req.query; // Date is optional

    try {
        const [[counter]] = await pool.query(
            'SELECT type, sub_type FROM position_counters WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (!counter || counter.type !== 'remote') {
            return res.status(404).json({ message: 'Remote counter not found.' });
        }

        let result;
        if (counter.sub_type === 'alfa') {
            result = await alfaBalanceService.getBalance(date); // Pass date if it exists
        } else {
            return res.status(400).json({ message: 'This remote counter type is not supported.' });
        }
        
        res.json(result);

    } catch (error) {
        console.error('[ERROR] Failed to calculate remote position:', error.message);
        res.status(500).json({ message: 'Failed to fetch remote balance.' });
    }
};