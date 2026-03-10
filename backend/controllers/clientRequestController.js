const pool = require('../config/db');
const whatsappService = require('../services/whatsappService');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

const normalizeContentValue = (value) => {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
};

// RENAMED & MODIFIED: Fetches ALL requests (pending and completed)
exports.getAllRequests = async (req, res) => {
    const pagination = parsePagination(req.query, { defaultLimit: 50 });
    const view = String(req.query.view || 'pending').trim().toLowerCase();
    const requestType = String(req.query.requestType || '').trim();
    const search = String(req.query.search || '').trim();
    const sortKey = String(req.query.sortKey || 'received_at').trim();
    const sortDir = String(req.query.sortDir || 'asc').trim().toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const sortColumnMap = {
        received_at: 'cr.received_at',
        source_group_name: 'cr.source_group_name',
        request_type: 'cr.request_type',
        content: 'cr.content',
        amount: 'CAST(cr.amount AS DECIMAL(18,2))',
        completed_at: 'cr.completed_at'
    };
    const orderBy = sortColumnMap[sortKey] || sortColumnMap.received_at;

    const whereParts = ['1=1'];
    const whereParams = [];

    if (view === 'completed') {
        whereParts.push('cr.is_completed = 1');
    } else {
        whereParts.push('cr.is_completed = 0');
    }

    if (requestType && requestType !== 'All') {
        whereParts.push('cr.request_type = ?');
        whereParams.push(requestType);
    }

    if (search) {
        const searchToken = `%${search}%`;
        whereParts.push(`(
            cr.source_group_name LIKE ?
            OR cr.request_type LIKE ?
            OR cr.content LIKE ?
            OR CAST(cr.amount AS CHAR) LIKE ?
            OR COALESCE(u.username, '') LIKE ?
            OR DATE_FORMAT(cr.received_at, '%Y-%m-%d %H:%i:%s') LIKE ?
            OR DATE_FORMAT(cr.completed_at, '%Y-%m-%d %H:%i:%s') LIKE ?
            OR COALESCE(rt.content_label, '') LIKE ?
        )`);
        whereParams.push(
            searchToken,
            searchToken,
            searchToken,
            searchToken,
            searchToken,
            searchToken,
            searchToken,
            searchToken
        );
    }

    const whereSql = `WHERE ${whereParts.join(' AND ')}`;

    try {
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM client_requests cr
            LEFT JOIN request_types rt
              ON (cr.request_type_id IS NOT NULL AND rt.id = cr.request_type_id)
              OR (cr.request_type_id IS NULL AND rt.name = cr.request_type)
            LEFT JOIN users u ON cr.completed_by_user_id = u.id
            ${whereSql}
        `;
        const [[{ total }]] = await pool.query(countQuery, whereParams);

        let query = `
            SELECT 
                cr.id, cr.message_id, cr.content, cr.amount, cr.source_group_name, cr.request_type, 
                cr.received_at, cr.is_completed, cr.completed_at, u.username as completed_by,
                COALESCE(rt.color, '#E0E0E0') as type_color,
                rt.acknowledgement_reaction,
                COALESCE(rt.track_content_history, 0) as track_content_history,
                rt.content_label,
                CASE
                    WHEN COALESCE(rt.track_content_history, 0) = 1 AND COALESCE(cr.content_key, '') != '' THEN (
                        SELECT COUNT(*)
                        FROM client_requests crh
                        WHERE crh.is_completed = 1
                          AND (
                              (cr.request_type_id IS NOT NULL AND (
                                  crh.request_type_id = cr.request_type_id
                                  OR (crh.request_type_id IS NULL AND crh.request_type = cr.request_type)
                              ))
                              OR (cr.request_type_id IS NULL AND crh.request_type = cr.request_type)
                          )
                          AND COALESCE(crh.content_key, '') = COALESCE(cr.content_key, '')
                          AND (
                              crh.received_at < cr.received_at
                              OR (crh.received_at = cr.received_at AND crh.id < cr.id)
                          )
                    )
                    ELSE 0
                END as history_completed_count
            FROM client_requests cr
            LEFT JOIN request_types rt
              ON (cr.request_type_id IS NOT NULL AND rt.id = cr.request_type_id)
              OR (cr.request_type_id IS NULL AND rt.name = cr.request_type)
            LEFT JOIN users u ON cr.completed_by_user_id = u.id
            ${whereSql}
            ORDER BY ${orderBy} ${sortDir}, cr.id ${sortDir}
        `;
        const dataParams = [...whereParams];
        if (!pagination.isAll) {
            query += ' LIMIT ? OFFSET ?';
            dataParams.push(pagination.limitValue, pagination.offset);
        }

        const [items] = await pool.query(query, dataParams);

        res.json({
            items,
            ...buildPaginationMeta(total, pagination)
        });
    } catch (error) {
        console.error('[CLIENT-REQ-ERROR] Failed to fetch all requests:', error);
        res.status(500).json({ message: 'Failed to fetch requests.' });
    }
};

// PATCH /api/client-requests/:id/complete - Mark a request as done
exports.completeRequest = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const io = req.app.get('io');

    try {
        const [[request]] = await pool.query(
            `SELECT message_id FROM client_requests WHERE id = ?`,
            [id]
        );

        if (!request) {
            return res.status(404).json({ message: 'Request not found.' });
        }

        const [result] = await pool.query(
            `UPDATE client_requests 
             SET is_completed = 1, completed_at = NOW(), completed_by_user_id = ? 
             WHERE id = ? AND is_completed = 0`,
            [userId, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Request already completed.' });
        }
        
        await whatsappService.clearReaction(request.message_id);

        io.emit('client_request:update');
        res.json({ message: 'Request marked as completed.' });

    } catch (error) {
        console.error(`[CLIENT-REQ-ERROR] Failed to complete request ${id}:`, error);
        res.status(500).json({ message: 'Failed to complete request.' });
    }
};

// --- NEW FUNCTION ---
// PATCH /api/client-requests/:id/restore - Mark a request as pending again
exports.restoreRequest = async (req, res) => {
    const { id } = req.params;
    const io = req.app.get('io');

    try {
        const [[requestToRestore]] = await pool.query(
            `SELECT cr.message_id, rt.acknowledgement_reaction 
             FROM client_requests cr
             LEFT JOIN request_types rt
               ON (cr.request_type_id IS NOT NULL AND rt.id = cr.request_type_id)
               OR (cr.request_type_id IS NULL AND rt.name = cr.request_type)
             WHERE cr.id = ?`,
            [id]
        );
        
        if (!requestToRestore) {
            return res.status(404).json({ message: "Request not found." });
        }
        
        const [result] = await pool.query(
            `UPDATE client_requests SET is_completed = 0, completed_at = NULL, completed_by_user_id = NULL WHERE id = ? AND is_completed = 1`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(409).json({ message: "Request is already pending." });
        }
        
        // Re-apply the original reaction
        if (requestToRestore.acknowledgement_reaction) {
            await whatsappService.reactToMessage(requestToRestore.message_id, requestToRestore.acknowledgement_reaction);
        }

        io.emit('client_request:update');
        res.json({ message: 'Request restored successfully.' });

    } catch (error) {
        console.error(`[CLIENT-REQ-ERROR] Failed to restore request ${id}:`, error);
        res.status(500).json({ message: 'Failed to restore request.' });
    }
};

// NEW: PATCH /api/client-requests/:id/amount - Update the amount for a request
exports.updateRequestAmount = async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    const io = req.app.get('io');

    if (amount === undefined || isNaN(parseFloat(amount))) {
        return res.status(400).json({ message: 'A valid amount is required.' });
    }

    try {
        const [result] = await pool.query(
            'UPDATE client_requests SET amount = ? WHERE id = ?',
            [amount, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Request not found.' });
        }
        
        io.emit('client_request:update');
        res.json({ message: 'Amount updated successfully.' });

    } catch (error) {
        console.error(`[CLIENT-REQ-ERROR] Failed to update amount for request ${id}:`, error);
        res.status(500).json({ message: 'Failed to update amount.' });
    }
};

exports.updateRequestContent = async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    const io = req.app.get('io');

    // Basic validation
    if (content === undefined || content === null) {
        return res.status(400).json({ message: 'Content must be provided.' });
    }

    try {
        const normalizedContentKey = normalizeContentValue(content);
        const [result] = await pool.query(
            'UPDATE client_requests SET content = ?, content_key = ? WHERE id = ?',
            [content, normalizedContentKey, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Request not found.' });
        }
        
        // Notify all clients that data has changed
        io.emit('client_request:update');
        res.json({ message: 'Information updated successfully.' });

    } catch (error) {
        console.error(`[CLIENT-REQ-ERROR] Failed to update content for request ${id}:`, error);
        res.status(500).json({ message: 'Failed to update information.' });
    }
};

exports.deleteRequest = async (req, res) => {
    const { id } = req.params;
    const io = req.app.get('io');

    try {
        const [result] = await pool.query(
            'DELETE FROM client_requests WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Request not found.' });
        }

        io.emit('client_request:update');
        res.json({ message: 'Request deleted successfully.' });
    } catch (error) {
        console.error(`[CLIENT-REQ-ERROR] Failed to delete request ${id}:`, error);
        res.status(500).json({ message: 'Failed to delete request.' });
    }
};

exports.getRequestHistory = async (req, res) => {
    const { id } = req.params;

    try {
        const [[currentRequest]] = await pool.query(
            `SELECT cr.id, cr.request_type, cr.request_type_id, cr.content, cr.content_key, cr.received_at,
                    COALESCE(rt.track_content_history, 0) as track_content_history,
                    rt.content_label
             FROM client_requests cr
             LEFT JOIN request_types rt
               ON (cr.request_type_id IS NOT NULL AND rt.id = cr.request_type_id)
               OR (cr.request_type_id IS NULL AND rt.name = cr.request_type)
             WHERE cr.id = ?
             LIMIT 1`,
            [id]
        );

        if (!currentRequest) {
            return res.status(404).json({ message: 'Request not found.' });
        }

        const tracked = Number(currentRequest.track_content_history) === 1;
        const normalizedContent = currentRequest.content_key || normalizeContentValue(currentRequest.content);
        if (!tracked || normalizedContent.length === 0) {
            return res.json({
                tracked: false,
                request_type: currentRequest.request_type,
                content_label: currentRequest.content_label || null,
                content: currentRequest.content || '',
                items: []
            });
        }

        const [items] = await pool.query(
            `SELECT
                crh.id,
                crh.message_id,
                crh.content,
                crh.amount,
                crh.source_group_name,
                crh.request_type,
                crh.received_at,
                crh.completed_at,
                u.username as completed_by
             FROM client_requests crh
             LEFT JOIN users u ON crh.completed_by_user_id = u.id
             WHERE crh.is_completed = 1
               AND (
                    (? IS NOT NULL AND (
                        crh.request_type_id = ?
                        OR (crh.request_type_id IS NULL AND crh.request_type = ?)
                    ))
                    OR (? IS NULL AND crh.request_type = ?)
               )
               AND COALESCE(crh.content_key, '') = ?
               AND (
                    crh.received_at < ?
                    OR (crh.received_at = ? AND crh.id < ?)
               )
             ORDER BY crh.received_at DESC, crh.id DESC
             LIMIT 100`,
            [
                currentRequest.request_type_id,
                currentRequest.request_type_id,
                currentRequest.request_type,
                currentRequest.request_type_id,
                currentRequest.request_type,
                normalizedContent,
                currentRequest.received_at,
                currentRequest.received_at,
                currentRequest.id
            ]
        );

        res.json({
            tracked: true,
            request_type: currentRequest.request_type,
            content_label: currentRequest.content_label || null,
            content: currentRequest.content || '',
            items
        });
    } catch (error) {
        console.error(`[CLIENT-REQ-ERROR] Failed to fetch request history for ${id}:`, error);
        res.status(500).json({ message: 'Failed to fetch request history.' });
    }
};
