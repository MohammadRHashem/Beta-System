/**
 * A robust currency parser that handles both US (1,234.56) and Brazilian/European (1.234,56) formats.
 * This is the definitive "interpreter" that fixes bad number formats before calculations or export.
 * @param {string | number} value The currency string to parse.
 * @returns {number} The parsed numeric value, defaulting to 0.
 */
function parseFormattedCurrency(value) {
    if (value === null || value === undefined) {
        return 0;
    }
    if (typeof value === 'number') {
        return value;
    }

    let s = String(value).trim();
    if (s === '') {
        return 0;
    }

    const lastComma = s.lastIndexOf(',');
    const lastPeriod = s.lastIndexOf('.');

    // If a comma exists and it comes after any period, it's a decimal separator (e.g., "1.234,56")
    if (lastComma > -1 && lastComma > lastPeriod) {
        // Remove all periods (thousands separators) and replace the decimal comma with a period
        s = s.replace(/\./g, '').replace(',', '.');
    } 
    // Otherwise, the period is the decimal separator (e.g., "1,234.56")
    else {
        // Just remove all commas (thousands separators)
        s = s.replace(/,/g, '');
    }

    const number = parseFloat(s);
    return isNaN(number) ? 0 : number;
}

/**
 * Formats a number into your required USA currency string format (e.g., 1250.5 -> "1,250.50").
 * This is our "formatter" for saving calculation results.
 * @param {number} value The number to format.
 * @returns {string} The formatted currency string.
 */
function formatNumberToCustomCurrency(value) {
    if (value === null || value === undefined) {
        return '0.00';
    }
    const num = Number(value);
    if (isNaN(num)) {
        return '0.00';
    }
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num);
}


module.exports = { parseFormattedCurrency, formatNumberToCustomCurrency };