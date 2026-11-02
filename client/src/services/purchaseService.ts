import { formatDate } from '../utils/date.ts';
const api = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

type PurchaseReportParams = {
  fromDate?: string;
  toDate?: string;
  warehouseId?: string;
};

export const getPurchaseReport = async (params: PurchaseReportParams) => {
  const query = new URLSearchParams();
  if (params.fromDate) query.append("startDate", params.fromDate);
  if (params.toDate) query.append("endDate", params.toDate);
  if (params.warehouseId) query.append("warehouseId", params.warehouseId);

  const res = await fetch(`${api}/purchases?${query.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || "Failed to fetch purchase report");

  const rows = (Array.isArray(json?.data) ? json.data : []).map((p: any) => ({
    date: p?.purchaseDate ? formatDate(p.purchaseDate) : "—",
    ref: p?.purchaseId || p?._id || "—",
    supplier: p?.supplierId?.name || "—",
    warehouse: p?.warehouseId?.name || "—",
    total: Number(p?.grandTotal || 0),
    status: p?.paymentStatus || "unpaid",
  }));

  return {
    status: json?.status || "success",
    data: rows,
  };
};

export const getPurchaseReturnsReport = async (params: PurchaseReportParams) => {
  const query = new URLSearchParams();
  if (params.fromDate) query.append("startDate", params.fromDate);
  if (params.toDate) query.append("endDate", params.toDate);
  if (params.warehouseId) query.append("warehouseId", params.warehouseId);

  const res = await fetch(`${api}/purchase-returns?${query.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || "Failed to fetch purchase returns report");

  const rows = (Array.isArray(json?.data) ? json.data : []).map((r: any) => ({
    date: r?.returnDate ? formatDate(r.returnDate) : "—",
    retRef: r?.returnId || r?._id || "—",
    purchaseRef: r?.purchaseId?.purchaseId || r?.purchaseRef || "—",
    supplier: r?.supplierId?.name || "—",
    warehouse: r?.warehouseId?.name || "—",
    total: Number(r?.grandTotal || r?.total || 0),
    status: r?.status || "Received",
  }));

  return {
    status: json?.status || "success",
    data: rows,
  };
};

