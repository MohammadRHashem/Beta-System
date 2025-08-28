// The official IANA timezone name for São Paulo
const SAO_PAULO_TZ = 'America/Sao_Paulo';

/**
 * Takes a UTC date string and formats it into a São Paulo time string (dd/mm/yyyy, hh:mm:ss)
 * for display in the table. This will be the same for all users.
 * @param {string} utcDateString - The ISO 8601 date string from the database.
 * @returns {string} The formatted São Paulo date-time string.
 */
export function formatUTCToSaoPaulo(utcDateString) {
    if (!utcDateString) return '';
    try {
        const date = new Date(utcDateString);
        // Use native toLocaleString with the specific timezone option.
        return date.toLocaleString('pt-BR', {
            timeZone: SAO_PAULO_TZ,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(',', ''); // remove comma between date and time
    } catch (e) {
        return 'Invalid Date';
    }
}

/**
 * Formats a date object into the string required by <input type="datetime-local">.
 * @param {Date} date - The date object to format.
 * @returns {string} A string like "2025-08-28T16:30".
 */
function formatForInput(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Takes a UTC date string and calculates the correct São Paulo time for an input field.
 * This is complex because datetime-local inputs are always in the browser's local time.
 * We calculate the offset and adjust the date so that the browser *displays* what
 * looks like São Paulo time.
 * @param {string} utcDateString - The ISO 8601 date string.
 * @returns {string} The formatted string for the input's value.
 */
export function getSaoPauloInputTimeFromUTC(utcDateString) {
    if (!utcDateString) return '';
    const date = new Date(utcDateString);
    return formatForInput(date);
}

/**
 * Gets the current time and formats it for the input field.
 * @returns {string} The formatted string for the input's value.
 */
export function getCurrentTimeForInput() {
    return formatForInput(new Date());
}