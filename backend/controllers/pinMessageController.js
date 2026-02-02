const pool = require('../config/db');
const auditService = require('../services/auditService');
const whatsappService = require('../services/whatsappService');

const buildSummary = (targets) => {
    const summary = { total: targets.length, successful: 0, failed: 0 };
    for (const target of targets) {
        if (target.status === 'pinned') summary.successful += 1;
        if (target.status === 'failed') summary.failed += 1;
    }
    return summary;
};

exports.createPin = async (req, res) => {
    const { groupObjects, message, upload_id, duration_seconds, socketId, batch_id } = req.body;

    if ((!Array.isArray(groupObjects) || groupObjects.length === 0) && !batch_id) {
        return res.status(400).json({ message: 'At least one group or a batch is required.' });
    }
    if (!message && !upload_id) {
        return res.status(400).json({ message: 'Message text or attachment is required.' });
    }

    const durationSeconds = Number.isFinite(Number(duration_seconds)) ? Number(duration_seconds) : null;
    if (durationSeconds !== null && durationSeconds <= 0) {
        return res.status(400).json({ message: 'Duration must be greater than 0 seconds.' });
    }

    let attachment = null;
    if (upload_id) {
        const [[upload]] = await pool.query(
            'SELECT id, filepath, mimetype, original_filename FROM broadcast_uploads WHERE id = ?',
            [upload_id]
        );
        if (!upload) {
            return res.status(400).json({ message: 'Attachment not found.' });
        }
        attachment = upload;
    }

    const [result] = await pool.query(
        `INSERT INTO pinned_messages (user_id, message_text, upload_id, duration_seconds, batch_id)
         VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, message || null, upload_id || null, durationSeconds, batch_id || null]
    );
    const pinId = result.insertId;

    let resolvedGroups = groupObjects;
    if ((!Array.isArray(groupObjects) || groupObjects.length === 0) && batch_id) {
        const [batchGroups] = await pool.query(
            `SELECT bgl.group_id AS id, wg.group_name AS name
             FROM batch_group_link bgl
             LEFT JOIN whatsapp_groups wg ON wg.group_jid = bgl.group_id
             WHERE bgl.batch_id = ?`,
            [batch_id]
        );
        resolvedGroups = batchGroups.map((row) => ({ id: row.id, name: row.name || row.id }));
    }

    if (!Array.isArray(resolvedGroups) || resolvedGroups.length === 0) {
        return res.status(400).json({ message: 'Selected batch has no groups.' });
    }

    const targetValues = resolvedGroups.map((group) => [
        pinId,
        group.id,
        group.name || null,
        'pending'
    ]);

    await pool.query(
        `INSERT INTO pinned_message_targets (pinned_message_id, group_jid, group_name, status)
         VALUES ?`,
        [targetValues]
    );

    const io = req.app.get('io');
    const results = await whatsappService.pinMessageToGroups({
        groupObjects: resolvedGroups,
        message,
        attachment,
        durationSeconds,
        io,
        socketId,
    });

    for (const resultItem of results) {
        await pool.query(
            `UPDATE pinned_message_targets
             SET status = ?, error_message = ?, whatsapp_message_id = ?, pinned_at = ?
             WHERE pinned_message_id = ? AND group_jid = ?`,
            [
                resultItem.status,
                resultItem.error || null,
                resultItem.messageId || null,
                resultItem.pinnedAt || null,
                pinId,
                resultItem.groupId
            ]
        );
    }

    await auditService.logAction(req, 'pin:create', 'pinned_message', pinId, {
        groupCount: resolvedGroups.length,
        durationSeconds,
        uploadId: upload_id || null,
        batchId: batch_id || null
    });

    res.json({
        id: pinId,
        results,
        summary: buildSummary(results)
    });
};

exports.getPins = async (req, res) => {
    const [rows] = await pool.query(
        `SELECT pm.*, 
            gb.name AS batch_name,
            COUNT(pmt.id) AS total_targets,
            SUM(pmt.status = 'pinned') AS total_pinned,
            SUM(pmt.status = 'failed') AS total_failed
         FROM pinned_messages pm
         LEFT JOIN pinned_message_targets pmt ON pm.id = pmt.pinned_message_id
         LEFT JOIN group_batches gb ON pm.batch_id = gb.id
         GROUP BY pm.id
         ORDER BY pm.created_at DESC
         LIMIT 100`
    );
    res.json(rows);
};

exports.getPinDetails = async (req, res) => {
    const { id } = req.params;
    const [[pin]] = await pool.query('SELECT * FROM pinned_messages WHERE id = ?', [id]);
    if (!pin) {
        return res.status(404).json({ message: 'Pin not found.' });
    }
    const [targets] = await pool.query(
        'SELECT * FROM pinned_message_targets WHERE pinned_message_id = ? ORDER BY group_name ASC',
        [id]
    );
    res.json({ pin, targets });
};

exports.retryFailedPins = async (req, res) => {
    const { id } = req.params;
    const { socketId } = req.body;

    const [[pin]] = await pool.query('SELECT * FROM pinned_messages WHERE id = ?', [id]);
    if (!pin) {
        return res.status(404).json({ message: 'Pin not found.' });
    }

    const [failedTargets] = await pool.query(
        `SELECT group_jid AS id, group_name AS name
         FROM pinned_message_targets
         WHERE pinned_message_id = ? AND status = 'failed'`,
        [id]
    );

    if (failedTargets.length === 0) {
        return res.json({ message: 'No failed groups to retry.', results: [], summary: buildSummary([]) });
    }

    let attachment = null;
    if (pin.upload_id) {
        const [[upload]] = await pool.query(
            'SELECT id, filepath, mimetype, original_filename FROM broadcast_uploads WHERE id = ?',
            [pin.upload_id]
        );
        attachment = upload || null;
    }

    const io = req.app.get('io');
    const results = await whatsappService.pinMessageToGroups({
        groupObjects: failedTargets,
        message: pin.message_text,
        attachment,
        durationSeconds: pin.duration_seconds,
        io,
        socketId,
    });

    for (const resultItem of results) {
        await pool.query(
            `UPDATE pinned_message_targets
             SET status = ?, error_message = ?, whatsapp_message_id = ?, pinned_at = ?
             WHERE pinned_message_id = ? AND group_jid = ?`,
            [
                resultItem.status,
                resultItem.error || null,
                resultItem.messageId || null,
                resultItem.pinnedAt || null,
                id,
                resultItem.groupId
            ]
        );
    }

    await auditService.logAction(req, 'pin:retry', 'pinned_message', id, {
        retryCount: failedTargets.length
    });

    res.json({ results, summary: buildSummary(results) });
};
