// Load .env variables for this standalone script
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const cron = require('node-cron');
const pool = require('./config/db');
const alfaApiService = require('./services/alfaApiService');
const { format, subDays } = require('date-fns');

const syncTransactions = async () => {
    console.log('[ALFA-SYNC] Starting scheduled sync of Alfa Trust transactions...');
    try {
        // Fetch transactions for the last 3 days to catch any updates or late entries.
        const dateTo = format(new Date(), 'yyyy-MM-dd');
        const dateFrom = format(subDays(new Date(), 3), 'yyyy-MM-dd');

        const transactions = await alfaApiService.fetchAllTransactions({ dateFrom, dateTo });

        if (transactions.length === 0) {
            console.log('[ALFA-SYNC] No new transactions found in the last 3 days.');
            return;
        }

        const connection = await pool.getConnection();
        let upsertedCount = 0;

        try {
            for (const tx of transactions) {
                const query = `
                    INSERT INTO alfa_transactions (
                        end_to_end_id, transaction_id, inclusion_date, transaction_date, type, 
                        operation, value, title, description, payer_name, payer_document, raw_details
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        inclusion_date = VALUES(inclusion_date),
                        value = VALUES(value),
                        description = VALUES(description),
                        raw_details = VALUES(raw_details);
                `;

                const params = [
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
                ];

                const [result] = await connection.query(query, params);
                if (result.affectedRows > 0) {
                    upsertedCount++;
                }
            }
        } finally {
            connection.release();
        }

        console.log(`[ALFA-SYNC] Sync complete. Processed ${transactions.length} transactions. Upserted ${upsertedCount} records.`);

    } catch (error) {
        console.error('[ALFA-SYNC-ERROR] A critical error occurred during sync:', error.message);
    }
};

console.log('--- Alfa Trust Sync Service Started ---');
console.log('Initial sync will run in 10 seconds...');

// Run once on startup after a short delay
setTimeout(syncTransactions, 10000);

// Schedule to run every minute
cron.schedule('* * * * *', syncTransactions);