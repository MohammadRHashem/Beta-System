const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const fs = require("fs/promises");
const fsSync = require("fs");
const pool = require("../config/db");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");
const { Queue, Worker } = require("bullmq");
const cron = require("node-cron");
const { recalculateBalances } = require("../utils/balanceCalculator");

let client;
let qrCodeData;
let connectionStatus = "disconnected";
let abbreviationCache = [];
let io; // To hold the socket.io instance

const redisConnection = {
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
};
const invoiceQueue = new Queue("invoice-processing-queue", {
  connection: redisConnection,
});

const MEDIA_ARCHIVE_DIR = path.join(__dirname, "..", "media_archive");
if (!fsSync.existsSync(MEDIA_ARCHIVE_DIR)) {
  fsSync.mkdirSync(MEDIA_ARCHIVE_DIR, { recursive: true });
}

const invoiceWorker = new Worker(
  "invoice-processing-queue",
  async (job) => {
    const { execa } = await import("execa");

    if (!client || connectionStatus !== "connected") {
      console.warn(`[WORKER] WhatsApp client not connected. Job ${job.id} will be retried.`);
      throw new Error("WhatsApp client is not connected. Job will be retried.");
    }

    const { messageId } = job.data;
    console.log(`[WORKER][${job.id}] Started processing job for message ID: ${messageId}`);

    const message = await client.getMessageById(messageId);
    if (!message) {
      console.warn(`[WORKER][${job.id}] Could not find message by ID. Acknowledging job.`);
      return;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      console.log(`[WORKER][${job.id}] Database transaction started.`);

      const chat = await message.getChat();
      
      const [tombstoneRows] = await connection.query(
        "SELECT message_id FROM deleted_message_ids WHERE message_id = ?",
        [messageId]
      );
      if (tombstoneRows.length > 0) {
        console.log(`[WORKER][${job.id}] Message was deleted before processing. Creating 'deleted' invoice entry.`);
        // TIMEZONE FIX: Convert UTC timestamp to GMT-03:00
        const utcDate = new Date(message.timestamp * 1000);
        const gmtMinus3Date = new Date(utcDate.getTime() - 180 * 60 * 1000);
        const sortOrder = gmtMinus3Date.getTime();
        await connection.query(
          `INSERT INTO invoices (message_id, source_group_jid, received_at, sort_order, is_deleted, notes) 
                VALUES (?, ?, ?, ?, ?, ?)`,
          [
            messageId,
            chat.id._serialized,
            gmtMinus3Date,
            sortOrder,
            true,
            "Message deleted before processing.",
          ]
        );
        await connection.query(
          "DELETE FROM deleted_message_ids WHERE message_id = ?",
          [messageId]
        );
        await connection.commit();
        console.log(`[WORKER][${job.id}] Tombstone processed and transaction committed.`);
        if (io) io.emit("invoices:updated");
        return;
      }

      const [settings] = await connection.query(
        "SELECT * FROM group_settings WHERE group_jid = ?",
        [chat.id._serialized]
      );
      const groupSettings = settings[0] || {
        forwarding_enabled: true,
        archiving_enabled: true,
      };

      if (!groupSettings.forwarding_enabled && !groupSettings.archiving_enabled) {
        console.log(`[WORKER][${job.id}] Both archiving and forwarding are disabled for group "${chat.name}". Skipping.`);
        await connection.commit();
        return;
      }

      const media = await message.downloadMedia();
      if (!media) {
        console.log(`[WORKER][${job.id}] Message has no media to process. Skipping.`);
        await connection.commit();
        return;
      }

      const tempFilePath = path.join(
        os.tmpdir(),
        `${message.id.id}.${media.mimetype.split("/")[1] || "bin"}`
      );
      await fs.writeFile(tempFilePath, Buffer.from(media.data, "base64"));
      console.log(`[WORKER][${job.id}] Media downloaded to temp path: ${tempFilePath}`);

      const pythonScriptsDir = path.join(__dirname, "..", "python_scripts");
      const pythonExecutablePath = path.join(pythonScriptsDir, "venv", "bin", "python3");
      const pythonScriptPath = path.join(pythonScriptsDir, "main.py");
      const pythonEnv = dotenv.config({ path: path.join(pythonScriptsDir, ".env"), }).parsed;

      if (!pythonEnv || !pythonEnv.GOOGLE_API_KEY) {
          throw new Error("Could not load GOOGLE_API_KEY for Python script.");
      }

      let invoiceJson;
      try {
        console.log(`[WORKER][${job.id}] Executing Python OCR script...`);
        const { stdout } = await execa(
          pythonExecutablePath,
          [pythonScriptPath, tempFilePath],
          { cwd: pythonScriptsDir, env: pythonEnv }
        );
        invoiceJson = JSON.parse(stdout);
        console.log(`[WORKER][${job.id}] Python script executed successfully.`);
      } catch (pythonError) {
        await fs.unlink(tempFilePath);
        console.error(`[WORKER][${job.id}] Python script failed:`, pythonError.stderr || pythonError.message);
        throw pythonError; // This will cause the job to fail and be retried
      }

      const { amount, sender, recipient, transaction_id } = invoiceJson;
      if (!amount || !recipient?.name) {
        console.log(`[WORKER][${job.id}] OCR did not return required fields (amount, recipient). Skipping.`);
        await fs.unlink(tempFilePath);
        await connection.commit();
        return;
      }

      // TIMEZONE FIX: Convert UTC timestamp to GMT-03:00
      const utcDate = new Date(message.timestamp * 1000);
      const gmtMinus3Date = new Date(utcDate.getTime() - 180 * 60 * 1000);
      const sortOrder = gmtMinus3Date.getTime();

      let finalMediaPath = null;
      if (groupSettings.archiving_enabled) {
        const extension = path.extname(media.filename || "") || `.${media.mimetype.split("/")[1] || "bin"}`;
        const archiveFileName = `${messageId}${extension}`;
        finalMediaPath = path.join(MEDIA_ARCHIVE_DIR, archiveFileName);
        await fs.rename(tempFilePath, finalMediaPath);
        console.log(`[WORKER][${job.id}] Media archived to: ${finalMediaPath}`);
        
        await connection.query(
          `INSERT INTO invoices (message_id, transaction_id, sender_name, recipient_name, pix_key, amount, source_group_jid, received_at, sort_order, raw_json_data, media_path, is_deleted) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            messageId, transaction_id, sender?.name, recipient.name,
            recipient.pix_key, amount, chat.id._serialized, gmtMinus3Date,
            sortOrder, JSON.stringify(invoiceJson), finalMediaPath, false,
          ]
        );
        console.log(`[WORKER][${job.id}] Invoice data inserted into database.`);
        await recalculateBalances(connection, gmtMinus3Date.toISOString());
      } else {
        await fs.unlink(tempFilePath);
        console.log(`[WORKER][${job.id}] Archiving disabled. Temp media file deleted.`);
      }

      if (groupSettings.forwarding_enabled) {
        const recipientNameLower = (recipient.name || "").toLowerCase().trim();
        if (recipientNameLower) {
          // FORWARDING FIX: Only select rules that are enabled
          const [rules] = await connection.query("SELECT * FROM forwarding_rules WHERE is_enabled = 1");
          for (const rule of rules) {
            if (recipientNameLower.includes(rule.trigger_keyword.toLowerCase())) {
              console.log(`[WORKER][${job.id}] Forwarding rule matched for keyword "${rule.trigger_keyword}". Forwarding to "${rule.destination_group_name}".`);
              const mediaToForward = new MessageMedia(media.mimetype, media.data, media.filename);
              await client.sendMessage(rule.destination_group_jid, mediaToForward, { caption: '\u200C' });
              break; // Stop after first match
            }
          }
        }
      }

      await connection.commit();
      console.log(`[WORKER][${job.id}] Transaction committed successfully.`);
      if (io) io.emit("invoices:updated");
    } catch (error) {
      await connection.rollback();
      console.error(`[WORKER-ERROR][${job.id}] Transaction rolled back due to critical error:`, error);
      // Don't acknowledge duplicate entry errors, but throw others to trigger a retry
      if (error.code === "ER_DUP_ENTRY") {
        console.warn(`[WORKER][${job.id}] Duplicate entry error. Acknowledging job as complete to prevent retries.`);
        return; 
      }
      throw error;
    } finally {
      connection.release();
    }
  },
  {
    connection: redisConnection,
    lockDuration: 120000,
    concurrency: 2, // CONCURRENCY CHANGE: Increased from 1 to 2
  }
);

invoiceWorker.on("failed", (job, err) => {
  console.error(`[QUEUE-FAIL] Job ${job?.id} (Message: ${job?.data?.messageId}) failed with error: ${err.message}`);
});

invoiceWorker.on("completed", (job) => {
    console.log(`[QUEUE-SUCCESS] Job ${job.id} (Message: ${job.data.messageId}) has completed.`);
});

const refreshAbbreviationCache = async () => {
  try {
    console.log("[CACHE] Refreshing abbreviations cache...");
    const [abbreviations] = await pool.query(
      "SELECT `trigger`, `response` FROM abbreviations"
    );
    abbreviationCache = abbreviations;
    console.log(`[CACHE] Loaded ${abbreviationCache.length} abbreviations.`);
  } catch (error) {
    console.error(
      "[CACHE-ERROR] Failed to refresh abbreviations cache:",
      error
    );
  }
};

let isReconciling = false;
const reconcileMissedMessages = async () => {
  if (isReconciling) {
      console.log("[RECONCILER] Reconciliation already in progress. Skipping this run.");
      return;
  }
  if (connectionStatus !== "connected") {
    return;
  }
  isReconciling = true;
  console.log("[RECONCILER] Starting aggressive check for missed messages...");
  const cutoffTimestamp = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
  
  try {
    const chats = await client.getChats();
    const groups = chats.filter((chat) => chat.isGroup);
    for (const group of groups) {
      const recentMessages = await group.fetchMessages({ limit: 50 });
      if (recentMessages.length === 0) continue;
      
      const messagesWithinWindow = recentMessages.filter(
        (msg) => msg.timestamp >= cutoffTimestamp
      );
      if (messagesWithinWindow.length === 0) continue;
      
      const messageIdsToCheck = messagesWithinWindow.map((msg) => msg.id._serialized);
      const [processedRows] = await pool.query(
        "SELECT message_id FROM processed_messages WHERE message_id IN (?)",
        [messageIdsToCheck]
      );
      const processedIds = new Set(processedRows.map((r) => r.message_id));
      
      const missedMessages = messagesWithinWindow.filter(
        (msg) => !processedIds.has(msg.id._serialized)
      );
      
      if (missedMessages.length > 0) {
        console.log(`[RECONCILER] Found ${missedMessages.length} missed message(s) in "${group.name}". Processing them now.`);
        for (const message of missedMessages) {
          await handleMessage(message);
        }
      }
    }
  } catch (error) {
    console.error("[RECONCILER-ERROR] An error occurred during reconciliation:", error);
  } finally {
    isReconciling = false;
    console.log("[RECONCILER] Finished check.");
  }
};

const handleMessage = async (message) => {
  try {
    const messageId = message.id._serialized;
    const [rows] = await pool.query("SELECT message_id FROM processed_messages WHERE message_id = ?", [messageId]);
    if (rows.length > 0) {
      return; // Already processed or queued, do nothing.
    }

    const chat = await message.getChat();
    if (!chat.isGroup) return;

    if (message.body) {
      const triggerText = message.body.trim();
      const match = abbreviationCache.find((abbr) => abbr.trigger === triggerText);
      if (match) {
        await pool.query("INSERT INTO processed_messages (message_id) VALUES (?) ON DUPLICATE KEY UPDATE message_id=message_id", [messageId]);
        await client.sendMessage(chat.id._serialized, match.response);
        return;
      }
    }

    if (message.hasMedia && !message.fromMe) {
        try {
            await invoiceQueue.add("process-invoice", { messageId }, { jobId: messageId });
            console.log(`[QUEUE-ADD] Added media from "${chat.name}" to queue. Msg ID: ${messageId}`);
            await pool.query("INSERT INTO processed_messages (message_id) VALUES (?) ON DUPLICATE KEY UPDATE message_id=message_id", [messageId]);
        } catch (queueError) {
            console.error(`[QUEUE-ERROR] Failed to add message ${messageId} to the queue. It will be retried by the reconciler.`, queueError);
        }
    }
  } catch (error) {
    if (error.code !== "ER_DUP_ENTRY") {
      console.error(`[MESSAGE-HANDLER-ERROR]`, error);
    }
  }
};

const handleMessageRevoke = async (message, revoked_msg) => {
  const deletedMessageId =
    revoked_msg?.id?._serialized ||
    message.protocolMessageKey?.id ||
    message._data?.protocolMessage?.key?.id ||
    null;

  if (!deletedMessageId) {
    console.warn("[DELETE] Revoke event received but could not determine message ID.");
    return;
  }
  console.log(`[DELETE] Revoke event for message ID: ${deletedMessageId}`);
  try {
    const [updateResult] = await pool.query(
      "UPDATE invoices SET is_deleted = 1 WHERE message_id = ?",
      [deletedMessageId]
    );
    if (updateResult.affectedRows > 0) {
      console.log(`[DELETE] Found and marked existing invoice as deleted for message ID: ${deletedMessageId}`);
      if (io) io.emit("invoices:updated");
    } else {
      console.log(`[DELETE] No invoice found. Creating tombstone for message ID: ${deletedMessageId}`);
      await pool.query(
        "INSERT INTO deleted_message_ids (message_id) VALUES (?) ON DUPLICATE KEY UPDATE message_id=message_id",
        [deletedMessageId]
      );
    }
  } catch (error) {
    console.error(`[DELETE-ERROR] Failed to process revoke for ${deletedMessageId}:`, error);
  }
};

const initializeWhatsApp = (socketIoInstance) => {
  io = socketIoInstance;
  console.log("[WAPP] Initializing WhatsApp client...");
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: "wwebjs_sessions" }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    },
  });

  client.on("qr", async (qr) => {
    console.log("[WAPP] QR code generated. Scan required.");
    qrCodeData = await qrcode.toDataURL(qr);
    connectionStatus = "qr";
  });
  client.on("ready", () => {
    console.log("[WAPP] Connection opened. Client is ready!");
    qrCodeData = null;
    connectionStatus = "connected";
    refreshAbbreviationCache();
    cron.schedule("* * * * *", reconcileMissedMessages);
    console.log("[RECONCILER] Self-healing reconciler scheduled to run every minute.");
  });
  client.on("message", handleMessage);
  client.on("message_revoke_everyone", handleMessageRevoke);
  client.on("disconnected", (reason) => {
    console.warn("[WAPP] Client was logged out or disconnected. Reason:", reason);
    connectionStatus = "disconnected";
  });
  client.on("auth_failure", (msg) => {
    console.error("[WAPP-FATAL] AUTHENTICATION FAILURE", msg);
    connectionStatus = "disconnected";
  });
  client.initialize();
};

const getQR = () => qrCodeData;
const getStatus = () => connectionStatus;

const fetchAllGroups = async () => {
  if (connectionStatus !== "connected") {
    throw new Error("WhatsApp is not connected.");
  }
  try {
    const chats = await client.getChats();
    const groups = chats.filter((chat) => chat.isGroup);
    return groups.map((group) => ({
      id: group.id._serialized,
      name: group.name,
      participants: group.participants.length,
    }));
  } catch (error) {
    console.error("[WAPP-ERROR] Error fetching groups:", error);
    throw error;
  }
};

const broadcast = async (io, socketId, groupObjects, message) => {
  if (connectionStatus !== "connected") {
    io.to(socketId).emit("broadcast:error", { message: "WhatsApp is not connected." });
    return;
  }
  let successfulSends = 0;
  let failedSends = 0;
  const failedGroups = [];
  const successfulGroups = [];
  console.log(`[BROADCAST] Starting broadcast to ${groupObjects.length} groups for socket ${socketId}.`);

  for (const group of groupObjects) {
    try {
      io.to(socketId).emit("broadcast:progress", { groupName: group.name, status: "sending", message: `Sending to "${group.name}"...` });
      const chat = await client.getChatById(group.id);
      chat.sendStateTyping();
      await new Promise((resolve) => setTimeout(resolve, 400));
      await client.sendMessage(group.id, message);
      successfulSends++;
      successfulGroups.push(group.name);
      io.to(socketId).emit("broadcast:progress", { groupName: group.name, status: "success", message: `Successfully sent to "${group.name}".` });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`[BROADCAST-ERROR] Failed to send to ${group.name} (${group.id}):`, error.message);
      failedSends++;
      failedGroups.push(group.name);
      io.to(socketId).emit("broadcast:progress", { groupName: group.name, status: "failed", message: `Failed to send to "${group.name}". Reason: ${error.message}` });
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  console.log(`[BROADCAST] Broadcast complete for socket ${socketId}. Successful: ${successfulSends}, Failed: ${failedSends}.`);
  io.to(socketId).emit("broadcast:complete", { total: groupObjects.length, successful: successfulSends, failed: failedSends, successfulGroups, failedGroups });
};

module.exports = {
  init: initializeWhatsApp,
  getQR,
  getStatus,
  fetchAllGroups,
  broadcast,
  refreshAbbreviationCache,
};