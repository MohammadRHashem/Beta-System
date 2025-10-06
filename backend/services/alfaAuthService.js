const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URLSearchParams } = require('url');
const { parseFormattedCurrency } = require('../utils/currencyParser');

// --- CONFIGURATION (Loaded from .env) ---
const TOKEN_URL = process.env.INTER_TOKEN_URL || "https://cdpj.partners.bancointer.com.br/oauth/v2/token";
const EXTRATO_URL = process.env.INTER_EXTRATO_URL || "https://cdpj.partners.bancointer.com.br/banking/v2/extrato";
const CLIENT_ID = "c2ffe7f2-e00f-497e-b32c-8fdc4f33dcde";
const CLIENT_SECRET = "85ac64d1-4573-4778-8dd2-dc357db210eb";
const CERT_FILE = "./Inter_API_Certificado.crt";
const KEY_FILE = "./Inter_API_Chave.key";
const CONTA_CORRENTE = process.env.INTER_CONTA_CORRENTE || null;

// --- In-memory token cache ---
let tokenCache = {
    accessToken: null,
    expiresAt: null,
};

/**
 * Creates a reusable Axios instance with mTLS authentication.
 */
const createApiClient = () => {
    if (!fs.existsSync(CERT_FILE) || !fs.existsSync(KEY_FILE)) {
        console.error('[ALFA-API] Certificate or Key file not found. Please check .env paths.');
        return null;
    }

    const httpsAgent = new https.Agent({
        cert: fs.readFileSync(CERT_FILE),
        key: fs.readFileSync(KEY_FILE),
        rejectUnauthorized: true, // Should be true in production
    });

    return axios.create({ httpsAgent });
};

/**
 * Fetches a new OAuth2 token from the Inter API.
 */
const getNewOauthToken = async (apiClient) => {
    console.log('[ALFA-API] Requesting new OAuth token...');
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Inter Client ID or Secret is not configured in .env');
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('scope', 'extrato.read');

    const { data } = await apiClient.post(TOKEN_URL, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!data.access_token) {
        throw new Error('Failed to retrieve access token from Inter API.');
    }

    // Cache the token for its validity period (minus a 60-second buffer)
    const expiresIn = data.expires_in || 3600;
    tokenCache = {
        accessToken: data.access_token,
        expiresAt: Date.now() + (expiresIn - 60) * 1000,
    };

    console.log('[ALFA-API] Successfully obtained and cached new token.');
    return tokenCache.accessToken;
};

/**
 * Retrieves a valid token, either from cache or by fetching a new one.
 */
const getToken = async (apiClient) => {
    if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
        return tokenCache.accessToken;
    }
    return await getNewOauthToken(apiClient);
};

/**
 * Fetches the bank statement for a given date range.
 */
const getExtrato = async (apiClient, token, dataInicio, dataFim) => {
    const headers = { 'Authorization': `Bearer ${token}` };
    if (CONTA_CORRENTE) {
        headers['x-conta-corrente'] = CONTA_CORRENTE;
    }
    const params = { dataInicio, dataFim };

    const { data } = await apiClient.get(EXTRATO_URL, { headers, params });
    return data.transacoes || [];
};

/**
 * Main function to find a transaction matching the invoice data.
 * @param {object} invoiceJson The structured data from the OCR process.
 * @returns {Promise<boolean>} True if a matching transaction is found, false otherwise.
 */
const findTransaction = async (invoiceJson) => {
    const apiClient = createApiClient();
    if (!apiClient) return false;

    try {
        const token = await getToken(apiClient);
        
        // Fetch statement from yesterday to today to cover all timezones
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const formatDate = (date) => date.toISOString().split('T')[0];
        const transactions = await getExtrato(token, formatDate(yesterday), formatDate(today));

        const invoiceAmount = parseFormattedCurrency(invoiceJson.amount);
        const invoiceSender = (invoiceJson.sender?.name || '').toLowerCase().trim();

        if (invoiceAmount === 0 || !invoiceSender) {
            console.warn('[ALFA-API] Cannot search with zero amount or empty sender name.');
            return false;
        }

        for (const tx of transactions) {
            if (tx.tipoOperacao !== 'C') continue; // Only check credits

            const txAmount = parseFormattedCurrency(tx.valor);
            const txDescription = (tx.descricao || '').toLowerCase();
            
            // Perform the matching logic
            const amountMatches = txAmount === invoiceAmount;
            const senderMatches = txDescription.includes(invoiceSender);

            if (amountMatches && senderMatches) {
                console.log(`[ALFA-API] Match found! Invoice Amount: ${invoiceAmount}, TX Description: "${tx.descricao}"`);
                return true;
            }
        }

        console.log(`[ALFA-API] No match found for amount ${invoiceAmount} and sender "${invoiceSender}".`);
        return false;

    } catch (error) {
        console.error('[ALFA-API-ERROR] Failed to confirm transaction with Inter API:', error.response?.data || error.message);
        return false;
    }
};

module.exports = { findTransaction };