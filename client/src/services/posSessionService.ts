const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

export type PosDenominations = {
  '1': number;
  '2': number;
  '5': number;
  '10': number;
  '20': number;
  '50': number;
  '100': number;
  '500': number;
  '1000': number;
  '5000': number;
};

export const emptyDenominations = (): PosDenominations => ({
  '1': 0, '2': 0, '5': 0, '10': 0, '20': 0, '50': 0, '100': 0, '500': 0, '1000': 0, '5000': 0
});

export const totalFromDenominations = (d: PosDenominations): number => {
  return Object.entries(d).reduce((sum, [k, v]) => sum + Number(k) * (v || 0), 0);
};

export type ZBillRow = {
  sessionId: string;
  date: string;
  openTime: string;
  closeTime: string | null;
  username: string;
  cashHandIn: number;
  cardPayment: number;
  cashPayment: number;
  bankTransfer: number;
  cashVariance: number;
  discount: number;
  total: number;
  status: 'OPEN' | 'CLOSED';
};

export type ZBillDetails = {
  sessionId: string;
  date: string;
  cashierName: string;
  sessionSaleValue: number;
  daySaleValue: number;
  totalDiscount: number;
  cashPayments: number;
  cardPayments: number;
  bankTransferPayments: number;
  cashVariance: number;
  openingCash: number;
  closingCash: number;
  openingDenominations?: Record<string, number>;
  closingDenominations?: Record<string, number>;
  openTime: string;
  closeTime: string | null;
};

export type RegisterReportData = {
  sessionId: string;
  openTime: string;
  cashierName: string;
  openingCash: number;
  userSalesWithoutOpeningCash: number;
  todayTotalSalesWithoutOpeningCash: number;
  totalDiscount: number;
  cashPayments: number;
  cardPayments: number;
  bankTransferPayments: number;
  cashSalesForVariance: number;
};

export const fetchActivePosSession = async () => {
  const res = await fetch(`${api}/pos/active`, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch active session');
  return data;
};

export const openPosSession = async (payload: { openingCash: number; denominations: PosDenominations }) => {
  const res = await fetch(`${api}/pos/open`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to open session');
  return data;
};

export const fetchRegisterReport = async (sessionId: string) => {
  const res = await fetch(`${api}/pos/report/${sessionId}`, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch report');
  return data;
};

export const closePosSession = async (sessionId: string, denominations: PosDenominations) => {
  const res = await fetch(`${api}/pos/close`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ sessionId, denominations })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to close session');
  return data;
};

export const getZBills = async (filters?: { fromDate?: string; toDate?: string }) => {
  const params = new URLSearchParams();
  if (filters?.fromDate) params.append('fromDate', filters.fromDate);
  if (filters?.toDate) params.append('toDate', filters.toDate);
  const url = `${api}/pos/z-bills${params.toString() ? `?${params.toString()}` : ''}`;

  const res = await fetch(url, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch z-bills');
  return data as { status: 'success'; data: ZBillRow[] };
};

export const getZBillBySessionId = async (sessionId: string) => {
  const res = await fetch(`${api}/pos/z-bills/${sessionId}`, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch z-bill');
  return data as { status: 'success'; data: ZBillDetails };
};

export const deleteZBillBySessionId = async (sessionId: string) => {
  const res = await fetch(`${api}/pos/z-bills/${sessionId}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to delete z-bill');
  return data as { status: 'success'; message: string };
};

export const bulkDeleteZBills = async (sessionIds: string[]) => {
  const res = await fetch(`${api}/pos/z-bills/bulk-delete`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ sessionIds })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Failed to bulk delete z-bills');
  return data as {
    status: 'success';
    message: string;
    data: { deletedSessions: number; deletedSales: number };
  };
};
