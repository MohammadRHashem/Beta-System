import axios from 'axios';

const apiClient = axios.create({
    baseURL: 'http://192.168.10.209:5000/api', // Your backend URL
    headers: {
        'Content-Type': 'application/json',
    },
});

export const getBatches = () => apiClient.get('/batches');
export const getGroupIdsForBatch = (batchId) => apiClient.get(`/batches/${batchId}`);
export const createBatch = (data) => apiClient.post('/batches', data);
export const updateBatch = (id, data) => apiClient.put(`/batches/${id}`, data);
export const deleteBatch = (id) => apiClient.delete(`/batches/${id}`);
export const updateTemplate = (id, data) => apiClient.put(`/templates/${id}`, data);
export const deleteTemplate = (id) => apiClient.delete(`/templates/${id}`);
export const getTemplates = () => apiClient.get('/templates');
export const createTemplate = (data) => apiClient.post('/templates', data);

export default apiClient;