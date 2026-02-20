const pool = require('../config/db');
const { getSubaccountBalance, withdrawAmount } = require('../services/xpayzApiService');

const VALID_SCHEDULE_TYPES = new Set(['ONCE', 'DAILY', 'WEEKLY']);

const isValidTime = (value) => /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(value || '');
const parseAmount = (value) => {
    if (typeof value === 'string') {
        return parseFloat(value.replace(',', '.'));
    }
    return parseFloat(value);
};

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

exports.getLiveBalances = async (req, res) => {
    try {
        let subaccountIds = [];
        if (req.query.subaccount_ids) {
            subaccountIds = String(req.query.subaccount_ids)
                .split(',')
                .map((id) => parseInt(id.trim(), 10))
                .filter((id) => Number.isInteger(id) && id > 0);
        }

        let query = `
            SELECT DISTINCT s.id as subaccount_id, s.subaccount_number
            FROM scheduled_withdrawals sw
            JOIN subaccounts s ON s.id = sw.subaccount_id
            WHERE s.account_type = 'xpayz' AND s.subaccount_number IS NOT NULL
        `;
        const params = [];
        if (subaccountIds.length > 0) {
            query += ` AND s.id IN (${subaccountIds.map(() => '?').join(',')})`;
            params.push(...subaccountIds);
        }

        const [subaccounts] = await pool.query(query, params);

        const items = await Promise.all(subaccounts.map(async (subaccount) => {
            try {
                const balanceResponse = await getSubaccountBalance(subaccount.subaccount_number);
                return {
                    subaccount_id: subaccount.subaccount_id,
                    subaccount_number: subaccount.subaccount_number,
                    status: 'ok',
                    amount: parseAmount(balanceResponse?.amount || 0) || 0,
                    pending_amount: parseAmount(balanceResponse?.pending_amount || 0) || 0,
                    total_amount: parseAmount(balanceResponse?.total_amount || 0) || 0
                };
            } catch (error) {
                return {
                    subaccount_id: subaccount.subaccount_id,
                    subaccount_number: subaccount.subaccount_number,
                    status: 'error',
                    amount: null,
                    pending_amount: null,
                    total_amount: null,
                    message: error.message || 'Failed to fetch balance.'
                };
            }
        }));

        res.json({ items });
    } catch (error) {
        console.error('[SCHEDULED-WITHDRAWALS] Failed to fetch live balances:', error);
        res.status(500).json({ message: 'Failed to fetch live balances.' });
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

exports.withdrawNow = async (req, res) => {
    const { id } = req.params;
    const { mode = 'all', amount } = req.body || {};
    const normalizedMode = String(mode).toLowerCase();

    if (!['all', 'custom'].includes(normalizedMode)) {
        return res.status(400).json({ message: 'Invalid withdraw mode. Use "all" or "custom".' });
    }

    try {
        const [[schedule]] = await pool.query(
            `SELECT sw.id, sw.subaccount_id, s.subaccount_number, s.account_type
             FROM scheduled_withdrawals sw
             JOIN subaccounts s ON s.id = sw.subaccount_id
             WHERE sw.id = ?`,
            [id]
        );

        if (!schedule) {
            return res.status(404).json({ message: 'Schedule not found.' });
        }

        if (schedule.account_type !== 'xpayz') {
            return res.status(400).json({ message: 'Manual withdraw is only available for XPayz subaccounts.' });
        }

        if (!schedule.subaccount_number) {
            return res.status(400).json({ message: 'Selected XPayz subaccount is missing subaccount number.' });
        }

        const nowUtc = new Date();

        try {
            const balanceResponse = await getSubaccountBalance(schedule.subaccount_number);
            const availableBalance = parseAmount(balanceResponse?.amount || 0);

            if (!Number.isFinite(availableBalance)) {
                throw new Error('Could not parse subaccount balance.');
            }

            let amountToWithdraw = 0;
            if (normalizedMode === 'all') {
                amountToWithdraw = availableBalance;
            } else {
                amountToWithdraw = parseAmount(amount);
                if (!Number.isFinite(amountToWithdraw) || amountToWithdraw <= 0) {
                    return res.status(400).json({ message: 'Custom amount must be a valid number greater than zero.' });
                }
                if (amountToWithdraw > availableBalance) {
                    return res.status(400).json({ message: `Custom amount exceeds available balance (${availableBalance}).` });
                }
            }

            let result;
            if (amountToWithdraw <= 0) {
                result = {
                    status: 'skipped',
                    message: 'No available balance to withdraw.',
                    mode: normalizedMode,
                    available_balance: availableBalance,
                    amount: 0,
                    balanceResponse
                };
            } else {
                const withdrawResponse = await withdrawAmount(schedule.subaccount_number, amountToWithdraw);
                result = {
                    status: 'success',
                    message: `Withdrawn ${amountToWithdraw}.`,
                    mode: normalizedMode,
                    available_balance: availableBalance,
                    amount: amountToWithdraw,
                    balanceResponse,
                    withdrawResponse
                };
            }

            await pool.query(
                `UPDATE scheduled_withdrawals
                 SET last_run_at = ?, last_status = ?, last_error = ?, last_response = ?
                 WHERE id = ?`,
                [
                    nowUtc,
                    result.status || 'success',
                    result.status === 'failed' ? (result.message || 'Withdraw failed.') : null,
                    JSON.stringify(result),
                    id
                ]
            );

            if (result.status === 'skipped') {
                return res.status(200).json({ message: result.message, result });
            }

            return res.status(200).json({ message: 'Manual withdraw executed successfully.', result });
        } catch (error) {
            const responsePayload = {
                message: error.message,
                responseData: error.response?.data || null
            };

            await pool.query(
                `UPDATE scheduled_withdrawals
                 SET last_run_at = ?, last_status = ?, last_error = ?, last_response = ?
                 WHERE id = ?`,
                [nowUtc, 'failed', error.message || 'Manual withdraw failed.', JSON.stringify(responsePayload), id]
            );

            return res.status(500).json({ message: error.message || 'Failed to execute manual withdraw.' });
        }
    } catch (error) {
        console.error('[SCHEDULED-WITHDRAWALS] Failed to execute manual withdraw:', error);
        res.status(500).json({ message: 'Failed to execute manual withdraw.' });
    }
};
