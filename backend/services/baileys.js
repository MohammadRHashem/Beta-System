const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode');
const fs = require('fs-extra');

let sock;
let qrCodeData;
let connectionStatus = 'disconnected';
const SESSION_DIR = './baileys_auth_info';

// --- STABILITY UPGRADE 1: Use Pino logger with specified level ---
// This provides more detailed logs for debugging connection issues.
const logger = pino({ level: 'silent' });

// --- STABILITY UPGRADE 2: Use an In-Memory Store ---
// The store will cache small amounts of data that Baileys needs frequently,
// like contacts and chat names, reducing redundant requests and improving performance.
const store = makeInMemoryStore({ logger });
store?.readFromFile('./baileys_store.json');
// Save the store data to a file every 10 seconds
setInterval(() => {
    store?.writeToFile('./baileys_store.json');
}, 10_000);


const startSocket = async () => {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: ['Beta Broadcaster', 'Chrome', '1.0.0'],
        
        // --- STABILITY UPGRADE 3: Advanced Connection Options ---
        
        // This will fetch all pending messages when the connection is established
        getMessage: async key => {
            if (store) {
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg?.message || undefined;
            }
            // only if store is not present
            return { conversation: 'hello' };
        },
        
        // This can help mitigate issues with syncd patches
        patchVersion: { account: 1, device: 2 },
        
        // This can help with network connection stability
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 20_000,
        
        // This helps in WA Web resume states
        syncFullHistory: true,
    });
    
    // Bind the store to the socket
    store?.bind(sock.ev);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeData = await qrcode.toDataURL(qr);
            connectionStatus = 'qr';
            console.log('QR code generated.');
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== DisconnectReason.connectionReplaced;
            
            connectionStatus = 'disconnected';
            console.log(`Connection closed due to: ${lastDisconnect.error}, reconnecting: ${shouldReconnect}`);

            if (shouldReconnect) {
                startSocket();
            } else {
                console.log("Connection closed permanently. Deleting session and requesting new QR scan.");
                // We ONLY delete the session if it's a permanent, unrecoverable error.
                await fs.remove(SESSION_DIR);
                await fs.remove('./baileys_store.json');
                // Restarting will now generate a new QR code
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

const broadcast = async (io, socketId, groupObjects, message) => {
    if (!sock || connectionStatus !== 'connected') {
        io.to(socketId).emit('broadcast:error', { message: 'WhatsApp is not connected.' });
        return;
    }

    console.log(`[BROADCAST] Starting advanced broadcast to ${groupObjects.length} groups for socket ${socketId}.`);
    
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

            await sock.sendPresenceUpdate('composing', group.id);
            const typingDelay = Math.floor(Math.random() * (1500 - 750 + 1) + 750);
            await delay(typingDelay);

            await sock.sendMessage(group.id, { text: message });
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
    init: startSocket,
    getSocket,
    getQR,
    getStatus,
    fetchAllGroups,
    broadcast,
};