import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const activityLogService = {
  getLogs: async (params: any) => {
    const response = await api.get('/activity-logs', { params });
    return response.data;
  },
  downloadCsv: async (params: any) => {
    const response = await api.get('/activity-logs/download', { params, responseType: 'blob' });
    return response.data; // blob
  }
};

export default activityLogService;
