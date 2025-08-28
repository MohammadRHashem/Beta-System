import { format } from 'date-fns';
// THIS IS THE NEW, CORRECTED IMPORT FROM THE NEW LIBRARY FOR THE FRONTEND
import { toZonedTime } from '@date-fns/utc';

const SAO_PAULO_TZ = 'America/Sao_Paulo';

export function formatToSaoPaulo(utcDateString) {
    if (!utcDateString) return '';
    try {
        const date = new Date(utcDateString);
        // The new function is toZonedTime
        const zonedDate = toZonedTime(date, SAO_PAULO_TZ);
        return format(zonedDate, 'dd/MM/yyyy HH:mm:ss', { timeZone: SAO_PAULO_TZ });
    } catch (error) {
        console.error("Error formatting date:", error);
        return 'Invalid Date';
    }
}

export function formatUTCToSaoPauloInput(utcDateString) {
    if (!utcDateString) return '';
    const date = new Date(utcDateString);
    const zonedDate = toZonedTime(date, SAO_PAULO_TZ);
    return format(zonedDate, "yyyy-MM-dd'T'HH:mm", { timeZone: SAO_PAULO_TZ });
}

export function getCurrentSaoPauloForInput() {
    const now = new Date();
    const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
    return format(zonedDate, "yyyy-MM-dd'T'HH:mm", { timeZone: SAO_PAULO_TZ });
}