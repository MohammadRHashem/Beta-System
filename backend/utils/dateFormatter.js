/**
 * Takes any valid date string or Date object and converts it into the
 * 'YYYY-MM-DD HH:mm:ss' format that MySQL's DATETIME column requires.
 * @param {string | Date} dateInput - The date to format.
 * @returns {string} The formatted string for MySQL.
 */
function formatForMySQL(dateInput) {
    if (!dateInput) {
        return null;
    }
    
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) {
        return null; // Return null if the date is invalid
    }

    const pad = (num) => num.toString().padStart(2, '0');

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

module.exports = { formatForMySQL };