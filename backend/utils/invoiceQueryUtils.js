const { parseFormattedCurrency, formatNumberToCustomCurrency } = require('./currencyParser');

const SAO_PAULO_UTC_OFFSET = '-03:00';

const normalizeExactAmountInput = (rawValue) => {
    if (rawValue === undefined || rawValue === null) return { isEmpty: true, value: null };
    const trimmed = String(rawValue).trim();
    if (!trimmed) return { isEmpty: true, value: null };

    if (!/^\d+(?:\.\d{0,2})?$/.test(trimmed)) {
        return { isEmpty: false, isValid: false, value: null };
    }

    const numeric = Number.parseFloat(trimmed);
    if (!Number.isFinite(numeric)) {
        return { isEmpty: false, isValid: false, value: null };
    }

    return { isEmpty: false, isValid: true, value: Number(numeric.toFixed(2)) };
};

const toInvoiceAmountDecimal = (value) => {
    const numeric = Number(parseFormattedCurrency(value));
    if (!Number.isFinite(numeric)) return 0;
    return Number(numeric.toFixed(2));
};

const toStoredInvoiceAmount = (value) => formatNumberToCustomCurrency(toInvoiceAmountDecimal(value));

const formatUtcDateForMySql = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const iso = date.toISOString();
    return iso.slice(0, 19).replace('T', ' ');
};

const buildUtcRangeFromSaoPauloInput = ({ dateFrom, dateTo, timeFrom, timeTo }) => {
    const range = {};

    if (dateFrom) {
        const startDate = new Date(`${dateFrom}T${timeFrom || '00:00:00'}${SAO_PAULO_UTC_OFFSET}`);
        const formattedStart = formatUtcDateForMySql(startDate);
        if (formattedStart) {
            range.utcStart = formattedStart;
        }
    }

    if (dateTo) {
        const endDate = new Date(`${dateTo}T${timeTo || '23:59:59'}${SAO_PAULO_UTC_OFFSET}`);
        const formattedEnd = formatUtcDateForMySql(endDate);
        if (formattedEnd) {
            range.utcEnd = formattedEnd;
        }
    }

    return range;
};

module.exports = {
    normalizeExactAmountInput,
    toInvoiceAmountDecimal,
    toStoredInvoiceAmount,
    buildUtcRangeFromSaoPauloInput
};
