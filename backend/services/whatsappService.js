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
const usdtLinkService = require('./usdtLinkService'); // <--- ADD IMPORT

let client;
let qrCodeData;
let connectionStatus = "disconnected";
let abbreviationCache = [];
let requestTypeCache = [];
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

const normalizeNameForMatching = (name) => {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove Accents (ã -> a, é -> e)
        .replace(/[\d.,-]/g, "") // Remove digits/punctuation
        .replace(/\b(ltda|me|sa|eireli|epp|s.a|participacoes|pagamentos)\b/g, "") // Remove corporate suffixes
        .replace(/\b(de|da|do|dos|das|e)\b/g, "") // Remove articles
        .replace(/\s+/g, " ") // Standardize whitespace
        .trim();
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

// =======================================================================
// === NEW HELPER FUNCTION: 3-VECTOR SMART MATCH FOR TRKBIT/CROSS      ===
// =======================================================================
const findBestTrkbitMatch = async (searchAmount, searchSender, pixKeyOptions) => {
    if (!searchSender || !searchAmount) return null;

    let query = `
        SELECT id, tx_payer_name FROM trkbit_transactions 
        WHERE amount = ? AND is_used = 0 AND tx_date >= NOW() - INTERVAL 72 HOUR
    `;
    const params = [searchAmount];

    if (pixKeyOptions.mode === 'include') {
        if (!pixKeyOptions.keys || pixKeyOptions.keys.length === 0) return null;
        query += ' AND tx_pix_key IN (?)';
        params.push(pixKeyOptions.keys);
    } else if (pixKeyOptions.mode === 'exclude') {
        if (pixKeyOptions.keys && pixKeyOptions.keys.length > 0) {
            query += ' AND tx_pix_key NOT IN (?)';
            params.push(pixKeyOptions.keys);
        }
    }

    const [candidates] = await pool.query(query, params);
    if (candidates.length === 0) return null;

    const ocrNameNormalized = normalizeNameForMatching(searchSender);
    const ocrWords = new Set(ocrNameNormalized.split(' ').filter(w => w.length > 1));

    for (const tx of candidates) {
        if (!tx.tx_payer_name) continue;
        const dbNameNormalized = normalizeNameForMatching(tx.tx_payer_name);
        
        // Vector 1: Exact Match
        if (dbNameNormalized === ocrNameNormalized) {
            console.log(`[TRKBIT-MATCH] Found via Vector 1 (Exact): ${tx.id}`);
            return tx.id;
        }

        // Vector 2: Substring Match
        if (dbNameNormalized.includes(ocrNameNormalized) || ocrNameNormalized.includes(dbNameNormalized)) {
            console.log(`[TRKBIT-MATCH] Found via Vector 2 (Substring): ${tx.id}`);
            return tx.id;
        }

        // Vector 3: Word Set Intersection
        const dbWords = new Set(dbNameNormalized.split(' ').filter(w => w.length > 1));
        const commonWordsCount = [...ocrWords].filter(word => dbWords.has(word)).length;
        const shorterWordCount = Math.min(ocrWords.size, dbWords.size);

        if (shorterWordCount > 0 && commonWordsCount / shorterWordCount >= 0.6 && commonWordsCount >= 1) {
            console.log(`[TRKBIT-MATCH] Found via Vector 3 (Word Intersection): ${tx.id}`);
            return tx.id;
        }
    }

    return null; // No suitable match found
};

// === NEW: Helper function for the smart matching logic ===
const findBestTelegramMatch = async (searchAmount, searchSender) => {
  if (!searchSender || !searchAmount) return null;
  try {
    const [foundTxs] = await pool.query(
      `SELECT id, sender_name_normalized FROM telegram_transactions WHERE amount = ? AND is_used = 0`,
      [searchAmount]
    );
    if (foundTxs.length === 0) return null;
    
    const ocrNameNormalized = normalizeNameForMatching(searchSender);
    const ocrWords = new Set(ocrNameNormalized.split(' ').filter(w => w.length > 1));

    for (const tx of foundTxs) {
      const dbNameNormalized = tx.sender_name_normalized;
      if (!dbNameNormalized) continue;

      // Vector 1: Exact Match
      if (dbNameNormalized === ocrNameNormalized) return tx.id;

      // Vector 2: Substring Match
      if (dbNameNormalized.includes(ocrNameNormalized) || ocrNameNormalized.includes(dbNameNormalized)) return tx.id;

      // Vector 3: Word Set Intersection
      const dbWords = new Set(dbNameNormalized.split(' ').filter(w => w.length > 1));
      const commonWords = new Set([...ocrWords].filter(word => dbWords.has(word)));
      
      const shorterWordCount = Math.min(ocrWords.size, dbWords.size);
      if (shorterWordCount > 0 && commonWords.size / shorterWordCount >= 0.6 && commonWords.size >= 1) {
          return tx.id;
      }
    }
    return null;
  } catch (dbError) {
    console.error("[DB-CONFIRM-ERROR] Error querying telegram_transactions table:", dbError);
    return null;
  }
};




const findBestXPayzMatch = async (searchAmount, searchSender, subaccountPool = []) => {
  // 1. Fail fast on bad input
  if (!searchSender || searchAmount === undefined || searchAmount === null) {
    return null;
  }
  
  try {
    // 2. THE ANCHOR: Strict Amount Filtering
    // We select sender_name_normalized (pre-computed) and raw sender_name (fallback)
    let query = `
        SELECT id, sender_name_normalized, sender_name 
        FROM xpayz_transactions 
        WHERE 
            is_used = 0 
            AND amount = ? 
    `;
    const params = [searchAmount];

    if (subaccountPool.length > 0) {
      query += ` AND subaccount_id IN (?)`;
      params.push(subaccountPool);
    } else {
      return null; // No accounts to check
    }
    
    // Execute SQL
    const [foundTxs] = await pool.query(query, params);
    
    // 3. Early Exit if no amount match
    if (foundTxs.length === 0) {
        return null;
    }

    // 4. THE VERIFICATION: Smart Name Matching
    const ocrNameNormalized = normalizeNameForMatching(searchSender);
    const ocrWords = new Set(ocrNameNormalized.split(' ').filter(w => w.length > 2)); // Filter tiny words

    for (const tx of foundTxs) {
        // Fallback: If DB didn't normalize on insert, normalize now
        const dbNameNormalized = tx.sender_name_normalized || normalizeNameForMatching(tx.sender_name);
        
        if (!dbNameNormalized) continue;

        // VECTOR A: Exact Match (Fastest)
        if (dbNameNormalized === ocrNameNormalized) {
            console.log(`[XPAYZ-MATCH] Found via Vector A (Exact): ${tx.id}`);
            return tx.id;
        }

        // VECTOR B: Substring Containment (Common in banking)
        // Bank: "LUIZ GUSTAVO ZINATO", OCR: "LUIZ ZINATO" -> Not substring, but...
        // Bank: "JOSE SILVA", OCR: "JOSE SILVA SANTOS" -> Substring works.
        if (dbNameNormalized.includes(ocrNameNormalized) || ocrNameNormalized.includes(dbNameNormalized)) {
            console.log(`[XPAYZ-MATCH] Found via Vector B (Substring): ${tx.id}`);
            return tx.id;
        }

        // VECTOR C: Word Intersection (The "Bag of Words" - Most Powerful)
        // Splits names into sets of words and checks overlap.
        const dbWords = new Set(dbNameNormalized.split(' ').filter(w => w.length > 2));
        
        // Find common words
        let matchCount = 0;
        for (const word of ocrWords) {
            if (dbWords.has(word)) matchCount++;
        }

        // SCORING LOGIC:
        // If we matched at least 2 unique words OR (1 word if total words is small)
        const totalSignificantWords = Math.min(ocrWords.size, dbWords.size);
        
        // Match if:
        // 1. More than 60% of the significant words match
        // 2. AND we matched at least 1 word
        if (totalSignificantWords > 0 && (matchCount / totalSignificantWords) >= 0.6 && matchCount >= 1) {
             console.log(`[XPAYZ-MATCH] Found via Vector C (Intersection): ${tx.id} (${matchCount}/${totalSignificantWords} words)`);
             return tx.id;
        }
    }

    // No name match found among amount candidates
    return null;

  } catch (dbError) {
    console.error("[DB-CONFIRM-ERROR] Critical error in XPayz match:", dbError);
    return null;
  }
};


const findBestWalletMatch = (ocrAddress, ourWallets) => {
    if (!ocrAddress || ourWallets.length === 0) {
        return null;
    }

    const ocrLower = ocrAddress.toLowerCase();
    const matches = [];

    for (const wallet of ourWallets) {
        const walletLower = wallet.toLowerCase();

        // Tier 1: Exact match (highest confidence)
        if (ocrLower === walletLower) {
            return wallet; // Return immediately on perfect match
        }

        // Tier 2: Starts with and Ends with (high confidence for trimmed addresses)
        if (ocrLower.includes('...') && 
            walletLower.startsWith(ocrLower.split('...')[0]) && 
            walletLower.endsWith(ocrLower.split('...')[1])) {
            matches.push(wallet);
            continue; 
        }

        // Tier 3: Contains (medium confidence)
        if (walletLower.includes(ocrLower)) {
            matches.push(wallet);
        }
    }

    // Return a match only if it is unique to prevent ambiguity
    if (matches.length === 1) {
        return matches[0];
    }

    // If no matches or multiple ambiguous matches, return null
    return null;
};


const findBestUsdtMatch = async (searchAmount, recipientAddress) => {
    if (!searchAmount || !recipientAddress) {
        return null;
    }
    try {
        const query = `
            SELECT id FROM usdt_transactions
            WHERE to_address = ? 
            AND amount_usdt = ? 
            AND is_used = 0 
            LIMIT 1;
        `;
        const [[match]] = await pool.query(query, [recipientAddress, searchAmount]);
        return match ? match.id : null;
    } catch (dbError) {
        console.error("[DB-CONFIRM-ERROR] Error querying usdt_transactions table:", dbError);
        return null;
    }
};



const sendManualConfirmation = async (originalMessageId) => {
    try {
        const originalMessage = await client.getMessageById(originalMessageId);
        if (originalMessage) {
            await originalMessage.reply("Caiu");
            await originalMessage.react("🟢");
        }

        // Also find the forwarded message in the manual group and react 👍 to indicate it's done
        const [[link]] = await pool.query(
            'SELECT forwarded_message_id, destination_group_jid FROM forwarded_invoices WHERE original_message_id = ?', 
            [originalMessageId]
        );
        
        if (link) {
             // Try to react to the forwarded message
             try {
                 // We need to reconstruct the message object or use the WWebJS react method if available on client (it isn't usually directly on client)
                 // Standard way: Fetch msg -> react.
                 const forwardedMsg = await client.getMessageById(link.forwarded_message_id);
                 if (forwardedMsg) await forwardedMsg.react("👍");
             } catch (e) { console.warn("[MANUAL-API] Could not react to forwarded message:", e.message); }
        }

        console.log(`[MANUAL-API] Confirmed invoice ${originalMessageId}`);
    } catch (error) {
        console.error(`[MANUAL-API-ERROR] Failed to send confirmation for ${originalMessageId}:`, error);
        throw error;
    }
};

// === NEW: Helper to trigger rejection actions programmatically ===
const sendManualRejection = async (originalMessageId) => {
    try {
        const originalMessage = await client.getMessageById(originalMessageId);
        
        // Delete media file if exists
        const [[invoice]] = await pool.query('SELECT media_path FROM invoices WHERE message_id = ?', [originalMessageId]);
        if (invoice && invoice.media_path && fsSync.existsSync(invoice.media_path)) {
            await fs.unlink(invoice.media_path);
        }

        if (originalMessage) {
            await originalMessage.reply("no caiu");
            await originalMessage.react("🔴");
        }
        
        // Mark forwarded message (optional visual cue)
        const [[link]] = await pool.query('SELECT forwarded_message_id FROM forwarded_invoices WHERE original_message_id = ?', [originalMessageId]);
        if (link) {
            try {
                const forwardedMsg = await client.getMessageById(link.forwarded_message_id);
                if (forwardedMsg) await forwardedMsg.react("❌");
            } catch (e) {}
        }

        console.log(`[MANUAL-API] Rejected invoice ${originalMessageId}`);
    } catch (error) {
        console.error(`[MANUAL-API-ERROR] Failed to send rejection for ${originalMessageId}:`, error);
        throw error;
    }
};


let isTrkbitConfirmationEnabled = false;
const refreshTrkbitConfirmationStatus = async () => {
  try {
    const [[setting]] = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'trkbit_confirmation_enabled'"
    );
    isTrkbitConfirmationEnabled = setting
      ? setting.setting_value === "true"
      : false;
    console.log(
      `[SETTINGS] Trkbit Confirmation is now ${
        isTrkbitConfirmationEnabled ? "ENABLED" : "DISABLED"
      }.`
    );
  } catch (error) {
    console.error("[SETTINGS-ERROR] Failed to refresh Trkbit status:", error);
    isTrkbitConfirmationEnabled = false;
  }
};


const invoiceWorker = new Worker(
  "invoice-processing-queue",
  async (job) => {
    const { execa } = await import("execa");
    if (!client || connectionStatus !== "connected") {
      throw new Error("WhatsApp client is not connected. Job will be retried.");
    }
    const { messageId, isUsdtLink, txId } = job.data;
    const originalMessage = await client.getMessageById(messageId);
    if (!originalMessage) {
      console.warn(`[WORKER] Could not find message by ID ${messageId}.`);
      return;
    }

    // ============================================================
    // USDT LINK PROCESSING
    // ============================================================
    if (isUsdtLink && txId) {
      try {
        const [[existing]] = await pool.query(
          "SELECT id, is_used FROM usdt_transactions WHERE txid = ?",
          [txId]
        );
        if (existing && existing.is_used) {
          await originalMessage.reply("❌Repeated❌");
          await originalMessage.react("❌");
          return;
        }

        const result = await usdtLinkService.processLink(txId);
        if (!result.success) {
          await originalMessage.reply("⚠️ Failed to load transaction details.");
          await originalMessage.react("");
          return;
        }

        const media = new MessageMedia(
          "image/png",
          result.screenshot.toString("base64"),
          "tx_details.png"
        );
        await originalMessage.reply(media);

        let isConfirmed = false;
        const [walletRows] = await pool.query(
          "SELECT wallet_address FROM usdt_wallets WHERE is_enabled = 1"
        );
        const myWallets = new Set(walletRows.map((w) => w.wallet_address));
        const foundAddresses = result.data.toAddresses || [];
        const match = foundAddresses.find((addr) => myWallets.has(addr));

        if (match) {
          isConfirmed = true;
        } else if (existing) {
          const [[dbCheck]] = await pool.query(
            "SELECT to_address FROM usdt_transactions WHERE txid = ?",
            [txId]
          );
          if (dbCheck && myWallets.has(dbCheck.to_address)) {
            isConfirmed = true;
          }
        }

        if (isConfirmed) {
          // Atomic Insert/Update
          await pool.query(
            `INSERT INTO usdt_transactions 
                    (txid, time_iso, from_address, to_address, amount_usdt, is_used, created_at) 
                    VALUES (?, ?, ?, ?, ?, 1, NOW()) 
                    ON DUPLICATE KEY UPDATE is_used = 1`,
            [
              txId,
              result.data.time,
              result.data.fromAddress,
              result.data.toAddresses[0] || "unknown",
              result.data.amount,
            ]
          );
          await originalMessage.reply("Informed ✅");
          await originalMessage.react("🟢");
        } else {
          await originalMessage.react("📤");
        }
      } catch (err) {
        console.error("[WORKER-LINK-ERROR]", err);
        await originalMessage.react("");
      }
      return;
    }

    const chat = await originalMessage.getChat();
    const tempFilePaths = [];

    try {
      const media = await originalMessage.downloadMedia();
      if (!media) return;

      const cleanMimeType = media.mimetype.split(";")[0];
      const extension = cleanMimeType.split("/")[1] || "bin";
      const tempFilePath = path.join(os.tmpdir(), `${originalMessage.id.id}.${extension}`);
      tempFilePaths.push(tempFilePath);
      await fs.writeFile(tempFilePath, Buffer.from(media.data, "base64"));

      const { stdout } = await execa('python', [path.join(__dirname, "..", "python_scripts", "main.py"), tempFilePath]);
      const invoiceJson = JSON.parse(stdout);

      const { amount, sender, recipient, transaction_id } = invoiceJson;
      if (!amount || (!recipient?.name && !recipient?.pix_key)) {
        await originalMessage.react("");
        return;
      }

      const recipientNameLower = (recipient.name || "").toLowerCase();

      if (
        recipientNameLower.includes("troca") ||
        recipientNameLower.includes("mks") ||
        recipientNameLower.includes("alfa trust") ||
        recipientNameLower.includes("trkbit") ||
        recipientNameLower.includes("upgrade zone") ||
        recipientNameLower.includes("usdt_recipient") ||
        recipientNameLower.includes("cross")
      ) {
        if (transaction_id && transaction_id.trim() !== "" && amount) {
          const trimmedTransactionId = transaction_id.trim();
          const [[existingById]] = await pool.query(
            "SELECT source_group_jid, message_id FROM invoices WHERE transaction_id = ? AND amount = ? AND is_deleted = 0 LIMIT 1",
            [trimmedTransactionId, amount]
          );

          if (existingById) {
            const currentSourceJid = chat.id._serialized;
            if (currentSourceJid === existingById.source_group_jid) {
              await originalMessage.reply("❌Repeated❌");
              try {
                const oldMessage = await client.getMessageById(
                  existingById.message_id
                );
                if (oldMessage) await oldMessage.reply("Original here 👈");
              } catch (e) {
                console.warn(
                  `[DUPLICATE] Could not reply to original:`,
                  e.message
                );
              }
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
      
      // === NEW: Variables to hold link data ===
      let linkedTransactionId = null;
      let linkedTransactionSource = null;
      // =======================================

      // --- 1. TRKBIT / CROSS (Atomic Update with NEW LOGIC) ---
      // --- START OF CORRECTED TRKBIT/CROSS LOGIC ---
      if (runStandardForwarding && isTrkbitConfirmationEnabled && (recipientNameLower.includes("trkbit") || recipientNameLower.includes("cross"))) {
        console.log('[WORKER] "Cross/Trkbit" recipient detected. Applying 3-vector confirmation logic...');
        const searchAmount = parseFormattedCurrency(amount);
        const searchSender = sender.name;
        const sourceGroupJid = chat.id._serialized;

        const [[assignedSubaccount]] = await pool.query(
          "SELECT chave_pix FROM subaccounts WHERE account_type = 'cross' AND assigned_group_jid = ? LIMIT 1",
          [sourceGroupJid]
        );

        let confirmedTxId = null;

        if (assignedSubaccount) {
            const expectedPixKey = assignedSubaccount.chave_pix;
            console.log(`[CROSS-CONFIRM] Path A: Group is assigned to PIX Key: ${expectedPixKey}`);

            confirmedTxId = await findBestTrkbitMatch(searchAmount, searchSender, { mode: 'include', keys: [expectedPixKey] });

            if (!confirmedTxId) {
                const [[mismatchCheck]] = await pool.query(
                    `SELECT id FROM trkbit_transactions WHERE amount = ? AND tx_payer_name = ? AND is_used = 0 LIMIT 1`,
                    [searchAmount, searchSender]
                );
                if (mismatchCheck) {
                    await originalMessage.reply("❌ Wrong PIX ❌");
                    wasActioned = true; 
                }
            }
        } 
        else {
            console.log(`[CROSS-CONFIRM] Path B: Group is unassigned. Searching in the public pool.`);
            const [assignedPixRows] = await pool.query(
                "SELECT chave_pix FROM subaccounts WHERE account_type = 'cross' AND assigned_group_jid IS NOT NULL AND assigned_group_jid != ''"
            );
            const exclusionList = assignedPixRows.map(r => r.chave_pix);

            confirmedTxId = await findBestTrkbitMatch(searchAmount, searchSender, { mode: 'exclude', keys: exclusionList });
            
            if (!confirmedTxId && exclusionList.length > 0) {
                const [[mismatchCheck]] = await pool.query(
                    `SELECT id FROM trkbit_transactions WHERE amount = ? AND tx_payer_name = ? AND tx_pix_key IN (?) AND is_used = 0 LIMIT 1`,
                    [searchAmount, searchSender, exclusionList]
                );
                if (mismatchCheck) {
                    await originalMessage.reply("❌ Wrong PIX ❌");
                    wasActioned = true;
                }
            }
        }
        
        if (confirmedTxId) {
            const [updateResult] = await pool.query(
                'UPDATE trkbit_transactions SET is_used = 1 WHERE id = ? AND is_used = 0', 
                [confirmedTxId]
            );

            if (updateResult.affectedRows > 0) {
                const [[{ uid }]] = await pool.query('SELECT uid FROM trkbit_transactions WHERE id = ?', [confirmedTxId]);
                linkedTransactionId = uid;
                linkedTransactionSource = 'Trkbit';
                await originalMessage.reply("Caiu");
                await originalMessage.react("🟢");
                wasActioned = true;

                // --- START: INFORMATIVE FORWARDING ON SUCCESS ---
                try {
                    const [[subaccount]] = await pool.query(
                        'SELECT account_type FROM subaccounts WHERE assigned_group_jid = ? LIMIT 1',
                        [chat.id._serialized]
                    );

                    if (subaccount && subaccount.account_type === 'cross') {
                        console.log(`[WORKER] Source group is a 'cross' subaccount. Skipping informative forward.`);
                    } else {
                        let destJid = null;
                        const [[directRule]] = await pool.query(
                            "SELECT destination_group_jid FROM direct_forwarding_rules WHERE source_group_jid = ?", 
                            [chat.id._serialized]
                        );
                        
                        if (directRule) {
                            destJid = directRule.destination_group_jid;
                        } else {
                            const [rules] = await pool.query("SELECT trigger_keyword, destination_group_jid FROM forwarding_rules WHERE is_enabled = 1");
                            for (const rule of rules) {
                                if (recipientNameLower.includes(rule.trigger_keyword.toLowerCase())) {
                                    destJid = rule.destination_group_jid;
                                    break;
                                }
                            }
                        }

                        if (destJid) {
                            const numberRegex = /\b(\d[\d-]{2,})\b/g;
                            const matches = chat.name.match(numberRegex);
                            const captionLabel = (matches && matches.length > 0) ? matches[matches.length - 1] : chat.name;
                            const finalCaption = `${captionLabel} ✅`;

                            const mediaToForward = new MessageMedia(media.mimetype, media.data, media.filename);
                            await client.sendMessage(destJid, mediaToForward, { caption: finalCaption });
                            console.log(`[TRKBIT-INFO] Informative forward sent to ${destJid}`);
                        }
                    }
                } catch (infoError) {
                    console.error('[TRKBIT-INFO-ERROR] Failed to send informative forward:', infoError);
                }
                // --- END: INFORMATIVE FORWARDING ON SUCCESS ---

            } else {
                wasActioned = 'duplicate';
            }
        }

        if (wasActioned) {
          runStandardForwarding = false;
        }
      }

      // --- 2. USDT (Atomic Update) ---
      if (recipientNameLower.includes("usdt_recipient")) {
        console.log('[WORKER] "USDT" type detected.');
        const ocrRecipientWallet = recipient ? recipient.wallet_address : null;
        const [wallets] = await pool.query(
          "SELECT wallet_address FROM usdt_wallets WHERE is_enabled = 1"
        );
        const ourWallets = wallets.map((w) => w.wallet_address);
        const matchedWallet = findBestWalletMatch(
          ocrRecipientWallet,
          ourWallets
        );

        if (matchedWallet) {
          console.log(`[USDT-WORKER] Detected INCOMING transaction.`);
          const expectedAmount = parseFloat(amount);
          const matchId = await findBestUsdtMatch(
            expectedAmount,
            matchedWallet
          );

          if (matchId) {
            // === ATOMIC UPDATE ===
            const [updateResult] = await pool.query("UPDATE usdt_transactions SET is_used = 1 WHERE id = ? AND is_used = 0", [matchId]);

            if (updateResult.affectedRows > 0) {
              linkedTransactionId = matchId; // <-- Capture Link Info
              linkedTransactionSource = 'USDT'; // <-- Capture Link Info
              await originalMessage.reply(`Informed ✅`);
              await originalMessage.react("🟢");
              wasActioned = true;
              runStandardForwarding = false;
            } else {
              await originalMessage.reply("❌Repeated❌");
              await originalMessage.react("❌");
              wasActioned = 'duplicate';
              runStandardForwarding = false;
            }
          } else {
            console.log(
              "[USDT-WORKER] No local match found. Falling back to manual forwarding."
            );
          }
        } else {
          await originalMessage.react("📤");
          wasActioned = true;
          runStandardForwarding = false;
        }
      }

      // --- 3. UPGRADE ZONE (XPAYZ) (Atomic Update) ---
      if (
        runStandardForwarding &&
        recipientNameLower.includes("upgrade zone")
      ) {
        const sourceGroupJid = chat.id._serialized;
        const searchAmount = parseFloat(amount.replace(/,/g, ""));
        const [[assignmentRule]] = await pool.query(
          "SELECT subaccount_number, name FROM subaccounts WHERE assigned_group_jid = ?",
          [sourceGroupJid]
        );

        let targetPool = [];
        let isAssigned = false;

        if (assignmentRule) {
          targetPool.push(assignmentRule.subaccount_number);
          isAssigned = true;
        } else {
          const [unassigned] = await pool.query(
            "SELECT subaccount_number FROM subaccounts WHERE assigned_group_jid IS NULL"
          );
          targetPool = unassigned.map((acc) => acc.subaccount_number);
        }

        let matchId = await findBestXPayzMatch(
          searchAmount,
          sender.name,
          targetPool
        );

        if (!matchId) {
          console.log(`[WORKER][JIT-SYNC] No initial match. Syncing...`);
          for (const subId of targetPool) {
            await syncSingleSubaccount(subId);
          }

          const POLLING_ATTEMPTS = 4;
          for (let i = 1; i <= POLLING_ATTEMPTS; i++) {
            await delay(5000);
            matchId = await findBestXPayzMatch(
              searchAmount,
              sender.name,
              targetPool
            );
            if (matchId) break;
          }
        }

        if (matchId) {
          // === ATOMIC UPDATE ===
          const [updateResult] = await pool.query("UPDATE xpayz_transactions SET is_used = 1 WHERE id = ? AND is_used = 0", [matchId]);

          if (updateResult.affectedRows > 0) {
            linkedTransactionId = matchId; // <-- Capture Link Info
            linkedTransactionSource = 'XPayz'; // <-- Capture Link Info
            await originalMessage.reply("Caiu");
            await originalMessage.react("🟢");
            wasActioned = true;
            runStandardForwarding = false;
          } else {
            await originalMessage.reply("❌Repeated❌");
            await originalMessage.react("❌");
            wasActioned = 'duplicate';
            runStandardForwarding = false;
          }
        } else if (isAssigned) {
          // Escalation Logic
          const [[escalationRule]] = await pool.query(
            "SELECT destination_group_jid FROM forwarding_rules WHERE trigger_keyword = 'upgrade zone' AND is_enabled = 1"
          );
          if (escalationRule) {
            const numberRegex = /\b(\d[\d-]{2,})\b/g;
            const matches = chat.name.match(numberRegex);
            const clientIdentifier =
              matches && matches.length > 0
                ? matches[matches.length - 1]
                : chat.name;
            const richCaption = `${clientIdentifier}\u200C (Chave: ${assignmentRule.name})`;
            const mediaToForward = new MessageMedia(
              media.mimetype,
              media.data,
              media.filename
            );
            const forwardedMessage = await client.sendMessage(
              escalationRule.destination_group_jid,
              mediaToForward,
              { caption: richCaption }
            );
            await pool.query(
              `INSERT INTO forwarded_invoices (original_message_id, forwarded_message_id, destination_group_jid) VALUES (?, ?, ?)`,
              [
                messageId,
                forwardedMessage.id._serialized,
                escalationRule.destination_group_jid,
              ]
            );
            await originalMessage.react("🟡");
            wasActioned = true;
            runStandardForwarding = false;
          }
        }
      }

      // --- 4. TROCA COIN / MKS (Atomic Update) ---
      if (
        runStandardForwarding &&
        (recipientNameLower.includes("troca") ||
          recipientNameLower.includes("mks"))
      ) {
        let matchId = null;
        let updateTable = "";
        let sourceName = "";

        if (trocaCoinConfirmationMethod === "telegram") {
          matchId = await findBestTelegramMatch(
            parseFloat(amount.replace(/,/g, "")),
            sender.name
          );
          updateTable = "telegram_transactions";
        } else if (trocaCoinConfirmationMethod === "xpayz") {
          updateTable = "xpayz_transactions";
          const [unassigned] = await pool.query(
            "SELECT subaccount_number FROM subaccounts WHERE assigned_group_jid IS NULL"
          );
          const poolIds = unassigned.map((acc) => acc.subaccount_number);
          const searchAmt = parseFloat(amount.replace(/,/g, ""));

          matchId = await findBestXPayzMatch(searchAmt, sender.name, poolIds);
          if (!matchId && poolIds.length > 0) {
            for (const subId of poolIds) {
              await syncSingleSubaccount(subId);
            }
            await delay(2000);
            matchId = await findBestXPayzMatch(searchAmt, sender.name, poolIds);
          }
        }

        if (matchId) {
          // === ATOMIC UPDATE ===
          const [updateResult] = await pool.query(`UPDATE ${updateTable} SET is_used = 1 WHERE id = ? AND is_used = 0`, [matchId]);

          if (updateResult.affectedRows > 0) {
            linkedTransactionId = matchId; // <-- Capture Link Info
            linkedTransactionSource = sourceName; // <-- Capture Link Info
            await originalMessage.reply("Caiu");
            await originalMessage.react("🟢");
            wasActioned = true;
            runStandardForwarding = false;
          } else {
            await originalMessage.reply("❌Repeated❌");
            await originalMessage.react("❌");
            wasActioned = 'duplicate';
            runStandardForwarding = false;
          }
        }
      }

      // --- 5. ALFA TRUST (HARD REJECT) ---
      if (
        runStandardForwarding &&
        isAlfaApiConfirmationEnabled &&
        recipientNameLower.includes("alfa trust")
      ) {
        await originalMessage.reply("no caiu");
        await originalMessage.react("❌");
        wasActioned = true;
        runStandardForwarding = false;
      }
      
      // --- 6. MANUAL FORWARDING ---
      if (runStandardForwarding) {
        const [settings] = await pool.query(
          "SELECT * FROM group_settings WHERE group_jid = ?",
          [chat.id._serialized]
        );
        const groupSettings = settings[0] || { forwarding_enabled: true };

        if (groupSettings.forwarding_enabled) {
          let forwarded = false;
          const [[directRule]] = await pool.query(
            "SELECT destination_group_jid, destination_group_name FROM direct_forwarding_rules WHERE source_group_jid = ?",
            [chat.id._serialized]
          );

          if (directRule) {
            const mediaToForward = new MessageMedia(
              media.mimetype,
              media.data,
              media.filename
            );
            let caption = "\u200C";
            const numberRegex = /\b(\d[\d-]{2,})\b/g;
            const matches = chat.name.match(numberRegex);
            if (matches && matches.length > 0)
              caption = matches[matches.length - 1];

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
              await originalMessage.react("🟡");
            }
          }

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
                if (
                  recipientNameToCheck.includes(
                    rule.trigger_keyword.toLowerCase()
                  ) ||
                  pixKeyToCheck.includes(rule.trigger_keyword.toLowerCase())
                ) {
                  const mediaToForward = new MessageMedia(
                    media.mimetype,
                    media.data,
                    media.filename
                  );
                  let caption = "\u200C";
                  const numberRegex = /\b(\d[\d-]{2,})\b/g;
                  const matches = chat.name.match(numberRegex);
                  if (matches && matches.length > 0)
                    caption = matches[matches.length - 1];

                  const forwardedMessage = await client.sendMessage(
                    rule.destination_group_jid,
                    mediaToForward,
                    { caption: caption }
                  );

                  if (rule.reply_with_group_name) {
                    const destName = rule.destination_group_name || "";
                    let replyText = destName;
                    const numberRegex = /\b(\d[\d-]{2,})\b/g;
                    const matches = destName.match(numberRegex);
                    if (matches && matches.length > 0) {
                      replyText = matches[matches.length - 1];
                    }
                    await originalMessage.reply("⏩ " + replyText);
                  }

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
                    await originalMessage.react("🟡");
                  }
                  break;
                }
              }
            }
          }
        }
      }

      // --- 7. ARCHIVING (Modified to include link data) ---
      const [archiveSettings] = await pool.query("SELECT archiving_enabled FROM group_settings WHERE group_jid = ?", [chat.id._serialized]);
      const groupArchiveSettings = archiveSettings[0] || { archiving_enabled: true };
      
      if (groupArchiveSettings.archiving_enabled) {
        const archiveFileName = `${messageId}.${extension}`;
        const finalMediaPath = path.join(MEDIA_ARCHIVE_DIR, archiveFileName);
        // Ensure file is moved before proceeding
        if (fsSync.existsSync(tempFilePath)) {
          await fs.rename(tempFilePath, finalMediaPath);
          tempFilePaths.pop();
        }

        const correctUtcDate = new Date(originalMessage.timestamp * 1000);
        // === MODIFIED INSERT STATEMENT ===
        await pool.query(
          `INSERT INTO invoices (message_id, transaction_id, sender_name, recipient_name, pix_key, amount, source_group_jid, received_at, raw_json_data, media_path, is_deleted, linked_transaction_id, linked_transaction_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            messageId, transaction_id, sender?.name, recipient.name, recipient.pix_key,
            amount, chat.id._serialized, correctUtcDate, JSON.stringify(invoiceJson),
            finalMediaPath, false, linkedTransactionId, linkedTransactionSource
          ]
        );
        // ==================================
      }
      
      // Handle replies for duplicate state
      if (wasActioned === 'duplicate') {
        await originalMessage.reply("❌Repeated❌");
        await originalMessage.react("❌");
      }

    } catch (error) {
      console.error(`[WORKER-ERROR] Critical error processing job ${job?.id}:`, error);
      await originalMessage.react("⚠️");
      throw error;
    } finally {
      for (const tempPath of tempFilePaths) {
        if (fsSync.existsSync(tempPath)) await fs.unlink(tempPath);
      }
      if (io) io.emit("invoices:updated");
    }
  },
  { connection: redisConnection, lockDuration: 120000, concurrency: 1 }
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
      const recentMessages = await group.fetchMessages({ limit: 500 }); 
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


const queueMessageIfNotExists = async (messageId, options = {}) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // Check if message was processed before (Lock)
        const [processedRows] = await connection.query("SELECT message_id FROM processed_messages WHERE message_id = ?", [messageId]);
        const isProcessed = processedRows.length > 0;

        if (isProcessed) {
            // If it's a Force Retry, we check if it actually succeeded (is in invoices)
            if (options.forceIfMissingInvoice) {
                const [invoiceRows] = await connection.query("SELECT id FROM invoices WHERE message_id = ? AND is_deleted = 0", [messageId]);
                
                // Case A: It is in invoices table -> Already successful.
                if (invoiceRows.length > 0) {
                    console.log(`[QUEUE-SKIP] Force retry ignored for ${messageId}. Invoice already exists.`);
                    await connection.commit();
                    
                    // Try to clear the reaction to indicate "Nothing to do"
                    try {
                        const msg = await client.getMessageById(messageId);
                        if (msg) await msg.react(''); // Clears bot reaction
                    } catch (e) { /* ignore */ }
                    
                    return;
                }
                // Case B: Not in invoices -> Crashed/Failed. Proceed to queue.
                console.log(`[QUEUE-FORCE] Message ${messageId} found in processed logs but NOT in invoices. Forcing reprocessing.`);
            } else {
                // Standard case: If processed, skip.
                await connection.commit();
                return;
            }
        }

        // Add to Queue
        await invoiceQueue.add("process-invoice", { messageId, ...options }, { jobId: messageId, removeOnComplete: true, removeOnFail: 50 });
        
        await connection.query("INSERT IGNORE INTO processed_messages (message_id) VALUES (?)", [messageId]);
        await connection.commit();
        console.log(`[QUEUE-ADD] Transactionally added message to queue. ID: ${messageId} (Force: ${!!options.forceIfMissingInvoice})`);
        
        // Visual Feedback
        const originalMessage = await client.getMessageById(messageId);
        if (originalMessage) {
            // 1. Check for Media (Images/PDFs)
            if (originalMessage.hasMedia) {
                const mime = originalMessage._data?.mimetype?.toLowerCase();
                if (originalMessage.type === 'image' || (originalMessage.type === 'document' && (mime === 'application/pdf' || mime === 'application/x-pdf'))) {
                    await originalMessage.react('⏳');
                }
            } 
            // 2. Check for USDT Link Flag (Text Messages)
            else if (options.isUsdtLink) {
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

const refreshRequestTypeCache = async () => {
    try {
        console.log("[CACHE] Refreshing client request types cache...");
        const [types] = await pool.query(
            "SELECT name, trigger_regex, acknowledgement_reaction FROM request_types WHERE is_enabled = 1"
        );
        requestTypeCache = types.map(t => ({
            ...t,
            // Compile regex on load for performance
            regex: new RegExp(t.trigger_regex, 'i') 
        }));
        console.log(`[CACHE] Loaded ${requestTypeCache.length} active request types.`);
    } catch (error) {
        console.error("[CACHE-ERROR] Failed to refresh request types cache:", error);
    }
};

// === NEW: Function to clear reactions from a message ===
const clearReaction = async (messageId) => {
    try {
        if (!client || connectionStatus !== "connected") return;
        const message = await client.getMessageById(messageId);
        if (message) {
            await message.react(''); // Sending an empty string removes reactions
        }
    } catch (error) {
        console.warn(`[REACTION-CLEAR] Could not clear reaction for message ${messageId}:`, error.message);
    }
};

const handleMessage = async (message) => {
  try {
    await pool.query("INSERT IGNORE INTO raw_message_log (message_id) VALUES (?)", [message.id._serialized]);
    const chat = await message.getChat();
    if (!chat.isGroup) return;





    if (message.body) {
      // --- NEW: USDT Wallet Address Detection Logic ---
      const messageBody = message.body.trim();
      for (const rule of requestTypeCache) {
          const match = messageBody.match(rule.regex);
          // match[0] is the full match, match[1] is the first capture group
          if (match && match[1]) { 
              const capturedContent = match[1];
              console.log(`[REQUEST-DETECT] Rule "${rule.name}" triggered. Content: ${capturedContent}`);
              
              const [[ourWallet]] = await pool.query(
                  'SELECT id FROM usdt_wallets WHERE wallet_address = ?',
                  [capturedContent]
              );
              if (ourWallet) {
                  console.log(`[REQUEST-DETECT] Content is one of our own wallets. Ignoring.`);
                  await pool.query("INSERT IGNORE INTO processed_messages (message_id) VALUES (?)", [message.id._serialized]);
                  return;
              }

              await pool.query(
                  `INSERT INTO client_requests (message_id, content, request_type, source_group_jid, source_group_name, received_at) 
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON DUPLICATE KEY UPDATE content = VALUES(content)`,
                  [
                      message.id._serialized, capturedContent, rule.name,
                      chat.id._serialized, chat.name, new Date(message.timestamp * 1000)
                  ]
              );
              
              if (io) io.emit('client_request:new');
              if (rule.acknowledgement_reaction) {
                  await message.react(rule.acknowledgement_reaction);          
              }
              
              await pool.query("INSERT IGNORE INTO processed_messages (message_id) VALUES (?)", [message.id._serialized]);
              return; // Stop processing after the first match
          }
      }


      //usdt link detection
      const tronScanRegex = /https?:\/\/(?:www\.)?tronscan\.org\/#\/transaction\/([a-fA-F0-9]+)/;
      const linkMatch = message.body.match(tronScanRegex);
      
      if (linkMatch) {
          const txId = linkMatch[1];
          console.log(`[MSG] Detected TronScan Link for TX: ${txId}`);
          await queueMessageIfNotExists(message.id._serialized, { isUsdtLink: true, txId });
          return;
      }
      //abbreviation detection
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
  const reactedMessageId = reaction.msgId._serialized;
  const reactionEmoji = reaction.reaction;

  // --- 0. Delete Message for Everyone (Wastebasket) ---
  if (reactionEmoji === '🗑' || reactionEmoji === '🗑️') {
      try {
          const msg = await client.getMessageById(reactedMessageId);
          // Only allow deleting the bot's own messages to ensure "delete for everyone" works consistently
          if (msg && msg.fromMe) {
              await msg.delete(true); // true = Delete for everyone
              console.log(`[REACTION-DELETE] Deleted message ${reactedMessageId} for everyone.`);
          } else {
              console.log(`[REACTION-DELETE] Ignored delete request on message ${reactedMessageId} (Not from me).`);
          }
      } catch (e) {
          console.error(`[REACTION-DELETE-ERROR] Could not delete message:`, e.message);
      }
      return; // Stop further processing
  }

  // --- 1. Blue Circle Manual Override ---
  if (reactionEmoji === '🔵') {
      console.log(`[MANUAL-OVERRIDE] Blue circle detected on ${reactedMessageId}.`);
      try {
          const msg = await client.getMessageById(reactedMessageId);
          if (msg && msg.hasMedia) {
              // Pass flag to check invoices table before re-queueing
              await queueMessageIfNotExists(reactedMessageId, { forceIfMissingInvoice: true });
          }
      } catch (e) {
          console.error(`[MANUAL-OVERRIDE-ERROR]`, e);
      }
      return; // Stop processing here
  }

  // --- 2. Standard Auto-Confirmation Logic ---
  if (!isAutoConfirmationEnabled) {
    return;
  }

  try {
    const [[link]] = await pool.query(
      'SELECT original_message_id, is_confirmed FROM forwarded_invoices WHERE forwarded_message_id = ?',
      [reactedMessageId]
    );

    if (!link || link.is_confirmed !== 0) {
      return;
    }

    const [[invoiceDetails]] = await pool.query(
        'SELECT raw_json_data FROM invoices WHERE message_id = ?',
        [link.original_message_id]
    );

    let isUsdt = false;
    if (invoiceDetails && invoiceDetails.raw_json_data) {
        try {
            const jsonData = (typeof invoiceDetails.raw_json_data === 'string')
                ? JSON.parse(invoiceDetails.raw_json_data)
                : invoiceDetails.raw_json_data;

            if (jsonData.type === 'USDT' || jsonData.currency === 'USDT') {
                isUsdt = true;
            }
        } catch (e) {
            console.warn(`[REACTION] Could not parse raw_json_data for message ${link.original_message_id}`);
        }
    }
    
    const confirmMessage = isUsdt ? "Informed" : "Caiu";
    const rejectMessage = isUsdt ? "not informed" : "no caiu";

    if (reactionEmoji === '👍' || reactionEmoji === '✅') {
      const originalMessage = await client.getMessageById(link.original_message_id);
      if (originalMessage) {
        await originalMessage.reply(confirmMessage);
        await originalMessage.react(''); 
        await originalMessage.react('🟢');
        
        await pool.query(
          'UPDATE forwarded_invoices SET is_confirmed = 1 WHERE forwarded_message_id = ?',
          [reactedMessageId]
        );
        console.log(`[REACTION] Successfully processed '${confirmMessage}' confirmation for ${link.original_message_id}`);
        if (io) io.emit('manual:refresh');
      }
    }
    
    else if (reactionEmoji === '❌') {
      const originalMessage = await client.getMessageById(link.original_message_id);
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [[invoiceToDelete]] = await connection.query(
          'SELECT id, media_path FROM invoices WHERE message_id = ?',
          [link.original_message_id]
        );

        if (invoiceToDelete) {
          await connection.query('Update invoices SET is_deleted=1 WHERE id = ?', [invoiceToDelete.id]);
          if (invoiceToDelete.media_path && fsSync.existsSync(invoiceToDelete.media_path)) {
            await fs.unlink(invoiceToDelete.media_path);
          }
        }
        
        await connection.query(
          'UPDATE forwarded_invoices SET is_confirmed = 2 WHERE forwarded_message_id = ?',
          [reactedMessageId]
        );
        
        await connection.commit();

        if (originalMessage) {
          await originalMessage.reply(rejectMessage);
          await originalMessage.react("");
          await originalMessage.react("🔴");
        }
        
        if (io) {
          io.emit("invoices:updated");
          io.emit("manual:refresh");
        }
        console.log(`[REACTION-DELETE] Successfully processed '${rejectMessage}' deletion for ${link.original_message_id}`);
        
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
      refreshRequestTypeCache();
      refreshAbbreviationCache();
      refreshTrkbitConfirmationStatus();
      refreshAutoConfirmationStatus();

      console.log('[STARTUP] Clearing any old/stale jobs from the queue...');
      await invoiceQueue.obliterate({ force: true });
      console.log('[STARTUP] Job queue cleared.');

      cron.schedule("*/5 * * * *", reconcileStalledJobs); 
      console.log("[STALLED-RECONCILER] Stalled job reconciler scheduled to run every 5 minutes.");

      cron.schedule("*/15 * * * *", reconcileDeletedMessages);
      console.log("[DELETE-RECONCILER] Proactive deletion-checking reconciler scheduled to run every 15 minutes.");


      console.log("[RECONCILER] Scheduling a check for missed messages in 90 seconds...");
      setTimeout(() => {
          console.log("[RECONCILER] Starting post-connection check for missed messages.");
          reconcileMissedMessages();
      }, 90000); // 90-second delay

      // This part for clearing the queue should only run on initial startup, not every reconnect.
      // We can check if the cron jobs are already scheduled as a proxy for this.
      if (!cron.getTasks().length) {
          console.log('[STARTUP] First time startup detected. Clearing any old/stale jobs from the queue...');
          await invoiceQueue.obliterate({ force: true });
          console.log('[STARTUP] Job queue cleared.');
      }
      
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

const broadcast = async (socketIo, socketId, groupObjects, message, attachment = null) => {
  // This function is now perfect. It accepts the `io` instance as its first argument.
  // The scheduler will pass the main `io` object, and the API controller will pass `req.io`.
  const localIo = socketIo || io; // Use passed io, fallback to module-level
  if (!localIo) {
      console.error("[BROADCAST] IO object is not available.");
      return;
  }

  if (connectionStatus !== "connected") {
      if(socketId) localIo.to(socketId).emit("broadcast:error", { message: "WhatsApp is not connected." });
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
      if (attachment && attachment.filepath) {
          const media = MessageMedia.fromFilePath(attachment.filepath);
          await client.sendMessage(group.id, media, { caption: message || '' });
      } else {
          await client.sendMessage(group.id, message);
      }
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
  refreshRequestTypeCache,
  refreshAbbreviationCache,
  refreshAutoConfirmationStatus,
  refreshAlfaApiConfirmationStatus,
  refreshTrocaCoinStatus,
  refreshTrocaCoinMethod,
  refreshTrkbitConfirmationStatus,
  sendManualConfirmation,
  sendManualRejection,
  clearReaction
};