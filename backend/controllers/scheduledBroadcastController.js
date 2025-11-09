const pool = require('../config/db');

exports.getAllSchedules = async (req, res) => {
    const userId = req.user.id;
    try {
        const query = `
            SELECT sb.*, gb.name as batch_name 
            FROM scheduled_broadcasts sb
            JOIN group_batches gb ON sb.batch_id = gb.id
            WHERE sb.user_id = ?
            ORDER BY sb.created_at DESC
        `;
        const [schedules] = await pool.query(query, [userId]);
        res.json(schedules);
    } catch (error) {
        console.error('Error fetching schedules:', error);
        res.status(500).json({ message: 'Failed to fetch schedules' });
    }
};

exports.createSchedule = async (req, res) => {
    const userId = req.user.id;
    const {
        batch_id, message, schedule_type, scheduled_at_time,
        scheduled_at_date, scheduled_days_of_week, timezone
    } = req.body;

    // Basic validation
    if (!batch_id || !message || !schedule_type || !scheduled_at_time) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO scheduled_broadcasts (user_id, batch_id, message, schedule_type, scheduled_at_time, scheduled_at_date, scheduled_days_of_week, timezone)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId, batch_id, message, schedule_type, scheduled_at_time,
                scheduled_at_date || null,
                schedule_type === 'WEEKLY' ? JSON.stringify(scheduled_days_of_week) : null,
                timezone || 'America/Sao_Paulo'
            ]
        );
        res.status(201).json({ id: result.insertId, message: 'Schedule created successfully.' });
    } catch (error) {
        console.error('Error creating schedule:', error);
        res.status(500).json({ message: 'Failed to create schedule.' });
    }
};

exports.updateSchedule = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const {
        batch_id, message, schedule_type, scheduled_at_time,
        scheduled_at_date, scheduled_days_of_week, timezone
    } = req.body;
    
    try {
        const [result] = await pool.query(
            `UPDATE scheduled_broadcasts SET 
                batch_id = ?, message = ?, schedule_type = ?, scheduled_at_time = ?,
                scheduled_at_date = ?, scheduled_days_of_week = ?, timezone = ?
             WHERE id = ? AND user_id = ?`,
            [
                batch_id, message, schedule_type, scheduled_at_time,
                scheduled_at_date || null,
                schedule_type === 'WEEKLY' ? JSON.stringify(scheduled_days_of_week) : null,
                timezone || 'America/Sao_Paulo',
                id, userId
            ]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Schedule not found or permission denied.' });
        }
        res.json({ message: 'Schedule updated successfully.' });
    } catch (error) {
        console.error('Error updating schedule:', error);
        res.status(500).json({ message: 'Failed to update schedule.' });
    }
};

exports.toggleSchedule = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { is_active } = req.body;
    
    if (typeof is_active !== 'boolean') {
        return res.status(400).json({ message: 'is_active must be a boolean.' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE scheduled_broadcasts SET is_active = ? WHERE id = ? AND user_id = ?',
            [is_active, id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Schedule not found or permission denied.' });
        }
        res.json({ message: 'Schedule status updated.' });
    } catch (error) {
        console.error('Error toggling schedule:', error);
        res.status(500).json({ message: 'Failed to toggle schedule.' });
    }
};

exports.deleteSchedule = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM scheduled_broadcasts WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Schedule not found or permission denied.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).json({ message: 'Failed to delete schedule.' });
    }
};