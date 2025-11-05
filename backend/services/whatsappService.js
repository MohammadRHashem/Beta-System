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
const { syncSingleSubaccount } = require('../xpayzSyncService');
// const usdtService = require('./usdtService');
const { parseFormattedCurrency } = require('../utils/currencyParser');

let client;
let qrCodeData;
let connectionStatus = "disconnected";
let abbreviationCache = [];
let io; // To hold the socket.io instance

// === NEW: State for Auto Confirmation ===
let isAutoConfirmationEnabled = false;
let isAlfaApiConfirmationEnabled = false;
let isTrocaCoinTelegramEnabled = false;
let trocaCoinConfirmationMethod = 'telegram';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms)); 

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

const findAlfaTrustMatchInDb = async (invoiceJson) => {
    const searchAmount = parseFormattedCurrency(invoiceJson.amount);
    const searchSender = (invoiceJson.sender?.name || '').trim();

    if (searchAmount === 0 || !searchSender) {
        return false;
    }

    // This query is optimized to check for recent, incoming transactions
    const query = `
        SELECT id FROM alfa_transactions
        WHERE operation = 'C'
        AND value = ?
        AND payer_name = ?
        AND inclusion_date >= NOW() - INTERVAL 48 HOUR
        LIMIT 1;
    `;
    const params = [searchAmount, searchSender];

    try {
        const [[match]] = await pool.query(query, params);
        return !!match; // Returns true if a match is found, false otherwise
    } catch (dbError) {
        console.error('[DB-CONFIRM-ERROR] Error querying alfa_transactions table:', dbError);
        return false; // On error, we assume no match and proceed to API check
    }
};


// === NEW: Helper function for the smart matching logic ===
const findBestTelegramMatch = async (searchAmount, searchSender) => {
  if (!searchSender || !searchAmount) {
    return null;
  }

  try {
    const [foundTxs] = await pool.query(
      `SELECT id, sender_name_normalized FROM telegram_transactions 
             WHERE amount = ? AND is_used = FALSE`,
      [searchAmount]
    );

    if (foundTxs.length === 0) {
      return null;
    }

    const ocrNameNormalized = searchSender
      .toLowerCase()
      .replace(/[,.]/g, "")
      .replace(/\b(ltda|me|sa|eireli|epp)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    let bestMatchId = null;

    for (const tx of foundTxs) {
      const telegramNameNormalized = tx.sender_name_normalized;

      // === THE DEFINITIVE FIX: Add a guard clause to check for null ===
      if (!telegramNameNormalized) {
        // If the name from the DB is null or empty for this row, skip it.
        continue;
      }
      // === END FIX ===

      // Now we can safely perform the checks
      if (telegramNameNormalized.includes(ocrNameNormalized)) {
        console.log(`[SMART-MATCH] Found via Substring Match.`);
        bestMatchId = tx.id;
        break;
      }

      const ocrWords = new Set(ocrNameNormalized.split(" ").filter((w) => w.length > 1));
      const telegramWords = new Set(telegramNameNormalized.split(" ").filter((w) => w.length > 1));
      const isSubset = (setA, setB) => {
        for (const elem of setA) {
          if (!setB.has(elem)) return false;
        }
        return true;
      };

      if (ocrWords.size > 0 && isSubset(ocrWords, telegramWords)) {
        console.log(`[SMART-MATCH] Found via Word Subset Match.`);
        bestMatchId = tx.id;
        break;
      }
    }

    return bestMatchId;
  } catch (dbError) {
    console.error(
      "[DB-CONFIRM-ERROR] Error querying telegram_transactions table:",
      dbError
    );
    return null;
  }
};




const findBestXPayzMatch = async (searchAmount, searchSender, subaccountPool = []) => {
  if (!searchSender || !searchAmount) {
    return null;
  }
  try {
    let query = `
      SELECT id, sender_name_normalized FROM xpayz_transactions 
      WHERE amount = ? AND is_used = FALSE
    `;
    const params = [searchAmount];

    // If a pool of subaccounts is provided, filter the search
    if (subaccountPool.length > 0) {
      query += ` AND subaccount_id IN (?)`;
      params.push(subaccountPool);
    }
    
    const [foundTxs] = await pool.query(query, params);

    if (foundTxs.length === 0) return null;

    const ocrNameNormalized = searchSender
      .toLowerCase()
      .replace(/[,.]/g, "")
      .replace(/\b(ltda|me|sa|eireli|epp)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    for (const tx of foundTxs) {
      if (tx.sender_name_normalized && tx.sender_name_normalized.includes(ocrNameNormalized)) {
        console.log(`[XPAYZ-MATCH] Found match via Substring.`);
        return tx.id;
      }
    }
    return null;
  } catch (dbError) {
    console.error("[DB-CONFIRM-ERROR] Error querying xpayz_transactions table:", dbError);
    return null;
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

      const cleanMimeType = media.mimetype.split(";")[0];
      const extension = cleanMimeType.split("/")[1] || "bin";
      const tempFilePath = path.join(
        os.tmpdir(),
        `${originalMessage.id.id}.${extension}`
      );
      tempFilePaths.push(tempFilePath); // Add to cleanup list
      await fs.writeFile(tempFilePath, Buffer.from(media.data, "base64"));

      const pythonScriptsDir = path.join(__dirname, "..", "python_scripts");
      const mainScriptPath = path.join(pythonScriptsDir, "main.py");
      const usdtScriptPath = path.join(pythonScriptsDir, "usdt_validator.py");
      const pythonExecutable =
        process.platform === "win32" ? "python.exe" : "python3";
      const pythonScriptPath = path.join(pythonScriptsDir, "main.py");
      const pythonEnv = dotenv.config({
        path: path.join(pythonScriptsDir, ".env"),
      }).parsed;
      if (!pythonEnv || !pythonEnv.GOOGLE_API_KEY)
        throw new Error("Could not load GOOGLE_API_KEY.");

      const { stdout } = await execa(pythonExecutable, [
        pythonScriptPath,
        tempFilePath,
      ]);
      const invoiceJson = JSON.parse(stdout);

      // --- 1. PRE-CHECK: OCR Validity ---
      const { amount, sender, recipient, transaction_id } = invoiceJson;
      if (!amount || (!recipient?.name && !recipient?.pix_key)) {
        console.log(`[WORKER] OCR failed for message ${messageId}. Stopping.`);
        await originalMessage.react(""); // Clear processing reaction
        return;
      }

      const recipientNameLower = (recipient.name || "").toLowerCase();

      let isDuplicate = false;
      let existingSourceJid = "";

      // --- PRIORITY 1: STRICT DUPLICATE CHECK (transaction_id + amount) ---
      if (
        recipientNameLower.includes("troca") ||
        recipientNameLower.includes("mks intermediacoes") ||
        recipientNameLower.includes("alfa trust") ||
        recipientNameLower.includes("trkbit") ||
        recipientNameLower.includes("upgrade zone")
      ) {
        if (transaction_id && transaction_id.trim() !== "" && amount) {
          const trimmedTransactionId = transaction_id.trim();
          const [[existingById]] = await pool.query(
            "SELECT source_group_jid FROM invoices WHERE transaction_id = ? AND amount = ? AND is_deleted = 0 LIMIT 1",
            [trimmedTransactionId, amount]
          );

          if (existingById) {
            const currentSourceJid = chat.id._serialized;
            if (currentSourceJid === existingById.source_group_jid) {
              await originalMessage.reply("❌Repeated❌");
            } else {
              await originalMessage.reply("❌Repeated from another client❌");
            }
            await originalMessage.react("❌");
            return; // EXIT WORKER
          }
        }
      }

      let runStandardForwarding = true;
      let wasActioned = false;

      //USDT Transaction Confirmation
      if (recipientNameLower.includes("usdt_recipient")) {
        console.log('[WORKER] "USDT_RECIPIENT" detected. Running dedicated USDT validator...');
        
        const [wallets] = await pool.query('SELECT wallet_address FROM usdt_wallets WHERE is_enabled = 1');
        if (wallets.length === 0) {
            console.log('[USDT-WORKER] No wallets configured, falling back to manual forwarding.');
        } else {
            const ourWallets = wallets.map(w => w.wallet_address);
            const discoverFlag = (!invoiceJson.transaction_id || invoiceJson.transaction_id.trim() === '') ? '--discover-txid' : '""';
            const messageTimestamp = new Date(originalMessage.timestamp * 1000).toISOString();

            try {
                const { stdout: usdtStdout } = await execa(pythonExecutable, [
                    usdtScriptPath,
                    tempFilePath,
                    discoverFlag,
                    JSON.stringify(ourWallets),
                    messageTimestamp
                ]);
                
                const result = JSON.parse(usdtStdout);

                if (result.status === 'CONFIRMED') {
                    await originalMessage.reply(`${result.amount} USDT informed ✅`);
                    await originalMessage.react("🟢");
                    wasActioned = true;
                    runStandardForwarding = false;
                } else if (result.status === 'OUTGOING') {
                    await originalMessage.react("📤");
                    wasActioned = true;
                    runStandardForwarding = false;
                } else {
                    console.log(`[USDT-VALIDATOR] Validation failed: ${result.reason}. Falling back to manual forwarding.`);
                }
            } catch (pyError) {
                console.error('[USDT-VALIDATOR] Python script execution failed:', pyError.stderr || pyError.message);
            }
        }
      }

      // --- PRIORITY 2: TROCA COIN TELEGRAM CONFIRMATION (Using Smart Match) ---
      if (recipientNameLower.includes("upgrade zone")) {
        const sourceGroupJid = chat.id._serialized;
        const searchAmount = parseFloat(amount.replace(/,/g, ""));

        const [[assignmentRule]] = await pool.query(
          "SELECT subaccount_number FROM subaccounts WHERE assigned_group_jid = ?",
          [sourceGroupJid]
        );

        if (assignmentRule) {
          // SCENARIO 1: The Group IS Assigned
          const targetSubaccountId = assignmentRule.subaccount_number;
          console.log(
            `[WORKER][UPGRADE-ZONE] Group is assigned to subaccount ${targetSubaccountId}.`
          );

          // --- First Check ---
          let matchId = await findBestXPayzMatch(searchAmount, sender.name, [
            targetSubaccountId,
          ]);

          // --- JIT SYNC & Second Check (if first check fails) ---
          if (!matchId) {
            console.log(
              "[WORKER][JIT-SYNC] First check failed. Triggering immediate on-demand sync..."
            );
            await syncSingleSubaccount(targetSubaccountId);
            await delay(2000); // Wait 2 seconds for DB to update
            console.log(
              "[WORKER][JIT-SYNC] Re-checking database after sync..."
            );
            matchId = await findBestXPayzMatch(searchAmount, sender.name, [
              targetSubaccountId,
            ]);
          }

          if (matchId) {
            // Correct payment!
            await pool.query(
              "UPDATE xpayz_transactions SET is_used = TRUE WHERE id = ?",
              [matchId]
            );
            await originalMessage.reply("Caiu");
            await originalMessage.react("🟢");
            wasActioned = true;
            runStandardForwarding = false;
          } else {
            // Incorrect payment (CONFIRMED after JIT sync)
            await originalMessage.reply("no caiu, pix is wrong");
            await originalMessage.react("🔴");
            wasActioned = true;
            runStandardForwarding = false;
          }
        } else {
          // SCENARIO 2: The Group is NOT Assigned (General Pool)
          console.log(
            "[WORKER][UPGRADE-ZONE] Group is not assigned. Searching in general pool..."
          );

          const [unassignedSubaccounts] = await pool.query(
            "SELECT subaccount_number FROM subaccounts WHERE assigned_group_jid IS NULL"
          );
          const unassignedPoolIds = unassignedSubaccounts.map(
            (acc) => acc.subaccount_number
          );

          if (unassignedPoolIds.length > 0) {
            // --- First Check ---
            let matchId = await findBestXPayzMatch(
              searchAmount,
              sender.name,
              unassignedPoolIds
            );

            // --- JIT SYNC & Second Check (if first check fails) ---
            if (!matchId) {
              console.log(
                "[WORKER][JIT-SYNC] First check of general pool failed. Triggering on-demand sync for all unassigned accounts..."
              );
              for (const subId of unassignedPoolIds) {
                await syncSingleSubaccount(subId);
              }
              await delay(2000); // Wait 2 seconds
              console.log(
                "[WORKER][JIT-SYNC] Re-checking general pool after sync..."
              );
              matchId = await findBestXPayzMatch(
                searchAmount,
                sender.name,
                unassignedPoolIds
              );
            }

            if (matchId) {
              await pool.query(
                "UPDATE xpayz_transactions SET is_used = TRUE WHERE id = ?",
                [matchId]
              );
              await originalMessage.reply("Caiu");
              await originalMessage.react("🟢");
              wasActioned = true;
              runStandardForwarding = false;
            } else {
              console.log(
                "[DB-CONFIRM] No match found in general pool after JIT sync. Falling back to manual forwarding."
              );
            }
          } else {
            console.log(
              "[DB-CONFIRM] No unassigned subaccounts available to check. Falling back to manual forwarding."
            );
          }
        }
      }

      // --- PRIORITY 2.5: ORIGINAL TROCA COIN / MKS CONFIRMATION (Fallback) ---
      // (This block is now also upgraded with JIT logic for XPayz)
      if (
        runStandardForwarding &&
        (recipientNameLower.includes("troca") ||
          recipientNameLower.includes("mks intermediacoes"))
      ) {
        let matchId = null;
        let updateTable = "";

        if (trocaCoinConfirmationMethod === "telegram") {
          console.log(
            '[WORKER] "Troca Coin/MKS" detected. Using TELEGRAM confirmation method...'
          );
          matchId = await findBestTelegramMatch(
            parseFloat(amount.replace(/,/g, "")),
            sender.name
          );
          updateTable = "telegram_transactions";
        } else if (trocaCoinConfirmationMethod === "xpayz") {
          console.log(
            '[WORKER] "Troca Coin/MKS" detected. Using XPAYZ confirmation method...'
          );
          updateTable = "xpayz_transactions";
          const [unassignedSubaccounts] = await pool.query(
            "SELECT subaccount_number FROM subaccounts WHERE assigned_group_jid IS NULL"
          );
          const unassignedPoolIds = unassignedSubaccounts.map(
            (acc) => acc.subaccount_number
          );

          // First check
          matchId = await findBestXPayzMatch(
            parseFloat(amount.replace(/,/g, "")),
            sender.name,
            unassignedPoolIds
          );

          // JIT Sync and Re-check
          if (!matchId && unassignedPoolIds.length > 0) {
            console.log(
              "[WORKER][JIT-SYNC] First check of general pool failed for Troca Coin. Syncing all unassigned accounts..."
            );
            for (const subId of unassignedPoolIds) {
              await syncSingleSubaccount(subId);
            }
            await delay(2000);
            matchId = await findBestXPayzMatch(
              parseFloat(amount.replace(/,/g, "")),
              sender.name,
              unassignedPoolIds
            );
          }
        }

        if (matchId) {
          await pool.query(
            `UPDATE ${updateTable} SET is_used = TRUE WHERE id = ?`,
            [matchId]
          );
          await originalMessage.reply("Caiu");
          await originalMessage.react("🟢");
          wasActioned = true;
          runStandardForwarding = false;
        } else {
          console.log(
            `[DB-CONFIRM] No Smart Match found in ${trocaCoinConfirmationMethod} data after JIT sync. Falling back to manual forwarding.`
          );
        }
      }

      // --- 3. PRIORITY 2.5: ALFA TRUST API CONFIRMATION ---
      if (
        runStandardForwarding &&
        isAlfaApiConfirmationEnabled &&
        recipientNameLower.includes("alfa trust")
      ) {
        console.log(
          '[WORKER] "Alfa Trust" recipient detected. Checking local DB first...'
        );

        // Step 1: Check Local DB
        const dbMatch = await findAlfaTrustMatchInDb(invoiceJson);

        if (dbMatch) {
          // Found in DB - this is the fastest path
          console.log(
            `[ALFA-CONFIRM-DB] Confirmed via local database. Replying "Caiu".`
          );
          await originalMessage.reply("Caiu");
          await originalMessage.react("🟢");
          wasActioned = true;
          runStandardForwarding = false;
        } else {
          // Step 2: If not in DB, check the Live API as a fallback
          console.log(
            "[ALFA-CONFIRM-DB] Not found in local DB. Checking live API as a fallback..."
          );
          const apiResult = await alfaAuthService.findTransaction(invoiceJson);

          if (apiResult.status === "found") {
            console.log(
              `[ALFA-CONFIRM-API] Confirmed via live API. Replying "Caiu".`
            );
            await originalMessage.reply("Caiu");
            await originalMessage.react("🟢");
            wasActioned = true;
            runStandardForwarding = false;
          } else {
            // Step 3: If not found in API either, fall back to manual forwarding
            console.log(
              "[ALFA-CONFIRM-API] Not found via live API. Falling back to manual confirmation."
            );
          }
        }
      }

      // --- 4. PRIORITY 3: STANDARD FORWARDING & MANUAL CONFIRMATION (Fallback) ---
      // let wasActioned = false;
      if (runStandardForwarding) {
        const [settings] = await pool.query(
          "SELECT * FROM group_settings WHERE group_jid = ?",
          [chat.id._serialized]
        );
        const groupSettings = settings[0] || { forwarding_enabled: true };

        if (groupSettings.forwarding_enabled) {
          let forwarded = false;

          // Tier 1: Direct Forwarding Rule
          const [[directRule]] = await pool.query(
            "SELECT destination_group_jid FROM direct_forwarding_rules WHERE source_group_jid = ?",
            [chat.id._serialized]
          );
          if (directRule) {
            console.log(
              `[FORWARDING] Matched direct rule for group "${chat.name}".`
            );
            const mediaToForward = new MessageMedia(
              media.mimetype,
              media.data,
              media.filename
            );
            let caption = "\u200C";
            const numberRegex = /\b(\d[\d-]{2,})\b/g;
            const matches = chat.name.match(numberRegex);
            if (matches && matches.length > 0) {
              caption = matches[matches.length - 1];
            }
            const forwardedMessage = await client.sendMessage(
              directRule.destination_group_jid,
              mediaToForward,
              { caption: caption }
            );
            forwarded = true;
            if (isAutoConfirmationEnabled) {
              await pool.query(
                `INSERT INTO forwarded_invoices (original_message_id, forwarded_message_id, destination_group_jid) VALUES (?, ?, ?)`,
                [
                  messageId,
                  forwardedMessage.id._serialized,
                  directRule.destination_group_jid,
                ]
              );
              wasActioned = true;
              await originalMessage.react("🟡"); // Waiting for manual confirmation emoji
            }
          }

          // Tier 2: AI Keyword Forwarding
          if (!forwarded) {
            const recipientNameToCheck = (recipient.name || "")
              .toLowerCase()
              .trim();
            const pixKeyToCheck = (recipient.pix_key || "")
              .toLowerCase()
              .trim();
            if (recipientNameToCheck || pixKeyToCheck) {
              const [rules] = await pool.query(
                "SELECT * FROM forwarding_rules WHERE is_enabled = 1"
              );
              for (const rule of rules) {
                const triggerKeywordLower = rule.trigger_keyword.toLowerCase();
                if (
                  recipientNameToCheck.includes(triggerKeywordLower) ||
                  pixKeyToCheck.includes(triggerKeywordLower)
                ) {
                  console.log(
                    `[FORWARDING] Matched AI keyword rule "${rule.trigger_keyword}".`
                  );
                  const mediaToForward = new MessageMedia(
                    media.mimetype,
                    media.data,
                    media.filename
                  );
                  let caption = "\u200C";
                  const numberRegex = /\b(\d[\d-]{2,})\b/g;
                  const matches = chat.name.match(numberRegex);
                  if (matches && matches.length > 0) {
                    caption = matches[matches.length - 1];
                  }
                  const forwardedMessage = await client.sendMessage(
                    rule.destination_group_jid,
                    mediaToForward,
                    { caption: caption }
                  );
                  if (isAutoConfirmationEnabled) {
                    await pool.query(
                      `INSERT INTO forwarded_invoices (original_message_id, forwarded_message_id, destination_group_jid) VALUES (?, ?, ?)`,
                      [
                        messageId,
                        forwardedMessage.id._serialized,
                        rule.destination_group_jid,
                      ]
                    );
                    wasActioned = true;
                    await originalMessage.react("🟡"); // Waiting for manual confirmation emoji
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

        await fs.rename(tempFilePath, finalMediaPath);
        tempFilePaths.pop(); 

        const correctUtcDate = new Date(originalMessage.timestamp * 1000);
        await pool.query(
          `INSERT INTO invoices (message_id, transaction_id, sender_name, recipient_name, pix_key, amount, source_group_jid, received_at, raw_json_data, media_path, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            messageId, transaction_id, sender?.name, recipient.name, recipient.pix_key,
            amount, chat.id._serialized, correctUtcDate, JSON.stringify(invoiceJson), finalMediaPath, false,
          ]
        );
      }
    } catch (error) {
      console.error(`[WORKER-ERROR] Critical error processing job ${job?.id}:`, error);
      await originalMessage.react('');
      throw error;
    } finally {
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


const refreshTrocaCoinStatus = async () => {
  try {
    const [[setting]] = await pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'troca_coin_telegram_enabled'"
    );
    isTrocaCoinTelegramEnabled = setting ? setting.setting_value === 'true' : false;
    console.log(`[SETTINGS] Troca Coin Telegram Confirmation is now ${isTrocaCoinTelegramEnabled ? 'ENABLED' : 'DISABLED'}.`);
  } catch (error) {
    console.error("[SETTINGS-ERROR] Failed to refresh Troca Coin status:", error);
    isTrocaCoinTelegramEnabled = false;
  }
};


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

// let isReconciling = false;
// const reconcileMissedMessages = async () => {
//   if (isReconciling) {
//     console.log("[RECONCILER] Missed message reconciliation already in progress. Skipping.");
//     return;
//   }
//   if (connectionStatus !== "connected") {
//     return;
//   }
//   isReconciling = true;
//   console.log("[RECONCILER] Starting check for missed messages from the last 10 hours.");

//   try {
//     const cutoffTimestamp = Math.floor((Date.now() - 10 * 60 * 60 * 1000) / 1000);
//     const allRecentMessageIds = new Set();
//     const chats = await client.getChats();
//     const groups = chats.filter((chat) => chat.isGroup);

//     for (const group of groups) {
//       const recentMessages = await group.fetchMessages({ limit: 500 }); 
//       for (const msg of recentMessages) {
//         if (msg.timestamp >= cutoffTimestamp && msg.hasMedia && !msg.fromMe) {
//           allRecentMessageIds.add(msg.id._serialized);
//         }
//       }
//     }

//     if (allRecentMessageIds.size === 0) {
//       console.log("[RECONCILER] No recent media messages found. Check complete.");
//       isReconciling = false;
//       return;
//     }
    
//     const [processedRows] = await pool.query(
//         `SELECT message_id FROM processed_messages WHERE message_id IN (?)`,
//         [[...allRecentMessageIds]]
//     );
//     const processedIds = new Set(processedRows.map(r => r.message_id));
//     const missedMessageIds = [...allRecentMessageIds].filter(id => !processedIds.has(id));

//     if (missedMessageIds.length > 0) {
//         console.log(`[RECONCILER] Found ${missedMessageIds.length} missed messages. Queuing them now.`);
//         for (const messageId of missedMessageIds) {
//             await queueMessageIfNotExists(messageId);
//         }
//         console.log(`[RECONCILER] Successfully queued ${missedMessageIds.length} missed jobs.`);
//     } else {
//         console.log("[RECONCILER] No missed messages found.");
//     }
//   } catch (error) {
//     console.error("[RECONCILER-ERROR] A critical error occurred during reconciliation:", error);
//   } finally {
//     isReconciling = false;
//     console.log("[RECONCILER] Finished missed message reconciliation check.");
//   }
// };

let isReconcilingStalledJobs = false;
const reconcileStalledJobs = async () => {
    if (isReconcilingStalledJobs) {
        return;
    }
    if (connectionStatus !== "connected") {
        return;
    }
    isReconcilingStalledJobs = true;
    console.log("[STALLED-RECONCILER] Starting check for jobs that are truly stalled in the queue.");

    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        // Get jobs that are in 'active' or 'waiting' state but are older than 5 minutes.
        // This indicates a worker may have crashed while processing it.
        const stalledJobs = await invoiceQueue.getJobs(['active', 'waiting'], 0, 100, true);

        let requeuedCount = 0;
        for (const job of stalledJobs) {
            // Check if the job was created more than 5 minutes ago
            if (job.timestamp < fiveMinutesAgo.getTime()) {
                try {
                    console.log(`[STALLED-RECONCILER] Found a potentially stalled job: ${job.id}. State: ${await job.getState()}`);
                    
                    // A safe way to handle this is to remove the old job and re-add it.
                    // This avoids complex state management.
                    await job.remove();
                    await invoiceQueue.add("process-invoice", { messageId: job.id }, { jobId: job.id, removeOnComplete: true, removeOnFail: 50 });
                    requeuedCount++;
                    console.log(`[STALLED-RECONCILER] Successfully re-queued job ${job.id}.`);

                } catch (error) {
                    console.error(`[STALLED-RECONCILER] Failed to re-queue job ${job.id}:`, error.message);
                }
            }
        }

        if (requeuedCount > 0) {
            console.log(`[STALLED-RECONCILER] Finished check. Re-queued ${requeuedCount} stalled jobs.`);
        } else {
            console.log("[STALLED-RECONCILER] Finished check. No stalled jobs found in the queue.");
        }

    } catch (error) {
        console.error("[STALLED-RECONCILER-ERROR] A critical error occurred during stalled job reconciliation:", error);
    } finally {
        isReconcilingStalledJobs = false;
    }
};

let isAuditing = false;
const auditAndReconcileInternalLog = async () => {
    if (isAuditing) {
        return;
    }
    if (connectionStatus !== "connected") {
        return;
    }
    isAuditing = true;

    try {
        const connection = await pool.getConnection();
        const [missedMessages] = await connection.query(`
            SELECT rml.message_id 
            FROM raw_message_log rml
            LEFT JOIN processed_messages pm ON rml.message_id = pm.message_id
            WHERE pm.message_id IS NULL 
            AND rml.received_at >= NOW() - INTERVAL 24 HOUR; 
        `);
        connection.release();

        if (missedMessages.length > 0) {
            console.log(`[AUDITOR] Found ${missedMessages.length} messages that were received but not queued. Processing them now.`);
            for (const row of missedMessages) {
                await queueMessageIfNotExists(row.message_id);
            }
        }

    } catch (error) {
        console.error("[AUDITOR-ERROR] A critical error occurred during the internal audit:", error);
    } finally {
        isAuditing = false;
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
    await pool.query("INSERT IGNORE INTO raw_message_log (message_id) VALUES (?)", [message.id._serialized]);
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

// === THIS FUNCTION IS THE ONLY ONE WITH CHANGES ===
const handleReaction = async (reaction) => {
  if (!isAutoConfirmationEnabled) {
    return;
  }

  const reactedMessageId = reaction.msgId._serialized;
  const reactionEmoji = reaction.reaction;

  try {
    const [[link]] = await pool.query(
      'SELECT original_message_id, is_confirmed FROM forwarded_invoices WHERE forwarded_message_id = ?',
      [reactedMessageId]
    );

    if (!link || link.is_confirmed !== 0) {
      return;
    }

    // --- LOGIC FOR "CAIU" (CONFIRMATION) ---
    if (reactionEmoji === '👍' || reactionEmoji === '✅') {
      const originalMessage = await client.getMessageById(link.original_message_id);
      if (originalMessage) {
        // === THE FIX: Reply BEFORE reacting ===
        await originalMessage.reply('Caiu');
        await originalMessage.react(''); 
        await originalMessage.react('🟢');
        // === END FIX ===
        
        await pool.query(
          'UPDATE forwarded_invoices SET is_confirmed = 1 WHERE forwarded_message_id = ?',
          [reactedMessageId]
        );
        console.log(`[REACTION] Successfully processed 'Caiu' confirmation for ${link.original_message_id}`);
      }
    }
    
    // --- LOGIC FOR "NO CAIU" (DELETION) ---
    else if (reactionEmoji === '❌') {
      console.log(`[REACTION] Detected 'cross' (reject/delete) on message: ${reactedMessageId}`);
      
      const originalMessage = await client.getMessageById(link.original_message_id);
      
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // Step 1: Find the invoice record to get the media path
        const [[invoiceToDelete]] = await connection.query(
          'SELECT id, media_path FROM invoices WHERE message_id = ?',
          [link.original_message_id]
        );

        if (invoiceToDelete) {
          // Step 2: Delete the main invoice record from the database
          await connection.query('DELETE FROM invoices WHERE id = ?', [invoiceToDelete.id]);
          console.log(`[REACTION-DELETE] Deleted invoice record ID: ${invoiceToDelete.id}`);

          // Step 3 (Optional but recommended): Delete the associated media file
          if (invoiceToDelete.media_path && fsSync.existsSync(invoiceToDelete.media_path)) {
            await fs.unlink(invoiceToDelete.media_path);
            console.log(`[REACTION-DELETE] Deleted media file: ${invoiceToDelete.media_path}`);
          }
        }
        
        // Step 4: Mark the forwarded link as actioned to prevent repeats
        await connection.query(
          'UPDATE forwarded_invoices SET is_confirmed = 2 WHERE forwarded_message_id = ?',
          [reactedMessageId]
        );
        
        await connection.commit();

        // Step 5: Notify the original sender
        if (originalMessage) {
          // === THE FIX: Reply BEFORE reacting ===
          await originalMessage.reply("no caiu");
          await originalMessage.react("");
          await originalMessage.react("🔴");
          // === END FIX ===
        }
        
        // Notify the frontend to refresh the invoice list
        if (io) io.emit("invoices:updated");
        console.log(`[REACTION-DELETE] Successfully processed 'No Caiu' deletion for ${link.original_message_id}`);
        
      } catch (dbError) {
        await connection.rollback();
        console.error(`[REACTION-DELETE-ERROR] Database transaction failed for ${link.original_message_id}:`, dbError);
      } finally {
        connection.release();
      }
    }

  } catch (error) {
    console.error(`[REACTION-ERROR] Failed to process reaction for ${reactedMessageId}:`, error);
  }
};

const refreshTrocaCoinMethod = async () => {
  try {
    const [[setting]] = await pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'troca_coin_confirmation_method'"
    );
    trocaCoinConfirmationMethod = setting ? setting.setting_value : 'telegram';
    console.log(`[SETTINGS] Troca Coin Confirmation Method is now set to '${trocaCoinConfirmationMethod}'.`);
  } catch (error) {
    console.error("[SETTINGS-ERROR] Failed to refresh Troca Coin method:", error);
    trocaCoinConfirmationMethod = 'telegram'; // Default to telegram on error
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
      cron.schedule("*/1 * * * *", auditAndReconcileInternalLog);
      console.log("[AUDITOR] Internal message auditor scheduled to run every minute.");
      // cron.schedule("*/2 * * * * *", sendPingToMonitor);
      // console.log("[HEARTBEAT] Pinger to AWS monitor scheduled to run every second.");
      qrCodeData = null;
      connectionStatus = "connected";
      refreshAlfaApiConfirmationStatus();
      refreshTrocaCoinStatus();
      refreshTrocaCoinMethod();
      refreshAbbreviationCache();
      refreshAutoConfirmationStatus();

      console.log('[STARTUP] Clearing any old/stale jobs from the queue...');
      await invoiceQueue.obliterate({ force: true });
      console.log('[STARTUP] Job queue cleared.');

      cron.schedule("*/5 * * * *", reconcileStalledJobs); 
      console.log("[STALLED-RECONCILER] Stalled job reconciler scheduled to run every 5 minutes.");

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
  refreshTrocaCoinStatus,
  refreshTrocaCoinMethod,
};