const pool = require('../config/db');

exports.getSubCustomers = async (req, res) => {
    const { page = 1, limit = 50, groupId, searchName } = req.query;
    const offset = (page - 1) * limit;

    try {
        let whereClause = "WHERE i.sender_name IS NOT NULL AND i.sender_name != ''";
        const params = [];

        if (groupId) {
            whereClause += " AND i.source_group_jid = ?";
            params.push(groupId);
        }

        if (searchName) {
            whereClause += " AND i.sender_name LIKE ?";
            params.push(`%${searchName}%`);
        }

        // Query to get the total count of unique (sender, group) pairs for pagination
        const countQuery = `
            SELECT COUNT(*) as total FROM (
                SELECT i.sender_name
                FROM invoices i
                ${whereClause}
                GROUP BY i.sender_name, i.source_group_jid
            ) as t
        `;
        
        const [[{ total }]] = await pool.query(countQuery, params);

        if (total === 0) {
            return res.json({
                data: [],
                totalPages: 0,
                currentPage: 1,
                totalRecords: 0
            });
        }

        // Main Query
        const query = `
            SELECT 
                i.sender_name,
                i.source_group_jid,
                wg.group_name,
                COUNT(*) as transaction_count,
                MAX(i.received_at) as last_seen
            FROM invoices i
            LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
            ${whereClause}
            GROUP BY i.sender_name, i.source_group_jid
            ORDER BY transaction_count DESC
            LIMIT ? OFFSET ?
        `;

        const finalParams = [...params, parseInt(limit), parseInt(offset)];
        const [rows] = await pool.query(query, finalParams);

        res.json({
            data: rows,
            totalPages: Math.ceil(total / limit),
            currentPage: parseInt(page),
            totalRecords: total
        });

    } catch (error) {
        console.error('[SUB-CUSTOMERS-ERROR]', error);
        res.status(500).json({ message: 'Failed to fetch sub-customers.' });
    }
};