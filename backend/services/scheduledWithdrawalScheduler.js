const cron = require('node-cron');
const pool = require('../config/db');
const dateFnsTz = require('date-fns-tz');
const { withdrawFullBalance } = require('./xpayzApiService');

let isChecking = false;

const toDateOnly = (dateObj, timezone) => dateFnsTz.format(dateFnsTz.toZonedTime(dateObj, timezone), 'yyyy-MM-dd');
const toMinutesOfDay = (dateObj) => (dateObj.getHours() * 60) + dateObj.getMinutes();

const parseDaysOfWeek = (value) => {
    let source = value;
    if (!Array.isArray(source)) {
        if (!source) return [];
        try {
            source = JSON.parse(source);
        } catch (error) {
            return [];
        }
    }

    if (!Array.isArray(source)) return [];

    return [...new Set(source
        .map((day) => parseInt(day, 10))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )];
};

const shouldRunJobNow = (job, nowUtc) => {
    const jobTimezone = job.timezone || 'America/Sao_Paulo';
    const nowInJobTimezone = dateFnsTz.toZonedTime(nowUtc, jobTimezone);
    const lastRun = job.last_run_at ? dateFnsTz.toZonedTime(new Date(`${job.last_run_at}Z`), jobTimezone) : null;
    const hasRunToday = lastRun && toDateOnly(lastRun, jobTimezone) === toDateOnly(nowInJobTimezone, jobTimezone);

    const [hourStr, minuteStr] = String(job.scheduled_at_time || '').split(':');
    const scheduledHour = parseInt(hourStr, 10);
    const scheduledMinute = parseInt(minuteStr, 10);

    if (!Number.isInteger(scheduledHour) || !Number.isInteger(scheduledMinute)) return false;
    const nowMinutes = toMinutesOfDay(nowInJobTimezone);
    const scheduledMinutes = (scheduledHour * 60) + scheduledMinute;
    const timeReached = nowMinutes >= scheduledMinutes;
    if (!timeReached) return false;

    if (job.schedule_type === 'ONCE') {
        const scheduledDateStr = job.scheduled_at_date ? String(job.scheduled_at_date) : null;
        if (!scheduledDateStr) return false;
        if (job.last_run_at) return false;
        const todayStr = toDateOnly(nowInJobTimezone, jobTimezone);
        if (todayStr < scheduledDateStr) return false;
        return true;
    }

    if (job.schedule_type === 'DAILY') {
        return !hasRunToday;
    }

    if (job.schedule_type === 'WEEKLY') {
        if (hasRunToday) return false;
        const days = parseDaysOfWeek(job.scheduled_days_of_week);
        return days.includes(nowInJobTimezone.getDay());
    }

    return false;
};

const checkSchedules = async () => {
    if (isChecking) {
        console.warn('[WITHDRAW-SCHEDULER] Previous tick is still running; skipping this minute tick.');
        return;
    }
    isChecking = true;
    let connection;
    try {
        connection = await pool.getConnection();
        const [jobs] = await connection.query(
            `SELECT sw.*, s.subaccount_number, s.name as subaccount_name, s.account_type
             FROM scheduled_withdrawals sw
             JOIN subaccounts s ON s.id = sw.subaccount_id
             WHERE sw.is_active = 1`
        );

        const nowUtc = new Date();

        for (const job of jobs) {
            if (job.account_type !== 'xpayz') {
                await connection.query(
                    'UPDATE scheduled_withdrawals SET last_run_at = ?, last_status = ?, last_error = ?, last_response = ? WHERE id = ?',
                    [nowUtc, 'failed', 'Subaccount is no longer xpayz.', JSON.stringify({ subaccount_id: job.subaccount_id }), job.id]
                );
                continue;
            }

            if (!shouldRunJobNow(job, nowUtc)) {
                continue;
            }

            try {
                console.log(`[WITHDRAW-SCHEDULER] Triggering scheduled withdrawal #${job.id} for subaccount ${job.subaccount_number}.`);
                const result = await withdrawFullBalance(job.subaccount_number);
                const updateFields = [
                    nowUtc,
                    result.status || 'success',
                    result.status === 'failed' ? (result.message || 'Withdraw failed.') : null,
                    JSON.stringify(result),
                    job.id
                ];

                let updateQuery = `UPDATE scheduled_withdrawals
                                   SET last_run_at = ?, last_status = ?, last_error = ?, last_response = ?`;
                if (job.schedule_type === 'ONCE') {
                    updateQuery += ', is_active = 0';
                }
                updateQuery += ' WHERE id = ?';

                await connection.query(updateQuery, updateFields);
            } catch (error) {
                const responsePayload = {
                    message: error.message,
                    responseData: error.response?.data || null
                };
                let updateQuery = `UPDATE scheduled_withdrawals
                                   SET last_run_at = ?, last_status = ?, last_error = ?, last_response = ?`;
                if (job.schedule_type === 'ONCE') {
                    updateQuery += ', is_active = 0';
                }
                updateQuery += ' WHERE id = ?';

                await connection.query(
                    updateQuery,
                    [nowUtc, 'failed', error.message || 'Unknown withdrawal error.', JSON.stringify(responsePayload), job.id]
                );
                console.error(`[WITHDRAW-SCHEDULER] Failed schedule #${job.id}:`, error.message);
            }
        }
    } catch (error) {
        console.error('[WITHDRAW-SCHEDULER] Critical scheduler error:', error);
    } finally {
        if (connection) {
            connection.release();
        }
        isChecking = false;
    }
};

const initialize = () => {
    console.log('--- Scheduled Withdrawal Scheduler Initialized ---');
    cron.schedule('* * * * *', checkSchedules);
    console.log('[WITHDRAW-SCHEDULER] Scheduled to check jobs every minute.');
};

module.exports = { initialize };
