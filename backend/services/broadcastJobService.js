const { Queue, Worker } = require("bullmq");
const pool = require("../config/db");
const whatsappService = require("./whatsappService");

const redisConnection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  maxRetriesPerRequest: null,
};

const BROADCAST_QUEUE_NAME = "broadcast-jobs-queue";
const SEND_DELAY_MS = parseInt(process.env.BROADCAST_SEND_DELAY_MS || "1000", 10);
const FAILURE_DELAY_MS = parseInt(
  process.env.BROADCAST_FAILURE_DELAY_MS || "5000",
  10,
);
const WORKER_CONCURRENCY = parseInt(
  process.env.BROADCAST_WORKER_CONCURRENCY || "2",
  10,
);

const broadcastQueue = new Queue(BROADCAST_QUEUE_NAME, {
  connection: redisConnection,
});

let broadcastWorker = null;
let io = null;

const queueJobId = (broadcastJobId) => `broadcast:${broadcastJobId}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeError = (error) => {
  const message = error?.message || String(error || "Unknown error");
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
};

const toJsonStringOrNull = (value) => {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return null;
  }
};

const parseJsonOrNull = (value) => {
  if (!value) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch (error) {
    return null;
  }
};

const emitToSocket = (socketId, eventName, payload) => {
  if (!io || !socketId) return;
  io.to(socketId).emit(eventName, payload);
};

const fetchJobRow = async (broadcastJobId) => {
  const [[row]] = await pool.query("SELECT * FROM broadcast_jobs WHERE id = ?", [
    broadcastJobId,
  ]);
  return row || null;
};

const recomputeJobCounters = async (broadcastJobId) => {
  const [[stats]] = await pool.query(
    `
      SELECT
        COUNT(*) AS total,
        SUM(status = 'sent') AS sent_count,
        SUM(status = 'failed') AS failed_count,
        SUM(status = 'cancelled') AS cancelled_count
      FROM broadcast_job_targets
      WHERE broadcast_job_id = ?
    `,
    [broadcastJobId],
  );

  const targetTotal = parseInt(stats?.total || 0, 10);
  const targetSuccess = parseInt(stats?.sent_count || 0, 10);
  const targetFailed = parseInt(stats?.failed_count || 0, 10);
  const targetCancelled = parseInt(stats?.cancelled_count || 0, 10);

  await pool.query(
    `
      UPDATE broadcast_jobs
      SET
        target_total = ?,
        target_success = ?,
        target_failed = ?,
        target_cancelled = ?,
        updated_at = NOW()
      WHERE id = ?
    `,
    [targetTotal, targetSuccess, targetFailed, targetCancelled, broadcastJobId],
  );

  return { targetTotal, targetSuccess, targetFailed, targetCancelled };
};

const emitJobUpdate = async (broadcastJobId) => {
  const row = await fetchJobRow(broadcastJobId);
  if (!row) return;

  emitToSocket(row.socket_id, "broadcast:job:update", {
    job: row,
  });
};

const insertJobAction = async (
  broadcastJobId,
  action,
  userId = null,
  details = null,
) => {
  await pool.query(
    `
      INSERT INTO broadcast_job_actions (broadcast_job_id, user_id, action, details)
      VALUES (?, ?, ?, ?)
    `,
    [broadcastJobId, userId || null, action, toJsonStringOrNull(details)],
  );
};

const enqueueProcessingJob = async (broadcastJobId) => {
  const id = queueJobId(broadcastJobId);
  const existing = await broadcastQueue.getJob(id);
  if (existing) {
    const state = await existing.getState();
    if (state === "active" || state === "waiting" || state === "delayed") {
      return existing;
    }
    try {
      await existing.remove();
    } catch (error) {
      // Ignore if already gone.
    }
  }

  return broadcastQueue.add(
    "process-broadcast-job",
    { broadcastJobId },
    {
      jobId: id,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
};

const loadAttachmentForJob = async (jobRow) => {
  if (jobRow.upload_id) {
    const [[upload]] = await pool.query(
      "SELECT id, filepath, mimetype, original_filename, stored_filename FROM broadcast_uploads WHERE id = ?",
      [jobRow.upload_id],
    );
    if (upload) return upload;
  }
  return parseJsonOrNull(jobRow.attachment_snapshot);
};

const emitLegacyProgress = (socketId, payload) => {
  emitToSocket(socketId, "broadcast:progress", payload);
};

const emitLegacyComplete = (socketId, payload) => {
  emitToSocket(socketId, "broadcast:complete", payload);
};

const emitControlProgress = (socketId, payload) => {
  emitToSocket(socketId, "broadcast:job:control_progress", payload);
};

const emitControlComplete = (socketId, payload) => {
  emitToSocket(socketId, "broadcast:job:control_complete", payload);
};

const markPendingTargetsCancelled = async (broadcastJobId) => {
  await pool.query(
    `
      UPDATE broadcast_job_targets
      SET status = 'cancelled', updated_at = NOW()
      WHERE broadcast_job_id = ? AND status = 'pending'
    `,
    [broadcastJobId],
  );
  await recomputeJobCounters(broadcastJobId);
};

const finalizeCancelledJob = async (broadcastJobId) => {
  await pool.query(
    `
      UPDATE broadcast_jobs
      SET status = 'cancelled', paused = 0, completed_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `,
    [broadcastJobId],
  );
  await emitJobUpdate(broadcastJobId);
};

const emitCancelledCompletion = (socketId, broadcastJobId, counters) => {
  const payload = {
    jobId: broadcastJobId,
    status: "cancelled",
    total: counters.targetTotal,
    successful: counters.targetSuccess,
    failed: counters.targetFailed,
    cancelled: counters.targetCancelled,
  };
  emitToSocket(socketId, "broadcast:job:complete", payload);
  emitLegacyComplete(socketId, payload);
};

const processBroadcastJob = async (queueJob) => {
  const broadcastJobId = parseInt(queueJob.data?.broadcastJobId, 10);
  if (!Number.isFinite(broadcastJobId)) {
    return;
  }

  let jobRow = await fetchJobRow(broadcastJobId);
  if (!jobRow) return;

  if (jobRow.status === "completed" || jobRow.status === "cancelled") {
    return;
  }

  if (jobRow.paused) {
    await pool.query(
      "UPDATE broadcast_jobs SET status = 'paused', updated_at = NOW() WHERE id = ?",
      [broadcastJobId],
    );
    await emitJobUpdate(broadcastJobId);
    return;
  }

  if (jobRow.cancel_requested) {
    await markPendingTargetsCancelled(broadcastJobId);
    await finalizeCancelledJob(broadcastJobId);
    const counters = await recomputeJobCounters(broadcastJobId);
    emitCancelledCompletion(jobRow.socket_id, broadcastJobId, counters);
    return;
  }

  await pool.query(
    `
      UPDATE broadcast_jobs
      SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
      WHERE id = ?
    `,
    [broadcastJobId],
  );
  await insertJobAction(broadcastJobId, "start");
  await emitJobUpdate(broadcastJobId);

  jobRow = await fetchJobRow(broadcastJobId);
  const attachment = await loadAttachmentForJob(jobRow);

  const [targets] = await pool.query(
    `
      SELECT id, group_jid, group_name, attempts
      FROM broadcast_job_targets
      WHERE broadcast_job_id = ? AND status = 'pending'
      ORDER BY id ASC
    `,
    [broadcastJobId],
  );

  for (const target of targets) {
    const [[freshJob]] = await pool.query(
      "SELECT * FROM broadcast_jobs WHERE id = ?",
      [broadcastJobId],
    );
    if (!freshJob) return;

    if (freshJob.cancel_requested) {
      await markPendingTargetsCancelled(broadcastJobId);
      await finalizeCancelledJob(broadcastJobId);
      const counters = await recomputeJobCounters(broadcastJobId);
      emitCancelledCompletion(freshJob.socket_id, broadcastJobId, counters);
      return;
    }

    if (freshJob.paused) {
      await pool.query(
        "UPDATE broadcast_jobs SET status = 'paused', updated_at = NOW() WHERE id = ?",
        [broadcastJobId],
      );
      await emitJobUpdate(broadcastJobId);
      return;
    }

    await pool.query(
      `
        UPDATE broadcast_job_targets
        SET status = 'sending', attempts = attempts + 1, last_attempt_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `,
      [target.id],
    );

    emitToSocket(freshJob.socket_id, "broadcast:job:progress", {
      jobId: broadcastJobId,
      groupJid: target.group_jid,
      groupName: target.group_name,
      status: "sending",
      message: `Sending to "${target.group_name || target.group_jid}"...`,
    });
    emitLegacyProgress(freshJob.socket_id, {
      jobId: broadcastJobId,
      groupName: target.group_name || target.group_jid,
      status: "sending",
      message: `Sending to "${target.group_name || target.group_jid}"...`,
    });

    try {
      const sendResult = await whatsappService.sendBroadcastToGroup({
        groupId: target.group_jid,
        message: freshJob.message_text || "",
        attachment,
      });

      await pool.query(
        `
          UPDATE broadcast_job_targets
          SET status = 'sent', whatsapp_message_id = ?, last_error = NULL, sent_at = NOW(), updated_at = NOW()
          WHERE id = ?
        `,
        [sendResult?.messageId || null, target.id],
      );
      const counters = await recomputeJobCounters(broadcastJobId);
      await emitJobUpdate(broadcastJobId);

      const successMessage = `Successfully sent to "${target.group_name || target.group_jid}".`;
      emitToSocket(freshJob.socket_id, "broadcast:job:progress", {
        jobId: broadcastJobId,
        groupJid: target.group_jid,
        groupName: target.group_name,
        status: "success",
        message: successMessage,
        whatsappMessageId: sendResult?.messageId || null,
      });
      emitLegacyProgress(freshJob.socket_id, {
        jobId: broadcastJobId,
        groupName: target.group_name || target.group_jid,
        status: "success",
        message: successMessage,
      });

      emitToSocket(freshJob.socket_id, "broadcast:job:update", {
        job: {
          ...freshJob,
          target_total: counters.targetTotal,
          target_success: counters.targetSuccess,
          target_failed: counters.targetFailed,
          target_cancelled: counters.targetCancelled,
        },
      });

      await sleep(SEND_DELAY_MS);
    } catch (error) {
      const normalized = normalizeError(error);
      await pool.query(
        `
          UPDATE broadcast_job_targets
          SET status = 'failed', last_error = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [normalized, target.id],
      );
      await recomputeJobCounters(broadcastJobId);
      await emitJobUpdate(broadcastJobId);

      const failedMessage = `Failed to send to "${target.group_name || target.group_jid}". Reason: ${normalized}`;
      emitToSocket(freshJob.socket_id, "broadcast:job:progress", {
        jobId: broadcastJobId,
        groupJid: target.group_jid,
        groupName: target.group_name,
        status: "failed",
        message: failedMessage,
      });
      emitLegacyProgress(freshJob.socket_id, {
        jobId: broadcastJobId,
        groupName: target.group_name || target.group_jid,
        status: "failed",
        message: failedMessage,
      });

      await sleep(FAILURE_DELAY_MS);
    }
  }

  const counters = await recomputeJobCounters(broadcastJobId);
  const finalStatus = counters.targetSuccess > 0 ? "completed" : "failed";
  await pool.query(
    `
      UPDATE broadcast_jobs
      SET status = ?, completed_at = NOW(), updated_at = NOW(), cancel_requested = 0
      WHERE id = ?
    `,
    [finalStatus, broadcastJobId],
  );

  const finalJob = await fetchJobRow(broadcastJobId);
  const completionPayload = {
    jobId: broadcastJobId,
    status: finalStatus,
    total: counters.targetTotal,
    successful: counters.targetSuccess,
    failed: counters.targetFailed,
    cancelled: counters.targetCancelled,
  };

  emitToSocket(finalJob?.socket_id, "broadcast:job:complete", completionPayload);
  emitLegacyComplete(finalJob?.socket_id, completionPayload);
  await emitJobUpdate(broadcastJobId);
};

const createBroadcastJob = async ({
  userId = null,
  source = "manual",
  sourceRefType = null,
  sourceRefId = null,
  parentJobId = null,
  socketId = null,
  groupObjects = [],
  message = "",
  attachment = null,
  uploadId = null,
  batchId = null,
  creationAction = "create",
}) => {
  if ((!message || !String(message).trim()) && !attachment && !uploadId) {
    throw new Error("Message text or attachment is required.");
  }

  if (!Array.isArray(groupObjects) || groupObjects.length === 0) {
    throw new Error("At least one target group is required.");
  }

  const deduplicatedTargets = [];
  const seen = new Set();
  for (const group of groupObjects) {
    const groupId = String(group?.id || "").trim();
    if (!groupId || seen.has(groupId)) continue;
    seen.add(groupId);
    deduplicatedTargets.push({
      id: groupId,
      name: group?.name || groupId,
    });
  }

  if (deduplicatedTargets.length === 0) {
    throw new Error("No valid target groups were provided.");
  }

  const attachmentSnapshot = attachment
    ? {
        id: attachment.id || null,
        filepath: attachment.filepath || null,
        mimetype: attachment.mimetype || null,
        original_filename: attachment.original_filename || null,
        stored_filename: attachment.stored_filename || null,
      }
    : null;

  const connection = await pool.getConnection();
  let broadcastJobId;
  try {
    await connection.beginTransaction();

    const [insertResult] = await connection.query(
      `
        INSERT INTO broadcast_jobs (
          user_id, source, source_ref_type, source_ref_id, parent_job_id,
          batch_id, upload_id, socket_id, message_text, attachment_snapshot,
          status, paused, cancel_requested, target_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, 0, ?)
      `,
      [
        userId || null,
        source,
        sourceRefType,
        sourceRefId,
        parentJobId,
        batchId,
        uploadId || attachmentSnapshot?.id || null,
        socketId || null,
        message || "",
        toJsonStringOrNull(attachmentSnapshot),
        deduplicatedTargets.length,
      ],
    );
    broadcastJobId = insertResult.insertId;

    const targetValues = deduplicatedTargets.map((group) => [
      broadcastJobId,
      group.id,
      group.name,
      "pending",
    ]);
    await connection.query(
      `
        INSERT INTO broadcast_job_targets (broadcast_job_id, group_jid, group_name, status)
        VALUES ?
      `,
      [targetValues],
    );

    await connection.query(
      `
        INSERT INTO broadcast_job_actions (broadcast_job_id, user_id, action, details)
        VALUES (?, ?, ?, ?)
      `,
      [
        broadcastJobId,
        userId || null,
        creationAction,
        toJsonStringOrNull({
          source,
          sourceRefType,
          sourceRefId,
          targetCount: deduplicatedTargets.length,
        }),
      ],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await enqueueProcessingJob(broadcastJobId);
  await emitJobUpdate(broadcastJobId);

  return fetchJobRow(broadcastJobId);
};

const listBroadcastJobs = async ({
  status,
  source,
  limit = 30,
  page = 1,
} = {}) => {
  const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 30, 200));
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];
  if (status) {
    where.push("bj.status = ?");
    params.push(status);
  }
  if (source) {
    where.push("bj.source = ?");
    params.push(source);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query(
    `
      SELECT
        bj.*,
        u.username AS created_by_username,
        parent.id AS parent_job_ref
      FROM broadcast_jobs bj
      LEFT JOIN users u ON u.id = bj.user_id
      LEFT JOIN broadcast_jobs parent ON parent.id = bj.parent_job_id
      ${whereClause}
      ORDER BY bj.created_at DESC
      LIMIT ? OFFSET ?
    `,
    [...params, safeLimit, offset],
  );

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM broadcast_jobs bj ${whereClause}`,
    params,
  );

  return {
    jobs: rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalRecords: parseInt(countRow?.total || 0, 10),
      totalPages: Math.max(
        1,
        Math.ceil((parseInt(countRow?.total || 0, 10) || 0) / safeLimit),
      ),
    },
  };
};

const getBroadcastJobById = async (broadcastJobId) => {
  const [[job]] = await pool.query("SELECT * FROM broadcast_jobs WHERE id = ?", [
    broadcastJobId,
  ]);
  if (!job) return null;

  const [targets] = await pool.query(
    `
      SELECT *
      FROM broadcast_job_targets
      WHERE broadcast_job_id = ?
      ORDER BY id ASC
    `,
    [broadcastJobId],
  );

  const [actions] = await pool.query(
    `
      SELECT a.*, u.username
      FROM broadcast_job_actions a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.broadcast_job_id = ?
      ORDER BY a.id DESC
      LIMIT 100
    `,
    [broadcastJobId],
  );

  const normalizedActions = actions.map((action) => ({
    ...action,
    details: parseJsonOrNull(action.details),
  }));

  return { job, targets, actions: normalizedActions };
};

const fetchSentTargetsForControl = async (broadcastJobId) => {
  const [targets] = await pool.query(
    `
      SELECT id, group_jid, group_name, whatsapp_message_id
      FROM broadcast_job_targets
      WHERE broadcast_job_id = ?
        AND status = 'sent'
        AND whatsapp_message_id IS NOT NULL
        AND whatsapp_message_id <> ''
      ORDER BY id ASC
    `,
    [broadcastJobId],
  );
  return targets;
};

const pauseBroadcastJob = async (broadcastJobId, userId = null) => {
  const jobRow = await fetchJobRow(broadcastJobId);
  if (!jobRow) throw new Error("Broadcast job not found.");
  if (jobRow.status === "completed" || jobRow.status === "cancelled") {
    throw new Error("Cannot pause a completed or cancelled job.");
  }

  await pool.query(
    `
      UPDATE broadcast_jobs
      SET paused = 1, cancel_requested = 0, status = 'paused', updated_at = NOW()
      WHERE id = ?
    `,
    [broadcastJobId],
  );

  const queued = await broadcastQueue.getJob(queueJobId(broadcastJobId));
  if (queued) {
    const state = await queued.getState();
    if (state === "waiting" || state === "delayed") {
      try {
        await queued.remove();
      } catch (error) {
        // Ignore remove race.
      }
    }
  }

  await insertJobAction(broadcastJobId, "pause", userId);
  await emitJobUpdate(broadcastJobId);
  return fetchJobRow(broadcastJobId);
};

const resumeBroadcastJob = async (broadcastJobId, userId = null) => {
  const jobRow = await fetchJobRow(broadcastJobId);
  if (!jobRow) throw new Error("Broadcast job not found.");
  if (jobRow.status === "completed" || jobRow.status === "cancelled") {
    throw new Error("Cannot resume a completed or cancelled job.");
  }

  await pool.query(
    `
      UPDATE broadcast_jobs
      SET paused = 0, cancel_requested = 0, status = 'queued', error_message = NULL, updated_at = NOW()
      WHERE id = ?
    `,
    [broadcastJobId],
  );

  await enqueueProcessingJob(broadcastJobId);
  await insertJobAction(broadcastJobId, "resume", userId);
  await emitJobUpdate(broadcastJobId);
  return fetchJobRow(broadcastJobId);
};

const cancelBroadcastJob = async (broadcastJobId, userId = null) => {
  const jobRow = await fetchJobRow(broadcastJobId);
  if (!jobRow) throw new Error("Broadcast job not found.");
  if (jobRow.status === "completed" || jobRow.status === "cancelled") {
    return jobRow;
  }

  await pool.query(
    `
      UPDATE broadcast_jobs
      SET cancel_requested = 1, paused = 0, updated_at = NOW()
      WHERE id = ?
    `,
    [broadcastJobId],
  );

  const queued = await broadcastQueue.getJob(queueJobId(broadcastJobId));
  if (queued) {
    const state = await queued.getState();
    if (state === "waiting" || state === "delayed" || state === "paused") {
      try {
        await queued.remove();
      } catch (error) {
        // Ignore remove race.
      }
    }
  }

  if (jobRow.status === "queued" || jobRow.status === "paused") {
    await markPendingTargetsCancelled(broadcastJobId);
    await finalizeCancelledJob(broadcastJobId);
    const counters = await recomputeJobCounters(broadcastJobId);
    emitCancelledCompletion(jobRow.socket_id, broadcastJobId, counters);
  }

  await insertJobAction(broadcastJobId, "cancel", userId);
  await emitJobUpdate(broadcastJobId);
  return fetchJobRow(broadcastJobId);
};

const retryFailedTargets = async (broadcastJobId, userId = null) => {
  const jobRow = await fetchJobRow(broadcastJobId);
  if (!jobRow) throw new Error("Broadcast job not found.");
  if (jobRow.status === "running") {
    throw new Error("Cannot retry failed targets while the job is running.");
  }

  const [[failedCountRow]] = await pool.query(
    `
      SELECT COUNT(*) AS failed_count
      FROM broadcast_job_targets
      WHERE broadcast_job_id = ? AND status = 'failed'
    `,
    [broadcastJobId],
  );

  const failedCount = parseInt(failedCountRow?.failed_count || 0, 10);
  if (failedCount === 0) {
    throw new Error("This job has no failed targets to retry.");
  }

  await pool.query(
    `
      UPDATE broadcast_job_targets
      SET status = 'pending', last_error = NULL, updated_at = NOW()
      WHERE broadcast_job_id = ? AND status = 'failed'
    `,
    [broadcastJobId],
  );

  await pool.query(
    `
      UPDATE broadcast_jobs
      SET status = 'queued', paused = 0, cancel_requested = 0, completed_at = NULL, error_message = NULL, updated_at = NOW()
      WHERE id = ?
    `,
    [broadcastJobId],
  );

  await recomputeJobCounters(broadcastJobId);
  await enqueueProcessingJob(broadcastJobId);
  await insertJobAction(broadcastJobId, "retry_failed", userId, { failedCount });
  await emitJobUpdate(broadcastJobId);
  return fetchJobRow(broadcastJobId);
};

const replayBroadcastJob = async (broadcastJobId, userId = null, socketId = null) => {
  const original = await getBroadcastJobById(broadcastJobId);
  if (!original?.job) {
    throw new Error("Original broadcast job not found.");
  }
  if (!original.targets || original.targets.length === 0) {
    throw new Error("Original broadcast has no target groups.");
  }

  const groupObjects = original.targets.map((target) => ({
    id: target.group_jid,
    name: target.group_name || target.group_jid,
  }));

  const attachmentSnapshot = parseJsonOrNull(original.job.attachment_snapshot);
  const replayJob = await createBroadcastJob({
    userId: userId || original.job.user_id || null,
    source: "replay",
    sourceRefType: "broadcast_job",
    sourceRefId: original.job.id,
    parentJobId: original.job.id,
    socketId: socketId || null,
    groupObjects,
    message: original.job.message_text || "",
    attachment: attachmentSnapshot,
    uploadId: original.job.upload_id || null,
    batchId: original.job.batch_id || null,
    creationAction: "replay",
  });

  await insertJobAction(original.job.id, "replay", userId, {
    replayJobId: replayJob.id,
  });

  return replayJob;
};

const deleteBroadcastForEveryone = async (broadcastJobId, userId = null) => {
  const jobRow = await fetchJobRow(broadcastJobId);
  if (!jobRow) throw new Error("Broadcast job not found.");
  if (jobRow.status === "running") {
    throw new Error("Cannot delete messages while the broadcast is still running.");
  }

  const targets = await fetchSentTargetsForControl(broadcastJobId);
  if (!targets.length) {
    throw new Error("No sent targets were found for delete-for-everyone.");
  }

  let deleted = 0;
  let failed = 0;

  for (const target of targets) {
    emitControlProgress(jobRow.socket_id, {
      jobId: broadcastJobId,
      action: "delete_for_everyone",
      groupJid: target.group_jid,
      groupName: target.group_name,
      status: "processing",
      message: `Deleting sent message in "${target.group_name || target.group_jid}"...`,
    });

    try {
      await whatsappService.deleteMessageForEveryone(target.whatsapp_message_id);
      deleted += 1;

      await pool.query(
        `
          UPDATE broadcast_job_targets
          SET delete_status = 'deleted', delete_error = NULL, delete_attempted_at = NOW(), updated_at = NOW()
          WHERE id = ?
        `,
        [target.id],
      );

      emitControlProgress(jobRow.socket_id, {
        jobId: broadcastJobId,
        action: "delete_for_everyone",
        groupJid: target.group_jid,
        groupName: target.group_name,
        status: "success",
        message: `Deleted for everyone in "${target.group_name || target.group_jid}".`,
      });
    } catch (error) {
      failed += 1;
      const reason = normalizeError(error);

      await pool.query(
        `
          UPDATE broadcast_job_targets
          SET delete_status = 'failed', delete_error = ?, delete_attempted_at = NOW(), updated_at = NOW()
          WHERE id = ?
        `,
        [reason, target.id],
      );

      emitControlProgress(jobRow.socket_id, {
        jobId: broadcastJobId,
        action: "delete_for_everyone",
        groupJid: target.group_jid,
        groupName: target.group_name,
        status: "failed",
        message: `Delete failed in "${target.group_name || target.group_jid}". Reason: ${reason}`,
      });
    }
  }

  const summary = {
    attempted: targets.length,
    deleted,
    failed,
  };

  await insertJobAction(
    broadcastJobId,
    "delete_for_everyone",
    userId,
    summary,
  );
  await emitJobUpdate(broadcastJobId);

  emitControlComplete(jobRow.socket_id, {
    jobId: broadcastJobId,
    action: "delete_for_everyone",
    ...summary,
  });

  return summary;
};

const editBroadcastMessage = async (broadcastJobId, newMessage, userId = null) => {
  const messageText = String(newMessage || "").trim();
  if (!messageText) throw new Error("Edited message text is required.");

  const jobRow = await fetchJobRow(broadcastJobId);
  if (!jobRow) throw new Error("Broadcast job not found.");
  if (jobRow.status === "running") {
    throw new Error("Cannot edit messages while the broadcast is still running.");
  }

  const targets = await fetchSentTargetsForControl(broadcastJobId);
  if (!targets.length) {
    throw new Error("No sent targets were found for message edit.");
  }

  let edited = 0;
  let failed = 0;

  for (const target of targets) {
    emitControlProgress(jobRow.socket_id, {
      jobId: broadcastJobId,
      action: "edit_message",
      groupJid: target.group_jid,
      groupName: target.group_name,
      status: "processing",
      message: `Editing sent message in "${target.group_name || target.group_jid}"...`,
    });

    try {
      await whatsappService.editMessageById(target.whatsapp_message_id, messageText);
      edited += 1;

      await pool.query(
        `
          UPDATE broadcast_job_targets
          SET edit_status = 'edited', edit_error = NULL, edit_attempted_at = NOW(), edited_message_text = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [messageText, target.id],
      );

      emitControlProgress(jobRow.socket_id, {
        jobId: broadcastJobId,
        action: "edit_message",
        groupJid: target.group_jid,
        groupName: target.group_name,
        status: "success",
        message: `Edited message in "${target.group_name || target.group_jid}".`,
      });
    } catch (error) {
      failed += 1;
      const reason = normalizeError(error);

      await pool.query(
        `
          UPDATE broadcast_job_targets
          SET edit_status = 'failed', edit_error = ?, edit_attempted_at = NOW(), updated_at = NOW()
          WHERE id = ?
        `,
        [reason, target.id],
      );

      emitControlProgress(jobRow.socket_id, {
        jobId: broadcastJobId,
        action: "edit_message",
        groupJid: target.group_jid,
        groupName: target.group_name,
        status: "failed",
        message: `Edit failed in "${target.group_name || target.group_jid}". Reason: ${reason}`,
      });
    }
  }

  const summary = {
    attempted: targets.length,
    edited,
    failed,
    newMessage: messageText,
  };

  await pool.query(
    "UPDATE broadcast_jobs SET message_text = ?, updated_at = NOW() WHERE id = ?",
    [messageText, broadcastJobId],
  );
  await insertJobAction(broadcastJobId, "edit_message", userId, summary);
  await emitJobUpdate(broadcastJobId);

  emitControlComplete(jobRow.socket_id, {
    jobId: broadcastJobId,
    action: "edit_message",
    ...summary,
  });

  return summary;
};

const initialize = (socketIoInstance) => {
  io = socketIoInstance;
  if (broadcastWorker) return;

  broadcastWorker = new Worker(BROADCAST_QUEUE_NAME, processBroadcastJob, {
    connection: redisConnection,
    concurrency: WORKER_CONCURRENCY,
  });

  broadcastWorker.on("failed", async (job, error) => {
    const broadcastJobId = parseInt(job?.data?.broadcastJobId, 10);
    if (!Number.isFinite(broadcastJobId)) return;

    await pool.query(
      `
        UPDATE broadcast_jobs
        SET status = 'failed', error_message = ?, completed_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `,
      [normalizeError(error), broadcastJobId],
    );
    await emitJobUpdate(broadcastJobId);

    const row = await fetchJobRow(broadcastJobId);
    emitToSocket(row?.socket_id, "broadcast:job:complete", {
      jobId: broadcastJobId,
      status: "failed",
      message: normalizeError(error),
    });
  });

  console.log(
    `[BROADCAST-JOBS] Worker initialized with concurrency ${WORKER_CONCURRENCY}.`,
  );
};

module.exports = {
  initialize,
  createBroadcastJob,
  listBroadcastJobs,
  getBroadcastJobById,
  pauseBroadcastJob,
  resumeBroadcastJob,
  cancelBroadcastJob,
  retryFailedTargets,
  replayBroadcastJob,
  deleteBroadcastForEveryone,
  editBroadcastMessage,
};
