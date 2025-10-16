const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URLSearchParams } = require('url');

// --- CONFIGURATION ---
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
        throw new Error('Alfa API certificate or key file not found.');
    }
    const httpsAgent = new https.Agent({ cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) });
    apiClient = axios.create({ httpsAgent, timeout: 60000 });
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
    const headers = { 'Authorization': `Bearer ${token}` };
    if (CONTA_CORRENTE) headers['x-conta-corrente'] = CONTA_CORRENTE;

    let allItems = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
        const params = {
            dataInicio: filters.dateFrom,
            dataFim: filters.dateTo,
            page: page,
            pageSize: pageSize,
        };
        if (filters.operation) params.tipoOperacao = filters.operation;
        if (filters.txType) params.tipoTransacao = filters.txType;

        console.log(`[ALFA-API] Fetching page ${page} of transactions...`);
        const { data: jsonData } = await client.get(ENRICH_URL, { headers, params });
        
        // Replicate the robust key-finding logic from your Python script
        let items = [];
        const possibleKeys = ["itens", "items", "movimentos", "transacoes", "content", "dados"];
        for (const key of possibleKeys) {
            if (jsonData[key] && Array.isArray(jsonData[key])) {
                items = jsonData[key];
                break;
            }
        }
        
        if (items.length > 0) {
            allItems.push(...items);
        }

        // Replicate the robust pagination-ending logic
        const totalPages = jsonData.totalPages || jsonData.total_paginas;
        const lastPage = jsonData.ultimaPagina;

        if (items.length === 0) break;
        if (lastPage === true) break;
        if (totalPages !== undefined && (page + 1) >= totalPages) break;
        if (items.length < pageSize) break;
        
        page++;
    }
    console.log(`[ALFA-API] Finished fetching. Total items found: ${allItems.length}`);
    return allItems;
};

const downloadPdfStatement = async (dateFrom, dateTo) => {
    const client = getApiClient();
    const token = await getToken(client);
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
    if (CONTA_CORRENTE) headers['x-conta-corrente'] = CONTA_CORRENTE;

    // 1. Request the JSON object that contains the download info
    console.log(`[ALFA-PDF] Requesting PDF info for ${dateFrom} to ${dateTo}...`);
    const { data: jsonResponse } = await client.get(EXPORT_URL, {
        headers,
        params: { dataInicio: dateFrom, dataFim: dateTo, formato: 'PDF' },
        // IMPORTANT: We expect JSON first, not a raw buffer
    });

    // 2. Find the base64 content in the response, just like the Python script
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

    // 3. Decode the base64 string into a binary Buffer
    // Handle cases where the string includes a data URI prefix
    if (base64Data.startsWith("data:")) {
        base64Data = base64Data.split(",", 1)[1];
    }
    
    const pdfBuffer = Buffer.from(base64Data, 'base64');
    return pdfBuffer;
};

module.exports = { fetchAllTransactions, downloadPdfStatement };