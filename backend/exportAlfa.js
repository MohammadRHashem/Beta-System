// standalone script: node generateAlfaReconciliationReport.js YYYY-MM-DD YYYY-MM-DD
require('dotenv').config();
const { format, parseISO, isValid, addDays } = require('date-fns');
const ExcelJS = require('exceljs');
const path = require('path');
const pool = require('./config/db');
const alfaApiService = require('./services/alfaApiService');
const { parseFormattedCurrency } = require('./utils/currencyParser');

// NEW: Function to clean and format the group name
const cleanGroupName = (name) => {
    if (!name) return '';
    // Take the first word, remove non-alphanumeric characters, and convert to uppercase
    return name.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
};

const generateReport = async (startDate, endDate) => {
    console.log(`[1/4] Starting report generation for ${startDate} to ${endDate}...`);

    try {
        // --- PHASE 1: EFFICIENT DATA FETCHING ---

        console.log('[2/4] Fetching bank transactions from Alfa Trust API...');
        let bankTransactions = await alfaApiService.fetchAllTransactions({ dateFrom: startDate, dateTo: endDate });
        
        // NEW: Filter for Credits (IN) only
        bankTransactions = bankTransactions.filter(tx => tx.tipoOperacao === 'C');

        if (bankTransactions.length === 0) {
            console.log('No credit (IN) transactions found for the specified period. Aborting.');
            return;
        }
        console.log(` -> Found ${bankTransactions.length} credit (IN) bank transactions.`);

        console.log('[3/4] Fetching local invoice data for reconciliation...');
        // NEW: Fetch more data for fallback matching
        const invoiceQuery = `
            SELECT 
                i.transaction_id,
                i.sender_name,
                i.amount,
                wg.group_name
            FROM invoices i
            JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
            WHERE i.is_deleted = 0
              AND DATE(CONVERT_TZ(i.received_at, '+00:00', '-03:00')) BETWEEN ? AND ?;
        `;
        
        const sqlEndDate = format(addDays(parseISO(endDate), 1), 'yyyy-MM-dd');
        const [invoiceRows] = await pool.query(invoiceQuery, [startDate, sqlEndDate]);
        
        // --- PHASE 2: DATA RECONCILIATION ---
        
        console.log('[4/4] Reconciling data and generating Excel report...');

        // Tier 1: Create a high-speed lookup map for TxID matching
        const txIdMap = new Map();
        for (const row of invoiceRows) {
            if (row.transaction_id && !txIdMap.has(row.transaction_id)) {
                txIdMap.set(row.transaction_id, cleanGroupName(row.group_name));
            }
        }

        // Tier 2: Prepare data for fallback matching
        const fallbackInvoices = invoiceRows.filter(row => row.sender_name && row.amount);

        const enrichedTransactions = bankTransactions.map(tx => {
            const bankTxId = tx.detalhes?.endToEndId || tx.idTransacao;
            let sourceGroupName = 'N/A';

            // Tier 1 Match Attempt
            if (bankTxId && txIdMap.has(bankTxId)) {
                sourceGroupName = txIdMap.get(bankTxId);
            } 
            // Tier 2 Fallback Match Attempt
            else {
                const bankSender = (tx.detalhes?.nomePagador || '').toUpperCase();
                const bankAmount = parseFloat(tx.valor);

                const potentialMatches = fallbackInvoices.filter(inv => {
                    const invSender = (inv.sender_name || '').toUpperCase();
                    const invAmount = parseFormattedCurrency(inv.amount);
                    return invSender === bankSender && Math.abs(invAmount - bankAmount) < 0.01;
                });

                // Only apply fallback if there is one and only one unique match
                if (potentialMatches.length === 1) {
                    sourceGroupName = cleanGroupName(potentialMatches[0].group_name);
                }
            }

            return { ...tx, source_group_name: sourceGroupName };
        });

        // --- PHASE 3: EXCEL FILE GENERATION ---

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('AlfaTrust_Reconciliation', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });

        worksheet.columns = [
            { header: 'Date/Time', key: 'inclusion_date', width: 22, style: { numFmt: 'dd/mm/yyyy hh:mm:ss', alignment: { horizontal: 'right' } } },
            { header: 'Transaction ID', key: 'transaction_id', width: 35 },
            { header: 'Sender Name', key: 'sender_name', width: 40 },
            { header: 'Payer Document', key: 'payer_document', width: 20 },
            { header: 'Amount', key: 'amount', width: 18, style: { numFmt: '#,##0.00', alignment: { horizontal: 'right' } } },
            { header: 'Source Group', key: 'source_group_name', width: 25 }, // Moved to last column
        ];

        worksheet.getRow(1).font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2540' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        
        enrichedTransactions.sort((a, b) => new Date(a.dataInclusao) - new Date(b.dataInclusao));
        
        for (const tx of enrichedTransactions) {
            worksheet.addRow({
                inclusion_date: tx.dataInclusao,
                transaction_id: tx.detalhes?.endToEndId || tx.idTransacao,
                sender_name: tx.detalhes?.nomePagador || tx.descricao || 'N/A',
                payer_document: tx.detalhes?.cpfCnpjPagador || '',
                amount: parseFloat(tx.valor),
                source_group_name: tx.source_group_name
            });
        }

        const fileName = `Alfa_Reconciliation_Report_${startDate}_to_${endDate}.xlsx`;
        const filePath = path.join(__dirname, fileName);
        await workbook.xlsx.writeFile(filePath);

        console.log(`\n✅ Success! Report generated: ${filePath}`);

    } catch (error) {
        console.error('\n❌ An error occurred during report generation:');
        console.error(error.message);
    } finally {
        await pool.end();
    }
};

const main = () => {
    // ... main function remains unchanged ...
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error('Usage: node generateAlfaReconciliationReport.js YYYY-MM-DD YYYY-MM-DD');
        console.error('Example: node generateAlfaReconciliationReport.js 2025-11-01 2025-11-05');
        return;
    }
    const [startDate, endDate] = args;
    if (!isValid(parseISO(startDate)) || !isValid(parseISO(endDate))) {
        console.error('Invalid date format. Please use YYYY-MM-DD.');
        return;
    }
    generateReport(startDate, endDate);
};

main();