const pool = require('../config/db');
const { parseFormattedCurrency } = require('./currencyParser');

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
            currentBalance = parseFloat(previousInvoices[0].balance || 0);
        }

        const [invoicesToUpdate] = await connection.execute(
            `SELECT id, amount, credit FROM invoices WHERE received_at >= ? ORDER BY received_at ASC, id ASC`,
            [startTimeISO]
        );

        for (const invoice of invoicesToUpdate) {
            // Use the parser for the 'amount' string
            const debit = parseFormattedCurrency(invoice.amount); 
            const credit = parseFloat(invoice.credit || 0);
            currentBalance = currentBalance + debit - credit;

            await connection.execute(
                `UPDATE invoices SET balance = ? WHERE id = ?`,
                [currentBalance, invoice.id]
            );
        }
        console.log(`[BALANCE_CALC] Recalculation complete.`);
    } catch (error) {
        console.error('[BALANCE_CALC-ERROR] Failed to recalculate balances:', error);
        throw error;
    }
};

module.exports = { recalculateBalances };