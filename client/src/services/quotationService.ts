// Quotation API service functions

const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export interface QuotationFilters {
  q?: string;
  status?: string;
  customerId?: string;
  warehouseId?: string;
  startDate?: string;
  endDate?: string;
}

export interface QuotationItem {
  productId: string;
  productName: string;
  variation?: string | null;
  qty: number;
  price: number;
  discount: number;
  discountType: 'fixed' | 'percentage';
  tax: number;
  subtotal: number;
  image?: string;
}

export interface QuotationData {
  warehouseId: string;
  warehouseName?: string;
  customerId: string;
  customerName?: string;
  date: string;
  validUntil: string;
  items: QuotationItem[];
  discountValue: number;
  discountType: 'fixed' | 'percentage';
  taxValue: number;
  shippingCost: number;
  total: number;
  notes?: string;
  referenceNumber?: string;
  createdBy: string;
  status?: string;
}

export const getQuotations = async (filters: QuotationFilters = {}) => {
  const params = new URLSearchParams();
  
  if (filters.q) params.append('q', filters.q);
  if (filters.status) params.append('status', filters.status);
  if (filters.customerId) params.append('customerId', filters.customerId);
  if (filters.warehouseId) params.append('warehouseId', filters.warehouseId);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  
  const queryString = params.toString();
  const url = `${api}/quotations${queryString ? `?${queryString}` : ''}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch quotations');
  return data;
};

export const getQuotationById = async (id: string) => {
  const res = await fetch(`${api}/quotations/${id}`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch quotation');
  return data;
};

export const createQuotation = async (quotationData: QuotationData) => {
  const res = await fetch(`${api}/quotations`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(quotationData)
  });
  
  const data = await res.json();
  if (!res.ok) {
    if (data.errors && Array.isArray(data.errors)) {
      throw new Error(data.errors.map((e: any) => e.msg).join(', '));
    }
    throw new Error(data?.message || 'Failed to create quotation');
  }
  return data;
};

export const updateQuotation = async (id: string, quotationData: Partial<QuotationData>) => {
  const res = await fetch(`${api}/quotations/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(quotationData)
  });
  
  const data = await res.json();
  if (!res.ok) {
    if (data.errors && Array.isArray(data.errors)) {
      throw new Error(data.errors.map((e: any) => e.msg).join(', '));
    }
    throw new Error(data?.message || 'Failed to update quotation');
  }
  return data;
};

export const updateQuotationStatus = async (id: string, status: string) => {
  const res = await fetch(`${api}/quotations/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to update status');
  return data;
};

export const deleteQuotation = async (id: string) => {
  const res = await fetch(`${api}/quotations/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to delete quotation');
  return data;
};

export const bulkDeleteQuotations = async (ids: string[]) => {
  const res = await fetch(`${api}/quotations/bulk-delete`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ids })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to delete quotations');
  return data;
};
