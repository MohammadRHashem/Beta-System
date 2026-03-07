const broadcastJobService = require("../services/broadcastJobService");

const parseJobId = (value) => {
  const id = parseInt(value, 10);
  return Number.isFinite(id) ? id : null;
};

exports.createJob = async (req, res) => {
  const { groupObjects, message, socketId, attachment, upload_id, batch_id } =
    req.body || {};

  if (!Array.isArray(groupObjects) || groupObjects.length === 0) {
    return res.status(400).json({ message: "At least one target group is required." });
  }

  if ((!message || !String(message).trim()) && !attachment && !upload_id) {
    return res
      .status(400)
      .json({ message: "Message text or attachment is required." });
  }

  try {
    const job = await broadcastJobService.createBroadcastJob({
      userId: req.user?.id || null,
      source: "manual",
      sourceRefType: "api",
      sourceRefId: null,
      socketId: socketId || null,
      groupObjects,
      message: message || "",
      attachment: attachment || null,
      uploadId: upload_id || null,
      batchId: batch_id || null,
    });

    return res.status(202).json({
      message: "Broadcast accepted and queued.",
      job,
    });
  } catch (error) {
    console.error("[BROADCAST-JOBS] Failed to create job:", error);
    return res.status(500).json({
      message: error.message || "Failed to create broadcast job.",
    });
  }
};

exports.listJobs = async (req, res) => {
  try {
    const data = await broadcastJobService.listBroadcastJobs({
      status: req.query.status || undefined,
      source: req.query.source || undefined,
      limit: req.query.limit,
      page: req.query.page,
    });
    return res.json(data);
  } catch (error) {
    console.error("[BROADCAST-JOBS] Failed to list jobs:", error);
    return res.status(500).json({ message: "Failed to load broadcast jobs." });
  }
};

exports.getJobById = async (req, res) => {
  const jobId = parseJobId(req.params.id);
  if (!jobId) return res.status(400).json({ message: "Invalid job ID." });

  try {
    const payload = await broadcastJobService.getBroadcastJobById(jobId);
    if (!payload) return res.status(404).json({ message: "Broadcast job not found." });
    return res.json(payload);
  } catch (error) {
    console.error(`[BROADCAST-JOBS] Failed to load job ${jobId}:`, error);
    return res.status(500).json({ message: "Failed to load broadcast job." });
  }
};

exports.pauseJob = async (req, res) => {
  const jobId = parseJobId(req.params.id);
  if (!jobId) return res.status(400).json({ message: "Invalid job ID." });

  try {
    const job = await broadcastJobService.pauseBroadcastJob(jobId, req.user?.id || null);
    return res.json({ message: "Broadcast job paused.", job });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ message: error.message });
  }
};

exports.resumeJob = async (req, res) => {
  const jobId = parseJobId(req.params.id);
  if (!jobId) return res.status(400).json({ message: "Invalid job ID." });

  try {
    const job = await broadcastJobService.resumeBroadcastJob(jobId, req.user?.id || null);
    return res.json({ message: "Broadcast job resumed.", job });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ message: error.message });
  }
};

exports.cancelJob = async (req, res) => {
  const jobId = parseJobId(req.params.id);
  if (!jobId) return res.status(400).json({ message: "Invalid job ID." });

  try {
    const job = await broadcastJobService.cancelBroadcastJob(jobId, req.user?.id || null);
    return res.json({ message: "Broadcast job cancel requested.", job });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ message: error.message });
  }
};

exports.retryFailed = async (req, res) => {
  const jobId = parseJobId(req.params.id);
  if (!jobId) return res.status(400).json({ message: "Invalid job ID." });

  try {
    const job = await broadcastJobService.retryFailedTargets(jobId, req.user?.id || null);
    return res.json({ message: "Failed targets queued for retry.", job });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ message: error.message });
  }
};

exports.replayJob = async (req, res) => {
  const jobId = parseJobId(req.params.id);
  if (!jobId) return res.status(400).json({ message: "Invalid job ID." });

  try {
    const replayJob = await broadcastJobService.replayBroadcastJob(
      jobId,
      req.user?.id || null,
      req.body?.socketId || null,
    );
    return res.status(202).json({
      message: "Replay broadcast queued.",
      job: replayJob,
    });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ message: error.message });
  }
};

exports.deleteForEveryone = async (req, res) => {
  const jobId = parseJobId(req.params.id);
  if (!jobId) return res.status(400).json({ message: "Invalid job ID." });

  try {
    const summary = await broadcastJobService.deleteBroadcastForEveryone(
      jobId,
      req.user?.id || null,
    );
    return res.json({
      message: "Delete-for-everyone processing completed.",
      summary,
    });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ message: error.message });
  }
};

exports.editJobMessage = async (req, res) => {
  const jobId = parseJobId(req.params.id);
  if (!jobId) return res.status(400).json({ message: "Invalid job ID." });

  const newMessage = req.body?.message;
  if (!newMessage || !String(newMessage).trim()) {
    return res.status(400).json({ message: "Edited message text is required." });
  }

  try {
    const summary = await broadcastJobService.editBroadcastMessage(
      jobId,
      newMessage,
      req.user?.id || null,
    );
    return res.json({
      message: "Edit-message processing completed.",
      summary,
    });
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ message: error.message });
  }
};
