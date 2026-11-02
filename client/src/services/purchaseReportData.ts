export interface PurchaseReportParams {
  fromDate?: string;
  toDate?: string;
  warehouseId?: string;
}

interface ReportPage<T> {
  status: string;
  message?: string;
  data: T[];
  pagination: { total: number; page: number; limit: number; pages?: number; totalPages?: number };
  summary?: { totalPurchases?: number };
}

/** A partial or changing page sequence must never become a complete report/export. */
export async function fetchCompletePurchaseReport<T extends { _id: string }>(
  endpoint: string,
  params: PurchaseReportParams,
  headers: HeadersInit,
  amount: (row: T) => unknown,
  requireAggregate: boolean,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(endpoint);
  if (params.fromDate) url.searchParams.set('startDate', params.fromDate);
  if (params.toDate) url.searchParams.set('endDate', params.toDate);
  if (params.warehouseId) url.searchParams.set('warehouseId', params.warehouseId);
  url.searchParams.set('limit', '100');
  const rows: T[] = [];
  const seen = new Set<string>();
  let expectedTotal: number | undefined;
  let expectedLimit: number | undefined;
  let aggregateTotal: number | undefined;
  let rowTotal = 0;

  for (let page = 1; ; page++) {
    url.searchParams.set('page', String(page));
    const response = await fetcher(url.toString(), { method: 'GET', headers });
    const result: ReportPage<T> = await response.json();
    if (!response.ok || result.status !== 'success') throw new Error(result.message || 'Failed to fetch purchase report');
    const pagination = result.pagination;
    if (!Array.isArray(result.data) || !pagination || !Number.isSafeInteger(pagination.total) || pagination.total < 0 ||
        !Number.isSafeInteger(pagination.limit) || pagination.limit < 1 || pagination.page !== page) {
      throw new Error('Invalid purchase report pagination.');
    }
    expectedTotal ??= pagination.total;
    expectedLimit ??= pagination.limit;
    const pages = Math.ceil(pagination.total / pagination.limit);
    if (pagination.total !== expectedTotal || pagination.limit !== expectedLimit ||
        (pagination.pages !== undefined && pagination.pages !== pages) ||
        (pagination.totalPages !== undefined && pagination.totalPages !== pages) ||
        result.data.length !== Math.max(0, Math.min(pagination.limit, pagination.total - (page - 1) * pagination.limit))) {
      throw new Error('Purchase report changed while loading. Please retry.');
    }
    if (requireAggregate) {
      const total = result.summary?.totalPurchases;
      if (typeof total !== 'number' || !Number.isFinite(total)) throw new Error('Purchase report total is unavailable.');
      aggregateTotal ??= total;
      if (aggregateTotal !== total) throw new Error('Purchase report changed while loading. Please retry.');
    }
    for (const row of result.data) {
      const value = amount(row);
      if (typeof row._id !== 'string' || !row._id || seen.has(row._id) || typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error('Incomplete or invalid purchase report data. Please retry.');
      }
      seen.add(row._id);
      rows.push(row);
      rowTotal += value;
    }
    if (page >= pages) break;
    url.searchParams.set('limit', String(expectedLimit));
  }
  if (rows.length !== expectedTotal || (aggregateTotal !== undefined && Math.abs(rowTotal - aggregateTotal) > 0.005)) {
    throw new Error('Purchase report rows and total do not reconcile. Please retry.');
  }
  return { status: 'success', data: rows, summary: { totalAmount: aggregateTotal ?? rowTotal } };
}
