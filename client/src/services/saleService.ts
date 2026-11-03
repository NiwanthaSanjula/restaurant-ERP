// Sale API service functions

import { collectSalesReportPages, reportAmount, reportTotal } from './salesReportData';

const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export interface SaleFilters {
  q?: string;
  date?: string;
  dateEnd?: string;
  customerId?: string;
  warehouseId?: string;
  paymentStatus?: 'paid' | 'partial' | 'unpaid' | '';
  paymentType?: 'cash' | 'card' | 'bankTransfer' | '';
  businessType?: 'retail' | 'restaurant' | '';
  status?: 'draft' | 'completed' | 'cancelled' | 'returned' | 'ordered' | 'pending' | '';
  sortBy?: 'total' | 'createdAt' | '';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  search?: string;
}

export interface CreateSaleData {
  warehouseId: string;
  customerId: string;
  date?: string;
  businessType: 'retail' | 'restaurant';
  posSessionId?: string;
  specialOfferId?: string;
  status?: 'draft' | 'completed' | 'cancelled' | 'returned' | 'ordered' | 'pending';
  products: Array<{
    productId: string;
    variation?: string | null;
    batch?: string | null;
    qty: number;
    discount?: number;
    discountType?: 'fixed' | 'percentage';
    tax?: number;
  }>;
  saleDiscountValue?: number;
  saleDiscountType?: 'fixed' | 'percentage';
  saleTaxValue?: number;
  shippingCost?: number;
  cashAmount?: number;
  cardAmount?: number;
  bankTransferAmount?: number;
  saleType?: 'pos' | 'non-pos';
}

// Get all sales
export const getSales = async (filters: SaleFilters = {}) => {
  const params = new URLSearchParams();
  
  const str = (v: any) => (v != null && typeof v !== 'string' ? String(v).trim() : (typeof v === 'string' ? v.trim() : ''));
  if (str(filters.q)) params.append('q', str(filters.q));
  if (str(filters.date)) params.append('date', str(filters.date));
  if (str(filters.dateEnd)) params.append('dateEnd', str(filters.dateEnd));
  const customerId = str(filters.customerId);
  const warehouseId = str(filters.warehouseId);
  if (customerId) params.append('customerId', customerId);
  if (warehouseId) params.append('warehouseId', warehouseId);
  if (str(filters.paymentStatus)) params.append('paymentStatus', str(filters.paymentStatus));
  if (str(filters.paymentType)) params.append('paymentType', str(filters.paymentType));
  if (str(filters.businessType)) params.append('businessType', str(filters.businessType));
  if (str(filters.status)) params.append('status', str(filters.status));
  if (str(filters.sortBy)) params.append('sortBy', str(filters.sortBy));
  if (filters.sortOrder === 'asc' || filters.sortOrder === 'desc') params.append('sortOrder', filters.sortOrder);
  if (str(filters.search)) params.append('search', str(filters.search));
  params.append('page', String(filters.page ?? 1));
  params.append('limit', String(filters.limit ?? 10));
  
  const queryString = params.toString();
  const url = `${api}/sales?${queryString}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to fetch sales');
  }
  
  return data;
};

// Get sale by ID
export const getSaleById = async (id: string) => {
  const res = await fetch(`${api}/sales/${id}`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to fetch sale');
  }
  
  return data;
};

// Create sale
export const createSale = async (saleData: CreateSaleData) => {
  const res = await fetch(`${api}/sales`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(saleData)
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to create sale');
  }
  
  return data;
};

// Update sale
export const updateSale = async (id: string, saleData: Partial<CreateSaleData>) => {
  const res = await fetch(`${api}/sales/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(saleData)
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to update sale');
  }
  
  return data;
};

// Delete sale
export const deleteSale = async (id: string) => {
  const res = await fetch(`${api}/sales/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to delete sale');
  }
  
  return data;
};

// Complete sale (transition from draft to completed)
export const completeSale = async (id: string) => {
  const res = await fetch(`${api}/sales/${id}/complete`, {
    method: 'PUT',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to complete sale');
  }
  
  return data;
};

// Cancel sale
export const cancelSale = async (id: string) => {
  const res = await fetch(`${api}/sales/${id}/cancel`, {
    method: 'PUT',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to cancel sale');
  }
  
  return data;
};

export interface AddPaymentData {
  date?: string;
  reference?: string;
  paymentType: 'cash' | 'card' | 'bankTransfer';
  amount: number;
}

// Add payment to a sale
export const addPayment = async (saleId: string, payment: AddPaymentData) => {
  const res = await fetch(`${api}/sales/${saleId}/payments`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payment)
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to add payment');
  }
  
  return data;
};

// Update a payment on a sale (by index)
export const updatePayment = async (saleId: string, index: number, payment: AddPaymentData) => {
  const res = await fetch(`${api}/sales/${saleId}/payments/${index}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payment)
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to update payment');
  }
  
  return data;
};

// Delete a payment from a sale (by index)
export const deletePayment = async (saleId: string, index: number) => {
  const res = await fetch(`${api}/sales/${saleId}/payments/${index}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  
  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to remove payment');
  }
  
  return data;
};

/** Filters for the sales report table (maps to GET /sales query params). */
export interface SalesReportFilters {
  fromDate?: string;
  toDate?: string;
  warehouseId?: string;
}

export type SalesReportRow = {
  date: string;
  ref: string;
  customer: string;
  warehouse: string;
  type: string;
  total: number | null;
  status: string;
};

const paymentTypeLabel = (sale: Record<string, unknown>): string => {
  const c = Number(sale.cashAmount || 0);
  const card = Number(sale.cardAmount || 0);
  const bank = Number(sale.bankTransferAmount || 0);
  const parts: string[] = [];
  if (c > 0) parts.push('Cash');
  if (card > 0) parts.push('Card');
  if (bank > 0) parts.push('Bank transfer');
  if (parts.length > 0) return parts.join(' / ');
  const payments = sale.payments;
  if (Array.isArray(payments) && payments.length > 0) {
    const types = [
      ...new Set(
        (payments as { paymentType?: string }[])
          .map((p) => p.paymentType)
          .filter(Boolean)
      ),
    ] as string[];
    if (types.length > 0) {
      return types
        .map((t) => (t === 'bankTransfer' ? 'Bank transfer' : t.charAt(0).toUpperCase() + t.slice(1)))
        .join(' / ');
    }
  }
  return '—';
};

/** Sales list formatted for `SalesReport` (uses GET /sales). */
export const getSalesReport = async (filters: SalesReportFilters = {}) => {
  const saleFilters: SaleFilters = {
    page: 1,
    limit: 500,
    businessType: 'restaurant',
  };
  if (filters.fromDate) saleFilters.date = filters.fromDate;
  if (filters.toDate) saleFilters.dateEnd = filters.toDate;
  else if (filters.fromDate) saleFilters.dateEnd = filters.fromDate;
  if (filters.warehouseId) saleFilters.warehouseId = filters.warehouseId;

  const raw = await collectSalesReportPages<Record<string, unknown> & { _id: string }>(
    (page, limit) => getSales({ ...saleFilters, page, limit }), 500,
  );

  const data: SalesReportRow[] = raw.map((sale: Record<string, unknown>) => {
    const customerId = sale.customerId as { name?: string } | undefined;
    const warehouseId = sale.warehouseId as { name?: string } | undefined;
    const dateVal = sale.date;
    return {
      date:
        dateVal instanceof Date
          ? dateVal.toLocaleDateString()
          : dateVal
            ? new Date(String(dateVal)).toLocaleDateString()
            : '—',
      ref: String(sale.invoiceId || sale._id || '—'),
      customer: customerId?.name || '—',
      warehouse: warehouseId?.name || '—',
      type: paymentTypeLabel(sale),
      total: reportAmount(sale.total),
      status: String(sale.paymentStatus || '—'),
    };
  });

  return { status: 'success' as const, data, totalAmount: reportTotal(data) };
};

export interface SaleReturnsReportRow {
  date: string;
  retRef: string;
  saleRef: string;
  customer: string;
  total: number | null;
  status: string;
}

interface SaleReturnReportRecord {
  _id: string;
  returnDate?: string;
  createdAt?: string;
  returnId?: string;
  saleId?: { invoiceId?: string };
  saleRef?: string;
  customerId?: { name?: string };
  customerName?: string;
  totalReturnAmount?: unknown;
  status?: string;
}

export const getSaleReturnsReport = async (filters: SalesReportFilters = {}) => {
  const params = new URLSearchParams();
  // Match sales' established single-day behavior when only one date is supplied.
  if (filters.fromDate || filters.toDate) {
    params.set('startDate', filters.fromDate || filters.toDate || '');
    params.set('endDate', filters.toDate || filters.fromDate || '');
  }
  if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
  const rows = await collectSalesReportPages<SaleReturnReportRecord>(async (page, limit) => {
    params.set('page', String(page));
    params.set('limit', String(limit));
    const response = await fetch(`${api}/sale-returns?${params}`, { headers: getAuthHeaders() });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.message || 'Failed to fetch sale returns');
    return body;
  }, 100);
  const data: SaleReturnsReportRow[] = rows.map(row => ({
    date: row.returnDate || row.createdAt || '—',
    retRef: row.returnId || row._id,
    saleRef: row.saleId?.invoiceId || row.saleRef || '—',
    customer: row.customerId?.name || row.customerName || '—',
    total: reportAmount(row.totalReturnAmount),
    status: row.status || 'Completed',
  }));
  return { status: 'success' as const, data, totalAmount: reportTotal(data) };
};

