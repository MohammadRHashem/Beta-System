// exportUnlinkedInvoices.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const ExcelJS = require('exceljs');
const path = require('path');

// --- Configuration ---
const outputFile = path.join(__dirname, 'unlinked_invoices_export.xlsx');

async function exportUnlinkedInvoices() {
    console.log('Connecting to the database...');
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        dateStrings: true, // Keep dates as strings to avoid timezone issues
    });
    console.log('Database connection successful.');

    try {
        const workbook = new ExcelJS.Workbook();
        
        // --- Process for 'cross' invoices ---
        console.log('Fetching unlinked invoices for "cross%"...');
        const crossQuery = `
            SELECT 
                i.*, 
                wg.group_name as source_group_name 
            FROM invoices i
            LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
            WHERE 
                i.linked_transaction_id IS NULL 
                AND i.is_deleted = 0 
                AND i.recipient_name LIKE 'cross%'
            ORDER BY i.received_at DESC;
        `;
        const [crossInvoices] = await connection.execute(crossQuery);
        console.log(`Found ${crossInvoices.length} unlinked 'Cross' invoices.`);

        // --- Process for 'upgrade' invoices ---
        console.log('Fetching unlinked invoices for "upgrade%"...');
        const upgradeQuery = `
            SELECT 
                i.*, 
                wg.group_name as source_group_name 
            FROM invoices i
            LEFT JOIN whatsapp_groups wg ON i.source_group_jid = wg.group_jid
            WHERE 
                i.linked_transaction_id IS NULL 
                AND i.is_deleted = 0 
                AND i.recipient_name LIKE 'upgrade%'
            ORDER BY i.received_at DESC;
        `;
        const [upgradeInvoices] = await connection.execute(upgradeQuery);
        console.log(`Found ${upgradeInvoices.length} unlinked 'Upgrade' invoices.`);

        // Helper function to create a sheet
        const createSheet = (sheetName, data) => {
            const worksheet = workbook.addWorksheet(sheetName);
            if (data.length === 0) {
                worksheet.addRow(['No unlinked invoices found for this recipient type.']);
                return;
            }

            // Dynamically create headers. The new 'source_group_name' column will be added automatically.
            const columns = Object.keys(data[0]).map(key => ({ 
                header: key, 
                key, 
                width: key === 'message_id' || key === 'transaction_id' ? 30 : 20 
            }));
            worksheet.columns = columns;

            // Style the header row
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

            worksheet.addRows(data);
        };

        // Create the sheets
        createSheet('Cross', crossInvoices);
        createSheet('Upgrade Zone', upgradeInvoices);

        if (crossInvoices.length === 0 && upgradeInvoices.length === 0) {
            console.log('No unlinked invoices found for either recipient type. No file will be generated.');
            return;
        }

        console.log(`Writing data to ${outputFile}...`);
        await workbook.xlsx.writeFile(outputFile);

        console.log(`\n✅ Success! Export complete.`);
        console.log(`File saved to: ${outputFile}`);

    } catch (error) {
        console.error('\n❌ An error occurred during the export process:');
        console.error(error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Database connection closed.');
        }
    }
}

// Run the export function
exportUnlinkedInvoices();