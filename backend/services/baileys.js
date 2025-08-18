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
        printQRInTerminal: false, // We'll handle QR code manually
        logger,
    });

    // Handle connection updates
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

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    return sock;
};

const getSocket = () => sock;
const getQR = () => qrCodeData;
const getStatus = () => connectionStatus;

// --- FIX FOR RATE-LIMITING ---
// Staggered fetching with a delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchAllGroups = async () => {
    if (!sock || connectionStatus !== 'connected') {
        throw new Error('WhatsApp is not connected.');
    }
    try {
        const groupList = await sock.groupFetchAllParticipating();
        const groups = Object.values(groupList);
        console.log(`Fetched ${groups.length} groups.`);

        // Optional: Fetch metadata more slowly if needed, but this is usually enough
        // For this example, we return the basic list which is efficient.
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


// --- FIX FOR "WAITING FOR THIS MESSAGE" ---
// The key is ensuring a valid session and using a message queue.
const broadcast = async (groups, message) => {
    if (!sock || connectionStatus !== 'connected') {
        throw new Error('WhatsApp is not connected.');
    }

    console.log(`Starting broadcast to ${groups.length} groups.`);
    let successfulSends = 0;
    let failedSends = 0;

    for (const groupId of groups) {
        try {
            // The faulty check has been removed. We now attempt to send directly.
            await sock.sendMessage(groupId, { text: message });
            console.log(`Message sent successfully to ${groupId}`);
            successfulSends++;

            // Add a randomized delay to mimic human behavior and avoid rate limits
            const randomDelay = Math.floor(Math.random() * (4000 - 1500 + 1) + 1500); // Delay between 1.5s and 4s
            await delay(randomDelay);

        } catch (error) {
            console.error(`Failed to send message to ${groupId}:`, error.message);
            failedSends++;
        }
    }
    console.log(`Broadcast finished. Successful: ${successfulSends}, Failed: ${failedSends}`);
    return { total: groups.length, successful: successfulSends, failed: failedSends };
};

module.exports = {
    init: startSocket,
    getSocket,
    getQR,
    getStatus,
    fetchAllGroups,
    broadcast,
};