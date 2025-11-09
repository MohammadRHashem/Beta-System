const cron = require('node-cron');
const pool = require('../config/db');
const { utcToZonedTime, format } = require('date-fns-tz');

let isChecking = false;
let io = null; // This will be set by the initialize function

const checkSchedules = async () => {
    if (isChecking) return;
    isChecking = true;
    
    if (!io) {
        console.error('[SCHEDULER] IO not initialized, skipping check.');
        isChecking = false;
        return;
    }

    try {
        const [jobs] = await pool.query('SELECT * FROM scheduled_broadcasts WHERE is_active = 1');
        const nowUtc = new Date();

        for (const job of jobs) {
            let shouldRun = false;
            const jobTimezone = job.timezone || 'America/Sao_Paulo';
            const nowInJobTimezone = utcToZonedTime(nowUtc, jobTimezone);
            const lastRun = job.last_run_at ? utcToZonedTime(new Date(job.last_run_at + 'Z'), jobTimezone) : null;
            const hasRunToday = lastRun && format(lastRun, 'yyyy-MM-dd') === format(nowInJobTimezone, 'yyyy-MM-dd');
            const scheduledTimeParts = job.scheduled_at_time.split(':');
            const scheduledHour = parseInt(scheduledTimeParts[0], 10);
            const scheduledMinute = parseInt(scheduledTimeParts[1], 10);

            if (nowInJobTimezone.getHours() === scheduledHour && nowInJobTimezone.getMinutes() === scheduledMinute) {
                if (job.schedule_type === 'ONCE' && !job.last_run_at) {
                    const scheduledDateStr = job.scheduled_at_date;
                    if (format(nowInJobTimezone, 'yyyy-MM-dd') === scheduledDateStr) {
                        shouldRun = true;
                    }
                } else if (job.schedule_type === 'DAILY' && !hasRunToday) {
                    shouldRun = true;
                } else if (job.schedule_type === 'WEEKLY' && !hasRunToday) {
                    const scheduledDays = JSON.parse(job.scheduled_days_of_week);
                    if (scheduledDays.includes(nowInJobTimezone.getDay())) {
                        shouldRun = true;
                    }
                }
            }

            if (shouldRun) {
                console.log(`[SCHEDULER] Emitting event to run job ID: ${job.id}`);
                // EMIT THE EVENT FOR THE SERVER TO HANDLE
                io.emit('run-scheduled-broadcast', { jobId: job.id, nowUtc: nowUtc.toISOString() });
            }
        }
    } catch (error) {
        console.error('[SCHEDULER] A critical error occurred during the check:', error);
    } finally {
        isChecking = false;
    }
};

const initialize = (socketIoInstance) => {
    io = socketIoInstance;
    console.log('--- Broadcast Scheduler Service Initialized ---');
    cron.schedule('* * * * *', checkSchedules);
    console.log('[SCHEDULER] Scheduled to check for jobs every minute.');
};

module.exports = { initialize };