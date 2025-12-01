const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const processLink = async (txId) => {
    console.log(`[USDT-LINK] Processing TXID: ${txId}`);
    
    // 1. DATA FETCHING (Fast & Reliable API)
    let apiData = null;
    try {
        const { data } = await axios.get(`https://usdt.tokenview.io/api/usdtsearch/${txId}`);
        
        // Check root code (1 = Success in TokenView API)
        if (data.code !== 1 || !data.data || data.data.length === 0) {
            return { success: false, error: 'Transaction not found in API.' };
        }

        const txInfo = data.data[0];
        
        // Find the specific USDT token transfer logic
        // We look for tokenSymbol 'USDT' inside the tokenTransfer array
        const tokenTransfer = txInfo.tokenTransfer ? txInfo.tokenTransfer.find(t => t.tokenSymbol === 'USDT') : null;

        apiData = {
            // === FIX: Check root object 'data' for enMsg, OR assume success if code is 1 ===
            status: (data.code === 1 && data.enMsg === 'SUCCESS') ? 'SUCCESS' : 'FAIL',
            
            // The API returns value in Micro-USDT (6 decimals). E.g. 629850000 -> 629.85
            amount: tokenTransfer ? (parseFloat(tokenTransfer.value) / 1000000).toString() : "0",
            
            // Extract the "To" address from the token transfer logic
            toAddresses: tokenTransfer ? [tokenTransfer.to] : [],
            
            // Extract "From" address
            fromAddress: tokenTransfer ? tokenTransfer.from : (txInfo.from || 'unknown'),
            
            // Convert Epoch (seconds) to Date Object for MySQL
            time: txInfo.time ? new Date(txInfo.time * 1000) : new Date()
        };
        
        console.log(`[USDT-LINK] API Data Fetched:`, apiData);

    } catch (apiError) {
        console.error(`[USDT-LINK] API Fetch failed:`, apiError.message);
        return { success: false, error: 'API validation failed.' };
    }

    // 2. SCREENSHOT CAPTURE (Visual Proof)
    let screenshotBuffer = null;
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800'],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1000 });

        const url = `https://usdt.tokenview.io/en/tx/${txId}`;
        
        // 'domcontentloaded' is much faster than 'networkidle2'
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        
        // Small manual delay to allow the JS framework to render the table data
        await new Promise(r => setTimeout(r, 3000));

        screenshotBuffer = await page.screenshot({ 
            fullPage: false, 
            clip: { x: 0, y: 0, width: 1280, height: 1000 } 
        });

    } catch (pupError) {
        console.error('[USDT-LINK] Screenshot warning:', pupError.message);
    } finally {
        if (browser) await browser.close();
    }

    return { 
        success: true, 
        data: apiData, 
        screenshot: screenshotBuffer 
    };
};

module.exports = { processLink };