const pool = require('../config/db');
const ExcelJS = require('exceljs');

const LINKED_EXISTS_SQL = `
    EXISTS (
        SELECT 1
        FROM invoices li
        WHERE li.linked_transaction_source = 'Trkbit'
          AND li.linked_transaction_id = tt.uid
    )
`;

const toInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : fallback;
};

const normalizeTxType = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized === 'C' || normalized === 'D' ? normalized : '';
};

const normalizeLinkStatus = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return ['linked', 'unlinked', 'all'].includes(normalized) ? normalized : 'all';
};

const normalizeViewType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return ['cross', 'other', 'all'].includes(normalized) ? normalized : 'all';
};

const sanitizeSearchToken = (token) => {
    if (!token) return '';
    return token.replace(/[^\p{L}\p{N}@._\-]/gu, '').trim();
};

const buildRefreshToken = async () => {
    const [[row]] = await pool.query(`
        SELECT
            MAX(COALESCE(updated_at, created_at)) AS latest_record_at,
            COUNT(*) AS total_records
        FROM trkbit_transactions
    `);

    const latest = row?.latest_record_at
        ? new Date(row.latest_record_at).toISOString()
        : null;
    const total = Number(row?.total_records || 0);
    return {
        refreshToken: `${latest || 'none'}:${total}`,
        latestRecordAt: latest,
        totalRecords: total
    };
};

const getAssignedCrossPixKeys = async () => {
    const [rows] = await pool.query(`
        SELECT DISTINCT TRIM(chave_pix) AS chave_pix
        FROM subaccounts
        WHERE account_type = 'cross'
          AND chave_pix IS NOT NULL
          AND TRIM(chave_pix) <> ''
    `);
    return rows.map((row) => row.chave_pix);
};

const resolveViewFilter = async ({ viewType, subaccountId }) => {
    const normalizedViewType = normalizeViewType(viewType);

    if (normalizedViewType === 'cross') {
        const parsedSubaccountId = toInt(subaccountId, null);
        if (!parsedSubaccountId) {
            return { error: 'Subaccount ID is required for cross view.' };
        }

        const [[subaccount]] = await pool.query(
            `SELECT id, name, account_type, chave_pix
             FROM subaccounts
             WHERE id = ?`,
            [parsedSubaccountId]
        );

        if (!subaccount) {
            return { error: 'Subaccount not found.' };
        }
        if (subaccount.account_type !== 'cross') {
            return { error: 'Selected subaccount is not a cross account.' };
        }
        if (!subaccount.chave_pix || !String(subaccount.chave_pix).trim()) {
            return { error: 'Selected cross subaccount does not have a PIX key.' };
        }

        return {
            clause: 'tt.tx_pix_key = ?',
            params: [String(subaccount.chave_pix).trim()],
            view: {
                type: 'cross',
                subaccountId: subaccount.id,
                subaccountName: subaccount.name,
                pixKey: String(subaccount.chave_pix).trim()
            }
        };
    }

    if (normalizedViewType === 'other') {
        const assignedPixKeys = await getAssignedCrossPixKeys();
        if (assignedPixKeys.length === 0) {
            return {
                clause: '1=1',
                params: [],
                view: { type: 'other' }
            };
        }

        return {
            clause: `(tt.tx_pix_key IS NULL OR tt.tx_pix_key = '' OR tt.tx_pix_key NOT IN (${assignedPixKeys.map(() => '?').join(',')}))`,
            params: assignedPixKeys,
            view: { type: 'other' }
        };
    }

    return {
        clause: '1=1',
        params: [],
        view: { type: 'all' }
    };
};

const buildFilters = async (query) => {
    const {
        search,
        dateFrom,
        dateTo,
        timeFrom,
        timeTo,
        txType,
        linkStatus,
        viewType,
        subaccountId
    } = query;

    const clauses = [];
    const params = [];

    const viewFilter = await resolveViewFilter({ viewType, subaccountId });
    if (viewFilter.error) {
        return { error: viewFilter.error };
    }
    clauses.push(viewFilter.clause);
    params.push(...viewFilter.params);

    const normalizedTxType = normalizeTxType(txType);
    if (normalizedTxType) {
        clauses.push('tt.tx_type = ?');
        params.push(normalizedTxType);
    }

    const startDateTime = dateFrom ? `${dateFrom} ${timeFrom || '00:00:00'}` : null;
    const endDateTime = dateTo ? `${dateTo} ${timeTo || '23:59:59'}` : null;
    if (startDateTime) {
        clauses.push('tt.tx_date >= ?');
        params.push(startDateTime);
    }
    if (endDateTime) {
        clauses.push('tt.tx_date <= ?');
        params.push(endDateTime);
    }

    const normalizedLinkStatus = normalizeLinkStatus(linkStatus);
    if (normalizedLinkStatus === 'linked') {
        clauses.push(`(tt.is_used = 1 OR ${LINKED_EXISTS_SQL})`);
    } else if (normalizedLinkStatus === 'unlinked') {
        clauses.push(`(tt.is_used = 0 AND NOT ${LINKED_EXISTS_SQL})`);
    }

    const searchTokens = String(search || '')
        .trim()
        .split(/\s+/)
        .map(sanitizeSearchToken)
        .filter(Boolean)
        .slice(0, 8);

    searchTokens.forEach((token) => {
        const tokenClauses = [
            'tt.uid LIKE ?',
            'tt.tx_id LIKE ?',
            'tt.e2e_id LIKE ?',
            'tt.tx_payer_name LIKE ?',
            'tt.tx_payer_id LIKE ?',
            'tt.tx_pix_key LIKE ?',
            'CAST(tt.amount AS CHAR) LIKE ?'
        ];

        const likeValue = `%${token}%`;
        params.push(likeValue, likeValue, likeValue, likeValue, likeValue, likeValue, likeValue);

        const numericToken = parseFloat(token.replace(',', '.'));
        if (Number.isFinite(numericToken)) {
            tokenClauses.push('tt.amount = ?');
            params.push(numericToken);
        }

        clauses.push(`(${tokenClauses.join(' OR ')})`);
    });

    return {
        whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
        params,
        view: viewFilter.view
    };
};

exports.getViews = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, name, TRIM(chave_pix) AS chave_pix
            FROM subaccounts
            WHERE account_type = 'cross'
              AND chave_pix IS NOT NULL
              AND TRIM(chave_pix) <> ''
            ORDER BY name ASC
        `);

        res.json({
            crossSubaccounts: rows.map((row) => ({
                id: row.id,
                name: row.name,
                pix_key: row.chave_pix
            })),
            otherTab: {
                key: 'other',
                label: 'Other'
            }
        });
    } catch (error) {
        console.error('[TRKBIT-VIEWS-ERROR]', error);
        res.status(500).json({ message: 'Failed to fetch cross tabs.' });
    }
};

exports.getRefreshToken = async (req, res) => {
    try {
        const tokenPayload = await buildRefreshToken();
        res.json(tokenPayload);
    } catch (error) {
        console.error('[TRKBIT-REFRESH-TOKEN-ERROR]', error);
        res.status(500).json({ message: 'Failed to fetch refresh token.' });
    }
};

exports.getTransactions = async (req, res) => {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(200, Math.max(10, toInt(req.query.limit, 50)));
    const offset = (page - 1) * limit;

    try {
        const filterResult = await buildFilters(req.query);
        if (filterResult.error) {
            return res.status(400).json({ message: filterResult.error });
        }

        const { whereSql, params, view } = filterResult;

        const countQuery = `
            SELECT COUNT(DISTINCT tt.id) AS total
            FROM trkbit_transactions tt
            ${whereSql}
        `;
        const [[{ total }]] = await pool.query(countQuery, params);

        const dataQuery = `
            SELECT
                tt.id,
                tt.uid,
                tt.tx_id,
                tt.e2e_id,
                tt.tx_date,
                tt.amount,
                tt.tx_pix_key,
                tt.tx_type,
                tt.tx_payer_name,
                tt.tx_payer_id,
                tt.is_used,
                MAX(i.id) AS linked_invoice_id,
                MAX(i.message_id) AS linked_invoice_message_id,
                CASE
                    WHEN (tt.is_used = 1 OR MAX(i.id) IS NOT NULL) THEN 'linked'
                    ELSE 'unlinked'
                END AS link_status
            FROM trkbit_transactions tt
            LEFT JOIN invoices i
                ON tt.uid = i.linked_transaction_id
               AND i.linked_transaction_source = 'Trkbit'
            ${whereSql}
            GROUP BY
                tt.id, tt.uid, tt.tx_id, tt.e2e_id, tt.tx_date, tt.amount,
                tt.tx_pix_key, tt.tx_type, tt.tx_payer_name, tt.tx_payer_id, tt.is_used
            ORDER BY tt.tx_date DESC
            LIMIT ? OFFSET ?
        `;

        const [transactions] = await pool.query(dataQuery, [...params, limit, offset]);
        const tokenPayload = await buildRefreshToken();

        res.json({
            transactions,
            view,
            totalPages: Math.ceil((total || 0) / limit),
            currentPage: page,
            totalRecords: total || 0,
            ...tokenPayload
        });
    } catch (error) {
        console.error('[TRKBIT-ERROR]', error);
        res.status(500).json({ message: 'Failed to fetch Cross Intermediação transactions.' });
    }
};

exports.unlinkTransaction = async (req, res) => {
    const { uid } = req.params;
    if (!uid) {
        return res.status(400).json({ message: 'Transaction UID is required.' });
    }

    const io = req.app.get('io');
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [[transaction]] = await connection.query(
            'SELECT uid, is_used FROM trkbit_transactions WHERE uid = ?',
            [uid]
        );
        if (!transaction) {
            await connection.rollback();
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        const [linkedInvoices] = await connection.query(
            `SELECT id
             FROM invoices
             WHERE linked_transaction_source = 'Trkbit'
               AND linked_transaction_id = ?`,
            [uid]
        );

        if (linkedInvoices.length > 0) {
            await connection.query(
                `UPDATE invoices
                 SET linked_transaction_id = NULL,
                     linked_transaction_source = NULL
                 WHERE linked_transaction_source = 'Trkbit'
                   AND linked_transaction_id = ?`,
                [uid]
            );
        }

        await connection.query(
            'UPDATE trkbit_transactions SET is_used = 0 WHERE uid = ?',
            [uid]
        );

        await connection.commit();

        if (io) {
            io.emit('trkbit:updated');
            if (linkedInvoices.length > 0) {
                io.emit('invoices:updated');
            }
        }

        const tokenPayload = await buildRefreshToken();
        res.json({
            message: 'Transaction unlinked successfully.',
            detachedInvoices: linkedInvoices.length,
            ...tokenPayload
        });
    } catch (error) {
        await connection.rollback();
        console.error('[TRKBIT-UNLINK-ERROR]', error);
        res.status(500).json({ message: 'Failed to unlink transaction.' });
    } finally {
        connection.release();
    }
};

exports.exportExcel = async (req, res) => {
    try {
        const filterResult = await buildFilters(req.query);
        if (filterResult.error) {
            return res.status(400).json({ message: filterResult.error });
        }

        const { whereSql, params } = filterResult;

        const exportQuery = `
            SELECT
                tt.tx_date,
                tt.e2e_id,
                tt.tx_payer_name,
                tt.tx_payer_id,
                tt.tx_pix_key,
                tt.tx_type,
                tt.amount,
                CASE
                    WHEN (tt.is_used = 1 OR MAX(i.id) IS NOT NULL) THEN 'linked'
                    ELSE 'unlinked'
                END AS link_status
            FROM trkbit_transactions tt
            LEFT JOIN invoices i
                ON tt.uid = i.linked_transaction_id
               AND i.linked_transaction_source = 'Trkbit'
            ${whereSql}
            GROUP BY
                tt.id, tt.tx_date, tt.e2e_id, tt.tx_payer_name, tt.tx_payer_id,
                tt.tx_pix_key, tt.tx_type, tt.amount, tt.is_used
            ORDER BY tt.tx_date ASC
        `;

        const [transactions] = await pool.query(exportQuery, params);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Cross Intermediação');

        worksheet.columns = [
            { header: 'Date/Time', key: 'tx_date', width: 22 },
            { header: 'E2E ID', key: 'e2e_id', width: 44 },
            { header: 'Name', key: 'tx_payer_name', width: 36 },
            { header: 'Payer ID', key: 'tx_payer_id', width: 30 },
            { header: 'PIX Key', key: 'tx_pix_key', width: 34 },
            { header: 'Type', key: 'tx_type', width: 10 },
            { header: 'Amount', key: 'amount', width: 18, style: { numFmt: '#,##0.00' } },
            { header: 'Link Status', key: 'link_status', width: 14 }
        ];

        transactions.forEach((tx) => {
            const absAmount = Math.abs(parseFloat(tx.amount || 0));
            const signedAmount = tx.tx_type === 'D' ? -absAmount : absAmount;

            worksheet.addRow({
                tx_date: tx.tx_date,
                e2e_id: tx.e2e_id || '',
                tx_payer_name: tx.tx_payer_name || '',
                tx_payer_id: tx.tx_payer_id || '',
                tx_pix_key: tx.tx_pix_key || '',
                tx_type: tx.tx_type || '',
                amount: signedAmount,
                link_status: tx.link_status
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="cross_intermediacao_export.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('[TRKBIT-EXPORT-ERROR]', error);
        res.status(500).json({ message: 'Failed to export Cross Intermediação statement.' });
    }
};
