const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs/promises');
const pool = require('../config/db');
const path = require('path');
const execa = require('execa');
const os = require('os');
const dotenv = require('dotenv');
const { Queue, Worker } = require('bullmq');
const cron = require('node-cron');

let client;
let qrCodeData;
let connectionStatus = 'disconnected';
let abbreviationCache = [];

// --- PERSISTENT QUEUE SETUP ---
const redisConnection = { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
const invoiceQueue = new Queue('invoice-processing-queue', { connection: redisConnection });

// --- THE WORKER THAT PROCESSES JOBS FROM THE QUEUE ---
const invoiceWorker = new Worker('invoice-processing-queue', async (job) => {
    // We need the client to be available to re-hydrate the message
    if (!client || connectionStatus !== 'connected') {
        throw new Error("WhatsApp client is not connected. Job will be retried.");
    }
    
    const { messageId } = job.data;
    console.log(`[WORKER] Started processing job ${job.id} for message ID: ${messageId}`);

    // Fetch the full message object using its ID.
    const message = await client.getMessageById(messageId);
    if (!message) {
        console.warn(`[WORKER] Message with ID ${messageId} could not be found or was deleted. Acknowledging job as complete.`);
        return; // Return successfully to remove job from queue.
    }

    try {
        const chat = await message.getChat();
        
        const [settings] = await pool.query('SELECT * FROM group_settings WHERE group_jid = ?', [chat.id._serialized]);
        const groupSettings = settings[0] || { forwarding_enabled: true, archiving_enabled: true };

        if (!groupSettings.forwarding_enabled && !groupSettings.archiving_enabled) {
            console.log(`[WORKER] Ignoring job ${job.id} from disabled group: ${chat.name}`);
            return;
        }

        const media = await message.downloadMedia();
        if (!media || !['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(media.mimetype)) {
            console.log(`[WORKER] Ignoring job ${job.id} with unsupported media type.`);
            return;
        }

        console.log(`[WORKER] Processing media from group: ${chat.name}`);
        const tempFilePath = `/tmp/${message.id.id}.${media.mimetype.split('/')[1] || 'bin'}`;
        await fs.writeFile(tempFilePath, Buffer.from(media.data, 'base64'));
        
        const pythonScriptsDir = path.join(__dirname, '..', 'python_scripts');
        const pythonExecutablePath = path.join(pythonScriptsDir, 'venv', 'bin', 'python3');
        const pythonScriptPath = path.join(pythonScriptsDir, 'main.py');
        
        const pythonEnvPath = path.join(pythonScriptsDir, '.env');
        const pythonEnv = dotenv.config({ path: pythonEnvPath }).parsed;

        if (!pythonEnv || !pythonEnv.GOOGLE_API_KEY) {
            throw new Error('Could not load GOOGLE_API_KEY from python_scripts/.env file.');
        }
        
        let invoiceJson;
        try {
            const { stdout } = await execa(pythonExecutablePath, [pythonScriptPath, tempFilePath], { cwd: pythonScriptsDir, env: pythonEnv });
            invoiceJson = JSON.parse(stdout);
            console.log(`[WORKER] Python script success for job ${job.id}. Transaction ID: ${invoiceJson.transaction_id}`);
        } catch (pythonError) {
            console.error(`[WORKER-PYTHON-ERROR] Script failed for job ${job.id}. Stderr:`, pythonError.stderr);
            await fs.unlink(tempFilePath);
            throw pythonError;
        }
        
        await fs.unlink(tempFilePath);
        const invoiceIdentifier = invoiceJson.transaction_id;

        if (!invoiceIdentifier) {
             console.log(`[WORKER-INFO] Python script returned no valid transaction_id for job ${job.id}.`);
             return;
        }
        
        if (groupSettings.archiving_enabled) {
            const { amount, sender, recipient } = invoiceJson;
            if (amount && sender?.name && recipient?.name) {
                const receivedAt = new Date(message.timestamp * 1000);
                const adjustedDate = new Date(receivedAt.getTime() - (2 * 60 * 60 * 1000));
                
                await pool.query(
                   `INSERT INTO invoices (message_id, transaction_id, sender_name, recipient_name, pix_key, amount, source_group_jid, received_at, raw_json_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                   [message.id._serialized, invoiceIdentifier, sender.name, recipient.name, recipient.pix_key, amount, chat.id._serialized, adjustedDate, JSON.stringify(invoiceJson)]
                );
                console.log(`[WORKER] Invoice ${invoiceIdentifier} from job ${job.id} saved to DB.`);
            }
        }
        
        if (groupSettings.forwarding_enabled) {
            const recipientName = invoiceJson.recipient?.name?.toLowerCase() || '';
            if (recipientName) {
                const [rules] = await pool.query('SELECT * FROM forwarding_rules');
                for (const rule of rules) {
                    if (recipientName.includes(rule.trigger_keyword.toLowerCase())) {
                        const mediaToForward = new MessageMedia(media.mimetype, media.data, media.filename);
                        await client.sendMessage(rule.destination_group_jid, mediaToForward, { caption: `Invoice from: ${chat.name}\nID: ${invoiceIdentifier}` });
                        console.log(`[WORKER] Forwarded media for job ${job.id}.`);
                        break;
                    }
                }
            }
        }
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY' && error.sqlMessage.includes('invoices.message_id')) {
            console.warn(`[WORKER] Invoice with message ID ${message.id._serialized} already exists in DB. Acknowledging job.`);
            return; // This is a success, not an error.
        }
        console.error(`[WORKER-ERROR] A critical error occurred while processing job ${job.id}:`, error);
        throw error;
    }
}, { connection: redisConnection });

invoiceWorker.on('failed', (job, err) => {
    console.error(`[QUEUE] Job ${job.id} failed permanently after retries with error: ${err.message}`);
});

const refreshAbbreviationCache = async () => {
    try {
        console.log('[CACHE] Refreshing abbreviations cache...');
        const [abbreviations] = await pool.query('SELECT `trigger`, `response` FROM abbreviations');
        abbreviationCache = abbreviations;
        console.log(`[CACHE] Loaded ${abbreviationCache.length} abbreviations.`);
    } catch (error) {
        console.error('[CACHE-ERROR] Failed to refresh abbreviations cache:', error);
    }
};

// --- THE RECONCILIATION WORKER ---
const reconcileMissedMessages = async () => {
    if (connectionStatus !== 'connected') {
        console.log('[RECONCILER] Skipping run because client is not connected.');
        return;
    }
    console.log('[RECONCILER] Starting periodic check for missed messages...');
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup);

        for (const group of groups) {
            const recentMessages = await group.fetchMessages({ limit: 20 });
            const recentMessageIds = recentMessages.map(msg => msg.id._serialized);

            if (recentMessageIds.length === 0) continue;

            // Now checks against the new `processed_messages` table
            const [processedRows] = await pool.query(
                'SELECT message_id FROM processed_messages WHERE message_id IN (?)',
                [recentMessageIds]
            );
            const processedIds = new Set(processedRows.map(r => r.message_id));
            
            const missedMessageIds = recentMessageIds.filter(id => !processedIds.has(id));

            if (missedMessageIds.length > 0) {
                console.log(`[RECONCILER] Found ${missedMessageIds.length} missed message(s) in "${group.name}". Processing them now.`);
                for (const messageId of missedMessageIds) {
                    const missedMessage = await client.getMessageById(messageId);
                    if (missedMessage) {
                        // Directly call the handler to ensure it's processed
                        await handleMessage(missedMessage);
                    }
                }
            }
        }
    } catch (error) {
        console.error('[RECONCILER-ERROR] An error occurred during the reconciliation task:', error);
    }
    console.log('[RECONCILER] Finished check.');
};

// --- A SINGLE, UNIFIED MESSAGE HANDLER ---
const handleMessage = async (message) => {
    try {
        const messageId = message.id._serialized;

        // 1. DEDUPLICATION CHECK AGAINST DATABASE
        const [rows] = await pool.query('SELECT message_id FROM processed_messages WHERE message_id = ?', [messageId]);
        if (rows.length > 0) {
            // This is not an error, just a duplicate event.
            return;
        }

        // 2. MARK AS PROCESSED IMMEDIATELY
        await pool.query('INSERT INTO processed_messages (message_id) VALUES (?)', [messageId]);

        const chat = await message.getChat();
        if (!chat.isGroup) return;

        // 3. ABBREVIATION LOGIC
        if (message.body) {
            const triggerText = message.body.trim();
            const match = abbreviationCache.find(abbr => abbr.trigger === triggerText);
            if (match) {
                console.log(`[ABBR] Trigger "${triggerText}" found in group "${chat.name}".`);
                await client.sendMessage(chat.id._serialized, match.response);
                return;
            }
        }

        // 4. INVOICE LOGIC
        if (message.hasMedia && !message.fromMe) {
            // Use the messageId as the jobId to prevent duplicates if the Reconciler
            // and this listener run at the exact same time. BullMQ will ignore the second add.
            await invoiceQueue.add('process-invoice', { messageId }, { jobId: messageId });
            console.log(`[QUEUE] Added media from "${chat.name}" to persistent queue. Msg ID: ${messageId}`);
        }
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
             console.log(`[DEDUPE] Race condition prevented duplicate processing for message ID: ${message.id._serialized}`);
        } else {
            console.error(`[MESSAGE-HANDLER-ERROR] An error occurred:`, error);
        }
    }
};

const initializeWhatsApp = () => {
    console.log('Initializing WhatsApp client...');
    client = new Client({ authStrategy: new LocalAuth({ dataPath: 'wwebjs_sessions' }), puppeteer: { headless: true, args: [ '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu' ], }, qrMaxRetries: 10, authTimeoutMs: 0 });
    
    client.on('qr', async (qr) => {
        console.log('QR code generated.');
        qrCodeData = await qrcode.toDataURL(qr);
        connectionStatus = 'qr';
    });

    client.on('ready', () => {
        console.log('Connection opened. Client is ready!');
        qrCodeData = null;
        connectionStatus = 'connected';
        refreshAbbreviationCache();

        reconcileMissedMessages(); 
        cron.schedule('*/3 * * * *', reconcileMissedMessages);
        console.log('[RECONCILER] Self-healing reconciler scheduled to run every 3 minutes.');
    });
    
    // --- SIMPLIFIED: LISTEN TO A SINGLE EVENT, CALL THE UNIFIED HANDLER ---
    client.on('message', handleMessage);
    client.on('message_received', handleMessage);
    
    client.on('disconnected', (reason) => {
        console.log('Client was logged out or disconnected', reason);
        connectionStatus = 'disconnected';
    });
    
    client.on('auth_failure', msg => {
        console.error('AUTHENTICATION FAILURE', msg);
        connectionStatus = 'disconnected';
    });

    client.initialize();
};

const getQR = () => qrCodeData;
const getStatus = () => connectionStatus;

const fetchAllGroups = async () => {
    if (connectionStatus !== 'connected') {
        throw new Error('WhatsApp is not connected.');
    }
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup);
        console.log(`Fetched ${groups.length} groups.`);
        return groups.map(group => ({
            id: group.id._serialized,
            name: group.name,
            participants: group.participants.length
        }));
    } catch (error) {
        console.error('Error fetching groups:', error);
        throw error;
    }
};

const broadcast = async (io, socketId, groupObjects, message) => {
    if (connectionStatus !== 'connected') {
        io.to(socketId).emit('broadcast:error', { message: 'WhatsApp is not connected.' });
        return;
    }

    console.log(`[BROADCAST] Starting broadcast to ${groupObjects.length} groups for socket ${socketId}.`);
    
    let successfulSends = 0;
    let failedSends = 0;
    const failedGroups = [];
    const successfulGroups = [];

    for (const group of groupObjects) {
        try {
            io.to(socketId).emit('broadcast:progress', { 
                groupName: group.name, 
                status: 'sending',
                message: `Sending to "${group.name}"...`
            });
            
            const chat = await client.getChatById(group.id);
            chat.sendStateTyping();

            const typingDelay = 400;
            await new Promise(resolve => setTimeout(resolve, typingDelay));

            await client.sendMessage(group.id, message);
            successfulSends++;
            successfulGroups.push(group.name);

            io.to(socketId).emit('broadcast:progress', {
                groupName: group.name,
                status: 'success',
                message: `Successfully sent to "${group.name}".`
            });

            const cooldownDelay = 1000;
            await new Promise(resolve => setTimeout(resolve, cooldownDelay));

        } catch (error) {
            console.error(`[BROADCAST-ERROR] Failed to send to ${group.name} (${group.id}):`, error.message);
            failedSends++;
            failedGroups.push(group.name);
            
            io.to(socketId).emit('broadcast:progress', {
                groupName: group.name,
                status: 'failed',
                message: `Failed to send to "${group.name}". Reason: ${error.message}`
            });
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    io.to(socketId).emit('broadcast:complete', {
        total: groupObjects.length,
        successful: successfulSends,
        failed: failedSends,
        successfulGroups,
        failedGroups
    });
    console.log(`[BROADCAST] Finished for socket ${socketId}. Success: ${successfulSends}, Failed: ${failedSends}`);
};

module.exports = {
    init: initializeWhatsApp,
    getQR,
    getStatus,
    fetchAllGroups,
    broadcast,
    refreshAbbreviationCache
};