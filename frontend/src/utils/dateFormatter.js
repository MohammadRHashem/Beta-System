import { format } from 'date-fns';
// THIS IS THE CORRECTED IMPORT SYNTAX FOR VITE/ESM
import { utcToZonedTime } from 'date-fns-tz/utcToZonedTime';

const SAO_PAULO_TZ = 'America/Sao_Paulo';

/**
 * Takes a UTC date string from the API and formats it for display in São Paulo time.
 * @param {string} utcDateString - The ISO 8601 date string from the database.
 * @returns {string} - A formatted date and time string (e.g., "28/08/2025 10:30:55").
 */
export function formatToSaoPaulo(utcDateString) {
    if (!utcDateString) return '';
    try {
        const date = new Date(utcDateString);
        const zonedDate = utcToZonedTime(date, SAO_PAULO_TZ);
        return format(zonedDate, 'dd/MM/yyyy HH:mm:ss', { timeZone: SAO_PAULO_TZ });
    } catch (error) {
        console.error("Error formatting date:", error);
        return 'Invalid Date';
    }
}

/**
 * Takes a UTC date string and formats it for the value of a datetime-local input,
 * representing the correct São Paulo date and time.
 * @param {string} utcDateString - The ISO 8601 date string.
 * @returns {string} - A string in 'YYYY-MM-DDTHH:mm' format.
 */
export function formatUTCToSaoPauloInput(utcDateString) {
    if (!utcDateString) return '';
    const date = new Date(utcDateString);
    const zonedDate = utcToZonedTime(date, SAO_PAULO_TZ);
    return format(zonedDate, "yyyy-MM-dd'T'HH:mm", { timeZone: SAO_PAULO_TZ });
}


/**
 * Gets the current time in São Paulo and formats it for a datetime-local input.
 * @returns {string} - A string in 'YYYY-MM-DDTHH:mm' format.
 */
export function getCurrentSaoPauloForInput() {
    const now = new Date();
    // We don't need to convert here, just format 'now' with the target timezone
    return format(now, "yyyy-MM-dd'T'HH:mm", { timeZone: SAO_PAULO_TZ });
}