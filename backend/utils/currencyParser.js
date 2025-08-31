/**
 * Parses a currency string with comma thousands separators into a float.
 * This is our "interpreter" for calculations.
 * @param {string | number} value The currency string to parse (e.g., "1,250.00").
 * @returns {number} The parsed numeric value (e.g., 1250.00).
 */
function parseFormattedCurrency(value) {
    if (value === null || value === undefined || value === '') {
        return 0;
    }
    if (typeof value === 'number') {
        return value;
    }
    // Remove all comma separators, then parse as a float.
    const numericString = String(value).replace(/,/g, '');
    const number = parseFloat(numericString);

    return isNaN(number) ? 0 : number;
}

/**
 * Formats a number back into your required currency string format.
 * This is our "formatter" for saving calculation results.
 * @param {number} value The number to format.
 * @returns {string} The formatted currency string (e.g., "1,250.00").
 */
function formatNumberToCustomCurrency(value) {
    if (value === null || value === undefined) return '';
    const num = Number(value);
    if (isNaN(num)) return '';
    // Use 'en-US' locale as it provides the exact "1,250.00" format you want.
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num);
}


module.exports = { parseFormattedCurrency, formatNumberToCustomCurrency };