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

        if (!groupSettings.forwarding_enabled && !groupSettings.archiving_enabled) {
            isProcessing = false;
            processQueue();
            return;
        }

        const media = await message.downloadMedia();
        if (!media || !['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(media.mimetype)) {
            isProcessing = false;
            processQueue();
            return;
        }

        console.log(`[PROCESS] Started processing media from group: ${chat.name}`);
        const tempFilePath = `/tmp/${message.id.id}.${media.mimetype.split('/')[1] || 'bin'}`;
        await fs.writeFile(tempFilePath, Buffer.from(media.data, 'base64'));
        
        // --- FIX 5: CORRECT PATHS FOR THE NEW STRUCTURE ---
        const pythonScriptsDir = path.join(__dirname, '..', 'python_scripts');
        const pythonExecutablePath = path.join(pythonScriptsDir, 'venv', 'bin', 'python3');
        const pythonScriptPath = path.join(pythonScriptsDir, 'main.py');
        
        // Load the Python project's .env file
        const pythonEnvPath = path.join(pythonScriptsDir, '.env');
        const pythonEnv = dotenv.config({ path: pythonEnvPath }).parsed;
        
        let invoiceJson;
        try {
            const { stdout } = await execa(pythonExecutablePath, [pythonScriptPath, tempFilePath], {
                env: pythonEnv 
            });
            invoiceJson = JSON.parse(stdout);
            console.log(`[PROCESS] Python script success. Invoice ID: ${invoiceJson.invoice_id}`);
        } catch (pythonError) {
            console.error(`[PYTHON-ERROR] Script failed for media from ${chat.name}. Stderr:`, pythonError.stderr);
            await fs.unlink(tempFilePath);
            isProcessing = false;
            processQueue();
            return;
        }
        
        await fs.unlink(tempFilePath);

        if (!invoiceJson || !invoiceJson.invoice_id) {
             console.log(`[PROCESS-INFO] Python script returned no valid invoice_id. Skipping forwarding/archiving for this file.`);
             isProcessing = false;
             processQueue();
             return;
        }
        
        if (groupSettings.archiving_enabled) {
            await pool.query(
               `INSERT INTO invoices_all (invoice_id, source_group_jid, payment_method, invoice_date, invoice_time, amount, currency, sender_name, recipient_name, raw_json_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
               [invoiceJson.invoice_id, chat.id._serialized, invoiceJson.payment_method, invoiceJson.invoice_date, invoiceJson.invoice_time, invoiceJson.amount, invoiceJson.currency, invoiceJson.sender?.name, invoiceJson.recipient?.name, JSON.stringify(invoiceJson)]
           );
        }

        const recipientName = invoiceJson.recipient?.name?.toLowerCase() || '';
        const [rules] = await pool.query('SELECT * FROM forwarding_rules');

        let ruleMatched = false;
        for (const rule of rules) {
            if (recipientName.includes(rule.trigger_keyword.toLowerCase())) {
                ruleMatched = true;
                console.log(`[PROCESS] Matched rule "${rule.trigger_keyword}"`);
                
                if (groupSettings.forwarding_enabled) {
                    const mediaToForward = new MessageMedia(media.mimetype, media.data, media.filename);
                    await client.sendMessage(rule.destination_group_jid, mediaToForward, { caption: `Invoice from: ${chat.name}\nID: ${invoiceJson.invoice_id}` });
                    console.log(`[PROCESS] Forwarded media to: ${rule.destination_group_name}`);
                }

                if (groupSettings.archiving_enabled) {
                    const { invoice_id, sender, recipient, amount } = invoiceJson;
                    if (invoice_id && sender?.name && recipient?.name && amount) {
                        await pool.query(
                            'INSERT INTO invoices_trkbit_approved (invoice_id, source_group_jid, sender_name, recipient_name, amount) VALUES (?, ?, ?, ?, ?)',
                            [invoice_id, chat.id._serialized, sender.name, recipient.name, amount]
                        );
                    } else {
                         await pool.query(
                            'INSERT INTO invoices_trkbit_unapproved (invoice_id, source_group_jid, raw_json_data) VALUES (?, ?, ?)',
                            [invoice_id, chat.id._serialized, JSON.stringify(invoiceJson)]
                        );
                    }
                }
                break;
            }
        }

        if (!ruleMatched && groupSettings.archiving_enabled) {
             await pool.query(
                'INSERT INTO invoices_chave_pix (invoice_id, source_group_jid, raw_json_data) VALUES (?, ?, ?)',
                [invoiceJson.invoice_id, chat.id._serialized, JSON.stringify(invoiceJson)]
            );
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
    client.on('ready', () => { console.log('Connection opened. Client is ready!'); qrCodeData = null; connectionStatus = 'connected'; });
    client.on('message', async (message) => {
        try {
            const chat = await message.getChat();
            if (!chat.isGroup || !message.hasMedia || message.fromMe) { return; }
            messageQueue.push(message);
            processQueue();
        } catch (error) {
            console.error('[MESSAGE-HANDLER-ERROR] Could not queue message:', error);
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
};