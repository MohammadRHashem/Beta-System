const mysql = require('mysql2/promise');
const exceljs = new require('exceljs');
require('dotenv').config(); // Load environment variables from .env file

// --- SCRIPT CONFIGURATION ---
const FILENAME = `invoices_export_${new Date().toISOString().split('T')[0]}.xlsx`;

// Main function to run the export process
const exportInvoices = async () => {
    console.log('--- Starting Invoice Export ---');
    let connection;

    try {
        // 1. Connect to the database using credentials from your .env file
        console.log(`Connecting to database "${process.env.DB_DATABASE}"...`);
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE,
        });
        console.log('Database connection successful.');

        // 2. Fetch all data from the invoices table
        console.log('Fetching all records from the "invoices" table...');
        const [invoices] = await connection.query(
            'SELECT * FROM invoices ORDER BY received_at ASC'
        );
        console.log(`Found ${invoices.length} invoices to export.`);

        if (invoices.length === 0) {
            console.log('No invoices to export. Exiting.');
            return;
        }

        // 3. Create a new Excel workbook and worksheet
        const workbook = new exceljs.Workbook();
        const worksheet = workbook.addWorksheet('Invoices');

        // 4. Define the columns for the Excel file
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Transaction ID', key: 'transaction_id', width: 40 },
            { header: 'Sender Name', key: 'sender_name', width: 35 },
            { header: 'Recipient Name', key: 'recipient_name', width: 35 },
            { header: 'PIX Key', key: 'pix_key', width: 30 },
            { header: 'Amount', key: 'amount', width: 15, style: { numFmt: '#,##0.00' } },
            { header: 'Source Group JID', key: 'source_group_jid', width: 30 },
            { header: 'Received At', key: 'received_at', width: 25, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
        ];
        
        // Style the header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };

        // 5. Add all the invoice data to the worksheet
        worksheet.addRows(invoices);

        // 6. Write the file to disk
        console.log(`Writing data to file: "${FILENAME}"...`);
        await workbook.xlsx.writeFile(FILENAME);

        console.log('\n--- EXPORT COMPLETE ---');
        console.log(`[SUCCESS] Successfully exported ${invoices.length} invoices to ${FILENAME}`);
        console.log(`The file is located in the current directory: /home/ubuntu/Beta-System/backend/`);

    } catch (error) {
        console.error('\n[ERROR] An error occurred during the export process:', error);
    } finally {
        // 7. Always close the database connection
        if (connection) {
            await connection.end();
            console.log('Database connection closed.');
        }
    }
};

// Run the main function
exportInvoices();