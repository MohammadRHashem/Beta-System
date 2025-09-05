import axios from 'axios';

// The baseURL is now the full path to your local backend server
const apiClient = axios.create({ baseURL: '/api' });

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


// Protected file downloads
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

// API function for Excel Import
export const importInvoices = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/invoices/import', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
};


export default apiClient;