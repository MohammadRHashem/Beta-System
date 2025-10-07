const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const fs =require("fs/promises");
const fsSync = require("fs");
const pool = require("../config/db");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");
const { Queue, Worker } = require("bullmq");
const cron = require("node-cron");
const axios = require('axios');
const alfaAuthService = require('./alfaAuthService'); 

let client;
let qrCodeData;
let connectionStatus = "disconnected";
let abbreviationCache = [];
let io; // To hold the socket.io instance

// === NEW: State for Auto Confirmation ===
let isAutoConfirmationEnabled = false;
let isAlfaApiConfirmationEnabled = false;

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

const sendPingToMonitor = async () => {
    const monitorUrl = process.env.MONITOR_URL;
    if (!monitorUrl) return;

    try {
        // We only send a ping if the bot is actually connected.
        // This prevents false alarms during a restart or QR scan.
        if (connectionStatus === 'connected') {
            await axios.get(monitorUrl);
        }
    } catch (error) {
        // We don't log errors here to avoid spamming the console.
        // The monitor server is responsible for alerting on failure.
    }
};


const invoiceWorker = new Worker(
  "invoice-processing-queue",
  async (job) => {
    const { execa } = await import("execa");
    if (!client || connectionStatus !== "connected") {
      throw new Error("WhatsApp client is not connected. Job will be retried.");
    }
    const { messageId } = job.data;
    const originalMessage = await client.getMessageById(messageId);
    if (!originalMessage) {
      console.warn(`[WORKER] Could not find message by ID ${messageId}.`);
      return;
    }

    const chat = await originalMessage.getChat();
    const tempFilePaths = []; // Keep track of temp files for cleanup

    try {
      // --- Initial Download and OCR ---
      const media = await originalMessage.downloadMedia();
      if (!media) return;

      const cleanMimeType = media.mimetype.split(';')[0];
      const extension = cleanMimeType.split('/')[1] || 'bin';
      const tempFilePath = path.join(os.tmpdir(), `${originalMessage.id.id}.${extension}`);
      tempFilePaths.push(tempFilePath); // Add to cleanup list
      await fs.writeFile(tempFilePath, Buffer.from(media.data, "base64"));

      const pythonScriptsDir = path.join(__dirname, "..", "python_scripts");
      const pythonExecutable = process.platform === 'win32' ? 'python.exe' : 'python3';
      const pythonScriptPath = path.join(pythonScriptsDir, "main.py");
      const pythonEnv = dotenv.config({ path: path.join(pythonScriptsDir, ".env") }).parsed;
      if (!pythonEnv || !pythonEnv.GOOGLE_API_KEY) throw new Error("Could not load GOOGLE_API_KEY.");

      const { stdout } = await execa(pythonExecutable, [pythonScriptPath, tempFilePath]);
      const invoiceJson = JSON.parse(stdout);

      // --- 1. PRE-CHECK: OCR Validity ---
      const { amount, sender, recipient, transaction_id } = invoiceJson;
      if (!amount || (!recipient?.name && !recipient?.pix_key)) {
        console.log(`[WORKER] OCR failed for message ${messageId}. Stopping.`);
        await originalMessage.react(''); // Clear processing reaction
        return;
      }

      const recipientNameLower = (recipient.name || "").toLowerCase();
      
      // --- 2. PRIORITY 1: DUPLICATE CHECK ---
      if (
        transaction_id &&
        amount &&
        (recipientNameLower.includes('trkbit') || recipientNameLower.includes('alfa trust') || recipientNameLower.includes('escrow'))
      ) {
        const [existing] = await pool.query('SELECT id FROM invoices WHERE transaction_id = ? AND amount = ?', [transaction_id, amount]);
        if (existing.length > 0) {
          console.log(`[DUPLICATE] Invoice with TXN_ID ${transaction_id} already exists. Stopping.`);
          await originalMessage.reply("Repeated");
          await originalMessage.react('❌'); // Standardized "Repeated" emoji
          return; // Stop all further processing
        }
      }

      let runStandardForwarding = true; // Flag to control fallback to manual confirmation

      // --- 3. PRIORITY 2: ALFA TRUST API CONFIRMATION ---
      if (isAlfaApiConfirmationEnabled && recipientNameLower.includes('alfa trust')) {
        console.log('[WORKER] "Alfa Trust" recipient detected. Initiating API confirmation...');
        const apiResult = await alfaAuthService.findTransaction(invoiceJson);

        // Only a definitive 'found' status will stop the forwarding process.
        if (apiResult.status === 'found') {
            console.log(`[ALFA-CONFIRM] Confirmed via API. Replying "Caiu".`);
            await originalMessage.reply('Caiu');
            await originalMessage.react('🟢');
            runStandardForwarding = false; // Prevent fallback
        } else if (apiResult.status === 'not_found') {
            console.log(`[ALFA-CONFIRM] Not found via API. Falling back to standard manual confirmation.`);
            // Let runStandardForwarding remain true to trigger the fallback.
        } else { // 'error'
            console.warn('[ALFA-CONFIRM] API call failed. Falling back to standard manual confirmation logic.');
            // Let runStandardForwarding remain true to trigger the fallback.
        }
      }

      // --- 4. PRIORITY 3: STANDARD FORWARDING & MANUAL CONFIRMATION (Fallback) ---
      if (runStandardForwarding) {
        const [settings] = await pool.query("SELECT * FROM group_settings WHERE group_jid = ?", [chat.id._serialized]);
        const groupSettings = settings[0] || { forwarding_enabled: true };

        if (groupSettings.forwarding_enabled) {
          let forwarded = false;
          
          // Tier 1: Direct Forwarding Rule
          const [[directRule]] = await pool.query('SELECT destination_group_jid FROM direct_forwarding_rules WHERE source_group_jid = ?', [chat.id._serialized]);
          if (directRule) {
            console.log(`[FORWARDING] Matched direct rule for group "${chat.name}".`);
            const mediaToForward = new MessageMedia(media.mimetype, media.data, media.filename);
            let caption = '\u200C';
                          const numberRegex = /\b(\d[\d-]{2,})\b/g;
                          const matches = chat.name.match(numberRegex);
                          if (matches && matches.length > 0) {
                              caption = matches[matches.length - 1];
                          }
                          const forwardedMessage = await client.sendMessage(directRule.destination_group_jid, mediaToForward, { caption: caption });
            forwarded = true;
            if (isAutoConfirmationEnabled) {
              await pool.query(`INSERT INTO forwarded_invoices (original_message_id, forwarded_message_id, destination_group_jid) VALUES (?, ?, ?)`, [messageId, forwardedMessage.id._serialized, directRule.destination_group_jid]);
              await originalMessage.react('🟡'); // Waiting for manual confirmation emoji
            }
          }

          // Tier 2: AI Keyword Forwarding
          if (!forwarded) {
            const recipientNameToCheck = (recipient.name || "").toLowerCase().trim();
            const pixKeyToCheck = (recipient.pix_key || "").toLowerCase().trim();
            if (recipientNameToCheck || pixKeyToCheck) {
              const [rules] = await pool.query("SELECT * FROM forwarding_rules WHERE is_enabled = 1");
              for (const rule of rules) {
                const triggerKeywordLower = rule.trigger_keyword.toLowerCase();
                if (recipientNameToCheck.includes(triggerKeywordLower) || pixKeyToCheck.includes(triggerKeywordLower)) {
                  console.log(`[FORWARDING] Matched AI keyword rule "${rule.trigger_keyword}".`);
                  const mediaToForward = new MessageMedia(media.mimetype, media.data, media.filename);
                  let caption = '\u200C';
                          const numberRegex = /\b(\d[\d-]{2,})\b/g;
                          const matches = chat.name.match(numberRegex);
                          if (matches && matches.length > 0) {
                              caption = matches[matches.length - 1];
                          }
                          const forwardedMessage = await client.sendMessage(rule.destination_group_jid, mediaToForward, { caption: caption });
                  if (isAutoConfirmationEnabled) {
                    await pool.query(`INSERT INTO forwarded_invoices (original_message_id, forwarded_message_id, destination_group_jid) VALUES (?, ?, ?)`, [messageId, forwardedMessage.id._serialized, rule.destination_group_jid]);
                    await originalMessage.react('🟡'); // Waiting for manual confirmation emoji
                  }
                  break; // Stop after first match
                }
              }
            }
          }
        }
      }

      // --- 5. FINAL STEP: ARCHIVING ---
      const [archiveSettings] = await pool.query("SELECT archiving_enabled FROM group_settings WHERE group_jid = ?", [chat.id._serialized]);
      const groupArchiveSettings = archiveSettings[0] || { archiving_enabled: true };
      
      if (groupArchiveSettings.archiving_enabled) {
        const archiveFileName = `${messageId}.${extension}`;
        const finalMediaPath = path.join(MEDIA_ARCHIVE_DIR, archiveFileName);
        
        // Move the file from temp to archive
        await fs.rename(tempFilePath, finalMediaPath);
        tempFilePaths.pop(); // Remove from cleanup list as it's now archived

        const correctUtcDate = new Date(originalMessage.timestamp * 1000);
        await pool.query(`INSERT INTO invoices (message_id, transaction_id, sender_name, recipient_name, pix_key, amount, source_group_jid, received_at, raw_json_data, media_path, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
          [messageId, transaction_id, sender?.name, recipient.name, recipient.pix_key, amount, chat.id._serialized, correctUtcDate, JSON.stringify(invoiceJson), finalMediaPath, false]
        );
        console.log(`[ARCHIVE] Successfully archived invoice for message ${messageId}.`);
      }

    } catch (error) {
      console.error(`[WORKER-ERROR] Critical error processing job ${job?.id}:`, error);
      await originalMessage.react(''); // Clear reaction on any unhandled failure
      throw error; // Re-throw to let BullMQ handle the job failure
    } finally {
      // Cleanup: always delete any remaining temp files
      for (const tempPath of tempFilePaths) {
          if (fsSync.existsSync(tempPath)) {
              await fs.unlink(tempPath);
          }
      }
      if (io) io.emit("invoices:updated");
    }
  },
  { connection: redisConnection, lockDuration: 120000, concurrency: 2 }
);

invoiceWorker.on("failed", (job, err) => console.error(`[QUEUE-FAIL] Job ${job?.id} failed: ${err.message}`));
invoiceWorker.on("completed", (job) => console.log(`[QUEUE-SUCCESS] Job ${job.id} has completed.`));


const refreshAlfaApiConfirmationStatus = async () => {
  try {
    const [[setting]] = await pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'alfa_api_confirmation_enabled'"
    );
    isAlfaApiConfirmationEnabled = setting ? setting.setting_value === 'true' : false;
    console.log(`[SETTINGS] Alfa API Confirmation is now ${isAlfaApiConfirmationEnabled ? 'ENABLED' : 'DISABLED'}.`);
  } catch (error) {
    console.error("[SETTINGS-ERROR] Failed to refresh Alfa API confirmation status:", error);
    isAlfaApiConfirmationEnabled = false; // Default to off on error
  }
};


// === NEW: Function to check and cache the auto-confirmation setting ===
const refreshAutoConfirmationStatus = async () => {
  try {
    const [[setting]] = await pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'auto_confirmation_enabled'"
    );
    isAutoConfirmationEnabled = setting ? setting.setting_value === 'true' : false;
    console.log(`[SETTINGS] Auto Confirmation is now ${isAutoConfirmationEnabled ? 'ENABLED' : 'DISABLED'}.`);
  } catch (error) {
    console.error("[SETTINGS-ERROR] Failed to refresh auto confirmation status:", error);
    isAutoConfirmationEnabled = false; // Default to off on error
  }
};

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
    console.log("[RECONCILER] Missed message reconciliation already in progress. Skipping.");
    return;
  }
  if (connectionStatus !== "connected") {
    return;
  }
  isReconciling = true;
  console.log("[RECONCILER] Starting check for missed messages from the last 10 hours.");

  try {
    const cutoffTimestamp = Math.floor((Date.now() - 10 * 60 * 60 * 1000) / 1000);
    const allRecentMessageIds = new Set();
    const chats = await client.getChats();
    const groups = chats.filter((chat) => chat.isGroup);

    for (const group of groups) {
      const recentMessages = await group.fetchMessages({ limit: 100 }); 
      for (const msg of recentMessages) {
        if (msg.timestamp >= cutoffTimestamp && msg.hasMedia && !msg.fromMe) {
          allRecentMessageIds.add(msg.id._serialized);
        }
      }
    }

    if (allRecentMessageIds.size === 0) {
      console.log("[RECONCILER] No recent media messages found. Check complete.");
      isReconciling = false;
      return;
    }
    
    const [processedRows] = await pool.query(
        `SELECT message_id FROM processed_messages WHERE message_id IN (?)`,
        [[...allRecentMessageIds]]
    );
    const processedIds = new Set(processedRows.map(r => r.message_id));
    const missedMessageIds = [...allRecentMessageIds].filter(id => !processedIds.has(id));

    if (missedMessageIds.length > 0) {
        console.log(`[RECONCILER] Found ${missedMessageIds.length} missed messages. Queuing them now.`);
        for (const messageId of missedMessageIds) {
            await queueMessageIfNotExists(messageId);
        }
        console.log(`[RECONCILER] Successfully queued ${missedMessageIds.length} missed jobs.`);
    } else {
        console.log("[RECONCILER] No missed messages found.");
    }
  } catch (error) {
    console.error("[RECONCILER-ERROR] A critical error occurred during reconciliation:", error);
  } finally {
    isReconciling = false;
    console.log("[RECONCILER] Finished missed message reconciliation check.");
  }
};

const queueMessageIfNotExists = async (messageId) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query("SELECT message_id FROM processed_messages WHERE message_id = ?", [messageId]);
        if (rows.length > 0) {
            await connection.commit();
            return;
        }
        await invoiceQueue.add("process-invoice", { messageId }, { jobId: messageId, removeOnComplete: true, removeOnFail: 50 });
        await connection.query("INSERT INTO processed_messages (message_id) VALUES (?)", [messageId]);
        await connection.commit();
        console.log(`[QUEUE-ADD] Transactionally added message to queue. ID: ${messageId}`);
        const originalMessage = await client.getMessageById(messageId);
        if (originalMessage && originalMessage.hasMedia) {
            const mime = originalMessage._data?.mimetype?.toLowerCase();
            // === THE DEFINITIVE PDF FIX ===
            // Check for both common PDF mime types.
            if (originalMessage.type === 'image' || (originalMessage.type === 'document' && (mime === 'application/pdf' || mime === 'application/x-pdf'))) {
                await originalMessage.react('⏳');
            }
        }
    } catch (error) {
        await connection.rollback();
        if (error.code !== 'ER_DUP_ENTRY') {
             console.error(`[QUEUE-ERROR] Failed to transactionally queue message ${messageId}. It will be retried by the reconciler.`, error);
        }
    } finally {
        connection.release();
    }
};

// === NEW: Self-healing cron job to check for missed deletions ===
let isReconcilingDeletions = false;
const reconcileDeletedMessages = async () => {
    if (isReconcilingDeletions) {
        console.log("[DELETE-RECONCILER] Deletion reconciliation already in progress. Skipping.");
        return;
    }
    if (connectionStatus !== "connected") {
        return;
    }
    isReconcilingDeletions = true;
    console.log("[DELETE-RECONCILER] Starting proactive check for deleted messages.");

    try {
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        
        const [invoicesToCheck] = await pool.query(
            `SELECT message_id FROM invoices WHERE is_deleted = 0 AND received_at >= ?`,
            [twelveHoursAgo]
        );

        if (invoicesToCheck.length === 0) {
            console.log("[DELETE-RECONCILER] No recent, active invoices to check.");
            isReconcilingDeletions = false;
            return;
        }

        const idsToMarkAsDeleted = [];
        for (const invoice of invoicesToCheck) {
            try {
                const message = await client.getMessageById(invoice.message_id);
                // A message object with type 'revoked' is a confirmed deletion.
                if (message && message.type === 'revoked') {
                    idsToMarkAsDeleted.push(invoice.message_id);
                }
            } catch (error) {
                // Errors from getMessageById can often mean the message doesn't exist, but we check type to be safe.
                console.warn(`[DELETE-RECONCILER] Could not fetch status for message ${invoice.message_id}. It might be too old or an error occurred.`, error.message);
            }
        }

        if (idsToMarkAsDeleted.length > 0) {
            console.log(`[DELETE-RECONCILER] Found ${idsToMarkAsDeleted.length} invoices that were deleted but not marked. Updating now.`);
            await pool.query(
                `UPDATE invoices SET is_deleted = 1 WHERE message_id IN (?)`,
                [idsToMarkAsDeleted]
            );
            if (io) io.emit("invoices:updated");
        } else {
            console.log("[DELETE-RECONCILER] All recent invoices are in sync. No inconsistencies found.");
        }

    } catch (error) {
        console.error("[DELETE-RECONCILER-ERROR] A critical error occurred during deletion reconciliation:", error);
    } finally {
        isReconcilingDeletions = false;
        console.log("[DELETE-RECONCILER] Finished deletion reconciliation check.");
    }
};

const handleMessage = async (message) => {
  try {
    const chat = await message.getChat();
    if (!chat.isGroup) return;

    
    if (message.body) {
      const triggerText = message.body.trim();
      const match = abbreviationCache.find((abbr) => abbr.trigger === triggerText);
      if (match) {
        await pool.query("INSERT INTO processed_messages (message_id) VALUES (?) ON DUPLICATE KEY UPDATE message_id=message_id", [message.id._serialized]);
        await client.sendMessage(chat.id._serialized, match.response);
        return;
      }
    }

    if (message.hasMedia && !message.fromMe) {
        await queueMessageIfNotExists(message.id._serialized);
    }
  } catch (error) {
      console.error(`[MESSAGE-HANDLER-ERROR]`, error);
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
  console.log(`[DELETE] Real-time revoke event for message ID: ${deletedMessageId}`);
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

const handleReaction = async (reaction) => {
  if (
    !isAutoConfirmationEnabled ||
    (reaction.reaction !== '👍' && reaction.reaction !== '✅')
  ) {
    return;
  }

  const reactedMessageId = reaction.msgId._serialized;
  console.log(`[REACTION] Detected 'like' on message: ${reactedMessageId}`);

  try {
    const [[link]] = await pool.query(
      'SELECT original_message_id, is_confirmed FROM forwarded_invoices WHERE forwarded_message_id = ?',
      [reactedMessageId]
    );

    if (!link) {
      // This was a 'like' on a message we are not tracking, so we ignore it.
      return;
    }

    if (link.is_confirmed !== 0) {
      // Already confirmed, do not send "Caiu" again
      return;
    }

    console.log(`[REACTION] Found linked original message: ${link.original_message_id}`);
    const originalMessage = await client.getMessageById(link.original_message_id);

    if (originalMessage) {
      await originalMessage.reply('Caiu');
      await originalMessage.react(''); // Remove previous reactions
      await originalMessage.react('🟢'); // Add final confirmation reaction
      await pool.query(
        'UPDATE forwarded_invoices SET is_confirmed = 1 WHERE forwarded_message_id = ?',
        [reactedMessageId]
      );
      console.log(`[REACTION] Successfully processed confirmation for ${link.original_message_id}`);
    }
  } catch (error) {
    console.error(`[REACTION-ERROR] Failed to process 'like' confirmation for ${reactedMessageId}:`, error);
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
          "--disable-gpu",
          // This can help prevent navigation-related race conditions
          "--unhandled-rejections=strict",
        ],
      },
    });
  
    client.on("qr", async (qr) => {
      console.log("[WAPP] QR code generated. Scan required.");
      qrCodeData = await qrcode.toDataURL(qr);
      connectionStatus = "qr";
    });
    client.on("ready", async () => {
      cron.schedule("*/2 * * * * *", sendPingToMonitor);
      console.log("[HEARTBEAT] Pinger to AWS monitor scheduled to run every second.");
      qrCodeData = null;
      connectionStatus = "connected";
      refreshAlfaApiConfirmationStatus();
      refreshAbbreviationCache();
      refreshAutoConfirmationStatus();

      console.log('[STARTUP] Clearing any old/stale jobs from the queue...');
      await invoiceQueue.obliterate({ force: true });
      console.log('[STARTUP] Job queue cleared.');

      cron.schedule("*/5 * * * *", reconcileMissedMessages); 
      console.log("[RECONCILER] Safe, non-destructive message reconciler scheduled to run every 5 minutes.");

      // === THE EDIT: Schedule the new deletion reconciler ===
      cron.schedule("*/15 * * * *", reconcileDeletedMessages);
      console.log("[DELETE-RECONCILER] Proactive deletion-checking reconciler scheduled to run every 15 minutes.");
    });
    client.on("message", handleMessage);
    client.on("message_revoke_everyone", handleMessageRevoke);
    client.on("message_reaction", handleReaction);
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
    if (connectionStatus !== "connected" || !client.info) {
      throw new Error("WhatsApp is not connected or client info is not available yet.");
    }
    try {
      const selfId = client.info.wid._serialized;
      const chats = await client.getChats();
      const allGroups = chats.filter((chat) => chat.isGroup);
  
      const activeGroups = allGroups.filter(group => 
          group.participants && group.participants.some(p => p.id._serialized === selfId)
      );
  
      return activeGroups.map((group) => ({
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
  refreshAutoConfirmationStatus,
  refreshAlfaApiConfirmationStatus,
};