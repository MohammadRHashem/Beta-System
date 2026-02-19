const pool = require('../config/db');

const VALID_SCHEDULE_TYPES = new Set(['ONCE', 'DAILY', 'WEEKLY']);

const isValidTime = (value) => /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(value || '');

const normalizeWeekDays = (days) => {
    if (!Array.isArray(days)) return [];
    const normalized = [...new Set(days.map((day) => parseInt(day, 10)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
    return normalized.sort((a, b) => a - b);
};

const validatePayload = (payload) => {
    const {
        subaccount_id,
        schedule_type,
        scheduled_at_time,
        scheduled_at_date,
        scheduled_days_of_week
    } = payload;

    if (!subaccount_id) {
        return 'Subaccount is required.';
    }
    if (!VALID_SCHEDULE_TYPES.has(schedule_type)) {
        return 'Invalid schedule type.';
    }
    if (!isValidTime(scheduled_at_time)) {
        return 'Valid scheduled time is required.';
    }

    if (schedule_type === 'ONCE' && !scheduled_at_date) {
        return 'Date is required for one-time schedules.';
    }

    if (schedule_type === 'WEEKLY') {
        const normalizedDays = normalizeWeekDays(scheduled_days_of_week);
        if (normalizedDays.length === 0) {
            return 'At least one day of week is required for weekly schedules.';
        }
    }

    return null;
};

const ensureXpayzSubaccount = async (subaccountId) => {
    const [[subaccount]] = await pool.query(
        'SELECT id, name, account_type, subaccount_number FROM subaccounts WHERE id = ?',
        [subaccountId]
    );

    if (!subaccount) {
        return { error: 'Subaccount not found.' };
    }
    if (subaccount.account_type !== 'xpayz') {
        return { error: 'Scheduled withdrawals are only available for XPayz subaccounts.' };
    }
    if (!subaccount.subaccount_number) {
        return { error: 'Selected XPayz subaccount is missing subaccount number.' };
    }
    return { subaccount };
};

exports.getAllSchedules = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT sw.*, s.name as subaccount_name, s.subaccount_number, s.account_type
             FROM scheduled_withdrawals sw
             JOIN subaccounts s ON s.id = sw.subaccount_id
             ORDER BY sw.created_at DESC`
        );
        res.json(rows);
    } catch (error) {
        console.error('[SCHEDULED-WITHDRAWALS] Failed to fetch schedules:', error);
        res.status(500).json({ message: 'Failed to fetch scheduled withdrawals.' });
    }
};

exports.createSchedule = async (req, res) => {
    const userId = req.user.id;
    const {
        subaccount_id,
        schedule_type,
        scheduled_at_time,
        scheduled_at_date,
        scheduled_days_of_week,
        timezone
    } = req.body;

    const validationError = validatePayload(req.body);
    if (validationError) {
        return res.status(400).json({ message: validationError });
    }

    const { error: subaccountError } = await ensureXpayzSubaccount(subaccount_id);
    if (subaccountError) {
        return res.status(400).json({ message: subaccountError });
    }

    try {
        await pool.query(
            `INSERT INTO scheduled_withdrawals
                (user_id, subaccount_id, schedule_type, scheduled_at_time, scheduled_at_date, scheduled_days_of_week, timezone)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                subaccount_id,
                schedule_type,
                scheduled_at_time,
                schedule_type === 'ONCE' ? scheduled_at_date : null,
                schedule_type === 'WEEKLY' ? JSON.stringify(normalizeWeekDays(scheduled_days_of_week)) : null,
                timezone || 'America/Sao_Paulo'
            ]
        );

        res.status(201).json({ message: 'Scheduled withdrawal created successfully.' });
    } catch (error) {
        console.error('[SCHEDULED-WITHDRAWALS] Failed to create schedule:', error);
        res.status(500).json({ message: 'Failed to create scheduled withdrawal.' });
    }
};

exports.updateSchedule = async (req, res) => {
    const { id } = req.params;
    const {
        subaccount_id,
        schedule_type,
        scheduled_at_time,
        scheduled_at_date,
        scheduled_days_of_week,
        timezone
    } = req.body;

    const validationError = validatePayload(req.body);
    if (validationError) {
        return res.status(400).json({ message: validationError });
    }

    const { error: subaccountError } = await ensureXpayzSubaccount(subaccount_id);
    if (subaccountError) {
        return res.status(400).json({ message: subaccountError });
    }

    try {
        const [result] = await pool.query(
            `UPDATE scheduled_withdrawals
             SET subaccount_id = ?, schedule_type = ?, scheduled_at_time = ?, scheduled_at_date = ?, scheduled_days_of_week = ?, timezone = ?
             WHERE id = ?`,
            [
                subaccount_id,
                schedule_type,
                scheduled_at_time,
                schedule_type === 'ONCE' ? scheduled_at_date : null,
                schedule_type === 'WEEKLY' ? JSON.stringify(normalizeWeekDays(scheduled_days_of_week)) : null,
                timezone || 'America/Sao_Paulo',
                id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Schedule not found.' });
        }

        res.json({ message: 'Scheduled withdrawal updated successfully.' });
    } catch (error) {
        console.error('[SCHEDULED-WITHDRAWALS] Failed to update schedule:', error);
        res.status(500).json({ message: 'Failed to update scheduled withdrawal.' });
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
            'UPDATE scheduled_withdrawals SET is_active = ? WHERE id = ?',
            [is_active, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Schedule not found.' });
        }
        res.json({ message: 'Schedule status updated successfully.' });
    } catch (error) {
        console.error('[SCHEDULED-WITHDRAWALS] Failed to toggle schedule:', error);
        res.status(500).json({ message: 'Failed to update scheduled withdrawal status.' });
    }
};

exports.deleteSchedule = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query(
            'DELETE FROM scheduled_withdrawals WHERE id = ?',
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Schedule not found.' });
        }
        res.status(204).send();
    } catch (error) {
        console.error('[SCHEDULED-WITHDRAWALS] Failed to delete schedule:', error);
        res.status(500).json({ message: 'Failed to delete scheduled withdrawal.' });
    }
};
