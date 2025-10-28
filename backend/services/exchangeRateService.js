const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
require('dotenv').config();

puppeteer.use(StealthPlugin());

const dailyDataCache = new Map();
let browserInstance = null;
let scraperIsBusy = false;

/**
 * Initializes and returns a persistent, singleton Puppeteer browser instance.
 */
const getBrowser = async () => {
    if (browserInstance && browserInstance.isConnected()) {
        return browserInstance;
    }
    const isHeadless = process.env.PUPPETEER_HEADLESS !== 'false';
    console.log(`[SCRAPER] Launching new persistent browser instance (Headless: ${isHeadless})...`);
    
    browserInstance = await puppeteer.launch({
        headless: isHeadless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080',
        ],
    });

    browserInstance.on('disconnected', () => {
        console.error('[SCRAPER] Browser instance has disconnected or crashed.');
        browserInstance = null;
    });

    return browserInstance;
};

/**
 * Scrapes an entire day's worth of hourly data from Investing.com.
 * @param {string} dateString - The date to scrape in 'YYYY-MM-DD' format.
 * @returns {Promise<Map<number, number>|null>} A map of hour -> rate.
 */
const scrapeHourlyDataForDay = async (dateString) => {
    if (scraperIsBusy) {
        console.warn('[SCRAPER] Scraper is busy. Deferring request.');
        await new Promise(resolve => setTimeout(resolve, 3000));
        return; // Let the calling function retry logic handle it.
    }

    scraperIsBusy = true;
    console.log(`[SCRAPER] Starting scrape for date: ${dateString}`);
    let page = null;
    try {
        const browser = await getBrowser();
        if (!browser) throw new Error("Browser instance is not available.");

        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        // === THE DEFINITIVE FIX: Build the URL to bypass the date picker ===
        const [year, month, day] = dateString.split('-');
        const timestamp = new Date(`${dateString}T12:00:00Z`).getTime() / 1000;
        const url = `https://www.investing.com/currencies/usd-brl-historical-data?end_date=${timestamp}&interval_sec=3600&st_date=${timestamp - 86400}&interval_sec=3600`;
        
        console.log(`[SCRAPER] Navigating to URL: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

        // --- More Aggressive Popup Handling ---
        try {
            const closeButtonSelector = 'i[class*="popup-close-icon"], button[aria-label="Close"]';
            await page.waitForSelector(closeButtonSelector, { timeout: 7000 });
            await page.click(closeButtonSelector);
            console.log('[SCRAPER] Closed a popup/modal.');
        } catch (e) {
            console.log('[SCRAPER] No popups found, proceeding.');
        }

        const tableSelector = 'table[data-test="historical-data-table"]';
        await page.waitForSelector(tableSelector, { timeout: 20000 });
        
        const hourlyData = await page.evaluate((selector) => {
            const data = new Map();
            const table = document.querySelector(selector);
            if (!table) return null;

            const rows = table.querySelectorAll('tbody > tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 2) { // Ensure there are enough cells
                    const timeStr = cells[0].innerText;    // "Oct 25, 2025 23:00"
                    const priceStr = cells[1].innerText;   // "5.3867"
                    
                    const timeMatch = timeStr.match(/(\d{2}:\d{2})$/);
                    if (timeMatch) {
                        const hour = parseInt(timeMatch[1].substring(0, 2), 10);
                        const price = parseFloat(priceStr.replace(/,/g, ''));
                        
                        if (!isNaN(hour) && !isNaN(price)) {
                            data.set(hour, price);
                        }
                    }
                }
            });
            return Array.from(data.entries());
        }, tableSelector);

        if (!hourlyData || hourlyData.length === 0) {
            throw new Error(`No historical data found in the table for ${dateString}. The market may have been closed or page structure changed.`);
        }

        const dataMap = new Map(hourlyData);
        dailyDataCache.set(dateString, dataMap);
        console.log(`[SCRAPER] Successfully scraped and cached ${dataMap.size} hourly rates for ${dateString}.`);
        return dataMap;

    } catch (error) {
        console.error(`[SCRAPER] CRITICAL ERROR scraping for ${dateString}:`, error.message);
        if (page) {
            const screenshotPath = path.join(__dirname, '..', 'error_screenshot.png');
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.error(`[SCRAPER] Screenshot of the failed page saved to: ${screenshotPath}`);
        }
        dailyDataCache.set(dateString, null);
        return null;
    } finally {
        if (page) await page.close();
        scraperIsBusy = false;
    }
};

/**
 * Gets the historical rate for a specific hour, using a daily cache to be efficient.
 * @param {string} dateTimeString - e.g., "2025-10-25 08:35:00"
 * @returns {Promise<number|null>}
 */
const getUsdBrlRateForDateTime = async (dateTimeString) => {
    const datePart = dateTimeString.split(' ')[0];
    const hourPart = parseInt(dateTimeString.split(' ')[1].substring(0, 2), 10);

    let dayData = dailyDataCache.get(datePart);

    if (dayData === undefined) {
        dayData = await scrapeHourlyDataForDay(datePart);
    }

    if (dayData === null) {
        return null;
    }
    
    // Find the closest available hour if the exact hour isn't there (e.g., market open/close)
    if (dayData.has(hourPart)) {
        return dayData.get(hourPart);
    } else {
        // Fallback: find the closest previous hour in the scraped data
        for (let h = hourPart - 1; h >= 0; h--) {
            if (dayData.has(h)) {
                console.log(`[SCRAPER] Using fallback rate from hour ${h} for target hour ${hourPart}`);
                return dayData.get(h);
            }
        }
        return null; // No earlier data found for that day
    }
};

// Graceful shutdown
const closeBrowser = async () => {
    if (browserInstance) {
        console.log('[SCRAPER] Gracefully closing browser instance...');
        await browserInstance.close();
        browserInstance = null;
    }
};

process.on('SIGINT', closeBrowser);
process.on('SIGTERM', closeBrowser);

module.exports = { getUsdBrlRateForDateTime };