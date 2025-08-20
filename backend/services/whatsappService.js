const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs/promises');
const pool = require('../config/db');
const path = require('path');
const execa = require('execa');
const os = require('os');
const dotenv = require('dotenv');

let client;
let qrCodeData;
let connectionStatus = 'disconnected';

const messageQueue = [];
let isProcessing = false;

let abbreviationCache = [];
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

const processQueue = async () => {
    if (isProcessing || messageQueue.length === 0) {
        return;
    }
    isProcessing = true;
    const message = messageQueue.shift();

    try {
        const chat = await message.getChat();
        
        const [settings] = await pool.query('SELECT * FROM group_settings WHERE group_jid = ?', [chat.id._serialized]);
        const groupSettings = settings[0] || { forwarding_enabled: true, archiving_enabled: true };

        const media = await message.downloadMedia();
        if (!media || !['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(media.mimetype)) {
            isProcessing = false;
            processQueue();
            return;
        }

        console.log(`[PROCESS] Started processing media from group: ${chat.name}`);
        const tempFilePath = `/tmp/${message.id.id}.${media.mimetype.split('/')[1] || 'bin'}`;
        await fs.writeFile(tempFilePath, Buffer.from(media.data, 'base64'));
        
        const pythonScriptsDir = path.join(__dirname, '..', 'python_scripts');
        const pythonExecutablePath = path.join(pythonScriptsDir, 'venv', 'bin', 'python3');
        const pythonScriptPath = path.join(pythonScriptsDir, 'main.py');
        
        const pythonEnvPath = path.join(pythonScriptsDir, '.env');
        const pythonEnv = dotenv.config({ path: pythonEnvPath }).parsed;

        if (!pythonEnv || !pythonEnv.GOOGLE_API_KEY) {
            console.error('[PROCESS-ERROR] Could not load GOOGLE_API_KEY from python_scripts/.env file.');
            await fs.unlink(tempFilePath);
            isProcessing = false;
            processQueue();
            return;
        }
        
        let invoiceJson;
        try {
            const { stdout } = await execa(pythonExecutablePath, [pythonScriptPath, tempFilePath], {
                cwd: pythonScriptsDir,
                env: pythonEnv
            });
            invoiceJson = JSON.parse(stdout);
            console.log(`[PROCESS] Python script success. Transaction ID: ${invoiceJson.transaction_id}`);
        } catch (pythonError) {
            console.error(`[PYTHON-ERROR] Script failed for media from ${chat.name}. Stderr:`, pythonError.stderr);
            await fs.unlink(tempFilePath);
            isProcessing = false;
            processQueue();
            return;
        }
        
        await fs.unlink(tempFilePath);

        const invoiceIdentifier = invoiceJson.transaction_id; // Using the key from your Python script

        // --- NEW SAVING LOGIC ---
        if (groupSettings.archiving_enabled) {
            const { amount, sender, recipient } = invoiceJson;
            // Check if all required fields for saving are present
            if (amount && sender?.name && recipient?.name) {
                // Convert WhatsApp's Unix timestamp to a MySQL-friendly format
                const receivedAt = new Date(message.timestamp * 1000);

                await pool.query(
                   `INSERT INTO invoices (transaction_id, sender_name, recipient_name, pix_key, amount, source_group_jid, received_at, raw_json_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                   [invoiceIdentifier, sender.name, recipient.name, recipient.pix_key, amount, chat.id._serialized, receivedAt, JSON.stringify(invoiceJson)]
                );
                console.log(`[PROCESS] Invoice ${invoiceIdentifier} meets requirements and was saved to the database.`);
            } else {
                console.log(`[PROCESS] Invoice from ${chat.name} did not meet saving requirements (missing amount, sender, or recipient). Skipping save.`);
            }
        } else {
            console.log(`[PROCESS] Archiving is disabled for group ${chat.name}. Skipping save.`);
        }

        // --- NEW FORWARDING LOGIC ---
        if (groupSettings.forwarding_enabled) {
            const recipientName = invoiceJson.recipient?.name?.toLowerCase() || '';
            if (recipientName) {
                const [rules] = await pool.query('SELECT * FROM forwarding_rules');
                for (const rule of rules) {
                    if (recipientName.includes(rule.trigger_keyword.toLowerCase())) {
                        console.log(`[PROCESS] Matched forwarding rule "${rule.trigger_keyword}"`);
                        const mediaToForward = new MessageMedia(media.mimetype, media.data, media.filename);
                        await client.sendMessage(rule.destination_group_jid, mediaToForward, { caption: `Invoice from: ${chat.name}\nID: ${invoiceIdentifier}` });
                        console.log(`[PROCESS] Forwarded media to: ${rule.destination_group_name}`);
                        break; // Stop after the first match
                    }
                }
            } else {
                 console.log(`[PROCESS] No recipient name found for forwarding rule check. Skipping forward.`);
            }
        } else {
            console.log(`[PROCESS] Forwarding is disabled for group ${chat.name}. Skipping forward.`);
        }

    } catch (error) {
        console.error('[QUEUE-PROCESS-ERROR] A critical error occurred:', error);
    } finally {
        isProcessing = false;
        processQueue();
    }
};

const initializeWhatsApp = () => {
    console.log('Initializing WhatsApp client...');
    client = new Client({ authStrategy: new LocalAuth({ dataPath: 'wwebjs_sessions' }), puppeteer: { headless: true, args: [ '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu' ], } });
    client.on('qr', async (qr) => { console.log('QR code generated.'); qrCodeData = await qrcode.toDataURL(qr); connectionStatus = 'qr'; });
    client.on('ready', () => { console.log('Connection opened. Client is ready!'); qrCodeData = null; connectionStatus = 'connected'; refreshAbbreviationCache(); });
    
    client.on('message', async (message) => {
        try {
            // --- ABBREVIATION LOGIC ---
            // This runs IN PARALLEL and BEFORE the invoice queue logic.
            // It must be fast.
            if (message.fromMe && message.body) {
                const triggerText = message.body.trim();
                const match = abbreviationCache.find(abbr => abbr.trigger === triggerText);
                if (match) {
                    // Wait 1 second as requested, then edit the message.
                    setTimeout(async () => {
                        try {
                            await message.edit(match.response);
                            console.log(`[ABBR] Successfully expanded trigger: "${triggerText}"`);
                        } catch (editError) {
                            console.error(`[ABBR-ERROR] Failed to edit message for trigger "${triggerText}":`, editError);
                        }
                    }, 1000);
                    return; // Stop further processing if it's an abbreviation
                }
            }

            // --- INVOICE QUEUE LOGIC ---
            const chat = await message.getChat();
            if (chat.isGroup && message.hasMedia && !message.fromMe) {
                console.log(`[QUEUE] Queuing incoming media from: ${chat.name}`);
                messageQueue.push(message);
                processQueue();
            }
        } catch (error) {
            console.error('[MESSAGE-HANDLER-ERROR] An error occurred:', error);
        }
    });
    
    client.on('disconnected', (reason) => { console.log('Client was logged out or disconnected', reason); connectionStatus = 'disconnected'; });
    client.on('auth_failure', msg => { console.error('AUTHENTICATION FAILURE', msg); connectionStatus = 'disconnected'; });
    client.initialize();
};

const getQR = () => qrCodeData;
const getStatus = () => connectionStatus;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
            await delay(typingDelay);

            await client.sendMessage(group.id, message);
            successfulSends++;
            successfulGroups.push(group.name);

            io.to(socketId).emit('broadcast:progress', {
                groupName: group.name,
                status: 'success',
                message: `Successfully sent to "${group.name}".`
            });

            const cooldownDelay = Math.floor(Math.random() * (6000 - 2500 + 1) + 2500);
            await delay(cooldownDelay);

        } catch (error) {
            console.error(`[BROADCAST-ERROR] Failed to send to ${group.name} (${group.id}):`, error.message);
            failedSends++;
            failedGroups.push(group.name);
            
            io.to(socketId).emit('broadcast:progress', {
                groupName: group.name,
                status: 'failed',
                message: `Failed to send to "${group.name}". Reason: ${error.message}`
            });
            await delay(5000);
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