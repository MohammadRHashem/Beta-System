import axios from 'axios';

const apiClient = axios.create({ baseURL: 'https://platform.betaserver.dev:4433/api' });
const portalApiClient = axios.create({ baseURL: 'https://platform.betaserver.dev:4433/portal' });

// --- INTERCEPTOR FOR ADMIN PANEL ---
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

// --- THIS IS THE FIX: A COMPLETE INTERCEPTOR FOR THE CLIENT PORTAL ---
portalApiClient.interceptors.request.use(config => {
    const token = localStorage.getItem('portalAuthToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, error => Promise.reject(error));

portalApiClient.interceptors.response.use(
    response => response,
    error => {
        // If we get a 401 error, the token is invalid or expired.
        if (error.response?.status === 401 && !window.location.pathname.includes('/portal/login')) {
            // Clean up the invalid session data.
            localStorage.removeItem('portalAuthToken');
            localStorage.removeItem('portalClient');
            // Force a redirect to the login page.
            window.location.href = '/portal/login'; 
        }
        return Promise.reject(error);
    }
);
// --- END OF FIX ---


// --- PORTAL API FUNCTIONS ---
export const portalLogin = (credentials) => portalApiClient.post('/auth/login', credentials);
export const getPortalTransactions = (params) => portalApiClient.get('/transactions', { params });
export const getPortalDashboardSummary = (params) => portalApiClient.get('/dashboard-summary', { params });
export const exportPortalTransactions = async (params, format = 'excel') => {
    try {
        const response = await portalApiClient.get('/export-excel', {
            params: { ...params, format },
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

// --- ADMIN API FUNCTIONS (Unchanged) ---
// ... (all your other admin functions remain here) ...
export const getBatches = () => apiClient.get('/batches');
export const getGroupIdsForBatch = (batchId) => apiClient.get(`/batches/${batchId}`);
export const createBatch = (data) => apiClient.post('/batches', data);
export const updateBatch = (id, data) => apiClient.put(`/batches/${id}`, data);
export const deleteBatch = (id) => apiClient.delete(`/batches/${id}`);
export const getTemplates = () => apiClient.get('/templates');
export const createTemplate = (data) => apiClient.post('/templates', data);
export const updateTemplate = (id, data) => apiClient.put(`/templates/${id}`, data);
export const deleteTemplate = (id) => apiClient.delete(`/templates/${id}`);
export const toggleForwardingRule = (id, is_enabled) => apiClient.patch(`/settings/forwarding/${id}/toggle`, { is_enabled });
export const toggleReplyRule = (id, reply_with_group_name) => apiClient.patch(`/settings/forwarding/${id}/toggle-reply`, { reply_with_group_name });
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
export const getDirectForwardingRules = () => apiClient.get('/direct-forwarding');
export const createDirectForwardingRule = (data) => apiClient.post('/direct-forwarding', data);
export const deleteDirectForwardingRule = (id) => apiClient.delete(`/direct-forwarding/${id}`);
export const getPositionCounters = () => apiClient.get('/positions/counters');
export const createPositionCounter = (data) => apiClient.post('/positions/counters', data);
export const updatePositionCounter = (id, data) => apiClient.put(`/positions/counters/${id}`, data);
export const deletePositionCounter = (id) => apiClient.delete(`/positions/counters/${id}`);
export const calculateLocalPosition = (params) => apiClient.get('/position/local', { params });
export const calculateRemotePosition = (id, params) => apiClient.get(`/position/remote/${id}`, { params });
export const getSubaccounts = () => apiClient.get('/subaccounts');
export const getSubCustomers = (params) => apiClient.get('/sub-customers', { params });
export const getRecibosTransactions = (subaccountNumber) => apiClient.get(`/subaccounts/${subaccountNumber}/recibos`);
export const reassignTransaction = (transactionId, targetSubaccountNumber) => apiClient.post('/subaccounts/reassign', { transactionId, targetSubaccountNumber });
export const createSubaccount = (data) => apiClient.post('/subaccounts', data);
export const updateSubaccount = (id, data) => apiClient.put(`/subaccounts/${id}`, data);
export const deleteSubaccount = (id) => apiClient.delete(`/subaccounts/${id}`);
export const getSubaccountCredentials = (id) => apiClient.get(`/subaccounts/${id}/credentials`);
export const resetSubaccountPassword = (id, type) => apiClient.post(`/subaccounts/${id}/credentials/reset`, { type });
export const getUsdtWallets = () => apiClient.get('/usdt-wallets');
export const createUsdtWallet = (data) => apiClient.post('/usdt-wallets', data);
export const updateUsdtWallet = (id, data) => apiClient.put(`/usdt-wallets/${id}`, data);
export const deleteUsdtWallet = (id) => apiClient.delete(`/usdt-wallets/${id}`);
export const toggleUsdtWallet = (id, is_enabled) => apiClient.patch(`/usdt-wallets/${id}/toggle`, { is_enabled });
export const getScheduledBroadcasts = () => apiClient.get('/scheduled-broadcasts');
export const createSchedule = (data) => apiClient.post('/scheduled-broadcasts', data);
export const updateSchedule = (id, data) => apiClient.put(`/scheduled-broadcasts/${id}`, data);
export const deleteSchedule = (id) => apiClient.delete(`/scheduled-broadcasts/${id}`);
export const toggleSchedule = (id, is_active) => apiClient.patch(`/scheduled-broadcasts/${id}/toggle`, { is_active });
export const triggerAlfaSync = () => apiClient.post('/alfa-trust/trigger-sync');
export const getAlfaTransactions = (params) => apiClient.get('/alfa-trust/transactions', { params });



export const getPendingManualInvoices = () => apiClient.get('/manual/pending');
export const getManualCandidates = (amount) => apiClient.get('/manual/candidates', { params: { amount } });
export const confirmManualInvoice = (data) => apiClient.post('/manual/confirm', data);
export const rejectManualInvoice = (messageId) => apiClient.post('/manual/reject', { messageId });

export const confirmAllManualInvoices = (messageIds) => apiClient.post('/manual/confirm-all', { messageIds });
export const getCandidateInvoices = (amount) => apiClient.get('/manual/candidate-invoices', { params: { amount } });


export const exportAlfaExcel = async (params) => {
    const blob = await downloadFile('/alfa-trust/export-excel', params);
    triggerBrowserDownload(blob, 'alfa_trust_export.xlsx');
};
export const exportAlfaPdf = async (params) => {
    try {
        const { data } = await apiClient.get('/alfa-trust/export-pdf', {
            params,
            responseType: 'blob',
        });
        const file = new Blob([data], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = fileURL;
        link.setAttribute('download', `extrato_${params.dateFrom}_a_${params.dateTo}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(fileURL);
    } catch (error) {
        console.error("PDF Export failed:", error);
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

export const getTrkbitTransactions = (params) => apiClient.get('/trkbit/transactions', { params });
export const exportTrkbit = async (params) => {
    const blob = await downloadFile('/trkbit/export', params);
    triggerBrowserDownload(blob, 'trkbit_export.xlsx');
};

export default apiClient;