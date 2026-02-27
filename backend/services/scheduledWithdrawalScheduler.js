const cron = require('node-cron');
const pool = require('../config/db');
const dateFnsTz = require('date-fns-tz');
const { withdrawFullBalance } = require('./xpayzApiService');

let isChecking = false;

const toDateOnly = (dateObj, timezone) => dateFnsTz.format(dateFnsTz.toZonedTime(dateObj, timezone), 'yyyy-MM-dd');
const toMinutesOfDay = (dateObj) => (dateObj.getHours() * 60) + dateObj.getMinutes();
const safeParseJson = (value) => {
    if (!value || typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
};

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

const evaluateJobSchedule = (job, nowUtc) => {
    const jobTimezone = job.timezone || 'America/Sao_Paulo';
    let nowInJobTimezone;
    try {
        nowInJobTimezone = dateFnsTz.toZonedTime(nowUtc, jobTimezone);
    } catch (error) {
        return {
            shouldRun: false,
            reason: 'invalid_timezone',
            message: `Invalid timezone "${jobTimezone}".`
        };
    }

    const [hourStr, minuteStr] = String(job.scheduled_at_time || '').split(':');
    const scheduledHour = parseInt(hourStr, 10);
    const scheduledMinute = parseInt(minuteStr, 10);
    if (!Number.isInteger(scheduledHour) || !Number.isInteger(scheduledMinute)) {
        return {
            shouldRun: false,
            reason: 'invalid_time',
            message: `Invalid scheduled_at_time "${job.scheduled_at_time}".`
        };
    }

    const lastResponse = safeParseJson(job.last_response);
    const wasManualRun = String(job.last_status || '').toLowerCase().startsWith('manual_')
        || Boolean(lastResponse?.mode)
        || Boolean(lastResponse?.manual);
    const lastRun = job.last_run_at ? dateFnsTz.toZonedTime(new Date(`${job.last_run_at}Z`), jobTimezone) : null;
    const hasRunToday = !wasManualRun
        && lastRun
        && toDateOnly(lastRun, jobTimezone) === toDateOnly(nowInJobTimezone, jobTimezone);

    const nowMinutes = toMinutesOfDay(nowInJobTimezone);
    const scheduledMinutes = (scheduledHour * 60) + scheduledMinute;
    const timeReached = nowMinutes >= scheduledMinutes;
    if (!timeReached) {
        return {
            shouldRun: false,
            reason: 'time_not_reached'
        };
    }

    if (job.schedule_type === 'ONCE') {
        const scheduledDateStr = job.scheduled_at_date ? String(job.scheduled_at_date) : null;
        if (!scheduledDateStr) {
            return {
                shouldRun: false,
                reason: 'once_missing_date',
                message: 'ONCE schedule has no scheduled_at_date.'
            };
        }
        if (job.last_run_at) {
            return {
                shouldRun: false,
                reason: 'once_already_ran'
            };
        }
        const todayStr = toDateOnly(nowInJobTimezone, jobTimezone);
        if (todayStr < scheduledDateStr) {
            return {
                shouldRun: false,
                reason: 'once_date_not_reached'
            };
        }
        return {
            shouldRun: true,
            reason: 'once_due'
        };
    }

    if (job.schedule_type === 'DAILY') {
        return hasRunToday
            ? { shouldRun: false, reason: 'daily_already_ran_today' }
            : { shouldRun: true, reason: 'daily_due' };
    }

    if (job.schedule_type === 'WEEKLY') {
        if (hasRunToday) {
            return {
                shouldRun: false,
                reason: 'weekly_already_ran_today'
            };
        }
        const days = parseDaysOfWeek(job.scheduled_days_of_week);
        if (!days.includes(nowInJobTimezone.getDay())) {
            return {
                shouldRun: false,
                reason: 'weekly_day_not_matched'
            };
        }
        return {
            shouldRun: true,
            reason: 'weekly_due'
        };
    }

    return {
        shouldRun: false,
        reason: 'invalid_schedule_type',
        message: `Unknown schedule_type "${job.schedule_type}".`
    };
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
        const stats = {
            total: jobs.length,
            due: 0,
            triggered: 0,
            succeeded: 0,
            failed: 0,
            skipped: {}
        };

        for (const job of jobs) {
            try {
                if (job.account_type !== 'xpayz') {
                    stats.failed += 1;
                    await connection.query(
                        'UPDATE scheduled_withdrawals SET last_run_at = ?, last_status = ?, last_error = ?, last_response = ? WHERE id = ?',
                        [nowUtc, 'failed', 'Subaccount is no longer xpayz.', JSON.stringify({ subaccount_id: job.subaccount_id }), job.id]
                    );
                    continue;
                }

                const decision = evaluateJobSchedule(job, nowUtc);
                if (!decision.shouldRun) {
                    stats.skipped[decision.reason] = (stats.skipped[decision.reason] || 0) + 1;
                    if (decision.message) {
                        console.warn(`[WITHDRAW-SCHEDULER] Job #${job.id} skipped (${decision.reason}): ${decision.message}`);
                    }
                    continue;
                }

                stats.due += 1;

                console.log(`[WITHDRAW-SCHEDULER] Triggering scheduled withdrawal #${job.id} for subaccount ${job.subaccount_number}.`);
                const result = await withdrawFullBalance(job.subaccount_number);
                stats.triggered += 1;
                if (result.status === 'failed') stats.failed += 1;
                else stats.succeeded += 1;
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
                stats.failed += 1;
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
        console.log(`[WITHDRAW-SCHEDULER] Tick summary: ${JSON.stringify(stats)}`);
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
