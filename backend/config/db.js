const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 100,
    queueLimit: 0,
    dateStrings: true,
    timezone: '+00:00'
});

const slowQueryThresholdMs = Math.max(Number.parseInt(process.env.DB_SLOW_QUERY_MS || '300', 10) || 300, 50);
let activeQueries = 0;
let peakConcurrentQueries = 0;

const baseQuery = pool.query.bind(pool);
pool.query = async (...args) => {
    const startedAt = Date.now();
    activeQueries += 1;
    if (activeQueries > peakConcurrentQueries) {
        peakConcurrentQueries = activeQueries;
    }

    try {
        return await baseQuery(...args);
    } finally {
        const elapsedMs = Date.now() - startedAt;
        activeQueries = Math.max(0, activeQueries - 1);
        if (elapsedMs >= slowQueryThresholdMs) {
            const sqlPreview = String(args[0] || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 220);
            console.warn(`[DB-SLOW] ${elapsedMs}ms | active=${activeQueries} peak=${peakConcurrentQueries} | ${sqlPreview}`);
        }
    }
};

pool.getDiagnostics = () => ({
    activeQueries,
    peakConcurrentQueries,
    slowQueryThresholdMs
});

console.log('[DB] Database connection pool created.');

module.exports = pool;
