const cron = require('node-cron');
const pool = require('../config/db');
const dateFnsTz = require('date-fns-tz');
const whatsappService = require('./whatsappService'); // <-- IMPORT WHATSAPP SERVICE

let isChecking = false;
let io = null; // This will still be used to pass to the broadcast function for frontend progress updates

const checkSchedules = async () => {
    if (isChecking) return;
    isChecking = true;
    
    if (!io) {
        console.error('[SCHEDULER] IO not initialized, skipping check.');
        isChecking = false;
        return;
    }

    const connection = await pool.getConnection(); // Use a connection for the transaction

    try {
        const [jobs] = await connection.query('SELECT * FROM scheduled_broadcasts WHERE is_active = 1');
        const nowUtc = new Date();

        for (const job of jobs) {
            let shouldRun = false;
            const jobTimezone = job.timezone || 'America/Sao_Paulo';
            const nowInJobTimezone = dateFnsTz.toZonedTime(nowUtc, jobTimezone);
            const lastRun = job.last_run_at ? dateFnsTz.toZonedTime(new Date(job.last_run_at + 'Z'), jobTimezone) : null;
            const hasRunToday = lastRun && dateFnsTz.format(lastRun, 'yyyy-MM-dd') === dateFnsTz.format(nowInJobTimezone, 'yyyy-MM-dd');
            
            const scheduledTimeParts = job.scheduled_at_time.split(':');
            const scheduledHour = parseInt(scheduledTimeParts[0], 10);
            const scheduledMinute = parseInt(scheduledTimeParts[1], 10);

            if (nowInJobTimezone.getHours() === scheduledHour && nowInJobTimezone.getMinutes() === scheduledMinute) {
                if (job.schedule_type === 'ONCE' && !job.last_run_at) {
                    const scheduledDateStr = job.scheduled_at_date;
                    if (dateFnsTz.format(nowInJobTimezone, 'yyyy-MM-dd') === scheduledDateStr) {
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
                // --- THIS IS THE NEW, DIRECT EXECUTION LOGIC ---
                console.log(`[SCHEDULER] Triggering broadcast for job ID: ${job.id}`);
                
                const [groups] = await connection.query('SELECT group_id FROM batch_group_link WHERE batch_id = ?', [job.batch_id]);
                const [allGroups] = await connection.query('SELECT group_jid, group_name FROM whatsapp_groups');
                const groupMap = new Map(allGroups.map(g => [g.group_jid, g.group_name]));
                
                const groupObjects = groups
                    .map(g => ({ id: g.group_id, name: groupMap.get(g.group_id) || 'Unknown Group' }))
                    .filter(g => g.name !== 'Unknown Group');

                if (groupObjects.length > 0) {
                    // Directly call the broadcast function. Pass `null` for socketId as this is a system task.
                    whatsappService.broadcast(io, null, groupObjects, job.message);

                    const updateQuery = 'UPDATE scheduled_broadcasts SET last_run_at = ?' + (job.schedule_type === 'ONCE' ? ', is_active = 0' : '') + ' WHERE id = ?';
                    await connection.query(updateQuery, [nowUtc, job.id]);

                    console.log(`[SCHEDULER] Broadcast for job ID ${job.id} has been successfully initiated.`);
                } else {
                    console.warn(`[SCHEDULER] Job ID ${job.id} skipped: No valid groups found for batch ID ${job.batch_id}.`);
                }
            }
        }
    } catch (error) {
        console.error('[SCHEDULER] A critical error occurred during the check:', error);
    } finally {
        connection.release();
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