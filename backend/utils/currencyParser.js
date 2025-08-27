/**
 * Parses a currency string with comma thousands separators into a float.
 * Handles formats like "4,200.00" and returns a number like 4200.00.
 * Returns 0 if the input is invalid, null, or undefined.
 * @param {string | number} value The currency string to parse.
 * @returns {number} The parsed numeric value.
 */
function parseFormattedCurrency(value) {
    if (value === null || value === undefined) {
        return 0;
    }
    // If it's already a number, return it.
    if (typeof value === 'number') {
        return value;
    }
    // Remove all comma separators and then parse as a float.
    const numericString = String(value).replace(/,/g, '');
    const number = parseFloat(numericString);

    return isNaN(number) ? 0 : number;
}

module.exports = { parseFormattedCurrency };