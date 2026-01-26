const pool = require('../config/db');

exports.getAllSchedules = async (req, res) => {
    try {
        const query = `
            SELECT 
                sb.*, 
                gb.name as batch_name,
                bu.original_filename,
                bu.id as upload_id,
                bu.stored_filename,
                bu.mimetype,
                bu.filepath
            FROM scheduled_broadcasts sb
            JOIN group_batches gb ON sb.batch_id = gb.id
            LEFT JOIN broadcast_uploads bu ON sb.upload_id = bu.id
            ORDER BY sb.created_at DESC
        `;
        const [schedules] = await pool.query(query);
        
        // Format for consistency with templates
        const formattedSchedules = schedules.map(s => ({
            ...s,
            attachment: s.upload_id ? {
                id: s.upload_id,
                original_filename: s.original_filename,
                stored_filename: s.stored_filename,
                mimetype: s.mimetype,
                filepath: s.filepath,
                url: `/uploads/broadcasts/${s.stored_filename}`
            } : null
        }));

        res.json(formattedSchedules);
    } catch (error) {
        console.error('Error fetching schedules:', error);
        res.status(500).json({ message: 'Failed to fetch schedules' });
    }
};

exports.createSchedule = async (req, res) => {
    const userId = req.user.id;
    const {
        batch_id, message, upload_id, schedule_type, scheduled_at_time,
        scheduled_at_date, scheduled_days_of_week, timezone
    } = req.body;

    if (!batch_id || (!message && !upload_id) || !schedule_type || !scheduled_at_time) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
    try {
        await pool.query(
            `INSERT INTO scheduled_broadcasts (user_id, batch_id, message, upload_id, schedule_type, scheduled_at_time, scheduled_at_date, scheduled_days_of_week, timezone)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId, batch_id, message || '', upload_id || null, schedule_type, scheduled_at_time,
                scheduled_at_date || null,
                schedule_type === 'WEEKLY' ? JSON.stringify(scheduled_days_of_week) : null,
                timezone || 'America/Sao_Paulo'
            ]
        );
        res.status(201).json({ message: 'Schedule created successfully.' });
    } catch (error) {
        console.error('Error creating schedule:', error);
        res.status(500).json({ message: 'Failed to create schedule.' });
    }
};

exports.updateSchedule = async (req, res) => {
    const { id } = req.params;
    const {
        batch_id, message, upload_id, schedule_type, scheduled_at_time,
        scheduled_at_date, scheduled_days_of_week, timezone
    } = req.body;
    
    try {
        const [result] = await pool.query(
            `UPDATE scheduled_broadcasts SET 
                batch_id = ?, message = ?, upload_id = ?, schedule_type = ?, scheduled_at_time = ?,
                scheduled_at_date = ?, scheduled_days_of_week = ?, timezone = ?
             WHERE id = ?`,
            [
                batch_id, message || '', upload_id || null, schedule_type, scheduled_at_time,
                scheduled_at_date || null,
                schedule_type === 'WEEKLY' ? JSON.stringify(scheduled_days_of_week) : null,
                timezone || 'America/Sao_Paulo',
                id
            ]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Schedule not found.' });
        }
        res.json({ message: 'Schedule updated successfully.' });
    } catch (error) {
        console.error('Error updating schedule:', error);
        res.status(500).json({ message: 'Failed to update schedule.' });
    }
};

exports.toggleSchedule = async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;
    
    if (typeof is_active !== 'boolean') {
        return res.status(400).json({ message: 'is_active must be a boolean.' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE scheduled_broadcasts SET is_active = ? WHERE id = ?',
            [is_active, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Schedule not found.' });
        }
        res.json({ message: 'Schedule status updated.' });
    } catch (error) {
        console.error('Error toggling schedule:', error);
        res.status(500).json({ message: 'Failed to toggle schedule.' });
    }
};

exports.deleteSchedule = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM scheduled_broadcasts WHERE id = ?',
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Schedule not found.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).json({ message: 'Failed to delete schedule.' });
    }
};
