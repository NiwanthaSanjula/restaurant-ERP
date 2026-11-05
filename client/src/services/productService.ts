// Product API service functions

const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export interface ProductFilters {
  q?: string;
  category?: string;
  brand?: string;
  warehouse?: string;
  isSellable?: boolean;
  page?: number;
  limit?: number;
}

export const getProducts = async (filters: ProductFilters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.q) params.append('q', filters.q);
  if (filters.category) params.append('category', filters.category);
  if (filters.brand) params.append('brand', filters.brand);
  if (filters.warehouse) params.append('warehouse', filters.warehouse);
  if (filters.isSellable !== undefined) params.append('isSellable', String(filters.isSellable));
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());
  
  const queryString = params.toString();
  const url = `${api}/products${queryString ? `?${queryString}` : ''}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch products');
  return data;
};

export const getProductById = async (id: string) => {
  const res = await fetch(`${api}/products/${id}`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch product');
  return data;
};

export const createProduct = async (productData: any) => {
  // Using any for now as product data can be complex with FormData
  const isFormData = productData instanceof FormData;
  const headers = getAuthHeaders();
  if (isFormData) {
    delete (headers as any)['Content-Type'];
  }

  const res = await fetch(`${api}/products`, {
    method: 'POST',
    headers: headers,
    body: isFormData ? productData : JSON.stringify(productData)
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to create product');
  return data;
};

export const updateProduct = async (id: string, productData: any) => {
  const isFormData = productData instanceof FormData;
  const headers = getAuthHeaders();
  if (isFormData) {
    delete (headers as any)['Content-Type'];
  }

  const res = await fetch(`${api}/products/${id}`, {
    method: 'PUT',
    headers: headers,
    body: isFormData ? productData : JSON.stringify(productData)
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to update product');
  return data;
};

export const deleteProduct = async (id: string) => {
  const res = await fetch(`${api}/products/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to delete product');
  return data;
};
