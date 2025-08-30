const mysql = require('mysql2/promise');
const exceljs = require('exceljs'); // Corrected require
require('dotenv').config();

// --- SCRIPT CONFIGURATION ---
const FILENAME = `invoices_export_${new Date().toISOString().split('T')[0]}.xlsx`;

/**
 * Parses a currency string with comma thousands separators into a float.
 * Handles formats like "1,880.00" and returns a number like 1880.00.
 * Returns null if the input is invalid, null, or undefined.
 * @param {string | number} value The currency string to parse.
 * @returns {number | null} The parsed numeric value or null.
 */
function parseFormattedCurrency(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        return value;
    }
    // Remove all comma separators and then parse as a float.
    const numericString = String(value).replace(/,/g, '');
    const number = parseFloat(numericString);

    return isNaN(number) ? null : number;
}


// Main function to run the export process
const exportInvoices = async () => {
    console.log('--- Starting Invoice Export ---');
    let connection;

    try {
        // 1. Connect to the database
        console.log(`Connecting to database "${process.env.DB_DATABASE}"...`);
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE,
        });
        console.log('Database connection successful.');

        // 2. Fetch all data
        console.log('Fetching records from the "invoices" and "whatsapp_groups" tables...');
        const query = `
            SELECT 
                i.id, 
                i.transaction_id, 
                i.sender_name, 
                i.recipient_name, 
                i.pix_key, 
                i.amount, 
                COALESCE(wg.group_name, i.source_group_jid) AS source_group_name, 
                i.received_at 
            FROM invoices AS i 
            LEFT JOIN whatsapp_groups AS wg ON i.source_group_jid = wg.group_jid 
            ORDER BY i.received_at ASC;
        `;
        const [invoicesFromDb] = await connection.query(query);
        console.log(`Found ${invoicesFromDb.length} invoices to export.`);

        if (invoicesFromDb.length === 0) {
            console.log('No invoices to export. Exiting.');
            return;
        }

        // === THIS IS THE CRITICAL FIX ===
        // 3. Process the data BEFORE adding it to Excel
        const processedInvoices = invoicesFromDb.map(invoice => ({
            ...invoice,
            // Convert the 'amount' string to a real number
            amount: parseFormattedCurrency(invoice.amount) 
        }));
        // ================================

        // 4. Create a new Excel workbook and worksheet
        const workbook = new exceljs.Workbook();
        const worksheet = workbook.addWorksheet('Invoices');

        // 5. Define the columns for the Excel file
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Transaction ID', key: 'transaction_id', width: 40 },
            { header: 'Sender Name', key: 'sender_name', width: 35 },
            { header: 'Recipient Name', key: 'recipient_name', width: 35 },
            { header: 'PIX Key', key: 'pix_key', width: 30 },
            // This style will now work correctly on the numeric data
            { header: 'Amount', key: 'amount', width: 15, style: { numFmt: '#,##0.00' } }, 
            { header: 'Source Group', key: 'source_group_name', width: 30 },
            { header: 'Received At', key: 'received_at', width: 25, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
        ];

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };

        // 6. Add the PROCESSED data to the worksheet
        worksheet.addRows(processedInvoices);

        // 7. Write the file to disk
        console.log(`Writing data to file: "${FILENAME}"...`);
        await workbook.xlsx.writeFile(FILENAME);

        console.log('\n--- EXPORT COMPLETE ---');
        console.log(`[SUCCESS] Successfully exported ${invoicesFromDb.length} invoices to ${FILENAME}`);
        console.log(`The file is located in the current directory: ${process.cwd()}`);

    } catch (error) {
        console.error('\n[ERROR] An error occurred during the export process:', error);
    } finally {
        // 8. Always close the database connection
        if (connection) {
            await connection.end();
            console.log('Database connection closed.');
        }
    }
};

// Run the main function
exportInvoices();