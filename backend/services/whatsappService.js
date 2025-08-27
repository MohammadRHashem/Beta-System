const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs/promises');
const fsSync = require('fs');
const pool = require('../config/db');
const path = require('path');
const execa = require('execa');
const os = require('os');
const dotenv = require('dotenv');
const { Queue, Worker } = require('bullmq');
const cron = require('node-cron');
const { recalculateBalances } = require('../utils/balanceCalculator');

let client;
let qrCodeData;
let connectionStatus = 'disconnected';
let abbreviationCache = [];
let io; // To hold the socket.io instance

const redisConnection = { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
const invoiceQueue = new Queue('invoice-processing-queue', { connection: redisConnection });

// Ensure media archive directory exists
const MEDIA_ARCHIVE_DIR = path.join(__dirname, '..', 'media_archive');
if (!fsSync.existsSync(MEDIA_ARCHIVE_DIR)) {
    fsSync.mkdirSync(MEDIA_ARCHIVE_DIR, { recursive: true });
}

const invoiceWorker = new Worker('invoice-processing-queue', async (job) => {
    if (!client || connectionStatus !== 'connected') {
        throw new Error("WhatsApp client is not connected. Job will be retried.");
    }
    
    const { messageId } = job.data;
    console.log(`[WORKER] Started processing job ${job.id} for message ID: ${messageId}`);

    const message = await client.getMessageById(messageId);
    if (!message) {
        console.warn(`[WORKER] Message ${messageId} not found. Acknowledging job.`);
        return;
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const chat = await message.getChat();
        
        await connection.query('INSERT INTO processed_messages (message_id) VALUES (?) ON DUPLICATE KEY UPDATE message_id=message_id', [messageId]);
        
        const [settings] = await connection.query('SELECT * FROM group_settings WHERE group_jid = ?', [chat.id._serialized]);
        const groupSettings = settings[0] || { forwarding_enabled: true, archiving_enabled: true };

        if (!groupSettings.forwarding_enabled && !groupSettings.archiving_enabled) {
            console.log(`[WORKER] Ignoring job from disabled group: ${chat.name}`);
            await connection.commit();
            return;
        }

        const media = await message.downloadMedia();
        if (!media) {
            console.warn(`[WORKER] Failed to download media for ${messageId}.`);
            await connection.commit();
            return;
        }

        const tempFilePath = path.join(os.tmpdir(), `${message.id.id}.${media.mimetype.split('/')[1] || 'bin'}`);
        await fs.writeFile(tempFilePath, Buffer.from(media.data, 'base64'));

        const pythonScriptsDir = path.join(__dirname, '..', 'python_scripts');
        const pythonExecutablePath = path.join(pythonScriptsDir, 'venv', 'bin', 'python3');
        const pythonScriptPath = path.join(pythonScriptsDir, 'main.py');
        const pythonEnv = dotenv.config({ path: path.join(pythonScriptsDir, '.env') }).parsed;

        if (!pythonEnv || !pythonEnv.GOOGLE_API_KEY) {
            throw new Error('Could not load GOOGLE_API_KEY.');
        }

        let invoiceJson;
        try {
            const { stdout } = await execa(pythonExecutablePath, [pythonScriptPath, tempFilePath], { cwd: pythonScriptsDir, env: pythonEnv });
            invoiceJson = JSON.parse(stdout);
        } catch (pythonError) {
            console.error(`[WORKER-PYTHON-ERROR] Script failed. Stderr:`, pythonError.stderr);
            await fs.unlink(tempFilePath);
            throw pythonError;
        }

        const { amount, sender, recipient, transaction_id } = invoiceJson;
        
        // Relaxed validation: We now require only amount and recipient name to process the invoice.
        const isInvoiceValid = amount && recipient?.name;

        if (!isInvoiceValid) {
             console.log(`[WORKER-INFO] OCR result did not meet requirements (amount, recipient) for job ${job.id}. Skipping.`);
             await fs.unlink(tempFilePath);
             await connection.commit();
             return;
        }
        
        let finalMediaPath = null;
        if (groupSettings.archiving_enabled) {
            const extension = path.extname(media.filename || '') || `.${media.mimetype.split('/')[1] || 'bin'}`;
            const archiveFileName = `${messageId}${extension}`;
            finalMediaPath = path.join(MEDIA_ARCHIVE_DIR, archiveFileName);
            await fs.rename(tempFilePath, finalMediaPath);

            const receivedAt = new Date(message.timestamp * 1000);

            await connection.query(
               `INSERT INTO invoices (message_id, transaction_id, sender_name, recipient_name, pix_key, amount, source_group_jid, received_at, raw_json_data, media_path) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
               [messageId, transaction_id, sender?.name, recipient.name, recipient.pix_key, amount, chat.id._serialized, receivedAt, JSON.stringify(invoiceJson), finalMediaPath]
            );

            await recalculateBalances(connection, receivedAt.toISOString());
            console.log(`[WORKER] Invoice from job ${job.id} saved to DB.`);
        } else {
             await fs.unlink(tempFilePath); // clean up if not archiving
        }
        
        if (groupSettings.forwarding_enabled) {
            const recipientNameLower = (recipient.name || '').toLowerCase().trim();
            if (recipientNameLower) {
                const [rules] = await connection.query('SELECT * FROM forwarding_rules');
                for (const rule of rules) {
                    if (recipientNameLower.includes(rule.trigger_keyword.toLowerCase())) {
                        const mediaToForward = new MessageMedia(media.mimetype, media.data, media.filename);
                        await client.sendMessage(rule.destination_group_jid, mediaToForward);
                        console.log(`[PROCESS] Forwarded media for job ${job.id}.`);
                        break;
                    }
                }
            }
        }
        
        await connection.commit();
        if (io) io.emit('invoices:updated');

    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            console.warn(`[WORKER] Duplicate entry for message ID ${messageId}. Acknowledging job.`);
            return;
        }
        console.error(`[WORKER-ERROR] Critical error processing job ${job.id}:`, error);
        throw error; // Let BullMQ handle retry
    } finally {
        connection.release();
    }
}, { connection: redisConnection });

invoiceWorker.on('failed', (job, err) => {
    console.error(`[QUEUE] Job ${job.id} failed with error: ${err.message}`);
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

let isReconciling = false;
const reconcileMissedMessages = async () => {
    if (isReconciling || connectionStatus !== 'connected') { return; }
    isReconciling = true;
    console.log('[RECONCILER] Starting check for missed messages...');
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup);

        for (const group of groups) {
            const recentMessages = await group.fetchMessages({ limit: 20 });
            if (recentMessages.length === 0) continue;

            const messageIdsToCheck = recentMessages.map(msg => msg.id._serialized);

            const [processedRows] = await pool.query(
                'SELECT message_id FROM processed_messages WHERE message_id IN (?)',
                [messageIdsToCheck]
            );
            const processedIds = new Set(processedRows.map(r => r.message_id));
            
            const missedMessages = recentMessages.filter(msg => !processedIds.has(msg.id._serialized));

            if (missedMessages.length > 0) {
                console.log(`[RECONCILER] Found ${missedMessages.length} missed message(s) in "${group.name}". Processing them now.`);
                for (const message of missedMessages) {
                    await handleMessage(message);
                }
            }
        }
    } catch (error) {
        console.error('[RECONCILER-ERROR] An error occurred:', error);
    } finally {
        isReconciling = false;
        console.log('[RECONCILER] Finished check.');
    }
};

const handleMessage = async (message) => {
    try {
        const messageId = message.id._serialized;
        const [rows] = await pool.query('SELECT message_id FROM processed_messages WHERE message_id = ?', [messageId]);
        if (rows.length > 0) return;

        await pool.query('INSERT INTO processed_messages (message_id) VALUES (?) ON DUPLICATE KEY UPDATE message_id=message_id', [messageId]);

        const chat = await message.getChat();
        if (!chat.isGroup) return;

        if (message.body) {
            const triggerText = message.body.trim();
            const match = abbreviationCache.find(abbr => abbr.trigger === triggerText);
            if (match) {
                console.log(`[ABBR] Trigger "${triggerText}" found in group "${chat.name}".`);
                await client.sendMessage(chat.id._serialized, match.response);
                return;
            }
        }

        if (message.hasMedia && !message.fromMe) {
            await invoiceQueue.add('process-invoice', { messageId }, { jobId: messageId });
            console.log(`[QUEUE] Added media from "${chat.name}" to queue. Msg ID: ${messageId}`);
        }
    } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') {
            console.error(`[MESSAGE-HANDLER-ERROR]`, error);
        }
    }
};

const handleMessageRevoke = async (message, revoked_msg) => {
    // 'revoked_msg' can be null if the message is old, so we also check 'message'
    const messageId = revoked_msg ? revoked_msg.id._serialized : message.id._serialized;
    if (!messageId) return;

    console.log(`[DELETE] Message ${messageId} was deleted.`);
    
    try {
        const [[invoice]] = await pool.query('SELECT id, media_path FROM invoices WHERE message_id = ?', [messageId]);
        
        if (invoice) {
            await pool.query('UPDATE invoices SET is_deleted = 1 WHERE id = ?', [invoice.id]);

            if (invoice.media_path && fsSync.existsSync(invoice.media_path)) {
                await fs.unlink(invoice.media_path);
                console.log(`[DELETE] Deleted media file: ${invoice.media_path}`);
            }
            if (io) io.emit('invoices:updated');
        }
    } catch (error) {
        console.error(`[DELETE-ERROR] Failed to process message deletion for ${messageId}:`, error);
    }
};

const initializeWhatsApp = (socketIoInstance) => {
    io = socketIoInstance;
    console.log('Initializing WhatsApp client...');
    client = new Client({ 
        authStrategy: new LocalAuth({ dataPath: 'wwebjs_sessions' }), 
        puppeteer: { 
            headless: true, 
            args: [ 
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-accelerated-2d-canvas', 
                '--no-first-run', 
                '--no-zygote', 
                '--single-process', // Maybe this is needed on some servers
                '--disable-gpu' 
            ], 
        }, 
        qrMaxRetries: 10, 
        authTimeoutMs: 0 
    });
    
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
        cron.schedule('*/5 * * * *', reconcileMissedMessages);
        console.log('[RECONCILER] Self-healing reconciler scheduled to run every 5 minutes.');
    });
    
    client.on('message', handleMessage);
    client.on('message_revoke_everyone', handleMessageRevoke);
    
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