// standalone script: node generateAlfaReconciliationReport.js YYYY-MM-DD YYYY-MM-DD
require('dotenv').config();
const { format, parseISO, isValid, addDays } = require('date-fns');
const ExcelJS = require('exceljs');
const path = require('path');
const pool = require('./config/db');
const alfaApiService = require('./services/alfaApiService');

// Helper function from the controller to maintain consistent business day logic
const getBusinessDayFromLocalString = (localDateString) => {
    const datePart = localDateString.split(' ')[0];
    const timePart = localDateString.split(' ')[1] || '00:00:00';
    const businessDay = new Date(`${datePart}T00:00:00Z`); 
    const [hour, minute] = timePart.split(':').map(Number);
    if (hour > 16 || (hour === 16 && minute >= 15)) {
        businessDay.setUTCDate(businessDay.getUTCDate() + 1);
    }
    return businessDay;
};

const generateReport = async (startDate, endDate) => {
    console.log(`[1/4] Starting report generation for ${startDate} to ${endDate}...`);

    try {
        // --- PHASE 1: EFFICIENT DATA FETCHING ---

        // Fetch all bank transactions from the Alfa API
        console.log('[2/4] Fetching bank transactions from Alfa Trust API...');
        const bankTransactions = await alfaApiService.fetchAllTransactions({ dateFrom: startDate, dateTo: endDate });
        if (bankTransactions.length === 0) {
            console.log('No bank transactions found for the specified period. Aborting.');
            return;
        }
        console.log(` -> Found ${bankTransactions.length} bank transactions.`);

        // Fetch all relevant invoices and their group names from our local DB
        console.log('[3/4] Fetching local invoice data for reconciliation...');
        const invoiceQuery = `
            SELECT 
                i.transaction_id,
                wg.group_name
            FROM invoices i
            JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
            WHERE i.transaction_id IS NOT NULL 
              AND i.transaction_id != ''
              AND DATE(CONVERT_TZ(i.received_at, '+00:00', '-03:00')) BETWEEN ? AND ?;
        `;
        
        // We add a day to the end date for a fully inclusive 'BETWEEN' in SQL
        const sqlEndDate = format(addDays(parseISO(endDate), 1), 'yyyy-MM-dd');
        const [invoiceRows] = await pool.query(invoiceQuery, [startDate, sqlEndDate]);
        
        // Create the high-speed lookup map
        const invoiceMap = new Map();
        for (const row of invoiceRows) {
            // We only store the first group found for a given transaction ID to avoid ambiguity
            if (!invoiceMap.has(row.transaction_id)) {
                invoiceMap.set(row.transaction_id, row.group_name);
            }
        }
        console.log(` -> Found ${invoiceMap.size} unique invoices to cross-reference.`);

        // --- PHASE 2: EXCEL FILE GENERATION ---
        
        console.log('[4/4] Generating Excel report...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('AlfaTrust_Reconciliation', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });

        worksheet.columns = [
            { header: 'Date/Time', key: 'inclusion_date', width: 22, style: { numFmt: 'dd/mm/yyyy hh:mm:ss', alignment: { horizontal: 'right' } } },
            { header: 'Transaction ID', key: 'transaction_id', width: 35 },
            { header: 'Source Group Name', key: 'source_group_name', width: 30 }, // New Column
            { header: 'Sender Name', key: 'sender_name', width: 40 },
            { header: 'Payer Document', key: 'payer_document', width: 20 },
            { header: 'Recipient Name', key: 'recipient_name', width: 40 },
            { header: 'Amount', key: 'amount', width: 18, style: { numFmt: '#,##0.00', alignment: { horizontal: 'right' } } },
        ];

        worksheet.getRow(1).font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2540' } };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        
        // Sort transactions chronologically before adding to Excel
        bankTransactions.sort((a, b) => new Date(a.dataInclusao) - new Date(b.dataInclusao));
        
        let lastBusinessDay = null;
        for (const tx of bankTransactions) {
            // Business day separator logic
            const currentBusinessDay = getBusinessDayFromLocalString(tx.dataInclusao);
            if (lastBusinessDay && currentBusinessDay.getTime() !== lastBusinessDay.getTime()) {
                const splitterRow = worksheet.addRow({ transaction_id: `--- Business Day of ${currentBusinessDay.toLocaleDateString('en-CA')} ---` });
                splitterRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                worksheet.mergeCells(`B${splitterRow.number}:G${splitterRow.number}`);
                splitterRow.getCell('B').alignment = { horizontal: 'center' };
            }
            
            // --- PHASE 3: DATA RECONCILIATION (per row) ---
            const bankTxId = tx.detalhes?.endToEndId || tx.idTransacao;
            const sourceGroupName = invoiceMap.get(bankTxId) || 'N/A';

            // Logic to determine sender/recipient, copied from controller for consistency
            let senderName = 'N/A';
            let recipientName = 'N/A';
            let payerDocument = '';
            
            if (tx.tipoOperacao === 'C') { // Credit
                senderName = tx.detalhes?.nomePagador || tx.descricao || 'N/A';
                recipientName = 'ALFA TRUST (Receiver)';
                payerDocument = tx.detalhes?.cpfCnpjPagador || '';
            } else { // Debit
                senderName = 'ALFA TRUST (Sender)';
                recipientName = tx.detalhes?.nomeRecebedor || tx.descricao || 'N/A';
                payerDocument = tx.detalhes?.cpfCnpjPagador || '';
            }
            
            worksheet.addRow({
                inclusion_date: tx.dataInclusao,
                transaction_id: bankTxId,
                source_group_name: sourceGroupName, // Populate new column
                sender_name: senderName,
                payer_document: payerDocument,
                recipient_name: recipientName,
                amount: tx.tipoOperacao === 'C' ? parseFloat(tx.valor) : -parseFloat(tx.valor)
            });
            
            lastBusinessDay = currentBusinessDay;
        }

        const fileName = `Alfa_Reconciliation_Report_${startDate}_to_${endDate}.xlsx`;
        const filePath = path.join(__dirname, fileName);
        await workbook.xlsx.writeFile(filePath);

        console.log(`\n✅ Success! Report generated: ${filePath}`);

    } catch (error) {
        console.error('\n❌ An error occurred during report generation:');
        console.error(error.message);
    } finally {
        await pool.end(); // Ensure the database connection is closed
    }
};

const main = () => {
    const args = process.argv.slice(2);
    if (args.length !== 2) {
        console.error('Usage: node generateAlfaReconciliationReport.js YYYY-MM-DD YYYY-MM-DD');
        console.error('Example: node generateAlfaReconciliationReport.js 2025-11-01 2025-11-05');
        return;
    }

    const [startDate, endDate] = args;
    const isValidStartDate = isValid(parseISO(startDate));
    const isValidEndDate = isValid(parseISO(endDate));

    if (!isValidStartDate || !isValidEndDate) {
        console.error('Invalid date format. Please use YYYY-MM-DD.');
        return;
    }

    generateReport(startDate, endDate);
};

main();