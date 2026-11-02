import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface Currency {
  _id: string;
  name: string;
  code: string;
  symbol: string;
  isActive: boolean;
}

export const currencyService = {
  getCurrencies: async (): Promise<{ success: boolean; data: Currency[] }> => {
    const response = await api.get('/currencies');
    return response.data;
  },

  createCurrency: async (payload: { name: string; code: string; symbol: string }): Promise<{ success: boolean; data: Currency; message: string }> => {
    const response = await api.post('/currencies', payload);
    return response.data;
  },

  updateCurrency: async (id: string, payload: { name: string; code: string; symbol: string }): Promise<{ success: boolean; data: Currency; message: string }> => {
    const response = await api.put(`/currencies/${id}`, payload);
    return response.data;
  }
};
