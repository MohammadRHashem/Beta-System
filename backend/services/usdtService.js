const axios = require('axios');
const pool = require('../config/db');

const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY;
const API_URL = 'https://api.trongrid.io';
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const sunToUsdt = (sunValue) => {
    return parseInt(sunValue, 10) / 1_000_000;
};

const confirmTransaction = async (txId, expectedAmount, ourWallets) => {
    if (!TRONGRID_API_KEY) {
        console.error('[USDT-SERVICE] TRONGRID_API_KEY is not configured in .env file.');
        return { status: 'ERROR', message: 'API key not configured.' };
    }

    if (!txId || !expectedAmount || ourWallets.size === 0) {
        return { status: 'INVALID_INPUT' };
    }

    try {
        const { data: txInfo } = await axios.get(`${API_URL}/wallet/gettransactioninfobyid`, {
            params: { value: txId },
            headers: { 'TRON-PRO-API-KEY': TRONGRID_API_KEY }
        });

        if (!txInfo || Object.keys(txInfo).length === 0) {
            return { status: 'NOT_FOUND' };
        }

        if (txInfo.receipt?.result !== 'SUCCESS') {
            return { status: 'TRANSACTION_FAILED' };
        }

        const transferLog = (txInfo.log || []).find(log => 
            log.topics && log.topics[0] === 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        );

        if (!transferLog) {
            return { status: 'NOT_A_TRANSFER' };
        }
        
        const contractAddress = '41' + transferLog.address.substring(2);
        if (contractAddress !== USDT_CONTRACT_ADDRESS) {
            return { status: 'NOT_USDT' };
        }
        
        const recipientAddress = '41' + transferLog.topics[2].substring(26);
        const transferredAmountHex = transferLog.data;
        const transferredAmount = sunToUsdt(transferredAmountHex);

        if (!ourWallets.has(recipientAddress)) {
            console.log(`[USDT-SERVICE] Mismatch: TX was sent to ${recipientAddress}, which is not in our list.`);
            return { status: 'WRONG_RECIPIENT' };
        }

        if (Math.abs(transferredAmount - expectedAmount) > 0.00001) {
             console.log(`[USDT-SERVICE] Mismatch: Invoice amount was ${expectedAmount}, but TX amount was ${transferredAmount}.`);
            return { status: 'WRONG_AMOUNT' };
        }

        console.log(`[USDT-SERVICE] CONFIRMED: TX ${txId} for ${transferredAmount} USDT to wallet ${recipientAddress}.`);
        return { status: 'CONFIRMED' };

    } catch (error) {
        console.error('[USDT-SERVICE] Critical error during TronGrid API call:', error.response ? error.response.data : error.message);
        return { status: 'API_ERROR', message: error.message };
    }
};

module.exports = { confirmTransaction };