export interface SalesReportPage<T> {
  status: string;
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

/** Reject missing, repeated or changing pages rather than publishing a partial report. */
export async function collectSalesReportPages<T extends { _id: string }>(
  loadPage: (page: number, limit: number) => Promise<SalesReportPage<T>>,
  pageSize: number,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  let limit = pageSize;
  for (let page = 1; ; page++) {
    const result = await loadPage(page, limit);
    const pagination = result?.pagination;
    if (result?.status !== 'success' || !Array.isArray(result.data) || !pagination ||
        !Number.isSafeInteger(pagination.total) || pagination.total < 0 ||
        !Number.isSafeInteger(pagination.limit) || pagination.limit < 1 || pagination.page !== page ||
        pagination.pages !== Math.ceil(pagination.total / pagination.limit)) {
      throw new Error('Invalid sales report pagination. Please retry.');
    }
    total ??= pagination.total;
    if (pagination.total !== total || (page > 1 && pagination.limit !== limit) ||
        result.data.length !== Math.max(0, Math.min(pagination.limit, total - (page - 1) * pagination.limit))) {
      throw new Error('Sales report changed while loading. Please retry.');
    }
    limit = pagination.limit;
    for (const row of result.data) {
      if (typeof row?._id !== 'string' || !row._id || seen.has(row._id)) throw new Error('Sales report contains missing or repeated records. Please retry.');
      seen.add(row._id);
      rows.push(row);
    }
    if (page >= pagination.pages) break;
  }
  if (rows.length !== total) throw new Error('Sales report is incomplete. Please retry.');
  return rows;
}

export function reportAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function reportTotal(rows: readonly { total: number | null }[]): number | null {
  let total = 0;
  for (const row of rows) {
    if (row.total === null) return null;
    total += row.total;
  }
  return total;
}
