const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URLSearchParams } = require('url');

// --- CONFIGURATION (from .env) ---
const TOKEN_URL = process.env.INTER_TOKEN_URL || "https://cdpj.partners.bancointer.com.br/oauth/v2/token";
const SALDO_URL = process.env.INTER_SALDO_URL || "https://cdpj.partners.bancointer.com.br/banking/v2/saldo";
const CLIENT_ID = process.env.INTER_CLIENT_ID;
const CLIENT_SECRET = process.env.INTER_CLIENT_SECRET;
const CERT_FILE = path.resolve(__dirname, '..', process.env.INTER_CERT_FILE);
const KEY_FILE = path.resolve(__dirname, '..', process.env.INTER_KEY_FILE);
const CONTA_CORRENTE = process.env.INTER_CONTA_CORRENTE || null;

let tokenCache = { accessToken: null, expiresAt: null };
let apiClient = null;

const getApiClient = () => {
    if (apiClient) return apiClient;
    if (!fs.existsSync(CERT_FILE) || !fs.existsSync(KEY_FILE)) {
        console.error('[ALFA-BALANCE] Certificate or Key file not found.');
        throw new Error('Alfa API certificate or key file not found.');
    }
    const httpsAgent = new https.Agent({
        cert: fs.readFileSync(CERT_FILE),
        key: fs.readFileSync(KEY_FILE),
    });
    apiClient = axios.create({ httpsAgent });
    return apiClient;
};

const getNewOauthToken = async (client) => {
    console.log('[ALFA-BALANCE] Requesting new OAuth token...');
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('scope', 'extrato.read');

    const { data } = await client.post(TOKEN_URL, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!data.access_token) throw new Error('Failed to retrieve access token from Alfa API.');
    
    const expiresIn = data.expires_in || 3600;
    tokenCache = {
        accessToken: data.access_token,
        expiresAt: Date.now() + (expiresIn - 60) * 1000,
    };
    return tokenCache.accessToken;
};

const getToken = async (client) => {
    if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
        return tokenCache.accessToken;
    }
    return await getNewOauthToken(client);
};

const getBalance = async (date = null) => {
    const client = getApiClient();
    const token = await getToken(client);

    const headers = { 'Authorization': `Bearer ${token}` };
    if (CONTA_CORRENTE) {
        headers['x-conta-corrente'] = CONTA_CORRENTE;
    }
    
    const params = {};
    if (date) {
        params.data = date; // Expects YYYY-MM-DD format
    }

    const { data } = await client.get(SALDO_URL, { headers, params });
    return data; // Return the full balance object
};

module.exports = { getBalance };