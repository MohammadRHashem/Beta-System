import axios from 'axios';

// === THE DEFINITIVE FIX: Use the full URL with the custom port ===
const apiClient = axios.create({ baseURL: 'https://platform.betaserver.dev:4433/api' });

const portalApiClient = axios.create({ baseURL: 'https://platform.betaserver.dev:4433/portal' });

apiClient.interceptors.request.use(config => {
    const token = localStorage.getItem('authToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, error => Promise.reject(error));

apiClient.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401 && window.location.pathname !== '/login') {
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            window.location.href = '/login'; 
        }
        return Promise.reject(error);
    }
);

export const portalLogin = (credentials) => portalApiClient.post('/auth/login', credentials);
export const getPortalTransactions = (params) => {
    const token = localStorage.getItem('portalAuthToken'); // Client token
    return portalApiClient.get('/transactions', {
        params,
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
};

export const getPortalFilteredVolume = (params) => {
    const token = localStorage.getItem('portalAuthToken');
    return portalApiClient.get('/filtered-volume', {
        params,
        headers: { Authorization: `Bearer ${token}` }
    });
};

export const exportPortalTransactions = async (params, format = 'excel') => {
    const token = localStorage.getItem('portalAuthToken');
    try {
        const response = await portalApiClient.get('/export-excel', {
            // Pass the format to the backend
            params: { ...params, format },
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob',
        });
        
        const clientData = JSON.parse(localStorage.getItem('portalClient')) || {};
        const clientName = clientData.username;
        const cleanFilename = `accountBalance_${clientName}`;
        
        const extension = format === 'pdf' ? 'pdf' : 'xlsx';
        const filename = `${cleanFilename}.${extension}`;
        
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Export failed:", error);
        throw error;
    }
};

export const getPortalTotalVolume = () => {
    const token = localStorage.getItem('portalAuthToken');
    return portalApiClient.get('/total-volume', {
        headers: { Authorization: `Bearer ${token}` }
    });
};

// ... (the rest of the file remains exactly the same) ...

// Batch & Template Endpoints
export const getBatches = () => apiClient.get('/batches');
export const getGroupIdsForBatch = (batchId) => apiClient.get(`/batches/${batchId}`);
export const createBatch = (data) => apiClient.post('/batches', data);
export const updateBatch = (id, data) => apiClient.put(`/batches/${id}`, data);
export const deleteBatch = (id) => apiClient.delete(`/batches/${id}`);
export const getTemplates = () => apiClient.get('/templates');
export const createTemplate = (data) => apiClient.post('/templates', data);
export const updateTemplate = (id, data) => apiClient.put(`/templates/${id}`, data);
export const deleteTemplate = (id) => apiClient.delete(`/templates/${id}`);

// AI Forwarding Rule Toggle
export const toggleForwardingRule = (id, is_enabled) => apiClient.patch(`/settings/forwarding/${id}/toggle`, { is_enabled });

const downloadFile = async (url, params) => {
    const config = {
        params,
        responseType: 'blob',
        paramsSerializer: params => {
            const parts = [];
            for (const key in params) {
                const value = params[key];
                if (Array.isArray(value)) {
                    if (value.length > 0) parts.push(`${key}=${value.join(',')}`);
                } else if (value) {
                    parts.push(`${key}=${value}`);
                }
            }
            return parts.join('&');
        }
    };
    const { data } = await apiClient.get(url, config);
    return data;
};

const triggerBrowserDownload = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};

// Invoice Endpoints
export const getInvoices = (params) => apiClient.get('/invoices', { params });
export const getRecipientNames = () => apiClient.get('/invoices/recipients');
export const createInvoice = (data) => apiClient.post('/invoices', data);
export const updateInvoice = (id, data) => apiClient.put(`/invoices/${id}`, data);
export const deleteInvoice = (id) => apiClient.delete(`/invoices/${id}`);

export const viewInvoiceMedia = async (id) => {
    const blob = await downloadFile(`/invoices/media/${id}`);
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
};

export const exportInvoices = async (params) => {
    const blob = await downloadFile('/invoices/export', params);
    triggerBrowserDownload(blob, 'invoices.xlsx');
};

// === NEW: API functions for Direct Forwarding Rules ===
export const getDirectForwardingRules = () => apiClient.get('/direct-forwarding');
export const createDirectForwardingRule = (data) => apiClient.post('/direct-forwarding', data);
export const deleteDirectForwardingRule = (id) => apiClient.delete(`/direct-forwarding/${id}`);


// === NEW: API functions for Position Counters ===
export const getPositionCounters = () => apiClient.get('/positions/counters');
export const createPositionCounter = (data) => apiClient.post('/positions/counters', data);
export const updatePositionCounter = (id, data) => apiClient.put(`/positions/counters/${id}`, data);
export const deletePositionCounter = (id) => apiClient.delete(`/positions/counters/${id}`);
export const calculateLocalPosition = (params) => apiClient.get('/position/local', { params });
export const calculateRemotePosition = (id, params) => apiClient.get(`/position/remote/${id}`, { params });


export const getSubaccounts = () => apiClient.get('/subaccounts');
export const createSubaccount = (data) => apiClient.post('/subaccounts', data);
export const updateSubaccount = (id, data) => apiClient.put(`/subaccounts/${id}`, data);
export const deleteSubaccount = (id) => apiClient.delete(`/subaccounts/${id}`);
export const getSubaccountCredentials = (id) => apiClient.get(`/subaccounts/${id}/credentials`);
export const resetSubaccountPassword = (id) => apiClient.post(`/subaccounts/${id}/credentials/reset`);



//usdt
export const getUsdtWallets = () => apiClient.get('/usdt-wallets');
export const createUsdtWallet = (data) => apiClient.post('/usdt-wallets', data);
export const updateUsdtWallet = (id, data) => apiClient.put(`/usdt-wallets/${id}`, data);
export const deleteUsdtWallet = (id) => apiClient.delete(`/usdt-wallets/${id}`);
export const toggleUsdtWallet = (id, is_enabled) => apiClient.patch(`/usdt-wallets/${id}/toggle`, { is_enabled });


// === NEW: API functions for Alfa Trust Page ===
export const triggerAlfaSync = () => apiClient.post('/alfa-trust/trigger-sync');
export const getAlfaTransactions = (params) => apiClient.get('/alfa-trust/transactions', { params });
export const exportAlfaExcel = async (params) => {
    const blob = await downloadFile('/alfa-trust/export-excel', params);
    triggerBrowserDownload(blob, 'alfa_trust_export.xlsx');
};
export const exportAlfaPdf = async (params) => {
    try {
        const { data } = await apiClient.get('/alfa-trust/export-pdf', {
            params,
            responseType: 'blob', // Crucial for file downloads
        });

        // Create a URL for the blob object
        const file = new Blob([data], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);

        // Create a temporary link to trigger the download
        const link = document.createElement('a');
        link.href = fileURL;
        link.setAttribute('download', `extrato_${params.dateFrom}_a_${params.dateTo}.pdf`);
        document.body.appendChild(link);
        link.click();

        // Clean up the temporary link and URL
        link.remove();
        URL.revokeObjectURL(fileURL);

    } catch (error) {
        console.error("PDF Export failed:", error);
        // Try to read the error message from the blob if it's a JSON error
        if (error.response && error.response.data) {
            const errText = await error.response.data.text();
            try {
                const errJson = JSON.parse(errText);
                alert(`Export failed: ${errJson.message}`);
            } catch (e) {
                alert('An unknown error occurred during export.');
            }
        }
    }
};


export default apiClient;