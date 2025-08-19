const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs/promises');
const pool = require('../config/db');
const path = require('path');
const execa = require('execa');

let client;
let qrCodeData;
let connectionStatus = 'disconnected';

const initializeWhatsApp = () => {
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
                '--single-process',
                '--disable-gpu'
            ],
        }
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
    });
    
    client.on('message', async (message) => {
        try {
            const chat = await message.getChat();
            if (!chat.isGroup || !message.hasMedia || message.fromMe) {
                return;
            }

            const [settings] = await pool.query('SELECT * FROM group_settings WHERE group_jid = ?', [chat.id._serialized]);
            const groupSettings = settings[0] || { forwarding_enabled: true, archiving_enabled: true };

            if (!groupSettings.forwarding_enabled && !groupSettings.archiving_enabled) {
                return;
            }

            const media = await message.downloadMedia();
            if (!media || !['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(media.mimetype)) {
                return;
            }

            console.log(`[PROCESS] Received valid media from group: ${chat.name}`);
            const tempFilePath = `/tmp/${message.id.id}.${media.mimetype.split('/')[1] || 'bin'}`;
            await fs.writeFile(tempFilePath, Buffer.from(media.data, 'base64'));

            // --- THIS IS THE CRITICAL FIX ---
            // Construct the absolute paths for the venv python executable and the script
            const pythonVenvPath = path.join(__dirname, '..', 'python_scripts', 'venv', 'bin', 'python3');
            const pythonScriptPath = path.join(__dirname, '..', 'python_scripts', 'main.py');
            
            console.log(`[PROCESS] Executing Python script: ${pythonScriptPath}`);
            console.log(`[PROCESS] Using venv executable: ${pythonVenvPath}`);

            // Correctly call execa with the executable as the first argument
            // and an array of script + arguments as the second.
            const { stdout } = await execa(pythonVenvPath, [pythonScriptPath, tempFilePath]);
            
            const invoiceJson = JSON.parse(stdout);
            console.log(`[PROCESS] Python script processed successfully for invoice: ${invoiceJson.invoice_id}`);
            
            await fs.unlink(tempFilePath);

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
                            console.log(`[PROCESS] Archived to trkbit_approved.`);
                        } else {
                             await pool.query(
                                'INSERT INTO invoices_trkbit_unapproved (invoice_id, source_group_jid, raw_json_data) VALUES (?, ?, ?)',
                                [invoice_id, chat.id._serialized, JSON.stringify(invoiceJson)]
                            );
                            console.log(`[PROCESS] Archived to trkbit_unapproved due to missing fields.`);
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
                console.log(`[PROCESS] No rule matched. Archived to chave_pix.`);
            }

        } catch (error) {
            console.error('[PROCESS-ERROR] An error occurred during message processing:', error);
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
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const fetchAllGroups = async () => { /* ... existing code, no changes ... */ };
const broadcast = async (io, socketId, groupObjects, message) => { /* ... existing code, no changes ... */ };

module.exports = {
    init: initializeWhatsApp,
    getQR,
    getStatus,
    fetchAllGroups,
    broadcast,
};