const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const processLink = async (txId) => {
    console.log(`[USDT-LINK] Processing TXID: ${txId}`);
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800'],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        const url = `https://usdt.tokenview.io/en/tx/${txId}`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Attempt to scrape basic details
        // Note: Selectors depend on TokenView's current DOM structure. 
        // We allow some leniency by getting all text if specific selectors fail.
        const scrapedData = await page.evaluate(() => {
            const text = document.body.innerText;
            const result = {
                status: 'Unknown',
                toAddresses: [],
                amount: null
            };

            if (text.includes('Success') || text.includes('Confirmed')) result.status = 'SUCCESS';
            else if (text.includes('Fail')) result.status = 'FAIL';

            // Extract potential TRON addresses (T...)
            // This is a heuristic to find the destination wallet in the page text
            const addressRegex = /\bT[A-Za-z0-9]{33}\b/g;
            const matches = text.match(addressRegex) || [];
            // Usually the "To" address appears after the "From" address in the transfer list
            result.toAddresses = [...new Set(matches)]; 

            return result;
        });

        const screenshotBuffer = await page.screenshot({ 
            fullPage: false, 
            clip: { x: 0, y: 0, width: 1280, height: 800 } 
        });

        return { success: true, data: scrapedData, screenshot: screenshotBuffer };

    } catch (error) {
        console.error('[USDT-LINK-ERROR]', error);
        return { success: false, error: error.message };
    } finally {
        if (browser) await browser.close();
    }
};

module.exports = { processLink };