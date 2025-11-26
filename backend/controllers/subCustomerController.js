const pool = require('../config/db');

exports.getSubCustomers = async (req, res) => {
    const { page = 1, limit = 50, groupId, searchName, source = 'bot' } = req.query;
    const offset = (page - 1) * limit;

    try {
        let query = '';
        let countQuery = '';
        let params = [];
        let countParams = [];

        // === SOURCE 1: BOT (INVOICES TABLE) ===
        if (source === 'bot') {
            let whereClause = "WHERE i.sender_name IS NOT NULL AND i.sender_name != ''";
            
            if (groupId) {
                whereClause += " AND i.source_group_jid = ?";
                params.push(groupId);
            }
            if (searchName) {
                whereClause += " AND i.sender_name LIKE ?";
                params.push(`%${searchName}%`);
            }
            
            countParams = [...params];

            countQuery = `
                SELECT COUNT(*) as total FROM (
                    SELECT i.sender_name
                    FROM invoices i
                    ${whereClause}
                    GROUP BY i.sender_name, i.source_group_jid
                ) as t
            `;

            query = `
                SELECT 
                    i.sender_name,
                    i.source_group_jid,
                    wg.group_name,
                    COUNT(*) as transaction_count,
                    MAX(i.received_at) as last_seen
                FROM invoices i
                LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
                ${whereClause}
                GROUP BY i.sender_name, i.source_group_jid, wg.group_name
                ORDER BY transaction_count DESC
                LIMIT ? OFFSET ?
            `;
        } 
        // === SOURCE 2: XPAYZ API ===
        else if (source === 'xpayz') {
            let whereClause = "WHERE xt.sender_name IS NOT NULL AND xt.sender_name != '' AND xt.operation_direct = 'in'";
            
            if (groupId) {
                // We assume the user selects a WhatsApp Group ID. We need to filter by the subaccount assigned to that group.
                whereClause += " AND s.assigned_group_jid = ?";
                params.push(groupId);
            }
            if (searchName) {
                whereClause += " AND xt.sender_name LIKE ?";
                params.push(`%${searchName}%`);
            }

            countParams = [...params];

            countQuery = `
                SELECT COUNT(*) as total FROM (
                    SELECT xt.sender_name
                    FROM xpayz_transactions xt
                    LEFT JOIN subaccounts s ON xt.subaccount_id = s.subaccount_number
                    ${whereClause}
                    GROUP BY xt.sender_name, s.assigned_group_jid
                ) as t
            `;

            query = `
                SELECT 
                    xt.sender_name,
                    s.assigned_group_jid as source_group_jid,
                    COALESCE(s.assigned_group_name, CONCAT('Subaccount: ', xt.subaccount_id)) as group_name,
                    COUNT(*) as transaction_count,
                    MAX(xt.transaction_date) as last_seen
                FROM xpayz_transactions xt
                LEFT JOIN subaccounts s ON xt.subaccount_id = s.subaccount_number
                ${whereClause}
                GROUP BY xt.sender_name, s.assigned_group_jid, s.assigned_group_name, xt.subaccount_id
                ORDER BY transaction_count DESC
                LIMIT ? OFFSET ?
            `;
        }
        // === SOURCE 3: ALFA TRUST API ===
        else if (source === 'alfa') {
            // Alfa doesn't have groups, so we ignore groupId filter usually, 
            // but if provided, we return empty because no group matches "Alfa API".
            // To be user-friendly, we just ignore the group filter unless strictness is required.
            
            let whereClause = "WHERE at.payer_name IS NOT NULL AND at.payer_name != '' AND at.operation = 'C'"; // Only credits
            
            if (searchName) {
                whereClause += " AND at.payer_name LIKE ?";
                params.push(`%${searchName}%`);
            }
            
            // If a specific group is requested, Alfa usually can't satisfy it, so we might return 0 results.
            // However, for this implementation, I will allow searching names even if group is selected, 
            // but I won't filter by group logic since Alfa implies "No Specific Group".
            if (groupId) {
                 // Optional: Make this strict. For now, let's return nothing if a group is forced.
                 whereClause += " AND 1=0"; 
            }

            countParams = [...params];

            countQuery = `
                SELECT COUNT(*) as total FROM (
                    SELECT at.payer_name
                    FROM alfa_transactions at
                    ${whereClause}
                    GROUP BY at.payer_name
                ) as t
            `;

            query = `
                SELECT 
                    at.payer_name as sender_name,
                    NULL as source_group_jid,
                    'Alfa Trust (Direct API)' as group_name,
                    COUNT(*) as transaction_count,
                    MAX(at.inclusion_date) as last_seen
                FROM alfa_transactions at
                ${whereClause}
                GROUP BY at.payer_name
                ORDER BY transaction_count DESC
                LIMIT ? OFFSET ?
            `;
        } else {
            return res.status(400).json({ message: 'Invalid source.' });
        }
        
        // --- Execute Queries ---
        const [[{ total }]] = await pool.query(countQuery, countParams);

        if (total === 0) {
            return res.json({
                data: [],
                totalPages: 0,
                currentPage: 1,
                totalRecords: 0
            });
        }

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