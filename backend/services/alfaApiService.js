const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URLSearchParams } = require('url');

// --- CONFIGURATION (with fallbacks) ---
const TOKEN_URL = process.env.INTER_TOKEN_URL || "https://cdpj.partners.bancointer.com.br/oauth/v2/token";
const ENRICH_URL = process.env.INTER_ENRICH_URL || "https://cdpj.partners.bancointer.com.br/banking/v2/extrato/completo";
const EXPORT_URL = process.env.INTER_EXTRATO_EXPORT_URL || "https://cdpj.partners.bancointer.com.br/banking/v2/extrato/exportar";

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
        throw new Error('Alfa API certificate or key file not found. Check .env paths.');
    }
    const httpsAgent = new https.Agent({
        cert: fs.readFileSync(CERT_FILE),
        key: fs.readFileSync(KEY_FILE),
        rejectUnauthorized: true,
    });
    apiClient = axios.create({ httpsAgent, timeout: 90000 });
    return apiClient;
};

const getNewOauthToken = async (client) => {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('scope', 'extrato.read');
    const { data } = await client.post(TOKEN_URL, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    if (!data.access_token) throw new Error('Failed to retrieve access token from Alfa API.');
    tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + ((data.expires_in || 3600) - 60) * 1000 };
    return tokenCache.accessToken;
};

const getToken = async (client) => {
    if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt) {
        return tokenCache.accessToken;
    }
    return await getNewOauthToken(client);
};

const fetchAllTransactions = async (filters) => {
    const client = getApiClient();
    const token = await getToken(client);
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
    if (CONTA_CORRENTE) headers['x-conta-corrente'] = CONTA_CORRENTE;

    let allItems = [];
    let pagina = 0;
    const tamanhoPagina = 1000;

    console.log(`[ALFA-API] Starting full pagination fetch from ${filters.dateFrom} to ${filters.dateTo}.`);

    while (true) {
        const params = {
            dataInicio: filters.dateFrom,
            dataFim: filters.dateTo,
            pagina: pagina,
            tamanhoPagina: tamanhoPagina,
        };
        if (filters.operation) params.tipoOperacao = filters.operation;
        if (filters.txType) params.tipoTransacao = filters.txType;

        console.log(`[ALFA-API] Fetching pagina ${pagina} with tamanhoPagina ${tamanhoPagina}...`);
        
        const { data: jsonData } = await client.get(ENRICH_URL, { headers, params });
        
        // === THE DEFINITIVE FIX: Use the correct 'transacoes' key ===
        const items = jsonData.transacoes || [];
        // === END FIX ===
        
        if (items.length > 0) {
            allItems.push(...items);
        }

        const isLastPage = jsonData.ultimaPagina === true || items.length < tamanhoPagina;
        if (isLastPage) {
            console.log(`[ALFA-API] Last page reached.`);
            break;
        }
        
        pagina++;
    }

    console.log(`[ALFA-API] Finished fetching. Total items found: ${allItems.length}`);
    return allItems;
};

const downloadPdfStatement = async (dateFrom, dateTo) => {
    const client = getApiClient();
    const token = await getToken(client);
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
    if (CONTA_CORRENTE) headers['x-conta-corrente'] = CONTA_CORRENTE;

    console.log(`[ALFA-PDF] Requesting PDF info for ${dateFrom} to ${dateTo}...`);
    const { data: jsonResponse } = await client.get(EXPORT_URL, {
        headers,
        params: { dataInicio: dateFrom, dataFim: dateTo, formato: 'PDF' },
    });

    const possibleKeys = ["arquivo", "conteudo", "pdf", "file", "base64"];
    let base64Data = null;
    for (const key of possibleKeys) {
        if (jsonResponse[key] && typeof jsonResponse[key] === 'string') {
            base64Data = jsonResponse[key];
            break;
        }
    }

    if (!base64Data) {
        console.error("[ALFA-PDF] ERROR: API response did not contain base64 PDF data.", jsonResponse);
        throw new Error("API did not return a valid PDF in the expected format.");
    }
    console.log("[ALFA-PDF] Found base64 data in response. Decoding...");

    if (base64Data.startsWith("data:")) {
        base64Data = base64Data.split(",", 1)[1];
    }
    
    const pdfBuffer = Buffer.from(base64Data, 'base64');
    return pdfBuffer;
};

module.exports = { fetchAllTransactions, downloadPdfStatement };