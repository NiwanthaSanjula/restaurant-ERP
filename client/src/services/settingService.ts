import axios from 'axios';

// Base URL (Adjust based on your environment)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});



export const settingService = {
  getSettings: async () => {
    const response = await api.get('/settings/system');
    return response.data; // Expected { success: true, data: { ... } }
  },

  updateSettings: async (settingsData: any) => {
    const response = await api.put('/settings/system', settingsData);
    return response.data;
  },
  uploadLogo: async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.url; 
  },
  getMailSettings: async () => {
    const response = await api.get('/settings/mail');
    return response.data;
  },

  updateMailSettings: async (mailData: any) => {
    const response = await api.post('/settings/mail', mailData);
    return response.data;
  },
  getPrefixSettings: async () => {
  const response = await api.get('/settings/prefix');
  return response.data;
},

updatePrefixSettings: async (prefixData: any) => {
  const response = await api.post('/settings/prefix', prefixData);
  return response.data;
},

};