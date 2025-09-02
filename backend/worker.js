require('dotenv').config();
const { Worker } = require('bullmq');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const pool = require('./config/db'); // Uses the same DB connection
const { recalculateBalances } = require('./utils/balanceCalculator');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js'); // We need MessageMedia

console.log('--- Starting Dedicated Invoice Worker Process ---');

// We need a lightweight WhatsApp client instance here to get message details,
// but it will share the session with the main server.
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: 'wwebjs_sessions' }),
});

const redisConnection = { 
    host: 'localhost', 
    port: 6379, 
    maxRetriesPerRequest: null 
};

const invoiceWorker = new Worker('invoice-processing-queue', async (job) => {
    // Dynamically import execa to handle ESM module
    const { execa } = await import('execa');

    const { messageId } = job.data;
    console.log(`[DEDICATED WORKER] Started processing job for message ID: ${messageId}`);

    const message = await client.getMessageById(messageId);
    if (!message) {
        console.warn(`[DEDICATED WORKER] Message ${messageId} not found.`);
        return;
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const chat = await message.getChat();
        
        const [tombstoneRows] = await connection.query('SELECT message_id FROM deleted_message_ids WHERE message_id = ?', [messageId]);
        if (tombstoneRows.length > 0) {
            const utcDate = new Date(message.timestamp * 1000);
            const gmtMinus5Date = new Date(utcDate.getTime() - (300 * 60 * 1000));
            const sortOrder = gmtMinus5Date.getTime();
            await connection.query(
               `INSERT INTO invoices (message_id, source_group_jid, received_at, sort_order, is_deleted, notes) VALUES (?, ?, ?, ?, ?, ?)`,
               [messageId, chat.id._serialized, gmtMinus5Date, sortOrder, true, 'Message deleted before processing.']
            );
            await connection.query('DELETE FROM deleted_message_ids WHERE message_id = ?', [messageId]);
            await connection.commit();
            // Note: We cannot emit socket events from here directly. The main app will handle refreshes.
            return;
        }

        const media = await message.downloadMedia();
        if (!media) {
            await connection.commit();
            return;
        }

        const tempFilePath = path.join(os.tmpdir(), `${message.id.id}.${media.mimetype.split('/')[1] || 'bin'}`);
        await fs.writeFile(tempFilePath, Buffer.from(media.data, 'base64'));

        const pythonScriptsDir = path.join(__dirname, 'python_scripts');
        const pythonExecutablePath = path.join(pythonScriptsDir, 'venv', 'bin', 'python3');
        const pythonScriptPath = path.join(pythonScriptsDir, 'main.py');
        const pythonEnv = dotenv.config({ path: path.join(pythonScriptsDir, '.env') }).parsed;

        if (!pythonEnv || !pythonEnv.GOOGLE_API_KEY) throw new Error('Could not load GOOGLE_API_KEY.');
        
        let invoiceJson;
        try {
            const { stdout } = await execa(pythonExecutablePath, [pythonScriptPath, tempFilePath], { cwd: pythonScriptsDir, env: pythonEnv });
            invoiceJson = JSON.parse(stdout);
        } catch (pythonError) {
            await fs.unlink(tempFilePath); throw pythonError;
        }

        const { amount, sender, recipient, transaction_id } = invoiceJson;
        if (!(amount && recipient?.name)) {
             await fs.unlink(tempFilePath); await connection.commit(); return;
        }
        
        const [settings] = await connection.query('SELECT * FROM group_settings WHERE group_jid = ?', [chat.id._serialized]);
        const groupSettings = settings[0] || { forwarding_enabled: true, archiving_enabled: true };

        if (groupSettings.archiving_enabled) {
            const extension = path.extname(media.filename || '') || `.${media.mimetype.split('/')[1] || 'bin'}`;
            const archiveFileName = `${messageId}${extension}`;
            const finalMediaPath = path.join(__dirname, 'media_archive', archiveFileName);
            await fs.rename(tempFilePath, finalMediaPath);
            const utcDate = new Date(message.timestamp * 1000);
            const gmtMinus5Date = new Date(utcDate.getTime() - (300 * 60 * 1000));
            const sortOrder = gmtMinus5Date.getTime();
            await connection.query(
               `INSERT INTO invoices (message_id, transaction_id, sender_name, recipient_name, pix_key, amount, source_group_jid, received_at, sort_order, raw_json_data, media_path, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
               [messageId, transaction_id, sender?.name, recipient.name, recipient.pix_key, amount, chat.id._serialized, gmtMinus5Date, sortOrder, JSON.stringify(invoiceJson), finalMediaPath, false]
            );
            await recalculateBalances(connection, gmtMinus5Date.toISOString());
            console.log(`[DEDICATED WORKER] Invoice from job ${messageId} saved to DB with sort_order ${sortOrder}.`);
        } else {
             await fs.unlink(tempFilePath);
        }
        
        if (groupSettings.forwarding_enabled) {
            const recipientNameLower = (recipient.name || '').toLowerCase().trim();
            if (recipientNameLower) {
                const [rules] = await connection.query('SELECT * FROM forwarding_rules');
                for (const rule of rules) {
                    if (recipientNameLower.includes(rule.trigger_keyword.toLowerCase())) {
                        const mediaToForward = new MessageMedia(media.mimetype, media.data, media.filename);
                        await client.sendMessage(rule.destination_group_jid, mediaToForward);
                        break;
                    }
                }
            }
        }
        
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') { return; }
        console.error(`[DEDICATED WORKER-ERROR] Critical error processing job ${messageId}:`, error);
        throw error;
    } finally {
        connection.release();
    }
}, { 
    connection: redisConnection,
    // This allows the worker to process up to 3 jobs at the same time,
    // greatly improving throughput on multi-core instances.
    concurrency: 3 
});

invoiceWorker.on('failed', (job, err) => {
    console.error(`[QUEUE] Job ${job?.id} failed in dedicated worker: ${err.message}`);
});

console.log(`Dedicated worker is now listening for jobs...`);
// We must initialize the client for the worker to be able to get message details.
client.initialize();