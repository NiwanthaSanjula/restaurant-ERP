// Warehouse API service functions

const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export interface WarehouseData {
  name: string;
  code?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export const getWarehouses = async () => {
  const res = await fetch(`${api}/warehouses`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch warehouses');
  return data;
};

export const getWarehouseById = async (id: string) => {
  const res = await fetch(`${api}/warehouses/${id}`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch warehouse');
  return data;
};

export const createWarehouse = async (warehouseData: WarehouseData) => {
  const res = await fetch(`${api}/warehouses`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(warehouseData)
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to create warehouse');
  return data;
};

export const updateWarehouse = async (id: string, warehouseData: Partial<WarehouseData>) => {
  const res = await fetch(`${api}/warehouses/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(warehouseData)
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to update warehouse');
  return data;
};

export const deleteWarehouse = async (id: string) => {
  const res = await fetch(`${api}/warehouses/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to delete warehouse');
  return data;
};
