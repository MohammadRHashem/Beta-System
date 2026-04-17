const pool = require('../config/db');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const transactionService = require('./subaccountTransactionService');
const {
    getCachedPortalAllTimeBalance,
    getCachedInvoiceStartingEntry,
    invalidatePortalReadCaches
} = require('./readCacheService');

const STATEMENT_SCOPE = {
    GERAL: 'geral',
    CHAVE_PIX: 'chave_pix',
    ALL: 'all'
};

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

const parseAmount = (value) => {
    const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
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

const normalizeRows = (rows = []) => rows.map((row) => ({
    ...row,
    amount: Number(row.amount || 0),
    is_portal_confirmed: Number(row.is_portal_confirmed || 0),
    visible_in_master: Number(row.visible_in_master ?? 1),
    visible_in_view_only: Number(row.visible_in_view_only ?? 1),
    badge_label: row.badge_label || null,
    transaction_key: `${row.pool}:${row.source}:${row.id}`
}));

const buildWhereSql = (clauses) => (clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '');

const addDateFilters = (filters, fieldName, params, clauses) => {
    if (isValidDate(filters.dateFrom)) {
        clauses.push(`${fieldName} >= ?`);
        params.push(`${filters.dateFrom} 00:00:00`);
    }
    if (isValidDate(filters.dateTo)) {
        clauses.push(`${fieldName} <= ?`);
        params.push(`${filters.dateTo} 23:59:59`);
    }
};

const addConfirmationFilter = (filters, fieldName, clauses) => {
    if (filters.confirmation === 'confirmed') {
        clauses.push(`${fieldName} = 1`);
    } else if (filters.confirmation === 'pending') {
        clauses.push(`${fieldName} = 0`);
    }
};

const addInvoiceBadgeFilter = (filters, poolType, clauses) => {
    if (filters.badgeFilter === 'with_badge') {
        if (poolType === 'statement') {
            clauses.push('1 = 0');
            return;
        }
        clauses.push('COALESCE(sime.is_starting_entry, 0) = 1');
    } else if (filters.badgeFilter === 'without_badge' && poolType === 'manual') {
        clauses.push('COALESCE(sime.is_starting_entry, 0) = 0');
    }
};

const isAllOnlyInvoiceScope = (subaccount) => (
    subaccount?.account_type === 'cross' || subaccount?.account_type === 'xpayz'
);

const normalizeStatementScope = (value, subaccount = null) => {
    if (isAllOnlyInvoiceScope(subaccount)) return STATEMENT_SCOPE.ALL;
    return value === STATEMENT_SCOPE.CHAVE_PIX ? STATEMENT_SCOPE.CHAVE_PIX : STATEMENT_SCOPE.GERAL;
};

const getPortalSourceType = (subaccount) => (
    subaccount?.portal_source_type === 'invoices' ? 'invoices' : 'transactions'
);

const getInvoiceRecipientPattern = (subaccount) => {
    const pattern = sanitizeText(subaccount?.invoice_recipient_pattern, 255);
    return pattern || null;
};

const getStartingEntry = async (subaccountId, statementScope) => {
    return getCachedInvoiceStartingEntry(subaccountId, statementScope, async () => {
        const query = statementScope === STATEMENT_SCOPE.ALL
            ? `
                SELECT id, transaction_date, direction, amount, starting_scope
                FROM subaccount_invoice_manual_entries
                WHERE subaccount_id = ?
                  AND is_starting_entry = 1
                ORDER BY transaction_date DESC, id DESC
                LIMIT 1
            `
            : `
                SELECT id, transaction_date, direction, amount, starting_scope
                FROM subaccount_invoice_manual_entries
                WHERE subaccount_id = ?
                  AND starting_scope = ?
                  AND is_starting_entry = 1
                ORDER BY transaction_date DESC, id DESC
                LIMIT 1
            `;
        const params = statementScope === STATEMENT_SCOPE.ALL
            ? [subaccountId]
            : [subaccountId, statementScope];
        const [[entry]] = await pool.query(query, params);
        return entry || null;
    });
};

const addAnchorDateFilter = (anchorEntry, fieldName, params, clauses) => {
    if (!anchorEntry?.transaction_date) return;
    clauses.push(`${fieldName} >= ?`);
    params.push(anchorEntry.transaction_date);
};

const getInvoiceStatementBase = (subaccount) => {
    const pattern = getInvoiceRecipientPattern(subaccount);
    if (!pattern) {
        const error = new Error('Invoice recipient pattern is required for invoice portal subaccounts.');
        error.status = 400;
        throw error;
    }
    return {
        fromSql: 'FROM invoices i',
        baseClauses: [
            'COALESCE(i.is_deleted, 0) = 0',
            'i.recipient_name LIKE ?'
        ],
        baseParams: [pattern]
    };
};

const addInvoiceStatementFilters = ({ filters, params, clauses }) => {
    if (filters.search) {
        const term = `%${filters.search.trim()}%`;
        clauses.push(`(
            COALESCE(i.sender_name, '') LIKE ?
            OR COALESCE(i.recipient_name, '') LIKE ?
            OR COALESCE(i.notes, '') LIKE ?
            OR COALESCE(i.transaction_id, '') LIKE ?
            OR COALESCE(i.message_id, '') LIKE ?
        )`);
        params.push(term, term, term, term, term);
    }

    const amountExact = parseExactAmount(filters.amountExact);
    if (amountExact != null) {
        clauses.push('i.amount_decimal = ?');
        params.push(amountExact);
    }

    addDateFilters(filters, 'i.received_at', params, clauses);
    addConfirmationFilter(filters, 'i.is_portal_confirmed', clauses);
    addInvoiceBadgeFilter(filters, 'statement', clauses);

    const excludedLinkedSubaccountIds = Array.isArray(filters.excludeLinkedSubaccountIds)
        ? filters.excludeLinkedSubaccountIds
            .map((entry) => Number.parseInt(entry, 10))
            .filter((entry) => Number.isInteger(entry) && entry > 0)
        : [];
    if (excludedLinkedSubaccountIds.length) {
        clauses.push(`
            NOT EXISTS (
                SELECT 1
                FROM subaccounts excluded_sub
                WHERE excluded_sub.id IN (${excludedLinkedSubaccountIds.map(() => '?').join(', ')})
                  AND excluded_sub.assigned_group_jid IS NOT NULL
                  AND excluded_sub.assigned_group_jid = i.source_group_jid
            )
        `);
        params.push(...excludedLinkedSubaccountIds);
    }

    if (filters.direction === 'out') {
        clauses.push('1 = 0');
    }
};

const addInvoiceStatementScopeFilter = ({ subaccount, statementScope, params, clauses }) => {
    if (statementScope === STATEMENT_SCOPE.ALL) {
        return;
    }

    const linkedGroupSql = `
        EXISTS (
            SELECT 1
            FROM subaccounts linked_sub
            WHERE linked_sub.assigned_group_jid = i.source_group_jid
              AND linked_sub.assigned_group_jid IS NOT NULL
              AND linked_sub.account_type = ?
        )
    `;

    params.push(subaccount.account_type);
    if (statementScope === STATEMENT_SCOPE.CHAVE_PIX) {
        clauses.push(linkedGroupSql);
        return;
    }

    clauses.push(`NOT ${linkedGroupSql}`);
};

const addInvoiceManualScopeFilter = ({ statementScope, clauses, params }) => {
    if (statementScope === STATEMENT_SCOPE.ALL) {
        return;
    }

    clauses.push(`COALESCE(sime.starting_scope, '${STATEMENT_SCOPE.GERAL}') = ?`);
    params.push(statementScope);
};

const addInvoiceManualFilters = ({ filters, params, clauses }) => {
    if (filters.search) {
        const term = `%${filters.search.trim()}%`;
        clauses.push(`(
            COALESCE(sime.sender_name, '') LIKE ?
            OR COALESCE(sime.counterparty_name, '') LIKE ?
            OR COALESCE(sime.portal_notes, '') LIKE ?
        )`);
        params.push(term, term, term);
    }

    const amountExact = parseExactAmount(filters.amountExact);
    if (amountExact != null) {
        clauses.push('sime.amount = ?');
        params.push(amountExact);
    }

    addDateFilters(filters, 'sime.transaction_date', params, clauses);
    addConfirmationFilter(filters, 'sime.is_portal_confirmed', clauses);
    addInvoiceBadgeFilter(filters, 'manual', clauses);

    if (filters.direction === 'in' || filters.direction === 'out') {
        clauses.push('sime.direction = ?');
        params.push(filters.direction);
    }
};

const listInvoiceStatementTransactions = async ({ subaccount, filters = {}, pagination, anchorEntry, statementScope }) => {
    const base = getInvoiceStatementBase(subaccount);
    const clauses = [...base.baseClauses];
    const params = [...base.baseParams];

    addInvoiceStatementScopeFilter({ subaccount, statementScope, params, clauses });
    addAnchorDateFilter(anchorEntry, 'i.received_at', params, clauses);
    addInvoiceStatementFilters({ filters, params, clauses });

    const whereSql = buildWhereSql(clauses);
    const countSql = `SELECT COUNT(*) AS total ${base.fromSql} ${whereSql}`;
    const [[{ total }]] = await pool.query(countSql, params);

    let rows = [];
    if (Number(total || 0) > 0) {
        let dataSql = `
            SELECT
                i.id,
                i.id AS source_id,
                'invoice' AS source,
                'statement' AS pool,
                ? AS statement_scope,
                i.received_at AS transaction_date,
                i.amount_decimal AS amount,
                'in' AS operation_direct,
                i.sender_name,
                i.recipient_name AS counterparty_name,
                COALESCE(i.is_portal_confirmed, 1) AS is_portal_confirmed,
                i.notes AS portal_notes,
                'invoice' AS entry_origin,
                NULL AS badge_label,
                NULL AS sync_control_state,
                1 AS visible_in_master,
                1 AS visible_in_view_only,
                ? AS effective_subaccount_id,
                i.transaction_id AS external_reference,
                NULL AS updated_by_user_id
            ${base.fromSql}
            ${whereSql}
            ORDER BY i.received_at DESC, i.id DESC
        `;
        const dataParams = [statementScope, subaccount.id, ...params];
        if (pagination && !pagination.isAll) {
            dataSql += ' LIMIT ? OFFSET ?';
            dataParams.push(pagination.limitValue, pagination.offset);
        }
        [rows] = await pool.query(dataSql, dataParams);
    }

    return {
        total: Number(total || 0),
        rows: normalizeRows(rows)
    };
};

const listInvoiceManualTransactions = async ({ subaccount, filters = {}, pagination, anchorEntry, statementScope }) => {
    const clauses = ['sime.subaccount_id = ?'];
    const params = [subaccount.id];

    addInvoiceManualScopeFilter({ statementScope, clauses, params });
    addAnchorDateFilter(anchorEntry, 'sime.transaction_date', params, clauses);
    addInvoiceManualFilters({ filters, params, clauses });

    const whereSql = buildWhereSql(clauses);
    const countSql = `SELECT COUNT(*) AS total FROM subaccount_invoice_manual_entries sime ${whereSql}`;
    const [[{ total }]] = await pool.query(countSql, params);

    let rows = [];
    if (Number(total || 0) > 0) {
        let dataSql = `
            SELECT
                sime.id,
                sime.id AS source_id,
                'invoice_manual' AS source,
                'manual' AS pool,
                sime.starting_scope AS statement_scope,
                sime.transaction_date,
                sime.amount,
                sime.direction AS operation_direct,
                sime.sender_name,
                sime.counterparty_name,
                sime.is_portal_confirmed,
                sime.portal_notes,
                'manual' AS entry_origin,
                CASE
                    WHEN sime.is_starting_entry = 1 AND sime.starting_scope = 'chave_pix' THEN 'saldo inicial chave'
                    WHEN sime.is_starting_entry = 1 AND sime.starting_scope = 'all' THEN 'saldo inicial'
                    WHEN sime.is_starting_entry = 1 THEN 'saldo inicial geral'
                    ELSE NULL
                END AS badge_label,
                NULL AS sync_control_state,
                1 AS visible_in_master,
                1 AS visible_in_view_only,
                sime.subaccount_id AS effective_subaccount_id,
                NULL AS external_reference,
                sime.updated_by_user_id,
                sime.is_starting_entry
            FROM subaccount_invoice_manual_entries sime
            ${whereSql}
            ORDER BY sime.transaction_date DESC, sime.id DESC
        `;
        const dataParams = [...params];
        if (pagination && !pagination.isAll) {
            dataSql += ' LIMIT ? OFFSET ?';
            dataParams.push(pagination.limitValue, pagination.offset);
        }
        [rows] = await pool.query(dataSql, dataParams);
    }

    return {
        total: Number(total || 0),
        rows: normalizeRows(rows)
    };
};

const getInvoiceStatementAggregate = async ({ subaccount, filters = {}, anchorEntry, statementScope }) => {
    const base = getInvoiceStatementBase(subaccount);
    const clauses = [...base.baseClauses];
    const params = [...base.baseParams];

    addInvoiceStatementScopeFilter({ subaccount, statementScope, params, clauses });
    addAnchorDateFilter(anchorEntry, 'i.received_at', params, clauses);
    addInvoiceStatementFilters({ filters, params, clauses });

    const whereSql = buildWhereSql(clauses);
    const [[row]] = await pool.query(
        `
            SELECT
                COALESCE(SUM(i.amount_decimal), 0) AS balance,
                COALESCE(SUM(i.amount_decimal), 0) AS totalIn,
                0 AS totalOut,
                COUNT(*) AS countIn,
                0 AS countOut
            ${base.fromSql}
            ${whereSql}
        `,
        params
    );
    return {
        balance: Number(row?.balance || 0),
        totalIn: Number(row?.totalIn || 0),
        totalOut: Number(row?.totalOut || 0),
        countIn: Number(row?.countIn || 0),
        countOut: Number(row?.countOut || 0)
    };
};

const calculateInvoiceStatementBalance = async ({ subaccount, filters = {}, anchorEntry, statementScope }) => {
    const aggregate = await getInvoiceStatementAggregate({ subaccount, filters, anchorEntry, statementScope });
    return aggregate.balance;
};

const getInvoiceManualAggregate = async ({ subaccount, filters = {}, anchorEntry, statementScope }) => {
    const clauses = ['sime.subaccount_id = ?'];
    const params = [subaccount.id];

    addInvoiceManualScopeFilter({ statementScope, clauses, params });
    addAnchorDateFilter(anchorEntry, 'sime.transaction_date', params, clauses);
    addInvoiceManualFilters({ filters, params, clauses });

    const whereSql = buildWhereSql(clauses);
    const [[row]] = await pool.query(
        `
            SELECT
                COALESCE(SUM(CASE WHEN sime.direction = 'in' THEN sime.amount ELSE -sime.amount END), 0) AS balance,
                COALESCE(SUM(CASE WHEN sime.direction = 'in' THEN sime.amount ELSE 0 END), 0) AS totalIn,
                COALESCE(SUM(CASE WHEN sime.direction = 'out' THEN sime.amount ELSE 0 END), 0) AS totalOut,
                COUNT(CASE WHEN sime.direction = 'in' THEN 1 ELSE NULL END) AS countIn,
                COUNT(CASE WHEN sime.direction = 'out' THEN 1 ELSE NULL END) AS countOut
            FROM subaccount_invoice_manual_entries sime
            ${whereSql}
        `,
        params
    );
    return {
        balance: Number(row?.balance || 0),
        totalIn: Number(row?.totalIn || 0),
        totalOut: Number(row?.totalOut || 0),
        countIn: Number(row?.countIn || 0),
        countOut: Number(row?.countOut || 0)
    };
};

const calculateInvoiceManualBalance = async ({ subaccount, filters = {}, anchorEntry, statementScope }) => {
    const aggregate = await getInvoiceManualAggregate({ subaccount, filters, anchorEntry, statementScope });
    return aggregate.balance;
};

const calculateInvoiceStatementFlowSummary = async ({ subaccount, filters = {}, anchorEntry, statementScope }) => {
    const row = await getInvoiceStatementAggregate({ subaccount, filters, anchorEntry, statementScope });
    return {
        totalIn: Number(row?.totalIn || 0),
        totalOut: 0,
        countIn: Number(row?.countIn || 0),
        countOut: 0
    };
};

const calculateInvoiceManualFlowSummary = async ({ subaccount, filters = {}, anchorEntry, statementScope }) => {
    const row = await getInvoiceManualAggregate({ subaccount, filters, anchorEntry, statementScope });
    return {
        totalIn: Number(row?.totalIn || 0),
        totalOut: Number(row?.totalOut || 0),
        countIn: Number(row?.countIn || 0),
        countOut: Number(row?.countOut || 0)
    };
};

const getInvoiceDashboardSummary = async ({ subaccount, filters = {}, viewerMode }) => {
    const normalizedFilters = transactionService.normalizePortalFiltersForViewerMode(filters, viewerMode);
    const activePool = normalizedFilters.pool === 'manual' ? 'manual' : 'statement';
    const statementScope = normalizeStatementScope(normalizedFilters.statementScope, subaccount);
    const anchorEntry = await getStartingEntry(subaccount.id, statementScope);

    const statementAggregate = await getInvoiceStatementAggregate({ subaccount, filters: normalizedFilters, anchorEntry, statementScope });
    const manualAggregate = await getInvoiceManualAggregate({ subaccount, filters: normalizedFilters, anchorEntry, statementScope });
    const statementAllTimeBalance = await getCachedPortalAllTimeBalance(
        ['portal-all-time', 'invoice', 'statement', subaccount.id, statementScope],
        async () => (await getInvoiceStatementAggregate({ subaccount, filters: {}, anchorEntry, statementScope })).balance
    );
    const manualAllTimeBalance = await getCachedPortalAllTimeBalance(
        ['portal-all-time', 'invoice', 'manual', subaccount.id, statementScope],
        async () => (await getInvoiceManualAggregate({ subaccount, filters: {}, anchorEntry, statementScope })).balance
    );
    const flowSummary = activePool === 'manual' ? manualAggregate : statementAggregate;

    return {
        sourceType: 'invoices',
        supportsVisibility: false,
        supportsBadgeEditing: false,
        supportsTransfer: false,
        supportsStartingEntry: true,
        activePool,
        statementScope,
        totalIn: flowSummary.totalIn,
        totalOut: flowSummary.totalOut,
        countIn: flowSummary.countIn,
        countOut: flowSummary.countOut,
        statementBalance: statementAggregate.balance,
        manualBalance: manualAggregate.balance,
        combinedBalance: statementAggregate.balance + manualAggregate.balance,
        allTimeBalance: statementAllTimeBalance + manualAllTimeBalance,
        statementAllTimeBalance,
        manualAllTimeBalance,
        startingEntry: anchorEntry ? {
            id: anchorEntry.id,
            amount: Number(anchorEntry.amount || 0),
            direction: anchorEntry.direction,
            transaction_date: anchorEntry.transaction_date,
            statement_scope: anchorEntry.starting_scope
        } : null
    };
};

const listInvoicePortalTransactions = async (client, query = {}) => {
    const subaccount = await transactionService.getPortalSubaccount(client);
    const viewerMode = transactionService.getViewerMode(client);
    const normalizedQuery = transactionService.normalizePortalFiltersForViewerMode(query, viewerMode);
    const pagination = parsePagination(query, { defaultLimit: 50, allowAll: true });
    const activePool = normalizedQuery.pool === 'manual' ? 'manual' : 'statement';
    const statementScope = normalizeStatementScope(normalizedQuery.statementScope, subaccount);
    const anchorEntry = await getStartingEntry(subaccount.id, statementScope);

    const result = activePool === 'manual'
        ? await listInvoiceManualTransactions({ subaccount, filters: normalizedQuery, pagination, anchorEntry, statementScope })
        : await listInvoiceStatementTransactions({ subaccount, filters: normalizedQuery, pagination, anchorEntry, statementScope });

    return {
        transactions: result.rows,
        pagination: buildPaginationMeta(result.total, pagination),
        pool: activePool,
        sourceType: 'invoices',
        statementScope
    };
};

const assertInvoiceManualTransaction = async (subaccountId, transactionId) => {
    const [[row]] = await pool.query(
        'SELECT * FROM subaccount_invoice_manual_entries WHERE id = ? AND subaccount_id = ?',
        [transactionId, subaccountId]
    );
    if (!row) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }
    return row;
};

const assertInvoiceStatementTransaction = async (subaccount, transactionId) => {
    const pattern = getInvoiceRecipientPattern(subaccount);
    const [[row]] = await pool.query(
        `
            SELECT id, notes, is_portal_confirmed
            FROM invoices
            WHERE id = ?
              AND COALESCE(is_deleted, 0) = 0
              AND recipient_name LIKE ?
            LIMIT 1
        `,
        [transactionId, pattern]
    );
    if (!row) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }
    return row;
};

const clearOtherStartingEntries = async (subaccountId, statementScope, exceptId = null) => {
    if (statementScope === STATEMENT_SCOPE.ALL) {
        if (exceptId == null) {
            await pool.query(
                'UPDATE subaccount_invoice_manual_entries SET is_starting_entry = 0 WHERE subaccount_id = ?',
                [subaccountId]
            );
            return;
        }

        await pool.query(
            'UPDATE subaccount_invoice_manual_entries SET is_starting_entry = 0 WHERE subaccount_id = ? AND id <> ?',
            [subaccountId, exceptId]
        );
        return;
    }

    if (exceptId == null) {
        await pool.query(
            'UPDATE subaccount_invoice_manual_entries SET is_starting_entry = 0 WHERE subaccount_id = ? AND starting_scope = ?',
            [subaccountId, statementScope]
        );
        return;
    }

    await pool.query(
        'UPDATE subaccount_invoice_manual_entries SET is_starting_entry = 0 WHERE subaccount_id = ? AND starting_scope = ? AND id <> ?',
        [subaccountId, statementScope, exceptId]
    );
};

const createInvoiceManualTransaction = async ({ subaccount, actorUserId, payload }) => {
    const normalizedDate = transactionService.normalizeDateTime(payload.transaction_date || payload.tx_date);
    const amount = parseAmount(payload.amount);
    const direction = payload.direction === 'out' || payload.operation_direct === 'out' ? 'out' : 'in';
    const isStartingEntry = payload.is_starting_entry === true || payload.is_starting_entry === 1 || payload.is_starting_entry === '1';
    const startingScope = normalizeStatementScope(payload.statementScope, subaccount);

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

    if (isStartingEntry) {
        await clearOtherStartingEntries(subaccount.id, startingScope);
    }

    const [result] = await pool.query(
        `
            INSERT INTO subaccount_invoice_manual_entries (
                subaccount_id,
                direction,
                starting_scope,
                sender_name,
                counterparty_name,
                amount,
                transaction_date,
                is_portal_confirmed,
                portal_notes,
                is_starting_entry,
                created_by_user_id,
                updated_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
        `,
        [
            subaccount.id,
            direction,
            startingScope,
            sanitizeText(payload.sender_name, 255),
            sanitizeText(payload.counterparty_name, 255),
            amount,
            normalizedDate,
            sanitizeText(payload.portal_notes ?? payload.description, 255),
            isStartingEntry ? 1 : 0,
            actorUserId || null,
            actorUserId || null
        ]
    );
    invalidatePortalReadCaches();
    return { id: result.insertId };
};

const updateInvoiceManualTransaction = async ({ subaccount, actorUserId, transactionId, payload }) => {
    const existing = await assertInvoiceManualTransaction(subaccount.id, transactionId);
    const normalizedDate = transactionService.normalizeDateTime(payload.transaction_date || payload.tx_date) || existing.transaction_date;
    const amount = parseAmount(payload.amount);
    const direction = payload.direction === 'out' || payload.operation_direct === 'out'
        ? 'out'
        : (payload.direction === 'in' || payload.operation_direct === 'in' ? 'in' : existing.direction);
    const isStartingEntry = payload.is_starting_entry === true || payload.is_starting_entry === 1 || payload.is_starting_entry === '1';
    const startingScope = normalizeStatementScope(payload.statementScope || existing.starting_scope, subaccount);

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

    if (isStartingEntry) {
        await clearOtherStartingEntries(subaccount.id, startingScope, transactionId);
    }

    await pool.query(
        `
            UPDATE subaccount_invoice_manual_entries
            SET direction = ?,
                starting_scope = ?,
                sender_name = ?,
                counterparty_name = ?,
                amount = ?,
                transaction_date = ?,
                portal_notes = ?,
                is_starting_entry = ?,
                updated_by_user_id = ?
            WHERE id = ? AND subaccount_id = ?
        `,
        [
            direction,
            startingScope,
            sanitizeText(payload.sender_name, 255),
            sanitizeText(payload.counterparty_name, 255),
            amount,
            normalizedDate,
            sanitizeText(payload.portal_notes ?? existing.portal_notes, 255),
            isStartingEntry ? 1 : 0,
            actorUserId || null,
            transactionId,
            subaccount.id
        ]
    );
    invalidatePortalReadCaches();
};

const deleteInvoiceManualTransaction = async ({ subaccount, transactionId }) => {
    const [result] = await pool.query(
        'DELETE FROM subaccount_invoice_manual_entries WHERE id = ? AND subaccount_id = ?',
        [transactionId, subaccount.id]
    );
    if (!result.affectedRows) {
        const error = new Error('Transaction not found.');
        error.status = 404;
        throw error;
    }
    invalidatePortalReadCaches();
};

const setInvoiceTransactionConfirmation = async ({ subaccount, transactionId, poolName, confirmed }) => {
    if (poolName === 'manual') {
        await assertInvoiceManualTransaction(subaccount.id, transactionId);
        await pool.query(
            'UPDATE subaccount_invoice_manual_entries SET is_portal_confirmed = ? WHERE id = ? AND subaccount_id = ?',
            [confirmed ? 1 : 0, transactionId, subaccount.id]
        );
        return;
    }

    await assertInvoiceStatementTransaction(subaccount, transactionId);
    await pool.query(
        'UPDATE invoices SET is_portal_confirmed = ? WHERE id = ?',
        [confirmed ? 1 : 0, transactionId]
    );
};

const setInvoiceTransactionNotes = async ({ subaccount, transactionId, poolName, notes }) => {
    const finalNotes = sanitizeText(notes, 255);
    if (poolName === 'manual') {
        await assertInvoiceManualTransaction(subaccount.id, transactionId);
        await pool.query(
            'UPDATE subaccount_invoice_manual_entries SET portal_notes = ? WHERE id = ? AND subaccount_id = ?',
            [finalNotes, transactionId, subaccount.id]
        );
        return;
    }

    await assertInvoiceStatementTransaction(subaccount, transactionId);
    await pool.query(
        'UPDATE invoices SET notes = ? WHERE id = ?',
        [finalNotes, transactionId]
    );
};

const unsupportedForInvoicePortals = (message) => {
    const error = new Error(message);
    error.status = 400;
    throw error;
};

const dispatchBySource = async (clientOrSubaccount, action) => {
    const subaccount = clientOrSubaccount?.subaccountId
        ? await transactionService.getPortalSubaccount(clientOrSubaccount)
        : clientOrSubaccount;
    const sourceType = getPortalSourceType(subaccount);
    return { subaccount, sourceType, action: action[sourceType] || action.transactions };
};

const getDashboardSummary = async ({ subaccount, filters = {}, viewerMode }) => {
    if (getPortalSourceType(subaccount) === 'invoices') {
        return getInvoiceDashboardSummary({ subaccount, filters, viewerMode });
    }
    const summary = await transactionService.getDashboardSummary({ subaccount, filters, viewerMode });
    return {
        ...summary,
        sourceType: 'transactions',
        supportsVisibility: true,
        supportsBadgeEditing: true,
        supportsTransfer: subaccount.account_type === 'cross',
        supportsStartingEntry: false
    };
};

const listPortalTransactions = async (client, query = {}) => {
    const subaccount = await transactionService.getPortalSubaccount(client);
    if (getPortalSourceType(subaccount) === 'invoices') {
        return listInvoicePortalTransactions(client, query);
    }
    const result = await transactionService.listPortalTransactions(client, query);
    return { ...result, sourceType: 'transactions' };
};

const createStatementTransaction = async ({ subaccount, actorUserId, payload }) => {
    if (getPortalSourceType(subaccount) === 'invoices') {
        unsupportedForInvoicePortals('Invoice-driven portals do not allow manual entries in the received invoices pool.');
    }
    return transactionService.createStatementTransaction({ subaccount, actorUserId, payload });
};

const createManualTransaction = async ({ subaccount, actorUserId, payload }) => {
    if (getPortalSourceType(subaccount) === 'invoices') {
        return createInvoiceManualTransaction({ subaccount, actorUserId, payload });
    }
    return transactionService.createManualTransaction({ subaccount, actorUserId, payload });
};

const updateStatementTransaction = async ({ subaccount, actorUserId, transactionId, payload }) => {
    if (getPortalSourceType(subaccount) === 'invoices') {
        unsupportedForInvoicePortals('Invoice-driven portals do not allow editing received invoice rows.');
    }
    return transactionService.updateStatementTransaction({ subaccount, actorUserId, transactionId, payload });
};

const updateManualTransaction = async ({ subaccount, actorUserId, transactionId, payload }) => {
    if (getPortalSourceType(subaccount) === 'invoices') {
        return updateInvoiceManualTransaction({ subaccount, actorUserId, transactionId, payload });
    }
    return transactionService.updateManualTransaction({ subaccount, actorUserId, transactionId, payload });
};

const deleteStatementTransaction = async ({ subaccount, actorUserId, transactionId }) => {
    if (getPortalSourceType(subaccount) === 'invoices') {
        unsupportedForInvoicePortals('Invoice-driven portals do not allow deleting received invoice rows.');
    }
    return transactionService.deleteStatementTransaction({ subaccount, actorUserId, transactionId });
};

const deleteManualTransaction = async ({ subaccount, transactionId }) => {
    if (getPortalSourceType(subaccount) === 'invoices') {
        return deleteInvoiceManualTransaction({ subaccount, transactionId });
    }
    return transactionService.deleteManualTransaction({ subaccount, transactionId });
};

const setTransactionVisibility = async ({ subaccount, transactionId, poolName, visibleInMaster, visibleInViewOnly }) => {
    if (getPortalSourceType(subaccount) === 'invoices') {
        unsupportedForInvoicePortals('Visibility controls are not available for invoice-driven portals.');
    }
    return transactionService.setTransactionVisibility({ subaccount, transactionId, poolName, visibleInMaster, visibleInViewOnly });
};

const setTransactionBadgeLabel = async ({ subaccount, transactionId, poolName, badgeLabel, actorUserId }) => {
    if (getPortalSourceType(subaccount) === 'invoices') {
        unsupportedForInvoicePortals('Badge editing is not available for invoice-driven portals.');
    }
    return transactionService.setTransactionBadgeLabel({ subaccount, transactionId, poolName, badgeLabel, actorUserId });
};

const setTransactionConfirmation = async ({ subaccount, transactionId, poolName, confirmed }) => {
    if (getPortalSourceType(subaccount) === 'invoices') {
        return setInvoiceTransactionConfirmation({ subaccount, transactionId, poolName, confirmed });
    }
    return transactionService.setTransactionConfirmation({ subaccount, transactionId, poolName, confirmed });
};

const setTransactionNotes = async ({ subaccount, transactionId, poolName, notes }) => {
    if (getPortalSourceType(subaccount) === 'invoices') {
        return setInvoiceTransactionNotes({ subaccount, transactionId, poolName, notes });
    }
    return transactionService.setTransactionNotes({ subaccount, transactionId, poolName, notes });
};

module.exports = {
    getPortalSourceType,
    getPortalSubaccount: transactionService.getPortalSubaccount,
    getViewerMode: transactionService.getViewerMode,
    normalizePortalFiltersForViewerMode: transactionService.normalizePortalFiltersForViewerMode,
    assertImpersonation: transactionService.assertImpersonation,
    getDashboardSummary,
    listPortalTransactions,
    createStatementTransaction,
    createManualTransaction,
    updateStatementTransaction,
    updateManualTransaction,
    deleteStatementTransaction,
    deleteManualTransaction,
    setTransactionVisibility,
    setTransactionBadgeLabel,
    setTransactionConfirmation,
    setTransactionNotes
};
