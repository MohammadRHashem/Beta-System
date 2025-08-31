const pool = require('../config/db');
const { parseFormattedCurrency, formatNumberToCustomCurrency } = require('./currencyParser');

/**
 * Recalculates the balance for all invoices starting from a specific timestamp.
 */
const recalculateBalances = async (connection, startTimeISO) => {
    console.log(`[BALANCE_CALC] Starting recalculation from ${startTimeISO}`);

    try {
        const [previousInvoices] = await connection.execute(
            `SELECT balance FROM invoices WHERE received_at < ? ORDER BY received_at DESC, id DESC LIMIT 1`,
            [startTimeISO]
        );
        let currentBalance = 0.00;
        if (previousInvoices.length > 0) {
            // The balance is a string, so we must parse it to a number to start.
            currentBalance = parseFormattedCurrency(previousInvoices[0].balance);
        }

        const [invoicesToUpdate] = await connection.execute(
            `SELECT id, amount, credit FROM invoices WHERE received_at >= ? ORDER BY received_at ASC, id ASC`,
            [startTimeISO]
        );

        for (const invoice of invoicesToUpdate) {
            // Convert both VARCHAR amounts to numbers for calculation.
            const debit = parseFormattedCurrency(invoice.amount); 
            const credit = parseFormattedCurrency(invoice.credit);
            currentBalance = currentBalance + debit - credit;

            // Convert the numeric result BACK to the correct "1,250.00" string format for storage.
            const formattedBalance = formatNumberToCustomCurrency(currentBalance);

            // Save the formatted string to the VARCHAR balance column.
            await connection.execute(
                `UPDATE invoices SET balance = ? WHERE id = ?`,
                [formattedBalance, invoice.id]
            );
        }
        console.log(`[BALANCE_CALC] Recalculation complete.`);
    } catch (error) {
        console.error('[BALANCE_CALC-ERROR] Failed to recalculate balances:', error);
        throw error;
    }
};

module.exports = { recalculateBalances };