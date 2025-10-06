const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URLSearchParams } = require('url');
const { parseFormattedCurrency } = require('../utils/currencyParser');

// --- CONFIGURATION (Loaded from .env) ---
const TOKEN_URL = process.env.INTER_TOKEN_URL || "https://cdpj.partners.bancointer.com.br/oauth/v2/token";
const EXTRATO_URL = process.env.INTER_EXTRATO_URL || "https://cdpj.partners.bancointer.com.br/banking/v2/extrato";
const CLIENT_ID = process.env.INTER_CLIENT_ID;
const CLIENT_SECRET = process.env.INTER_CLIENT_SECRET;
const CERT_FILE = path.resolve(__dirname, process.env.INTER_CERT_FILE || 'Inter_API_Certificado.crt');
const KEY_FILE = path.resolve(__dirname, process.env.INTER_KEY_FILE || 'Inter_API_Chave.key');
const CONTA_CORRENTE = process.env.INTER_CONTA_CORRENTE || null;
const API_CONFIRM_DELAY = parseInt(process.env.API_CONFIRM_DELAY, 10) || 7000;

// --- In-memory token cache ---
let tokenCache = {
    accessToken: null,
    expiresAt: null,
};

// This variable will hold the singleton Axios instance.
let apiClient = null;

/**
 * Initializes and returns a singleton Axios instance with mTLS authentication.
 */
const getApiClient = () => {
    // If the instance already exists, return it.
    if (apiClient) {
        return apiClient;
    }

    // If not, create it.
    if (!fs.existsSync(CERT_FILE) || !fs.existsSync(KEY_FILE)) {
        console.error('[ALFA-API] Certificate or Key file not found. Please check paths in .env');
        return null; // Return null to signal a critical configuration error.
    }

    const httpsAgent = new https.Agent({
        cert: fs.readFileSync(CERT_FILE),
        key: fs.readFileSync(KEY_FILE),
        rejectUnauthorized: true,
    });
    
    // Create and cache the instance.
    apiClient = axios.create({ httpsAgent });
    return apiClient;
};


/**
 * Fetches a new OAuth2 token from the Inter API.
 * @param {axios.AxiosInstance} client - The Axios instance.
 */
const getNewOauthToken = async (client) => {
    // ... (This function's internal logic is correct and remains unchanged)
    console.log('[ALFA-API] Requesting new OAuth token...');
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Inter Client ID or Secret is not configured in .env');
    }
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('scope', 'extrato.read');
    const { data } = await client.post(TOKEN_URL, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    if (!data.access_token) {
        throw new Error('Failed to retrieve access token from Inter API.');
    }
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
 * @param {axios.AxiosInstance} client - The Axios instance.
 */
const getToken = async (client) => {
    if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
        return tokenCache.accessToken;
    }
    return await getNewOauthToken(client);
};

/**
 * Fetches the bank statement for a given date range.
 * @param {axios.AxiosInstance} client - The Axios instance.
 */
const getExtrato = async (client, token, dataInicio, dataFim) => {
    const headers = { 'Authorization': `Bearer ${token}` };
    if (CONTA_CORRENTE) {
        headers['x-conta-corrente'] = CONTA_CORRENTE;
    }
    
    // Use the .get() method of the passed-in client instance.
    const { data } = await client.get(EXTRATO_URL, { 
        headers, 
        params: { dataInicio, dataFim } 
    });

    return data.transacoes || [];
};

/**
 * Main function to find a transaction matching the invoice data.
 */
const findTransaction = async (invoiceJson) => {
    const client = getApiClient();
    if (!client) {
        return { status: 'error', message: 'API client could not be initialized (check certs).' };
    }

    try {
        // === NEW: Add a delay before checking the API ===
        console.log(`[ALFA-API] Waiting for ${API_CONFIRM_DELAY / 1000} seconds before checking...`);
        await new Promise(resolve => setTimeout(resolve, API_CONFIRM_DELAY));

        const token = await getToken(client);
        
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const formatDate = (date) => date.toISOString().split('T')[0];
        const transactions = await getExtrato(client, token, formatDate(yesterday), formatDate(today));

        const invoiceAmount = parseFormattedCurrency(invoiceJson.amount);
        const invoiceSender = (invoiceJson.sender?.name || '').toLowerCase().trim();

        if (invoiceAmount === 0 || !invoiceSender) {
            console.warn('[ALFA-API] Cannot search with zero amount or empty sender name.');
            return { status: 'not_found' }; // Treat as not found
        }

        for (const tx of transactions) {
            if (tx.tipoOperacao !== 'C') continue;

            const txAmount = parseFormattedCurrency(tx.valor);
            const txDescription = (tx.descricao || '').toLowerCase();
            
            if (txAmount === invoiceAmount && txDescription.includes(invoiceSender)) {
                console.log(`[ALFA-API] Match found! Invoice Amount: ${invoiceAmount}, TX Description: "${tx.descricao}"`);
                return { status: 'found' };
            }
        }

        console.log(`[ALFA-API] No match found for amount ${invoiceAmount} and sender "${invoiceSender}".`);
        return { status: 'not_found' };

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[ALFA-API-ERROR] API call failed: ${errorMessage}`);
        // === NEW: Return a specific 'error' status for fallback logic ===
        return { status: 'error', message: errorMessage };
    }
};

module.exports = { findTransaction };