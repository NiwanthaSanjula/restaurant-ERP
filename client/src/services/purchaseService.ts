import { formatDate } from '../utils/date.ts';
import { fetchCompletePurchaseReport, type PurchaseReportParams } from './purchaseReportData';
const api = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

interface PurchaseReportRecord {
  _id: string;
  purchaseDate?: string;
  purchaseId?: string;
  supplierId?: { name?: string };
  warehouseId?: { name?: string };
  grandTotal: number;
  paymentStatus?: string;
}

interface PurchaseReturnReportRecord {
  _id: string;
  returnDate?: string;
  returnId?: string;
  purchaseId?: { purchaseId?: string };
  purchaseRef?: string;
  supplierId?: { name?: string };
  warehouseId?: { name?: string };
  totalReturnAmount: number;
  status?: string;
}

export const getPurchaseReport = async (params: PurchaseReportParams) => {
  const report = await fetchCompletePurchaseReport<PurchaseReportRecord>(
    `${api}/purchases`, params, getAuthHeaders(), row => row.grandTotal, true,
  );

  const rows = report.data.map(p => ({
    date: p?.purchaseDate ? formatDate(p.purchaseDate) : "—",
    ref: p?.purchaseId || p?._id || "—",
    supplier: p?.supplierId?.name || "—",
    warehouse: p?.warehouseId?.name || "—",
    total: Number(p?.grandTotal || 0),
    status: p?.paymentStatus || "unpaid",
  }));

  return {
    ...report,
    data: rows,
  };
};

export const getPurchaseReturnsReport = async (params: PurchaseReportParams) => {
  const report = await fetchCompletePurchaseReport<PurchaseReturnReportRecord>(
    `${api}/purchase-returns`, params, getAuthHeaders(), row => row.totalReturnAmount, false,
  );

  const rows = report.data.map(r => ({
    date: r?.returnDate ? formatDate(r.returnDate) : "—",
    retRef: r?.returnId || r?._id || "—",
    purchaseRef: r?.purchaseId?.purchaseId || r?.purchaseRef || "—",
    supplier: r?.supplierId?.name || "—",
    warehouse: r?.warehouseId?.name || "—",
    total: r.totalReturnAmount,
    status: r?.status || "Received",
  }));

  return {
    ...report,
    data: rows,
  };
};

