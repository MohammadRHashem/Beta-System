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

        // 2. Fetch all data using a LEFT JOIN to get the group name
        console.log('Fetching records from the "invoices" and "whatsapp_groups" tables...');
        
        // --- THIS IS THE MODIFIED QUERY ---
        const query = `
            SELECT 
                i.id, 
                i.transaction_id, 
                i.sender_name, 
                i.recipient_name, 
                i.pix_key, 
                i.amount, 
                -- Use COALESCE to show the JID if the group name is not found
                COALESCE(wg.group_name, i.source_group_jid) AS source_group_name,
                i.received_at
            FROM 
                invoices AS i
            LEFT JOIN 
                whatsapp_groups AS wg ON i.source_group_jid = wg.group_jid
            ORDER BY 
                i.received_at ASC;
        `;
        
        const [invoices] = await connection.query(query);
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
            // --- MODIFIED COLUMN HEADER ---
            { header: 'Source Group', key: 'source_group_name', width: 30 },
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