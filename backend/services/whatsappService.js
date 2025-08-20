const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs/promises');
const pool = require('../config/db');
const path = require('path');
const execa = require('execa');
const os = require('os');
const dotenv = require('dotenv');
const { Queue, Worker } = require('bullmq');

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
    if (!client) {
        throw new Error("WhatsApp client is not initialized. Cannot process job.");
    }
    
    const { messageData } = job.data;
    // Re-hydrate the message object from its raw data to get its methods
    const message = client.constructMessage(client, messageData);

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

        console.log(`[WORKER] Processing job ${job.id} for media from group: ${chat.name}`);
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
            throw pythonError; // This will cause the job to fail and be retried by BullMQ
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
                await pool.query(
                   `INSERT INTO invoices (transaction_id, sender_name, recipient_name, pix_key, amount, source_group_jid, received_at, raw_json_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                   [invoiceIdentifier, sender.name, recipient.name, recipient.pix_key, amount, chat.id._serialized, receivedAt, JSON.stringify(invoiceJson)]
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
        console.error(`[WORKER-ERROR] A critical error occurred while processing job ${job.id}:`, error);
        throw error; // Throwing the error tells BullMQ the job failed
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
    });
    
    client.on('message', async (message) => {
        try {
            const chat = await message.getChat();
            if (!chat.isGroup) return;

            if (message.body) {
                const triggerText = message.body.trim();
                const match = abbreviationCache.find(abbr => abbr.trigger === triggerText);
                if (match) {
                    console.log(`[ABBR] Trigger "${triggerText}" found. Sending response.`);
                    await client.sendMessage(chat.id._serialized, match.response);
                    return;
                }
            }

            if (message.hasMedia && !message.fromMe) {
                // Add the raw message data to the persistent queue
                await invoiceQueue.add('process-invoice', { messageData: message.rawData });
                console.log(`[QUEUE] Added incoming media from "${chat.name}" to persistent queue.`);
            }
        } catch (error) {
            console.error('[MESSAGE-HANDLER-ERROR] An error occurred:', error);
        }
    });
    
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

            const typingDelay = Math.floor(Math.random() * (2000 - 1000 + 1) + 1000);
            await new Promise(resolve => setTimeout(resolve, typingDelay));

            await client.sendMessage(group.id, message);
            successfulSends++;
            successfulGroups.push(group.name);

            io.to(socketId).emit('broadcast:progress', {
                groupName: group.name,
                status: 'success',
                message: `Successfully sent to "${group.name}".`
            });

            const cooldownDelay = Math.floor(Math.random() * (6000 - 2500 + 1) + 2500);
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