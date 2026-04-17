require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const pool = require('./config/db');
const { format, differenceInHours } = require('date-fns');
const { invalidatePortalReadCaches } = require('./services/readCacheService');

// Configuration
const API_URL = "https://shared-api.trkbit.co/supplier/bank/legacy/bank/brasilcash/account/5602362";
const HISTORY_START_DATE = '2024-01-01'; 
const SYNC_LOCK_NAME = 'trkbit_sync_lock_v1';
const HISTORICAL_SYNC_EVENT = 'trkbit:historical-sync:update';

const createEmptyHistoricalSyncState = () => ({
    status: 'idle',
    mode: null,
    phase: null,
    message: '',
    error: null,
    startedAt: null,
    finishedAt: null,
    updatedAt: null,
    requestedBy: null,
    range: {
        dateFrom: '',
        dateTo: ''
    },
    stats: {
        fetched: 0,
        processed: 0,
        inserted: 0,
        skipped: 0,
        totalChunks: 0,
        completedChunks: 0
    }
});

let historicalSyncState = createEmptyHistoricalSyncState();

const cloneHistoricalSyncState = () => JSON.parse(JSON.stringify(historicalSyncState));

const emitHistoricalSyncState = (io) => {
    if (!io) return;
    io.emit(HISTORICAL_SYNC_EVENT, cloneHistoricalSyncState());
};

const setHistoricalSyncState = (nextState, io) => {
    historicalSyncState = nextState;
    emitHistoricalSyncState(io);
};

const isValidDateInput = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());

const normalizeSyncOptions = (input) => {
    if (typeof input === 'string' || input == null) {
        return {
            startDate: input || null,
            endDate: null,
            insertOnly: false,
            onProgress: null
        };
    }

    return {
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        insertOnly: Boolean(input.insertOnly),
        onProgress: typeof input.onProgress === 'function' ? input.onProgress : null
    };
};

/**
 * Intelligently cleans and truncates a PIX key from the Trkbit API.
 * It first tries to find a logical endpoint (like ']') before doing a generic truncate.
 * This makes the service resilient to malformed API data.
 * @param {string} key The raw PIX key from the API.
 * @returns {string} A cleaned and safe key, guaranteed to be 255 chars or less.
 */
function smartTruncatePixKey(key) {
    const rawKey = key || '';
    
    if (rawKey.length <= 255) {
        return rawKey;
    }

    // --- Intelligent Parsing based on observed API error ---
    const garbageStartIndex = rawKey.indexOf(']');
    if (garbageStartIndex !== -1) {
        const cleanKey = rawKey.substring(0, garbageStartIndex);
        // Final safety check in case the "clean" part is still too long
        return cleanKey.substring(0, 255);
    }

    // --- Fallback Safety Net for unknown error formats ---
    console.warn(`[DATA-WARNING] A long PIX key without a ']' delimiter was found in Trkbit sync. Performing generic truncate.`);
    return rawKey.substring(0, 255);
}

const fetchAndStoreTransactions = async (input = null) => {
    const options = normalizeSyncOptions(input);
    const today = format(new Date(), 'yyyy-MM-dd');
    const startDate = options.startDate || today;
    const endDate = options.endDate || today;

    if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
        throw new Error('A valid start and end date are required.');
    }
    if (startDate > endDate) {
        throw new Error('Start date must be before or equal to end date.');
    }

    let connection = null;
    let lockAcquired = false;

    try {
        connection = await pool.getConnection();
        const [[lockRow]] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [SYNC_LOCK_NAME]);
        if (!lockRow?.acquired) {
            console.log('[TRKBIT-SYNC] Another sync is already running. Skipping this run.');
            return {
                busy: true,
                startDate,
                endDate,
                insertOnly: options.insertOnly
            };
        }
        lockAcquired = true;

        console.log(`[TRKBIT-SYNC] Starting ${options.insertOnly ? 'insert-only historical' : 'sync'} cycle from ${startDate} to ${endDate}...`);
        options.onProgress?.({
            phase: 'fetching',
            message: `Fetching transactions from ${startDate} to ${endDate}...`,
            stats: {
                fetched: 0,
                processed: 0,
                inserted: 0,
                skipped: 0,
                totalChunks: 0,
                completedChunks: 0
            }
        });
        
        const { data } = await axios.get(API_URL, {
            params: { start: startDate, end: endDate },
            timeout: 90000
        });

        if (data.code !== 200 || !data.data || !data.data.inputs) {
            throw new Error('Invalid API response structure.');
        }

        const allTransactions = [];
        if (Array.isArray(data.data.inputs)) {
            data.data.inputs.forEach(dayGroup => {
                if (dayGroup.inputs && Array.isArray(dayGroup.inputs)) {
                    allTransactions.push(...dayGroup.inputs);
                }
            });
        }

        const totalFetched = allTransactions.length;
        const chunkSize = 500;
        const totalChunks = totalFetched > 0 ? Math.ceil(totalFetched / chunkSize) : 0;

        if (allTransactions.length === 0) {
            console.log(`[TRKBIT-SYNC] No new transactions found for range ${startDate} - ${endDate}.`);
            options.onProgress?.({
                phase: 'completed',
                message: `No transactions found for range ${startDate} - ${endDate}.`,
                stats: {
                    fetched: 0,
                    processed: 0,
                    inserted: 0,
                    skipped: 0,
                    totalChunks: 0,
                    completedChunks: 0
                }
            });
            return {
                startDate,
                endDate,
                insertOnly: options.insertOnly,
                fetched: 0,
                processed: 0,
                inserted: 0,
                skipped: 0,
                totalChunks: 0,
                completedChunks: 0,
                busy: false
            };
        }

        console.log(`[TRKBIT-SYNC] Found ${allTransactions.length} transactions in API response. ${options.insertOnly ? 'Inserting only missing rows' : 'Upserting into DB'}...`);

        const query = options.insertOnly
            ? `
                INSERT IGNORE INTO trkbit_transactions
                (uid, tx_id, e2e_id, tx_date, amount, tx_pix_key, tx_type, tx_payer_name, tx_payer_id, raw_data)
                VALUES ?
            `
            : `
                INSERT INTO trkbit_transactions 
                (uid, tx_id, e2e_id, tx_date, amount, tx_pix_key, tx_type, tx_payer_name, tx_payer_id, raw_data)
                VALUES ?
                ON DUPLICATE KEY UPDATE 
                    tx_id = IF(sync_control_state = 'normal', VALUES(tx_id), tx_id),
                    e2e_id = IF(sync_control_state = 'normal', VALUES(e2e_id), e2e_id),
                    tx_date = IF(sync_control_state = 'normal', VALUES(tx_date), tx_date),
                    amount = IF(sync_control_state = 'normal', VALUES(amount), amount),
                    tx_pix_key = IF(sync_control_state = 'normal', VALUES(tx_pix_key), tx_pix_key),
                    tx_type = IF(sync_control_state = 'normal', VALUES(tx_type), tx_type),
                    tx_payer_name = IF(sync_control_state = 'normal', VALUES(tx_payer_name), tx_payer_name),
                    tx_payer_id = IF(sync_control_state = 'normal', VALUES(tx_payer_id), tx_payer_id),
                    raw_data = IF(sync_control_state = 'normal', VALUES(raw_data), raw_data),
                    updated_at = IF(sync_control_state = 'normal', NOW(), updated_at);
            `;

        let processed = 0;
        let inserted = 0;
        let skipped = 0;

        for (let i = 0; i < allTransactions.length; i += chunkSize) {
            const chunk = allTransactions.slice(i, i + chunkSize);
            const values = chunk.map(tx => [
                tx.uid,
                tx.tx_id,
                tx.e2e_id,
                tx.tx_date,
                parseFloat(tx.amount),
                smartTruncatePixKey(tx.tx_pix_key),
                tx.tx_type,
                tx.tx_payer_name,
                tx.tx_payer_id,
                JSON.stringify(tx)
            ]);
            
            const [result] = await connection.query(query, [values]);
            processed += chunk.length;

            if (options.insertOnly) {
                const insertedInChunk = Number(result.affectedRows || 0);
                inserted += insertedInChunk;
                skipped += Math.max(chunk.length - insertedInChunk, 0);
            }

            const completedChunks = Math.floor(i / chunkSize) + 1;
            console.log(`[TRKBIT-SYNC] Processed chunk ${completedChunks}/${totalChunks}. Affected rows: ${result.affectedRows}`);
            options.onProgress?.({
                phase: 'storing',
                message: `Processed chunk ${completedChunks}/${totalChunks}.`,
                stats: {
                    fetched: totalFetched,
                    processed,
                    inserted,
                    skipped,
                    totalChunks,
                    completedChunks
                }
            });
        }

        await connection.query(`
            UPDATE trkbit_transactions tt
            JOIN subaccounts s ON s.chave_pix = tt.tx_pix_key
            SET tt.display_subaccount_id = s.id
            WHERE tt.display_subaccount_id IS NULL OR tt.display_subaccount_id <> s.id
        `);
        invalidatePortalReadCaches();

        return {
            startDate,
            endDate,
            insertOnly: options.insertOnly,
            fetched: totalFetched,
            processed,
            inserted,
            skipped,
            totalChunks,
            completedChunks: totalChunks,
            busy: false
        };

    } catch (error) {
        console.error('[TRKBIT-SYNC-ERROR]', error.message);
        throw error;
    } finally {
        if (lockAcquired && connection) {
            try {
                await connection.query('SELECT RELEASE_LOCK(?)', [SYNC_LOCK_NAME]);
            } catch (releaseError) {
                console.error('[TRKBIT-SYNC] Failed to release sync lock:', releaseError.message);
            }
        }
        if (connection) {
            connection.release();
        }
    }
};

const getHistoricalSyncStatus = () => cloneHistoricalSyncState();

const startHistoricalSync = ({ startDate, endDate, requestedBy = null, io = null }) => {
    if (historicalSyncState.status === 'running') {
        return { started: false, status: cloneHistoricalSyncState() };
    }

    const startedAt = new Date().toISOString();
    setHistoricalSyncState({
        status: 'running',
        mode: 'historical',
        phase: 'queued',
        message: `Starting insert-only historical sync from ${startDate} to ${endDate}...`,
        error: null,
        startedAt,
        finishedAt: null,
        updatedAt: startedAt,
        requestedBy,
        range: {
            dateFrom: startDate,
            dateTo: endDate
        },
        stats: {
            fetched: 0,
            processed: 0,
            inserted: 0,
            skipped: 0,
            totalChunks: 0,
            completedChunks: 0
        }
    }, io);

    void (async () => {
        try {
            const result = await fetchAndStoreTransactions({
                startDate,
                endDate,
                insertOnly: true,
                onProgress: (progress) => {
                    setHistoricalSyncState({
                        ...cloneHistoricalSyncState(),
                        status: 'running',
                        mode: 'historical',
                        phase: progress.phase || 'running',
                        message: progress.message || cloneHistoricalSyncState().message,
                        error: null,
                        finishedAt: null,
                        updatedAt: new Date().toISOString(),
                        stats: {
                            ...cloneHistoricalSyncState().stats,
                            ...(progress.stats || {})
                        }
                    }, io);
                }
            });

            if (result?.busy) {
                setHistoricalSyncState({
                    ...cloneHistoricalSyncState(),
                    status: 'failed',
                    mode: 'historical',
                    phase: 'busy',
                    message: 'Another Trkbit sync is already running. Try again after it finishes.',
                    error: 'Another Trkbit sync is already running.',
                    finishedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }, io);
                return;
            }

            const completedAt = new Date().toISOString();
            setHistoricalSyncState({
                ...cloneHistoricalSyncState(),
                status: 'completed',
                mode: 'historical',
                phase: 'completed',
                message: result.fetched === 0
                    ? 'Historical sync finished. No transactions were returned for the selected range.'
                    : `Historical sync finished. Inserted ${result.inserted} new transaction(s) and skipped ${result.skipped} existing row(s).`,
                error: null,
                finishedAt: completedAt,
                updatedAt: completedAt,
                stats: {
                    fetched: Number(result.fetched || 0),
                    processed: Number(result.processed || 0),
                    inserted: Number(result.inserted || 0),
                    skipped: Number(result.skipped || 0),
                    totalChunks: Number(result.totalChunks || 0),
                    completedChunks: Number(result.completedChunks || 0)
                }
            }, io);

            if (io) {
                io.emit('trkbit:updated', {
                    dateFrom: startDate,
                    dateTo: endDate,
                    inserted: Number(result.inserted || 0),
                    skipped: Number(result.skipped || 0)
                });
            }
        } catch (error) {
            const failedAt = new Date().toISOString();
            setHistoricalSyncState({
                ...cloneHistoricalSyncState(),
                status: 'failed',
                mode: 'historical',
                phase: 'failed',
                message: error.message || 'Historical sync failed.',
                error: error.message || 'Historical sync failed.',
                finishedAt: failedAt,
                updatedAt: failedAt
            }, io);
        }
    })();

    return { started: true, status: cloneHistoricalSyncState() };
};

const main = async () => {
    console.log('--- Trkbit Sync Service Started (Self-Healing v2 & Data-Safe) ---');

    try {
        const [[{ count }]] = await pool.query("SELECT COUNT(*) as count FROM trkbit_transactions");

        if (count === 0) {
            console.log('[TRKBIT-SYNC] Database is empty. Performing INITIAL HISTORY SYNC...');
            await fetchAndStoreTransactions({ startDate: HISTORY_START_DATE, endDate: format(new Date(), 'yyyy-MM-dd') });
            console.log('[TRKBIT-SYNC] Initial history sync complete.');
        } else {
            const [[{ latest_tx_date }]] = await pool.query("SELECT MAX(tx_date) as latest_tx_date FROM trkbit_transactions");
            
            const now = new Date();
            const lastSyncDate = new Date(latest_tx_date);
            const hoursSinceLastSync = differenceInHours(now, lastSyncDate);

            if (hoursSinceLastSync > 2) {
                const catchUpStartDate = format(lastSyncDate, 'yyyy-MM-dd');
                console.log(`[TRKBIT-SYNC] Last transaction is from over 2 hours ago (at ${lastSyncDate.toLocaleString()}). Assuming downtime.`);
                console.log(`[TRKBIT-SYNC] Performing CATCH-UP sync starting from ${catchUpStartDate}...`);
                await fetchAndStoreTransactions({ startDate: catchUpStartDate, endDate: format(new Date(), 'yyyy-MM-dd') });
            } else {
                console.log(`[TRKBIT-SYNC] Data is recent. Performing standard incremental sync for today.`);
                await fetchAndStoreTransactions(null); 
            }
        }

    } catch (e) {
        console.error('[TRKBIT-SYNC] FATAL: Failed to run startup sync logic:', e.message);
    }

    cron.schedule('* * * * *', () => {
        void fetchAndStoreTransactions(null).catch(() => {});
    });
    console.log('[TRKBIT-SYNC] Recurring 1-minute sync for "today" has been scheduled.');
};

if (require.main === module) {
    main();
}

module.exports = {
    fetchAndStoreTransactions,
    getHistoricalSyncStatus,
    startHistoricalSync
};
