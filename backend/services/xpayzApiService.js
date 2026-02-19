const axios = require('axios');
require('dotenv').config();

const API_BASE = (process.env.XPAYZ_API_BASE || 'https://api.xpayz.us').replace(/\/+$/, '');
const LOGIN_PATH = '/user/customer/auth/signin';

const XPAYZ_EMAIL = process.env.XPAYZ_EMAIL;
const XPAYZ_PASSWORD = process.env.XPAYZ_PASSWORD;

let tokenCache = {
    token: null,
    expiresAtMs: 0
};

const apiClient = axios.create({
    baseURL: API_BASE,
    timeout: 20000,
    headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        Origin: 'https://app.xpayz.us',
        Referer: 'https://app.xpayz.us/',
        'User-Agent': 'Mozilla/5.0'
    }
});

const decodeJwtExpiryMs = (token) => {
    try {
        const payload = token.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
        if (!decoded.exp) return 0;
        return decoded.exp * 1000;
    } catch (error) {
        return 0;
    }
};

const ensureAuthToken = async () => {
    const now = Date.now();
    if (tokenCache.token && tokenCache.expiresAtMs - 60000 > now) {
        return tokenCache.token;
    }

    if (!XPAYZ_EMAIL || !XPAYZ_PASSWORD) {
        throw new Error('XPAYZ_EMAIL or XPAYZ_PASSWORD is missing in environment.');
    }

    const { data } = await apiClient.post(LOGIN_PATH, {
        email: XPAYZ_EMAIL,
        password: XPAYZ_PASSWORD
    });

    if (!data?.token) {
        throw new Error('XPayz login succeeded without token.');
    }

    tokenCache = {
        token: data.token,
        expiresAtMs: decodeJwtExpiryMs(data.token) || now + 45 * 60 * 1000
    };

    return tokenCache.token;
};

const authedRequest = async (requestFn) => {
    const token = await ensureAuthToken();
    try {
        return await requestFn(token);
    } catch (error) {
        if (error?.response?.status === 401) {
            tokenCache = { token: null, expiresAtMs: 0 };
            const refreshedToken = await ensureAuthToken();
            return requestFn(refreshedToken);
        }
        throw error;
    }
};

const getSubaccountBalance = async (subaccountNumber) => {
    if (!subaccountNumber) {
        throw new Error('Subaccount number is required for balance check.');
    }

    return authedRequest(async (token) => {
        const { data } = await apiClient.get(
            `/payment/customer/v1/web/sub/${subaccountNumber}/account/balance`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return data;
    });
};

const withdrawAmount = async (subaccountNumber, amount) => {
    if (!subaccountNumber) {
        throw new Error('Subaccount number is required for withdrawal.');
    }

    return authedRequest(async (token) => {
        const { data } = await apiClient.post(
            `/payment/customer/v1/web/sub/${subaccountNumber}/withdraw`,
            { amount },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return data;
    });
};

const withdrawFullBalance = async (subaccountNumber) => {
    const balanceResponse = await getSubaccountBalance(subaccountNumber);
    const amount = parseFloat(balanceResponse?.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
        return {
            status: 'skipped',
            message: 'No available balance to withdraw.',
            balance: amount || 0,
            balanceResponse
        };
    }

    const withdrawResponse = await withdrawAmount(subaccountNumber, amount);
    return {
        status: 'success',
        message: `Withdrawn ${amount}.`,
        balance: amount,
        balanceResponse,
        withdrawResponse
    };
};

module.exports = {
    getSubaccountBalance,
    withdrawAmount,
    withdrawFullBalance
};
