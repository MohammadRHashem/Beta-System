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

const syncTransactions = async (isFirstRun = true) => {
    console.log(`[ALFA-SYNC] Starting ${isFirstRun ? 'initial bootstrap' : 'scheduled'} sync...`);
    try {
        const dateTo = format(new Date(), 'yyyy-MM-dd');
        const dateFrom = isFirstRun
            ? '2025-09-29'
            : format(subDays(new Date(), 7), 'yyyy-MM-dd');

        console.log(`[ALFA-SYNC] Fetching all transactions from ${dateFrom} to ${dateTo}. This may take a while...`);
        const transactions = await alfaApiService.fetchAllTransactions({ dateFrom, dateTo });

        if (transactions.length === 0) {
            console.log(`[ALFA-SYNC] No transactions found in the specified period.`);
            return;
        }

        const connection = await pool.getConnection();
        let upsertedCount = 0;

        try {
            // === THE FIX: The INSERT and ON DUPLICATE KEY UPDATE logic is now much more robust ===
            const query = `
                INSERT INTO alfa_transactions (
                    end_to_end_id, transaction_id, inclusion_date, transaction_date, type, 
                    operation, value, title, description, payer_name, payer_document, raw_details
                ) VALUES ?
                ON DUPLICATE KEY UPDATE
                    end_to_end_id = VALUES(end_to_end_id),
                    inclusion_date = VALUES(inclusion_date),
                    value = VALUES(value),
                    description = VALUES(description),
                    payer_name = VALUES(payer_name),
                    payer_document = VALUES(payer_document),
                    raw_details = VALUES(raw_details),
                    updated_at = NOW();
            `;

            const values = transactions.map(tx => [
                // Prioritize the real endToEndId, but it no longer affects uniqueness. Fallback is now just for safety.
                tx.detalhes?.endToEndId || tx.idTransacao,
                tx.idTransacao, // This is now the UNIQUE key for the upsert
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
    
    const [rows] = await pool.query("SELECT COUNT(*) as count FROM alfa_transactions");
    const isBootstrapNeeded = rows[0].count === 0;

    if (isBootstrapNeeded) {
        console.log('[ALFA-SYNC] Table is empty. Performing initial bootstrap sync in 10 seconds...');
        setTimeout(() => syncTransactions(true), 10000);
    } else {
        console.log('[ALFA-SYNC] Data already exists. Starting with an immediate incremental sync...');
        syncTransactions(false);
    }

    cron.schedule('* * * * *', () => syncTransactions(false));
};

main();