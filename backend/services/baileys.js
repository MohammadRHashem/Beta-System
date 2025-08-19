const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode');

let sock;
let qrCodeData;
let connectionStatus = 'disconnected';

const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: { colorize: true }
    }
});

const startSocket = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: ['Beta Broadcaster', 'Chrome', '1.0.0']
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeData = await qrcode.toDataURL(qr);
            connectionStatus = 'qr';
            console.log('QR code generated.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            connectionStatus = 'disconnected';
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                startSocket();
            }
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            qrCodeData = null;
            console.log('Connection opened.');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
};

const getSocket = () => sock;
const getQR = () => qrCodeData;
const getStatus = () => connectionStatus;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchAllGroups = async () => {
    if (!sock || connectionStatus !== 'connected') {
        throw new Error('WhatsApp is not connected.');
    }
    try {
        const groupList = await sock.groupFetchAllParticipating();
        const groups = Object.values(groupList);
        console.log(`Fetched ${groups.length} groups.`);
        return groups.map(group => ({
            id: group.id,
            name: group.subject,
            participants: group.participants.length
        }));
    } catch (error) {
        console.error('Error fetching groups:', error);
        throw error;
    }
};


// --- FINAL BROADCAST FUNCTION WITH ADMIN CHECK ---
const broadcast = async (io, socketId, groupObjects, message) => {
    if (!sock || !sock.user || connectionStatus !== 'connected') {
        io.to(socketId).emit('broadcast:error', { message: 'WhatsApp is not connected or user is not available.' });
        return;
    }

    const botId = sock.user.id;
    console.log(`[BROADCAST] Starting broadcast for ${groupObjects.length} groups. Bot ID: ${botId}`);
    
    let successfulSends = 0;
    let failedSends = 0;
    const failedGroups = [];
    const successfulGroups = [];

    for (const group of groupObjects) {
        try {
            io.to(socketId).emit('broadcast:progress', { 
                groupName: group.name, 
                status: 'sending',
                message: `Checking permissions for "${group.name}"...`
            });

            // STEP 1: PRE-FLIGHT ADMIN CHECK
            const metadata = await sock.groupMetadata(group.id);
            const botParticipant = metadata.participants.find(p => p.id === botId);

            // Check if the bot is in the group and if it's an admin ('admin' or 'superadmin')
            if (!botParticipant || !botParticipant.admin) {
                const reason = !botParticipant ? "Bot is not a member of this group." : "Not an admin in this group.";
                throw new Error(reason); // Intentionally throw an error to be caught below
            }

            // STEP 2: SIMULATE TYPING
            io.to(socketId).emit('broadcast:progress', { 
                groupName: group.name, 
                status: 'sending',
                message: `Sending to "${group.name}"...`
            });
            await sock.sendPresenceUpdate('composing', group.id);
            const typingDelay = Math.floor(Math.random() * (1500 - 750 + 1) + 750);
            await delay(typingDelay);

            // STEP 3: SEND MESSAGE
            await sock.sendMessage(group.id, { text: message });
            successfulSends++;
            successfulGroups.push(group.name);

            io.to(socketId).emit('broadcast:progress', {
                groupName: group.name,
                status: 'success',
                message: `Successfully sent to "${group.name}".`
            });

            // STEP 4: COOLDOWN DELAY
            const cooldownDelay = Math.floor(Math.random() * (6000 - 2500 + 1) + 2500);
            await delay(cooldownDelay);

        } catch (error) {
            console.error(`[BROADCAST-ERROR] Failed to process ${group.name} (${group.id}):`, error.message);
            failedSends++;
            failedGroups.push(group.name);
            
            io.to(socketId).emit('broadcast:progress', {
                groupName: group.name,
                status: 'failed',
                // Use the specific error message we generated
                message: `Failed to send to "${group.name}". Reason: ${error.message}`
            });
            await delay(1000); // Shorter delay after a known failure like this
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
    init: startSocket,
    getSocket,
    getQR,
    getStatus,
    fetchAllGroups,
    broadcast,
};