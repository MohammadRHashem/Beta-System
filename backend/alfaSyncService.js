require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cron = require('node-cron');
const pool = require('./config/db');
const alfaApiService = require('./services/alfaApiService');
const { format, subDays, startOfYear } = require('date-fns');
const axios = require('axios');


const notifyServerOfUpdate = async () => {
    try {
        // Calls an endpoint on our own server to trigger the socket emit
        const port = process.env.PORT || 5000;
        await axios.post(`http://localhost:${port}/api/alfa-trust/notify-update`);
        console.log('[ALFA-SYNC] Notified main server of data update.');
    } catch (error) {
        console.error('[ALFA-SYNC-ERROR] Could not notify main server of update:', error.message);
    }
};

const syncTransactions = async (isFirstRun = false) => {
    console.log(`[ALFA-SYNC] Starting ${isFirstRun ? 'initial bootstrap' : 'scheduled'} sync...`);
    try {
        const dateTo = format(new Date(), 'yyyy-MM-dd');
        // === THE FIX: Fetch a much larger range on the first run ===
        const dateFrom = isFirstRun
            ? '2025-09-30' // On first run, go way back
            : format(subDays(new Date(), 7), 'yyyy-MM-dd'); // Subsequent runs only need last 7 days

        console.log(`[ALFA-SYNC] Fetching all transactions from ${dateFrom} to ${dateTo}. This may take a while...`);
        const transactions = await alfaApiService.fetchAllTransactions({ dateFrom, dateTo });

        if (transactions.length === 0) {
            console.log(`[ALFA-SYNC] No transactions found in the specified period.`);
            return;
        }

        const connection = await pool.getConnection();
        let upsertedCount = 0;

        try {
            // === THE FIX: Use a prepared statement for much faster bulk inserts ===
            const query = `
                INSERT INTO alfa_transactions (
                    end_to_end_id, transaction_id, inclusion_date, transaction_date, type, 
                    operation, value, title, description, payer_name, payer_document, raw_details
                ) VALUES ?
                ON DUPLICATE KEY UPDATE
                    inclusion_date = VALUES(inclusion_date),
                    value = VALUES(value),
                    description = VALUES(description),
                    raw_details = VALUES(raw_details);
            `;

            // Map all transactions to the format needed for bulk insert
            const values = transactions.map(tx => [
                tx.detalhes?.endToEndId || tx.idTransacao,
                tx.idTransacao,
                tx.dataInclusao,
                tx.dataTransacao,
                tx.tipoTransacao,
                tx.tipoOperacao,
                parseFloat(tx.valor),
                tx.titulo,
                tx.descricao,
                tx.detalhes?.nomePagador || null,
                tx.detalhes?.cpfCnpjPagador || null,
                JSON.stringify(tx)
            ]);
            
            const [result] = await connection.query(query, [values]);
            upsertedCount = result.affectedRows;
            // === END FIX ===

        } finally {
            connection.release();
        }

        console.log(`[ALFA-SYNC] Sync complete. Processed ${transactions.length} transactions. Upserted/Updated ${upsertedCount} records.`);

        if (upsertedCount > 0) {
            await notifyServerOfUpdate();
        }

    } catch (error) {
        console.error('[ALFA-SYNC-ERROR] A critical error occurred during sync:', error.message);
    }
};

const main = async () => {
    console.log('--- Alfa Trust Sync Service Started ---');
    
    // Check if the table is empty to decide if this is the first run
    const [rows] = await pool.query("SELECT COUNT(*) as count FROM alfa_transactions");
    const isBootstrapNeeded = rows[0].count === 0;

    if (isBootstrapNeeded) {
        console.log('[ALFA-SYNC] Table is empty. Performing initial bootstrap sync in 10 seconds...');
        setTimeout(() => syncTransactions(true), 10000);
    } else {
        console.log('[ALFA-SYNC] Data already exists. Starting with an immediate incremental sync...');
        // Run once on startup
        syncTransactions(false);
    }

    // Schedule to run every minute for incremental updates
    cron.schedule('* * * * *', () => syncTransactions(false));
};

main();