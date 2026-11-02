// Transfer API service functions

const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export interface TransferFilters {
  q?: string;
  fromWarehouse?: string;
  toWarehouse?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface TransferProduct {
  productId: string;
  variation?: string;
  batch?: string;
  qty: number;
}

export interface TransferData {
  date: string;
  fromWarehouse: string;
  toWarehouse: string;
  fromWarehouseName?: string;
  toWarehouseName?: string;
  items: Array<{
    productId: string;
    productName: string;
    qty: number;
    cost?: number;
    subtotal?: number;
  }>;
  status?: 'Pending' | 'Completed' | 'Cancelled';
  notes?: string;
  subtotal?: number;
  tax?: number;
  discount?: number;
  shipping?: number;
  grandTotal?: number;
}

export const getTransfers = async (filters: TransferFilters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.q) params.append('q', filters.q);
  if (filters.fromWarehouse) params.append('fromWarehouse', filters.fromWarehouse);
  if (filters.toWarehouse) params.append('toWarehouse', filters.toWarehouse);
  if (filters.status) params.append('status', filters.status);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());
  
  const queryString = params.toString();
  const url = `${api}/transfers${queryString ? `?${queryString}` : ''}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch transfers');
  return data;
};

export const getTransferById = async (id: string) => {
  const res = await fetch(`${api}/transfers/${id}`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch transfer');
  return data;
};

export const createTransfer = async (transferData: TransferData) => {
  const res = await fetch(`${api}/transfers`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(transferData)
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to create transfer');
  return data;
};

export const updateTransfer = async (id: string, transferData: Partial<TransferData>) => {
  const res = await fetch(`${api}/transfers/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(transferData)
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to update transfer');
  return data;
};

export const deleteTransfer = async (id: string) => {
  const res = await fetch(`${api}/transfers/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to delete transfer');
  return data;
};
