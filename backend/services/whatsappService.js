const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs/promises'); // Use promises version of fs
const { execa } = require('execa');
const pool =require('../config/db');

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
    
    // --- NEW MESSAGE LISTENER ---
    client.on('message', async (message) => {
        try {
            const chat = await message.getChat();
            // 1. Process only incoming messages from groups that have media
            if (!chat.isGroup || !message.hasMedia || message.fromMe) {
                return;
            }

            // 2. Check group settings in DB
            const [settings] = await pool.query('SELECT * FROM group_settings WHERE group_jid = ?', [chat.id._serialized]);
            const groupSettings = settings[0] || { forwarding_enabled: true, archiving_enabled: true }; // Default to enabled

            if (!groupSettings.forwarding_enabled && !groupSettings.archiving_enabled) {
                console.log(`[PROCESS] Ignoring message from disabled group: ${chat.name}`);
                return;
            }

            // 3. Download the media
            const media = await message.downloadMedia();
            if (!media || !['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(media.mimetype)) {
                console.log(`[PROCESS] Ignoring unsupported media type: ${media.mimetype}`);
                return;
            }

            console.log(`[PROCESS] Received valid media from group: ${chat.name}`);
            const tempFilePath = `/tmp/${message.id.id}.${media.mimetype.split('/')[1]}`;
            await fs.writeFile(tempFilePath, Buffer.from(media.data, 'base64'));

            // 4. Execute the Python script
            // IMPORTANT: Make sure the path to your python script is correct!
            const pythonScriptPath = '/home/ubuntu/TRK-TechAssistant/main.py';
            const { stdout } = await execa('python3', [pythonScriptPath, tempFilePath]);
            const invoiceJson = JSON.parse(stdout);

            console.log(`[PROCESS] Python script processed successfully for invoice: ${invoiceJson.invoice_id}`);
            
            // Clean up the temp file
            await fs.unlink(tempFilePath);

            // 5. Save to `invoices_all` table (if archiving is enabled)
            if (groupSettings.archiving_enabled) {
                 await pool.query(
                    `INSERT INTO invoices_all (invoice_id, source_group_jid, payment_method, invoice_date, invoice_time, amount, currency, sender_name, recipient_name, raw_json_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [invoiceJson.invoice_id, chat.id._serialized, invoiceJson.payment_method, invoiceJson.invoice_date, invoiceJson.invoice_time, invoiceJson.amount, invoiceJson.currency, invoiceJson.sender?.name, invoiceJson.recipient?.name, JSON.stringify(invoiceJson)]
                );
            }

            // 6. Routing and Archiving Logic
            const recipientName = invoiceJson.recipient?.name?.toLowerCase() || '';
            const [rules] = await pool.query('SELECT * FROM forwarding_rules');

            let ruleMatched = false;
            for (const rule of rules) {
                if (recipientName.includes(rule.trigger_keyword.toLowerCase())) {
                    ruleMatched = true;
                    console.log(`[PROCESS] Matched rule "${rule.trigger_keyword}"`);
                    
                    // Forward the message
                    if (groupSettings.forwarding_enabled) {
                        await client.sendMessage(rule.destination_group_jid, media, { caption: `Invoice from: ${chat.name}\nID: ${invoiceJson.invoice_id}` });
                        console.log(`[PROCESS] Forwarded media to: ${rule.destination_group_name}`);
                    }

                    // Archive to specific tables
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
                    break; // Stop after first match
                }
            }

            // Handle "Chave Pix" (no rule matched)
            if (!ruleMatched && groupSettings.archiving_enabled) {
                 await pool.query(
                    'INSERT INTO invoices_chave_pix (invoice_id, source_group_jid, raw_json_data) VALUES (?, ?, ?)',
                    [invoiceJson.invoice_id, chat.id._serialized, JSON.stringify(invoiceJson)]
                );
                console.log(`[PROCESS] No rule matched. Archived to chave_pix.`);
            }

        } catch (error) {
            console.error('[PROCESS-ERROR] An error occurred during message processing:', error);
            // Optional: Send an error message back to the source group
            // message.reply(`An error occurred while processing your invoice: ${error.message}`);
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

const fetchAllGroups = async () => {
    if (connectionStatus !== 'connected') {
        throw new Error('WhatsApp is not connected.');
    }
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup);
        console.log(`Fetched ${groups.length} groups.`);
        return groups.map(group => ({
            id: group.id._serialized, // This is the correct ID format
            name: group.name,
            participants: group.participants.length
        }));
    } catch (error) {
        console.error('Error fetching groups:', error);
        throw error;
    }
};

// --- BROADCAST FUNCTION WITH "TYPING..." SIMULATION RE-IMPLEMENTED ---
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

            // STEP 1: GET THE CHAT OBJECT AND SIMULATE TYPING
            const chat = await client.getChatById(group.id);
            // This will set the status to "typing..." for about 25 seconds
            chat.sendStateTyping();

            // A short delay is still good practice to let the "typing" status appear
            const typingDelay = Math.floor(Math.random() * (2000 - 1000 + 1) + 1000); // 1 to 2 seconds
            await delay(typingDelay);

            // STEP 2: SEND THE MESSAGE
            // Sending the message will automatically clear the "typing" state.
            await client.sendMessage(group.id, message);
            successfulSends++;
            successfulGroups.push(group.name);

            io.to(socketId).emit('broadcast:progress', {
                groupName: group.name,
                status: 'success',
                message: `Successfully sent to "${group.name}".`
            });

            // STEP 3: COOLDOWN DELAY
            const cooldownDelay = 2;
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