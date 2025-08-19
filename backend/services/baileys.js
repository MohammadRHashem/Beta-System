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
        options: {
            colorize: true
        }
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
        markOnlineOnConnect: false,
        // Add a browser config to appear more legitimate
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

// --- COMPLETELY REWRITTEN BROADCAST FUNCTION FOR MAXIMUM STABILITY ---
const broadcast = async (progressReporter, groupObjects, message) => {
    if (!sock || connectionStatus !== 'connected') {
        // Report an initial error and stop
        await progressReporter({ status: 'error', message: 'WhatsApp is not connected.' });
        return;
    }

    console.log(`[BROADCAST] Starting broadcast to ${groupObjects.length} groups.`);
    
    let successfulSends = 0;
    let failedSends = 0;
    const failedGroups = [];
    const successfulGroups = [];

    for (const group of groupObjects) {
        try {
            await progressReporter({ 
                groupName: group.name, 
                status: 'sending',
                message: `Sending to "${group.name}"...`
            });

            await sock.sendPresenceUpdate('composing', group.id);
            const typingDelay = Math.floor(Math.random() * (1500 - 750 + 1) + 750);
            await delay(typingDelay);

            await sock.sendMessage(group.id, { text: message });
            successfulSends++;
            successfulGroups.push(group.name);

            await progressReporter({
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
            
            await progressReporter({
                groupName: group.name,
                status: 'failed',
                message: `Failed to send to "${group.name}". Reason: ${error.message}`
            });
            await delay(5000);
        }
    }

    // Final completion report with summary
    await progressReporter({
        status: 'complete',
        total: groupObjects.length,
        successful: successfulSends,
        failed: failedSends,
        successfulGroups,
        failedGroups
    });
    console.log(`[BROADCAST] Finished. Success: ${successfulSends}, Failed: ${failedSends}`);
};


module.exports = {
    init: startSocket,
    getSocket,
    getQR,
    getStatus,
    fetchAllGroups,
    broadcast,
};