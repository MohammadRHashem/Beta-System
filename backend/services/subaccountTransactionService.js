const crypto = require('crypto');
const pool = require('../config/db');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

const VIEWER_MODE = {
    IMPERSONATION: 'impersonation',
    MASTER: 'master',
    VIEW_ONLY: 'view_only'
};

const normalizeDateTime = (value) => {
    if (!value || typeof value !== 'string') return null;
    let trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.includes('T')) trimmed = trimmed.replace('T', ' ');
    if (trimmed.endsWith('Z')) trimmed = trimmed.slice(0, -1);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) trimmed += ':00';
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) return null;
    return trimmed;
};

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

const parseAmount = (value) => {
    const numeric = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(numeric)) return null;
    return Number(numeric.toFixed(2));
};

const parseExactAmount = (value) => {
    if (value === '' || value == null) return null;
    return parseAmount(value);
};

const sanitizeText = (value, maxLength = 255) => {
    if (value == null) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    return normalized.slice(0, maxLength);
};

const sanitizeBadgeLabel = (value) => {
    const normalized = sanitizeText(value, 50);
    return normalized || null;
};

const createUuid = () => {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return crypto.randomBytes(16).toString('hex');
};

const createSyntheticXpayzTransactionId = () => {
    const base = Date.now() % 2000000000;
    const entropy = Math.floor(Math.random() * 1000);
    const candidate = Number(String(base).slice(-7) + String(entropy).padStart(3, '0'));
    return -1 * Math.max(candidate, 1);
};

const getTodayDateValue = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getViewerMode = (client) => {
    if (client?.impersonation === true) return VIEWER_MODE.IMPERSONATION;
    if (client?.accessLevel === 'view_only') return VIEWER_MODE.VIEW_ONLY;
    return VIEWER_MODE.MASTER;
};

const normalizePortalFiltersForViewerMode = (filters = {}, viewerMode) => {
    const normalized = { ...filters };

    if (viewerMode === VIEWER_MODE.VIEW_ONLY) {
        const today = getTodayDateValue();
        return {
            ...normalized,
            dateFrom: today,
            dateTo: today,
            direction: 'in',
            pool: 'statement'
        };
    }

    if (viewerMode === VIEWER_MODE.MASTER) {
        const exactDate = isValidDate(normalized.dateFrom) ? normalized.dateFrom : '';
        return {
            ...normalized,
            dateFrom: exactDate,
            dateTo: exactDate
        };
    }

    return normalized;
};

const assertImpersonation = (client) => {
    if (getViewerMode(client) !== VIEWER_MODE.IMPERSONATION) {
        const error = new Error('Impersonation access required.');
        error.status = 403;
        throw error;
    }
};

const resolveSourceFromAccountType = (accountType) => {
    if (accountType === 'cross') return 'trkbit';
    return 'xpayz';
};

const addDateFilters = (filters, fieldName, params, clauses) => {
    const { dateFrom, dateTo } = filters;
    if (isValidDate(dateFrom)) {
        clauses.push(`${fieldName} >= ?`);
        params.push(`${dateFrom} 00:00:00`);
    }
    if (isValidDate(dateTo)) {
        clauses.push(`${fieldName} <= ?`);
        params.push(`${dateTo} 23:59:59`);
    }
};

const addConfirmationFilter = (filters, fieldName, clauses) => {
    if (filters.confirmation === 'confirmed') {
        clauses.push(`${fieldName} = 1`);
    } else if (filters.confirmation === 'pending') {
        clauses.push(`${fieldName} = 0`);
    }
};

const addVisibilityFilters = (viewerMode, hiddenField, visibleMasterField, visibleViewOnlyField, clauses) => {
    if (viewerMode !== VIEWER_MODE.IMPERSONATION && hiddenField) {
        clauses.push(`${hiddenField} <> 'hidden'`);
    }
    if (viewerMode === VIEWER_MODE.MASTER && visibleMasterField) {
        clauses.push(`${visibleMasterField} = 1`);
    }
    if (viewerMode === VIEWER_MODE.VIEW_ONLY && visibleViewOnlyField) {
        clauses.push(`${visibleViewOnlyField} = 1`);
    }
};

const getStatementConfig = (accountType) => {
    if (accountType === 'cross') {
        return {
            source: 'trkbit',
            fromSql: `
                FROM trkbit_transactions tt
                LEFT JOIN subaccounts owner_sub ON owner_sub.chave_pix = tt.tx_pix_key
            `,
            effectiveOwnerSql: 'COALESCE(tt.display_subaccount_id, owner_sub.id)',
            dateField: 'tt.tx_date',
            confirmationField: 'tt.is_portal_confirmed',
            visibleMasterField: 'tt.visible_in_master',
            visibleViewOnlyField: 'tt.visible_in_view_only',
            hiddenField: 'tt.sync_control_state',
            searchSql: `(COALESCE(tt.tx_payer_name, '') LIKE ? OR COALESCE(JSON_UNQUOTE(JSON_EXTRACT(tt.raw_data, '$.tx_payee_name')), '') LIKE ? OR COALESCE(tt.tx_id, '') LIKE ? OR COALESCE(tt.e2e_id, '') LIKE ? OR COALESCE(tt.portal_notes, '') LIKE ? OR COALESCE(tt.badge_label, '') LIKE ?)`,
            directionSql: (direction) => direction === 'in' ? "tt.tx_type = 'C'" : "tt.tx_type = 'D'",
            signedAmountSql: "CASE WHEN tt.tx_type = 'C' THEN tt.amount ELSE -tt.amount END",
            creditAmountSql: "CASE WHEN tt.tx_type = 'C' THEN tt.amount ELSE 0 END",
            debitAmountSql: "CASE WHEN tt.tx_type = 'D' THEN tt.amount ELSE 0 END",
            creditCountSql: "CASE WHEN tt.tx_type = 'C' THEN 1 ELSE NULL END",
            debitCountSql: "CASE WHEN tt.tx_type = 'D' THEN 1 ELSE NULL END",
            selectSql: `
                SELECT
                    tt.uid AS id,
                    tt.uid AS source_id,
                    'trkbit' AS source,
                    'statement' AS pool,
                    tt.tx_date AS transaction_date,
                    tt.amount,
                    CASE WHEN tt.tx_type = 'C' THEN 'in' ELSE 'out' END AS operation_direct,
                    CASE WHEN tt.tx_type = 'C' THEN tt.tx_payer_name ELSE 'CROSS INTERMEDIAÇÃO LTDA' END AS sender_name,
                    CASE WHEN tt.tx_type = 'D' THEN JSON_UNQUOTE(JSON_EXTRACT(tt.raw_data, '$.tx_payee_name')) ELSE 'CROSS INTERMEDIAÇÃO LTDA' END AS counterparty_name,
                    tt.is_portal_confirmed,
                    tt.portal_notes,
                    tt.entry_origin,
                    tt.badge_label,
                    tt.sync_control_state,
                    tt.visible_in_master,
                    tt.visible_in_view_only,
                    COALESCE(tt.display_subaccount_id, owner_sub.id) AS effective_subaccount_id,
                    tt.tx_id AS external_reference,
                    tt.updated_by_user_id
            `
        };
    }

    return {
        source: 'xpayz',
        fromSql: `
            FROM xpayz_transactions xt
            LEFT JOIN subaccounts owner_sub ON owner_sub.subaccount_number = CAST(xt.subaccount_id AS CHAR)
            LEFT JOIN bridge_transactions bt ON bt.xpayz_transaction_id = xt.id
        `,
        effectiveOwnerSql: 'COALESCE(xt.display_subaccount_id, owner_sub.id)',
        dateField: 'xt.transaction_date',
        confirmationField: 'xt.is_portal_confirmed',
        visibleMasterField: 'xt.visible_in_master',
        visibleViewOnlyField: 'xt.visible_in_view_only',
        hiddenField: 'xt.sync_control_state',
        searchSql: `(COALESCE(xt.sender_name, '') LIKE ? OR COALESCE(xt.counterparty_name, '') LIKE ? OR COALESCE(xt.portal_notes, '') LIKE ? OR COALESCE(xt.badge_label, '') LIKE ? OR CAST(xt.xpayz_transaction_id AS CHAR) LIKE ? OR COALESCE(bt.correlation_id, '') LIKE ?)`,
        directionSql: () => 'xt.operation_direct = ?',
        directionValue: (direction) => direction,
        signedAmountSql: "CASE WHEN xt.operation_direct = 'in' THEN xt.amount ELSE -xt.amount END",
        creditAmountSql: "CASE WHEN xt.operation_direct = 'in' THEN xt.amount ELSE 0 END",
        debitAmountSql: "CASE WHEN xt.operation_direct = 'out' THEN xt.amount ELSE 0 END",
        creditCountSql: "CASE WHEN xt.operation_direct = 'in' THEN 1 ELSE NULL END",
        debitCountSql: "CASE WHEN xt.operation_direct = 'out' THEN 1 ELSE NULL END",
        selectSql: `
            SELECT
                xt.id AS id,
                xt.id AS source_id,
                'xpayz' AS source,
                'statement' AS pool,
                xt.transaction_date,
                xt.amount,
                xt.operation_direct,
                xt.sender_name,
                xt.counterparty_name,
                xt.is_portal_confirmed,
                xt.portal_notes,
                xt.entry_origin,
                xt.badge_label,
                xt.sync_control_state,
                xt.visible_in_master,
                xt.visible_in_view_only,
                COALESCE(xt.display_subaccount_id, owner_sub.id) AS effective_subaccount_id,
                xt.xpayz_transaction_id AS external_reference,
                xt.updated_by_user_id,
                bt.correlation_id,
                bt.status AS bridge_status
        `
    };
};

const addStatementFilters = (config, filters, viewerMode, params, clauses) => {
    if (filters.search) {
        const searchTerm = `%${filters.search.trim()}%`;
        clauses.push(config.searchSql);
        params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const amountExact = parseExactAmount(filters.amountExact);
    if (amountExact != null) {
        clauses.push(`${config.source === 'trkbit' ? 'tt' : 'xt'}.amount = ?`);
        params.push(amountExact);
    }

    addDateFilters(filters, config.dateField, params, clauses);
    addConfirmationFilter(filters, config.confirmationField, clauses);
    addVisibilityFilters(viewerMode, config.hiddenField, config.visibleMasterField, config.visibleViewOnlyField, clauses);

    if (filters.direction === 'in' || filters.direction === 'out') {
        clauses.push(config.directionSql(filters.direction));
        if (typeof config.directionValue === 'function') {
            params.push(config.directionValue(filters.direction));
        }
    }
};

const addManualFilters = (filters, viewerMode, params, clauses) => {
    if (filters.search) {
        const searchTerm = `%${filters.search.trim()}%`;
        clauses.push(`(
            COALESCE(smt.sender_name, '') LIKE ?
            OR COALESCE(smt.counterparty_name, '') LIKE ?
            OR COALESCE(smt.portal_notes, '') LIKE ?
            OR COALESCE(smt.badge_label, '') LIKE ?
        )`);
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const amountExact = parseExactAmount(filters.amountExact);
    if (amountExact != null) {
        clauses.push('smt.amount = ?');
        params.push(amountExact);
    }

    addDateFilters(filters, 'smt.transaction_date', params, clauses);
    addConfirmationFilter(filters, 'smt.is_portal_confirmed', clauses);
    addVisibilityFilters(viewerMode, null, 'smt.visible_in_master', 'smt.visible_in_view_only', clauses);

    if (filters.direction === 'in' || filters.direction === 'out') {
        clauses.push('smt.direction = ?');
        params.push(filters.direction);
    }
};

const buildWhereSql = (clauses) => (clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '');

const normalizeRows = (rows = []) => rows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0),
    is_portal_confirmed: Number(row.is_portal_confirmed || 0),
    visible_in_master: Number(row.visible_in_master || 0),
    visible_in_view_only: Number(row.visible_in_view_only || 0),
    is_hidden: row.sync_control_state === 'hidden',
    badge_label: row.badge_label || null,
    transaction_key: `${row.pool}:${row.source}:${row.id}`
}));

const getSubaccountById = async (subaccountId) => {
    const [[subaccount]] = await pool.query(
        'SELECT id, name, account_type, portal_source_type, invoice_recipient_pattern, subaccount_number, chave_pix, assigned_group_name FROM subaccounts WHERE id = ?',
        [subaccountId]
    );
    return subaccount || null;
};

const getSubaccountByNumber = async (subaccountNumber) => {
    const [[subaccount]] = await pool.query(
        'SELECT id, name, account_type, portal_source_type, invoice_recipient_pattern, subaccount_number, chave_pix, assigned_group_name FROM subaccounts WHERE subaccount_number = ?',
        [subaccountNumber]
    );
    return subaccount || null;
};

const getPortalSubaccount = async (client) => {
    if (!client?.subaccountId) {
        const error = new Error('Missing subaccount context.');
        error.status = 400;
        throw error;
    }
    const subaccount = await getSubaccountById(client.subaccountId);
    if (!subaccount) {
        const error = new Error('Subaccount not found.');
        error.status = 404;
        throw error;
    }
    return subaccount;
};

const listStatementTransactions = async ({ subaccount, filters = {}, viewerMode, pagination }) => {
    const config = getStatementConfig(subaccount.account_type);
    const clauses = [`${config.effectiveOwnerSql} = ?`];
    const params = [subaccount.id];

    addStatementFilters(config, filters, viewerMode, params, clauses);

    const whereSql = buildWhereSql(clauses);
    const countSql = `SELECT COUNT(*) AS total ${config.fromSql} ${whereSql}`;
    const [[{ total }]] = await pool.query(countSql, params);

    let rows = [];
    if (Number(total) > 0) {
        let dataSql = `${config.selectSql} ${config.fromSql} ${whereSql} ORDER BY ${config.dateField} DESC`;
        const dataParams = [...params];
        if (pagination && !pagination.isAll) {
            dataSql += ' LIMIT ? OFFSET ?';
            dataParams.push(pagination.limitValue, pagination.offset);
        }
        [rows] = await pool.query(dataSql, dataParams);
    }

    return {
        source: config.source,
        total: Number(total || 0),
        rows: normalizeRows(rows)
    };
};

const listManualTransactions = async ({ subaccount, filters = {}, viewerMode, pagination }) => {
    const clauses = ['smt.subaccount_id = ?'];
    const params = [subaccount.id];

    addManualFilters(filters, viewerMode, params, clauses);

    const whereSql = buildWhereSql(clauses);
    const countSql = `SELECT COUNT(*) AS total FROM subaccount_manual_transactions smt ${whereSql}`;
    const [[{ total }]] = await pool.query(countSql, params);

    let rows = [];
    if (Number(total) > 0) {
        let dataSql = `
            SELECT
                smt.id,
                smt.id AS source_id,
                'manual' AS source,
                'manual' AS pool,
                smt.transaction_date,
                smt.amount,
                smt.direction AS operation_direct,
                smt.sender_name,
                smt.counterparty_name,
                smt.is_portal_confirmed,
                smt.portal_notes,
                'manual' AS entry_origin,
                smt.badge_label,
                NULL AS sync_control_state,
                smt.visible_in_master,
                smt.visible_in_view_only,
                smt.subaccount_id AS effective_subaccount_id,
                NULL AS external_reference,
                smt.updated_by_user_id
            FROM subaccount_manual_transactions smt
            ${whereSql}
            ORDER BY smt.transaction_date DESC
        `;
        const dataParams = [...params];
        if (pagination && !pagination.isAll) {
            dataSql += ' LIMIT ? OFFSET ?';
            dataParams.push(pagination.limitValue, pagination.offset);
        }
        [rows] = await pool.query(dataSql, dataParams);
    }

    return {
        source: 'manual',
        total: Number(total || 0),
        rows: normalizeRows(rows)
    };
};

const calculateStatementBalance = async ({ subaccount, filters = {}, viewerMode }) => {
    const config = getStatementConfig(subaccount.account_type);
    const clauses = [`${config.effectiveOwnerSql} = ?`];
    const params = [subaccount.id];
    addStatementFilters(config, filters, viewerMode, params, clauses);
    const whereSql = buildWhereSql(clauses);
    const sql = `SELECT COALESCE(SUM(${config.signedAmountSql}), 0) AS balance ${config.fromSql} ${whereSql}`;
    const [[row]] = await pool.query(sql, params);
    return Number(row?.balance || 0);
};

const calculateManualBalance = async ({ subaccount, filters = {}, viewerMode }) => {
    const clauses = ['smt.subaccount_id = ?'];
    const params = [subaccount.id];
    addManualFilters(filters, viewerMode, params, clauses);
    const whereSql = buildWhereSql(clauses);
    const sql = `
        SELECT COALESCE(SUM(CASE WHEN smt.direction = 'in' THEN smt.amount ELSE -smt.amount END), 0) AS balance
        FROM subaccount_manual_transactions smt
        ${whereSql}
    `;
    const [[row]] = await pool.query(sql, params);
    return Number(row?.balance || 0);
};

const calculateStatementFlowSummary = async ({ subaccount, filters = {}, viewerMode }) => {
    const config = getStatementConfig(subaccount.account_type);
    const clauses = [`${config.effectiveOwnerSql} = ?`];
    const params = [subaccount.id];
    addStatementFilters(config, filters, viewerMode, params, clauses);
    const whereSql = buildWhereSql(clauses);
    const sql = `
        SELECT
            COALESCE(SUM(${config.creditAmountSql}), 0) AS totalIn,
            COALESCE(SUM(${config.debitAmountSql}), 0) AS totalOut,
            COUNT(${config.creditCountSql}) AS countIn,
            COUNT(${config.debitCountSql}) AS countOut
        ${config.fromSql}
        ${whereSql}
    `;
    const [[row]] = await pool.query(sql, params);
    return {
        totalIn: Number(row?.totalIn || 0),
        totalOut: Number(row?.totalOut || 0),
        countIn: Number(row?.countIn || 0),
        countOut: Number(row?.countOut || 0)
    };
};

const calculateManualFlowSummary = async ({ subaccount, filters = {}, viewerMode }) => {
    const clauses = ['smt.subaccount_id = ?'];
    const params = [subaccount.id];
    addManualFilters(filters, viewerMode, params, clauses);
    const whereSql = buildWhereSql(clauses);
    const sql = `
        SELECT
            COALESCE(SUM(CASE WHEN smt.direction = 'in' THEN smt.amount ELSE 0 END), 0) AS totalIn,
            COALESCE(SUM(CASE WHEN smt.direction = 'out' THEN smt.amount ELSE 0 END), 0) AS totalOut,
            COUNT(CASE WHEN smt.direction = 'in' THEN 1 ELSE NULL END) AS countIn,
            COUNT(CASE WHEN smt.direction = 'out' THEN 1 ELSE NULL END) AS countOut
        FROM subaccount_manual_transactions smt
        ${whereSql}
    `;
    const [[row]] = await pool.query(sql, params);
    return {
        totalIn: Number(row?.totalIn || 0),
        totalOut: Number(row?.totalOut || 0),
        countIn: Number(row?.countIn || 0),
        countOut: Number(row?.countOut || 0)
    };
};

const getDashboardSummary = async ({ subaccount, filters = {}, viewerMode }) => {
    const normalizedFilters = normalizePortalFiltersForViewerMode(filters, viewerMode);
    const activePool = normalizedFilters.pool === 'manual' ? 'manual' : 'statement';
    const statementBalance = await calculateStatementBalance({ subaccount, filters: normalizedFilters, viewerMode });
    const manualBalance = await calculateManualBalance({ subaccount, filters: normalizedFilters, viewerMode });
    const statementAllTimeBalance = await calculateStatementBalance({ subaccount, filters: {}, viewerMode });
    const manualAllTimeBalance = await calculateManualBalance({ subaccount, filters: {}, viewerMode });
    const flowSummary = activePool === 'manual'
        ? await calculateManualFlowSummary({ subaccount, filters: normalizedFilters, viewerMode })
        : await calculateStatementFlowSummary({ subaccount, filters: normalizedFilters, viewerMode });

    return {
        activePool,
        totalIn: flowSummary.totalIn,
        totalOut: flowSummary.totalOut,
        countIn: flowSummary.countIn,
        countOut: flowSummary.countOut,
        statementBalance,
        manualBalance,
        combinedBalance: statementBalance + manualBalance,
        allTimeBalance: statementAllTimeBalance + manualAllTimeBalance,
        statementAllTimeBalance,
        manualAllTimeBalance
    };
};

const listPortalTransactions = async (client, query = {}) => {
    const subaccount = await getPortalSubaccount(client);
    const viewerMode = getViewerMode(client);
    const normalizedQuery = normalizePortalFiltersForViewerMode(query, viewerMode);
    const pagination = parsePagination(query, { defaultLimit: 50, allowAll: true });
    const activePool = normalizedQuery.pool === 'manual' ? 'manual' : 'statement';

    const result = activePool === 'manual'
        ? await listManualTransactions({ subaccount, filters: normalizedQuery, viewerMode, pagination })
        : await listStatementTransactions({ subaccount, filters: normalizedQuery, viewerMode, pagination });

    return {
        transactions: result.rows,
        pagination: buildPaginationMeta(result.total, pagination),
        pool: activePool
    };
};

const loadStatementTransactionForSubaccount = async ({ subaccount, source, transactionId }) => {
    if (source === 'trkbit') {
        const [[row]] = await pool.query(
            `
                SELECT
                    tt.*,
                    COALESCE(tt.display_subaccount_id, owner_sub.id) AS effective_subaccount_id
                FROM trkbit_transactions tt
                LEFT JOIN subaccounts owner_sub ON owner_sub.chave_pix = tt.tx_pix_key
                WHERE tt.uid = ?
                LIMIT 1
            `,
            [transactionId]
        );
        if (!row || Number(row.effective_subaccount_id) !== Number(subaccount.id)) return null;
        return row;
    }

    const [[row]] = await pool.query(
        `
            SELECT
                xt.*,
                COALESCE(xt.display_subaccount_id, owner_sub.id) AS effective_subaccount_id
            FROM xpayz_transactions xt
            LEFT JOIN subaccounts owner_sub ON owner_sub.subaccount_number = CAST(xt.subaccount_id AS CHAR)
            WHERE xt.id = ?
            LIMIT 1
        `,
        [transactionId]
    );
    if (!row || Number(row.effective_subaccount_id) !== Number(subaccount.id)) return null;
    return row;
};

const createStatementTransaction = async ({ subaccount, actorUserId, payload }) => {
    const normalizedDate = normalizeDateTime(payload.transaction_date || payload.tx_date);
    const amount = parseAmount(payload.amount);
    const direction = payload.operation_direct === 'out' || payload.direction === 'out' ? 'out' : 'in';
    const senderName = sanitizeText(payload.sender_name, 255) || (direction === 'out' ? 'CROSS INTERMEDIAÇÃO LTDA' : 'Manual Entry');
    const counterpartyName = sanitizeText(payload.counterparty_name, 255) || 'Manual Entry';
    const notes = sanitizeText(payload.portal_notes ?? payload.description, 30);

    if (!normalizedDate) {
        const error = new Error('Valid date/time is required.');
        error.status = 400;
        throw error;
    }
    if (!Number.isFinite(amount)) {
        const error = new Error('Valid amount is required.');
        error.status = 400;
        throw error;
    }

    if (subaccount.account_type === 'cross') {
        const uid = `manual:${createUuid()}`;
        const txId = `manual:${createUuid()}`;
        const rawData = JSON.stringify({
            uid,
            tx_id: txId,
            tx_date: normalizedDate,
            tx_type: direction === 'in' ? 'C' : 'D',
            tx_pix_key: subaccount.chave_pix,
            tx_payee_name: counterpartyName,
            tx_payer_name: senderName,
            amount
        });

        await pool.query(
            `
                INSERT INTO trkbit_transactions (
                    uid, tx_id, e2e_id, tx_date, amount, tx_pix_key, display_subaccount_id,
                    entry_origin, sync_control_state, badge_label, visible_in_master, visible_in_view_only,
                    tx_type, tx_payer_name, tx_payer_id, raw_data, is_used, updated_by_user_id, portal_notes
                ) VALUES (
                    ?, ?, NULL, ?, ?, ?, ?,
                    'statement_manual', 'blocked', NULL, 1, 1,
                    ?, ?, 'SYSTEM_MANUAL', ?, 1, ?, ?
                )
            `,
            [
                uid,
                txId,
                normalizedDate,
                amount,
                subaccount.chave_pix,
                subaccount.id,
                direction === 'in' ? 'C' : 'D',
                senderName,
                rawData,
                actorUserId || null,
                notes
            ]
        );

        return { id: uid, source: 'trkbit' };
    }

    const syntheticId = createSyntheticXpayzTransactionId();
    const [result] = await pool.query(
        `
            INSERT INTO xpayz_transactions (
                xpayz_transaction_id, subaccount_id, display_subaccount_id, entry_origin, sync_control_state,
                badge_label, visible_in_master, visible_in_view_only, amount, operation_direct, sender_name,
                sender_name_normalized, counterparty_name, transaction_date, raw_details, external_id,
                is_portal_confirmed, portal_notes, updated_by_user_id
            ) VALUES (
                ?, ?, ?, 'statement_manual', 'blocked',
                NULL, 1, 1, ?, ?, ?,
                ?, ?, ?, JSON_OBJECT('manual', TRUE, 'subaccount_id', ?, 'created_at', ?), ?,
                0, ?, ?
            )
        `,
        [
            syntheticId,
            subaccount.subaccount_number,
            subaccount.id,
            amount,
            direction,
            senderName,
            senderName.toLowerCase(),
            counterpartyName,
            normalizedDate,
            subaccount.id,
            normalizedDate,
            `manual:${syntheticId}`,
            notes,
            actorUserId || null
        ]
    );

    return { id: result.insertId, source: 'xpayz' };
};

const updateStatementTransaction = async ({ subaccount, actorUserId, transactionId, payload }) => {
    const source = resolveSourceFromAccountType(subaccount.account_type);
    const existing = await loadStatementTransactionForSubaccount({ subaccount, source, transactionId });
    if (!existing) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }

    const normalizedDate = normalizeDateTime(payload.transaction_date || payload.tx_date) || existing.tx_date || existing.transaction_date;
    const amount = parseAmount(payload.amount);
    const direction = payload.operation_direct === 'out' || payload.direction === 'out'
        ? 'out'
        : (payload.operation_direct === 'in' || payload.direction === 'in'
            ? 'in'
            : (source === 'trkbit' ? (existing.tx_type === 'C' ? 'in' : 'out') : existing.operation_direct));

    if (!normalizedDate) {
        const error = new Error('Valid date/time is required.');
        error.status = 400;
        throw error;
    }
    if (!Number.isFinite(amount)) {
        const error = new Error('Valid amount is required.');
        error.status = 400;
        throw error;
    }

    const senderName = sanitizeText(payload.sender_name, 255)
        || existing.sender_name
        || existing.tx_payer_name
        || 'Manual Entry';
    const counterpartyName = sanitizeText(payload.counterparty_name, 255)
        || existing.counterparty_name
        || 'Manual Entry';

    if (source === 'trkbit') {
        let existingRaw = {};
        if (existing.raw_data) {
            try {
                existingRaw = typeof existing.raw_data === 'string' ? JSON.parse(existing.raw_data) : existing.raw_data;
            } catch (_error) {
                existingRaw = {};
            }
        }
        const rawData = JSON.stringify({
            ...existingRaw,
            tx_date: normalizedDate,
            tx_type: direction === 'in' ? 'C' : 'D',
            tx_payee_name: counterpartyName,
            tx_payer_name: senderName,
            amount
        });

        await pool.query(
            `
                UPDATE trkbit_transactions
                SET tx_date = ?,
                    amount = ?,
                    tx_type = ?,
                    tx_payer_name = ?,
                    raw_data = ?,
                    sync_control_state = 'blocked',
                    updated_by_user_id = ?
                WHERE uid = ?
            `,
            [
                normalizedDate,
                amount,
                direction === 'in' ? 'C' : 'D',
                senderName,
                rawData,
                actorUserId || null,
                transactionId
            ]
        );
        return;
    }

    await pool.query(
        `
            UPDATE xpayz_transactions
            SET transaction_date = ?,
                amount = ?,
                operation_direct = ?,
                sender_name = ?,
                counterparty_name = ?,
                sync_control_state = 'blocked',
                updated_by_user_id = ?
            WHERE id = ?
        `,
        [
            normalizedDate,
            amount,
            direction,
            senderName,
            counterpartyName,
            actorUserId || null,
            transactionId
        ]
    );
};

const deleteStatementTransaction = async ({ subaccount, actorUserId, transactionId }) => {
    const source = resolveSourceFromAccountType(subaccount.account_type);
    const existing = await loadStatementTransactionForSubaccount({ subaccount, source, transactionId });
    if (!existing) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }

    if (source === 'trkbit') {
        await pool.query(
            `
                UPDATE trkbit_transactions
                SET amount = 0,
                    sync_control_state = 'hidden',
                    updated_by_user_id = ?
                WHERE uid = ?
            `,
            [actorUserId || null, transactionId]
        );
        return;
    }

    await pool.query(
        `
            UPDATE xpayz_transactions
            SET amount = 0,
                sync_control_state = 'hidden',
                updated_by_user_id = ?
            WHERE id = ?
        `,
        [actorUserId || null, transactionId]
    );
};

const createManualTransaction = async ({ subaccount, actorUserId, payload }) => {
    const normalizedDate = normalizeDateTime(payload.transaction_date || payload.tx_date);
    const amount = parseAmount(payload.amount);
    const direction = payload.direction === 'out' || payload.operation_direct === 'out' ? 'out' : 'in';
    const senderName = sanitizeText(payload.sender_name, 255);
    const counterpartyName = sanitizeText(payload.counterparty_name, 255);
    const notes = sanitizeText(payload.portal_notes ?? payload.description, 30);

    if (!normalizedDate) {
        const error = new Error('Valid date/time is required.');
        error.status = 400;
        throw error;
    }
    if (!Number.isFinite(amount)) {
        const error = new Error('Valid amount is required.');
        error.status = 400;
        throw error;
    }

    const [result] = await pool.query(
        `
            INSERT INTO subaccount_manual_transactions (
                subaccount_id, direction, sender_name, counterparty_name, amount, transaction_date,
                is_portal_confirmed, portal_notes, badge_label, visible_in_master, visible_in_view_only,
                created_by_user_id, updated_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, 1, 1, ?, ?)
        `,
        [
            subaccount.id,
            direction,
            senderName,
            counterpartyName,
            amount,
            normalizedDate,
            notes,
            actorUserId || null,
            actorUserId || null
        ]
    );

    return { id: result.insertId };
};

const updateManualTransaction = async ({ subaccount, actorUserId, transactionId, payload }) => {
    const [[existing]] = await pool.query(
        'SELECT * FROM subaccount_manual_transactions WHERE id = ? AND subaccount_id = ?',
        [transactionId, subaccount.id]
    );
    if (!existing) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }

    const normalizedDate = normalizeDateTime(payload.transaction_date || payload.tx_date) || existing.transaction_date;
    const amount = parseAmount(payload.amount);
    const direction = payload.direction === 'out' || payload.operation_direct === 'out'
        ? 'out'
        : (payload.direction === 'in' || payload.operation_direct === 'in' ? 'in' : existing.direction);

    if (!normalizedDate) {
        const error = new Error('Valid date/time is required.');
        error.status = 400;
        throw error;
    }
    if (!Number.isFinite(amount)) {
        const error = new Error('Valid amount is required.');
        error.status = 400;
        throw error;
    }

    await pool.query(
        `
            UPDATE subaccount_manual_transactions
            SET direction = ?,
                sender_name = ?,
                counterparty_name = ?,
                amount = ?,
                transaction_date = ?,
                updated_by_user_id = ?
            WHERE id = ? AND subaccount_id = ?
        `,
        [
            direction,
            sanitizeText(payload.sender_name, 255),
            sanitizeText(payload.counterparty_name, 255),
            amount,
            normalizedDate,
            actorUserId || null,
            transactionId,
            subaccount.id
        ]
    );
};

const deleteManualTransaction = async ({ subaccount, transactionId }) => {
    const [result] = await pool.query(
        'DELETE FROM subaccount_manual_transactions WHERE id = ? AND subaccount_id = ?',
        [transactionId, subaccount.id]
    );
    if (!result.affectedRows) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }
};

const setTransactionVisibility = async ({ subaccount, transactionId, poolName, visibleInMaster, visibleInViewOnly }) => {
    if (poolName === 'manual') {
        const [result] = await pool.query(
            `
                UPDATE subaccount_manual_transactions
                SET visible_in_master = COALESCE(?, visible_in_master),
                    visible_in_view_only = COALESCE(?, visible_in_view_only)
                WHERE id = ? AND subaccount_id = ?
            `,
            [visibleInMaster, visibleInViewOnly, transactionId, subaccount.id]
        );
        if (!result.affectedRows) {
            const error = new Error('Transaction not found.');
            error.status = 404;
            throw error;
        }
        return;
    }

    const source = resolveSourceFromAccountType(subaccount.account_type);
    const existing = await loadStatementTransactionForSubaccount({ subaccount, source, transactionId });
    if (!existing) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }

    if (source === 'trkbit') {
        await pool.query(
            `
                UPDATE trkbit_transactions
                SET visible_in_master = COALESCE(?, visible_in_master),
                    visible_in_view_only = COALESCE(?, visible_in_view_only)
                WHERE uid = ?
            `,
            [visibleInMaster, visibleInViewOnly, transactionId]
        );
        return;
    }

    await pool.query(
        `
            UPDATE xpayz_transactions
            SET visible_in_master = COALESCE(?, visible_in_master),
                visible_in_view_only = COALESCE(?, visible_in_view_only)
            WHERE id = ?
        `,
        [visibleInMaster, visibleInViewOnly, transactionId]
    );
};

const setTransactionBadgeLabel = async ({ subaccount, transactionId, poolName, badgeLabel, actorUserId }) => {
    if (poolName === 'manual') {
        await pool.query(
            `
                UPDATE subaccount_manual_transactions
                SET badge_label = ?,
                    updated_by_user_id = ?
                WHERE id = ? AND subaccount_id = ?
            `,
            [sanitizeBadgeLabel(badgeLabel), actorUserId || null, transactionId, subaccount.id]
        );
        return;
    }

    const source = resolveSourceFromAccountType(subaccount.account_type);
    const existing = await loadStatementTransactionForSubaccount({ subaccount, source, transactionId });
    if (!existing) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }
    if (existing.entry_origin !== 'moved' && !existing.badge_label) {
        const error = new Error('Badge label can only be edited for moved transactions.');
        error.status = 400;
        throw error;
    }

    if (source === 'trkbit') {
        await pool.query(
            'UPDATE trkbit_transactions SET badge_label = ?, updated_by_user_id = ? WHERE uid = ?',
            [sanitizeBadgeLabel(badgeLabel), actorUserId || null, transactionId]
        );
        return;
    }

    await pool.query(
        'UPDATE xpayz_transactions SET badge_label = ?, updated_by_user_id = ? WHERE id = ?',
        [sanitizeBadgeLabel(badgeLabel), actorUserId || null, transactionId]
    );
};

const setTransactionConfirmation = async ({ subaccount, transactionId, poolName, confirmed }) => {
    if (poolName === 'manual') {
        const [result] = await pool.query(
            'UPDATE subaccount_manual_transactions SET is_portal_confirmed = ? WHERE id = ? AND subaccount_id = ?',
            [confirmed ? 1 : 0, transactionId, subaccount.id]
        );
        if (!result.affectedRows) {
            const error = new Error('Transaction not found.');
            error.status = 404;
            throw error;
        }
        return;
    }

    const source = resolveSourceFromAccountType(subaccount.account_type);
    const existing = await loadStatementTransactionForSubaccount({ subaccount, source, transactionId });
    if (!existing) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }

    if (source === 'trkbit') {
        await pool.query('UPDATE trkbit_transactions SET is_portal_confirmed = ? WHERE uid = ?', [confirmed ? 1 : 0, transactionId]);
        return;
    }

    await pool.query('UPDATE xpayz_transactions SET is_portal_confirmed = ? WHERE id = ?', [confirmed ? 1 : 0, transactionId]);
};

const setTransactionNotes = async ({ subaccount, transactionId, poolName, notes }) => {
    const finalNotes = sanitizeText(notes, 30);
    if (poolName === 'manual') {
        const [result] = await pool.query(
            'UPDATE subaccount_manual_transactions SET portal_notes = ? WHERE id = ? AND subaccount_id = ?',
            [finalNotes, transactionId, subaccount.id]
        );
        if (!result.affectedRows) {
            const error = new Error('Transaction not found.');
            error.status = 404;
            throw error;
        }
        return;
    }

    const source = resolveSourceFromAccountType(subaccount.account_type);
    const existing = await loadStatementTransactionForSubaccount({ subaccount, source, transactionId });
    if (!existing) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }

    if (source === 'trkbit') {
        await pool.query('UPDATE trkbit_transactions SET portal_notes = ? WHERE uid = ?', [finalNotes, transactionId]);
        return;
    }

    await pool.query('UPDATE xpayz_transactions SET portal_notes = ? WHERE id = ?', [finalNotes, transactionId]);
};

const moveStatementTransaction = async ({ source, transactionId, targetSubaccountId, actorUserId, badgeLabel = 'added' }) => {
    const targetSubaccount = await getSubaccountById(targetSubaccountId);
    if (!targetSubaccount) {
        const error = new Error('Target subaccount not found.');
        error.status = 404;
        throw error;
    }
    if (source === 'trkbit' && targetSubaccount.account_type !== 'cross') {
        const error = new Error('Cross transactions can only be moved to Cross subaccounts.');
        error.status = 400;
        throw error;
    }
    if (source === 'xpayz' && targetSubaccount.account_type !== 'xpayz') {
        const error = new Error('Statement transactions can only be moved to XPayz subaccounts.');
        error.status = 400;
        throw error;
    }

    if (source === 'trkbit') {
        const [[existing]] = await pool.query('SELECT uid FROM trkbit_transactions WHERE uid = ?', [transactionId]);
        if (!existing) {
            const error = new Error('Transaction not found.');
            error.status = 404;
            throw error;
        }
        await pool.query(
            `
                UPDATE trkbit_transactions
                SET display_subaccount_id = ?,
                    entry_origin = 'moved',
                    sync_control_state = 'blocked',
                    badge_label = ?,
                    updated_by_user_id = ?
                WHERE uid = ?
            `,
            [targetSubaccount.id, sanitizeBadgeLabel(badgeLabel) || 'added', actorUserId || null, transactionId]
        );
        return targetSubaccount;
    }

    const [[existing]] = await pool.query('SELECT id FROM xpayz_transactions WHERE id = ?', [transactionId]);
    if (!existing) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }

    await pool.query(
        `
            UPDATE xpayz_transactions
            SET display_subaccount_id = ?,
                entry_origin = 'moved',
                sync_control_state = 'blocked',
                badge_label = ?,
                updated_by_user_id = ?
            WHERE id = ?
        `,
        [targetSubaccount.id, sanitizeBadgeLabel(badgeLabel) || 'added', actorUserId || null, transactionId]
    );
    return targetSubaccount;
};

const listRecibosTransactions = async ({ sourceSubaccountId, query = {} }) => {
    const subaccount = await getSubaccountById(sourceSubaccountId);
    if (!subaccount || subaccount.account_type !== 'xpayz') {
        const error = new Error('Recibos manager is only available for XPayz subaccounts.');
        error.status = 400;
        throw error;
    }

    const pagination = parsePagination(query, { defaultLimit: 50, allowAll: true });
    const targetSubaccountNumber = sanitizeText(query.targetSubaccountNumber, 255);
    const needsSuggestionFilter = Boolean(targetSubaccountNumber);
    const sourcePagination = needsSuggestionFilter
        ? { page: 1, limit: 'all', limitValue: null, offset: 0, isAll: true }
        : pagination;
    const result = await listStatementTransactions({
        subaccount,
        filters: query,
        viewerMode: VIEWER_MODE.IMPERSONATION,
        pagination: sourcePagination
    });

    const uniqueSenders = Array.from(new Set(result.rows.map((row) => sanitizeText(row.sender_name, 255)).filter(Boolean)));
    const suggestionsBySender = new Map();

    if (uniqueSenders.length > 0) {
        const suggestionParams = [uniqueSenders, subaccount.id];
        let suggestionSql = `
                SELECT
                    xt.sender_name,
                    s.id AS subaccount_id,
                    s.name AS subaccount_name,
                    s.subaccount_number AS subaccount_number,
                    COUNT(*) AS match_count
                FROM xpayz_transactions xt
                JOIN subaccounts s ON s.subaccount_number = CAST(xt.subaccount_id AS CHAR)
                WHERE xt.sender_name IN (?)
                  AND COALESCE(xt.display_subaccount_id, s.id) <> ?
        `;

        if (targetSubaccountNumber) {
            suggestionSql += ' AND s.subaccount_number = ?';
            suggestionParams.push(targetSubaccountNumber);
        }

        suggestionSql += `
                GROUP BY xt.sender_name, s.id, s.name, s.subaccount_number
                ORDER BY xt.sender_name ASC, match_count DESC, s.name ASC
        `;

        const [matches] = await pool.query(
            suggestionSql,
            suggestionParams
        );

        matches.forEach((row) => {
            if (!suggestionsBySender.has(row.sender_name)) {
                suggestionsBySender.set(row.sender_name, row);
            }
        });
    }

    const enrichedRows = result.rows.map((row) => {
            const suggestion = suggestionsBySender.get(row.sender_name);
            if (!suggestion) return row;
            return {
                ...row,
                suggestion: {
                    subaccountId: suggestion.subaccount_id,
                    subaccountName: suggestion.subaccount_name,
                    subaccountNumber: suggestion.subaccount_number,
                    matchCount: Number(suggestion.match_count || 0),
                    confidence: 100
                }
            };
        });

    const filteredRows = needsSuggestionFilter
        ? enrichedRows.filter((row) => row.suggestion?.subaccountNumber === targetSubaccountNumber)
        : enrichedRows;

    if (pagination.isAll) {
        return {
            transactions: filteredRows,
            pagination: buildPaginationMeta(filteredRows.length, pagination)
        };
    }

    if (!needsSuggestionFilter) {
        return {
            transactions: filteredRows,
            pagination: buildPaginationMeta(result.total, pagination)
        };
    }

    const startIndex = pagination.offset;
    const endIndex = startIndex + pagination.limitValue;
    return {
        transactions: filteredRows.slice(startIndex, endIndex),
        pagination: buildPaginationMeta(filteredRows.length, pagination)
    };
};

module.exports = {
    VIEWER_MODE,
    normalizeDateTime,
    normalizePortalFiltersForViewerMode,
    getViewerMode,
    assertImpersonation,
    getSubaccountById,
    getSubaccountByNumber,
    getPortalSubaccount,
    getDashboardSummary,
    listPortalTransactions,
    listRecibosTransactions,
    createStatementTransaction,
    updateStatementTransaction,
    deleteStatementTransaction,
    createManualTransaction,
    updateManualTransaction,
    deleteManualTransaction,
    setTransactionVisibility,
    setTransactionBadgeLabel,
    setTransactionConfirmation,
    setTransactionNotes,
    moveStatementTransaction
};
