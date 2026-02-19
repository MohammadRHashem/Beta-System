import axios from 'axios';

const apiClient = axios.create({ baseURL: 'https://platform.betaserver.dev:4433/api' });
const portalApiClient = axios.create({ baseURL: 'https://platform.betaserver.dev:4433/api/portal' });

const getPortalToken = () => sessionStorage.getItem('portalAuthToken') || localStorage.getItem('portalAuthToken');

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

// --- INTERCEPTOR FOR CLIENT PORTAL ---
portalApiClient.interceptors.request.use(config => {
    const token = getPortalToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    console.log('[PORTAL API REQUEST]', {
        method: config.method.toUpperCase(),
        url: config.baseURL + config.url,
        data: config.data,
        params: config.params,
    });
    return config;
}, error => Promise.reject(error));


portalApiClient.interceptors.response.use(
    response => response,
    error => {
        console.error('[PORTAL API ERROR]', {
            message: error.message,
            url: error.config.url,
            status: error.response?.status,
            responseData: error.response?.data,
        });
        if (error.response?.status === 401 && !window.location.pathname.includes('/portal/login')) {
            console.warn('[PORTAL API] Received 401 Unauthorized. Forcing logout and redirecting to login.');
            localStorage.removeItem('portalAuthToken');
            localStorage.removeItem('portalClient');
            sessionStorage.removeItem('portalAuthToken');
            sessionStorage.removeItem('portalClient');
            sessionStorage.removeItem('portalImpersonation');
            window.location.href = '/portal/login'; 
        }
        return Promise.reject(error);
    }
);


// =======================================================
// === ALL PORTAL API FUNCTIONS ARE CONSOLIDATED HERE ===
// =======================================================
export const portalLogin = (credentials) => portalApiClient.post('/auth/login', credentials);
export const portalValidateSession = () => portalApiClient.get('/auth/validate'); // THIS WAS MISSING
export const getPortalTransactions = (params) => portalApiClient.get('/transactions', { params });
export const getPortalDashboardSummary = (params) => portalApiClient.get('/dashboard-summary', { params });
export const triggerPartnerConfirmation = (correlation_id) => portalApiClient.post('/bridge/confirm-payment', { correlation_id });
export const createPortalCrossDebit = (data) => portalApiClient.post('/transactions/debit', data);
export const getPortalTrkbitTransactions = (params) => portalApiClient.get('/trkbit/transactions', { params });
export const claimPortalTrkbitTransaction = (transactionId) => portalApiClient.post('/trkbit/transactions/claim', { transactionId });

export const updatePortalTransactionConfirmation = (id, source, confirmed, passcode) => {
    return portalApiClient.post(`/transactions/confirm`, { 
        transactionId: id, 
        source, 
        confirmed, 
        passcode 
    });
};

export const updatePortalTransactionNotes = (id, source, notes) => {
    return portalApiClient.post(`/transactions/notes`, {
        transactionId: id,
        source,
        op_comment: notes
    });
};

export const exportPortalTransactions = async (params, format = 'excel') => {
    try {
        const exportParams = { ...params, format };
        if (!exportParams.direction) {
            delete exportParams.direction;
        }
        const response = await portalApiClient.get('/export-excel', {
            params: exportParams,
            responseType: 'blob',
        });
        
        const storedClient =
            sessionStorage.getItem('portalClient') ||
            localStorage.getItem('portalClient');
        const clientData = storedClient ? JSON.parse(storedClient) : {};
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



// ===============================================
// === ALL ADMIN API FUNCTIONS START FROM HERE ===
// ===============================================

// ---- RBAC & User Management ----
export const getAllUsers = () => apiClient.get('/admin/users');
export const createUser = (data) => apiClient.post('/admin/users', data);
export const updateUser = (id, data) => apiClient.put(`/admin/users/${id}`, data);
export const deleteUser = (id) => apiClient.delete(`/admin/users/${id}`);
export const getAllRoles = () => apiClient.get('/admin/roles');
export const createRole = (data) => apiClient.post('/admin/roles', data); // NEW
export const updateRole = (id, data) => apiClient.put(`/admin/roles/${id}`, data); // NEW
export const deleteRole = (id) => apiClient.delete(`/admin/roles/${id}`);
export const getRolePermissions = (id) => apiClient.get(`/admin/roles/${id}/permissions`);
export const updateRolePermissions = (id, permissionIds) => apiClient.put(`/admin/roles/${id}/permissions`, { permissionIds });
export const getAuditLogs = (params) => apiClient.get('/admin/audit-log', { params });

// ---- Helper Functions for Downloads ----
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

// ---- Broadcaster ----
export const getBatches = () => apiClient.get('/batches');
export const getGroupIdsForBatch = (batchId) => apiClient.get(`/batches/${batchId}`);
export const createBatch = (data) => apiClient.post('/batches', data);
export const updateBatch = (id, data) => apiClient.put(`/batches/${id}`, data);
export const deleteBatch = (id) => apiClient.delete(`/batches/${id}`);
export const getTemplates = () => apiClient.get('/templates');
export const createTemplate = (data) => apiClient.post('/templates', data);
export const updateTemplate = (id, data) => apiClient.put(`/templates/${id}`, data);
export const deleteTemplate = (id) => apiClient.delete(`/templates/${id}`);
export const uploadBroadcastAttachment = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/broadcasts/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};
export const getBroadcastUploads = () => apiClient.get('/broadcasts/uploads');
export const deleteBroadcastUpload = (id) => apiClient.delete(`/broadcasts/uploads/${id}`);


// ---- Invoices ----
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


// ---- Settings & Rules ----
export const toggleForwardingRule = (id, is_enabled) => apiClient.patch(`/settings/forwarding/${id}/toggle`, { is_enabled });
export const toggleReplyRule = (id, reply_with_group_name) => apiClient.patch(`/settings/forwarding/${id}/toggle-reply`, { reply_with_group_name });
export const getDirectForwardingRules = () => apiClient.get('/direct-forwarding');
export const createDirectForwardingRule = (data) => apiClient.post('/direct-forwarding', data);
export const deleteDirectForwardingRule = (id) => apiClient.delete(`/direct-forwarding/${id}`);
export const getUsdtWallets = () => apiClient.get('/usdt-wallets');
export const createUsdtWallet = (data) => apiClient.post('/usdt-wallets', data);
export const updateUsdtWallet = (id, data) => apiClient.put(`/usdt-wallets/${id}`, data);
export const deleteUsdtWallet = (id) => apiClient.delete(`/usdt-wallets/${id}`);
export const toggleUsdtWallet = (id, is_enabled) => apiClient.patch(`/usdt-wallets/${id}/toggle`, { is_enabled });
export const getRequestTypes = () => apiClient.get('/request-types');
export const createRequestType = (data) => apiClient.post('/request-types', data);
export const updateRequestType = (id, data) => apiClient.put(`/request-types/${id}`, data);
export const deleteRequestType = (id) => apiClient.delete(`/request-types/${id}`);
export const updateRequestTypeOrder = (orderedIds) => apiClient.post('/request-types/update-order', orderedIds);



// ---- Subaccounts ----
export const getSubaccounts = () => apiClient.get('/subaccounts');
export const getWhatsappGroups = () => apiClient.get('/groups');
export const createPinMessage = (payload) => apiClient.post('/pins', payload);
export const getPinHistory = () => apiClient.get('/pins');
export const getPinDetails = (id) => apiClient.get(`/pins/${id}`);
export const retryPinMessage = (id, payload = {}) => apiClient.post(`/pins/${id}/retry`, payload);
export const createSubaccount = (data) => apiClient.post('/subaccounts', data);
export const updateSubaccount = (id, data) => apiClient.put(`/subaccounts/${id}`, data);
export const deleteSubaccount = (id) => apiClient.delete(`/subaccounts/${id}`);
export const getSubaccountCredentials = (id) => apiClient.get(`/subaccounts/${id}/credentials`);
export const resetSubaccountPassword = (id, type) => apiClient.post(`/subaccounts/${id}/credentials/reset`, { type });
export const triggerHardRefresh = (id) => apiClient.post(`/subaccounts/${id}/hard-refresh`);
export const createPortalAccessSession = (id) => apiClient.post(`/subaccounts/${id}/portal-access`);
export const createCrossDebit = (id, data) => apiClient.post(`/subaccounts/${id}/cross-debit`, data);



// ---- BI & Financial Tools ----
export const getPositionCounters = () => apiClient.get('/positions/counters');
export const createPositionCounter = (data) => apiClient.post('/positions/counters', data);
export const updatePositionCounter = (id, data) => apiClient.put(`/positions/counters/${id}`, data);
export const deletePositionCounter = (id) => apiClient.delete(`/positions/counters/${id}`);
export const calculateLocalPosition = (params) => apiClient.get('/position/local', { params });
export const calculateRemotePosition = (id, params) => apiClient.get(`/position/remote/${id}`, { params });
export const getSubCustomers = (params) => apiClient.get('/sub-customers', { params });
export const getRecibosTransactions = (subaccountNumber) => apiClient.get(`/subaccounts/${subaccountNumber}/recibos`);
export const reassignTransaction = (transactionId, targetSubaccountNumber) => apiClient.post('/subaccounts/reassign', { transactionId, targetSubaccountNumber });


// ---- External Statements ----
export const getAlfaTransactions = (params) => apiClient.get('/alfa-trust/transactions', { params });
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

// ---- Manual Review ----
export const getPendingManualInvoices = () => apiClient.get('/manual/pending');
export const getManualCandidates = (amount) => apiClient.get('/manual/candidates', { params: { amount } });
export const confirmManualInvoice = (data) => apiClient.post('/manual/confirm', data);
export const rejectManualInvoice = (messageId) => apiClient.post('/manual/reject', { messageId });
export const getCandidateInvoices = (amount) => apiClient.get('/manual/candidate-invoices', { params: { amount } });
export const clearAllPendingInvoices = (messageIds) => apiClient.post('/manual/clear-all', { messageIds });

// ---- Maybe Unused ----
export const triggerAlfaSync = () => apiClient.post('/alfa-trust/trigger-sync');



// ---- Client Requests ----
export const getClientRequests = () => apiClient.get('/client-requests');
export const completeClientRequest = (id) => apiClient.patch(`/client-requests/${id}/complete`);
export const updateClientRequestAmount = (id, amount) => apiClient.patch(`/client-requests/${id}/amount`, { amount });
export const updateClientRequestContent = (id, content) => apiClient.patch(`/client-requests/${id}/content`, { content });
export const restoreClientRequest = (id) => apiClient.patch(`/client-requests/${id}/restore`);


// ---- Schedules ----
export const getScheduledBroadcasts = () => apiClient.get('/scheduled-broadcasts');
export const createSchedule = (data) => apiClient.post('/scheduled-broadcasts', data);
export const updateSchedule = (id, data) => apiClient.put(`/scheduled-broadcasts/${id}`, data);
export const deleteSchedule = (id) => apiClient.delete(`/scheduled-broadcasts/${id}`);
export const toggleSchedule = (id, is_active) => apiClient.patch(`/scheduled-broadcasts/${id}/toggle`, { is_active });

// ---- Scheduled Withdrawals ----
export const getScheduledWithdrawals = () => apiClient.get('/scheduled-withdrawals');
export const createScheduledWithdrawal = (data) => apiClient.post('/scheduled-withdrawals', data);
export const updateScheduledWithdrawal = (id, data) => apiClient.put(`/scheduled-withdrawals/${id}`, data);
export const deleteScheduledWithdrawal = (id) => apiClient.delete(`/scheduled-withdrawals/${id}`);
export const toggleScheduledWithdrawal = (id, is_active) => apiClient.patch(`/scheduled-withdrawals/${id}/toggle`, { is_active });


export const getWalletRequests = () => apiClient.get('/client-requests'); // Reroute old function name
export const completeWalletRequest = (id) => apiClient.patch(`/client-requests/${id}/complete`); // Reroute

export default apiClient;
