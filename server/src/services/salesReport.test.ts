import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const clientRoot = path.resolve(__dirname, '../../../client/src/services');
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const helper = new Function('exports', compile(fs.readFileSync(path.join(clientRoot, 'salesReportData.ts'), 'utf8')) + ';return exports;')({});
const source = fs.readFileSync(path.join(clientRoot, 'saleService.ts'), 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined');
const sales = Array.from({ length: 600 }, (_, index) => ({ _id: String(index + 1), invoiceId: `SALE-${index + 1}`, total: 10, date: '2026-11-02', paymentStatus: 'paid' }));
const returns = Array.from({ length: 13 }, (_, index) => ({ _id: String(index + 1), returnId: `RETURN-${index + 1}`, totalReturnAmount: index === 0 ? 35 : index === 2 ? 10 : 0, returnDate: '2026-11-02', status: index === 2 ? 'Cancelled' : 'Completed' }));
const filters = { fromDate: '2026-11-01', toDate: '2026-11-02', warehouseId: 'a'.repeat(24) };
function fixtureFetch(options: { empty?: boolean; fail?: string; missingAmount?: boolean; duplicate?: boolean; changeCount?: boolean } = {}) {
  return jest.fn(async (input: string, _init?: unknown) => {
    const url = new URL(input), isReturn = url.pathname.endsWith('/sale-returns');
    const page = Number(url.searchParams.get('page') || 1);
    if (options.fail === (isReturn ? 'returns' : 'sales') && page === 2) return { ok: false, json: async () => ({ status: 'error', message: 'Later page failed' }) };
    const limit = Math.min(Number(url.searchParams.get('limit') || 10), isReturn ? 5 : 500);
    let rows: any[] = options.empty ? [] : structuredClone(isReturn ? returns : sales);
    if (isReturn && options.missingAmount) rows = [{ _id: 'missing', returnId: 'MISSING', totalAmount: 999, totalReturnAmount: undefined }];
    const data = rows.slice((page - 1) * limit, page * limit);
    if (options.duplicate && page === 2 && data.length) data[0] = rows[0];
    const total = rows.length + (options.changeCount && page === 2 ? 1 : 0);
    return { ok: true, json: async () => ({ status: 'success', data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }) };
  });
}
function service(fetcher: ReturnType<typeof fixtureFetch>) {
  return new Function('exports', 'require', 'fetch', 'localStorage', compile(source) + ';return exports;')({},
    () => helper, fetcher, { getItem: () => 'test-only-reader' });
}

describe('complete sales/return reports', () => {
  it('includes more than 500 sales and every export row using the same filters on every page', async () => {
    const fetcher = fixtureFetch(), result = await service(fetcher).getSalesReport(filters);
    expect(result.data).toHaveLength(600); expect(result.totalAmount).toBe(6000);
    expect(result.data[599].ref).toBe('SALE-600'); expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [input, init] of fetcher.mock.calls) {
      const url = new URL(input);
      expect(url.searchParams.get('date')).toBe(filters.fromDate); expect(url.searchParams.get('dateEnd')).toBe(filters.toDate);
      expect(url.searchParams.get('warehouseId')).toBe(filters.warehouseId); expect(url.searchParams.get('businessType')).toBe('restaurant');
      expect(init).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer test-only-reader' } });
    }
  });
  it('loads returns across all pages, preserves 35 and zero, and retains the existing all-status total definition', async () => {
    const fetcher = fixtureFetch(), result = await service(fetcher).getSaleReturnsReport(filters);
    expect(result.data).toHaveLength(13); expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.data[0].total).toBe(35); expect(result.data[1].total).toBe(0);
    expect(result.data[2].status).toBe('Cancelled'); expect(result.totalAmount).toBe(45);
    for (const [input] of fetcher.mock.calls) {
      const url = new URL(input);
      expect(url.searchParams.get('startDate')).toBe(filters.fromDate); expect(url.searchParams.get('endDate')).toBe(filters.toDate);
      expect(url.searchParams.get('warehouseId')).toBe(filters.warehouseId);
    }
  });
  it('does not substitute other fields or zero for an unavailable authoritative return amount', async () => {
    const result = await service(fixtureFetch({ missingAmount: true })).getSaleReturnsReport(filters);
    expect(result.data[0].total).toBeNull(); expect(result.totalAmount).toBeNull();
    expect(helper.reportAmount(0)).toBe(0); expect(helper.reportAmount(35)).toBe(35);
    for (const value of [undefined, null, NaN, Infinity, '35']) expect(helper.reportAmount(value)).toBeNull();
  });
  it('returns empty rows and genuine zero totals for an empty range', async () => {
    const instance = service(fixtureFetch({ empty: true }));
    for (const result of [await instance.getSalesReport(filters), await instance.getSaleReturnsReport(filters)]) {
      expect(result.data).toEqual([]); expect(result.totalAmount).toBe(0);
    }
  });
  it.each(['sales', 'returns'])('rejects a failed later %s page without returning partial export data', async endpoint => {
    const instance = service(fixtureFetch({ fail: endpoint }));
    await expect(endpoint === 'sales' ? instance.getSalesReport(filters) : instance.getSaleReturnsReport(filters)).rejects.toThrow('Later page failed');
  });
  it.each([{ duplicate: true }, { changeCount: true }])('rejects repeated or changing pagination: %j', async options => {
    await expect(service(fixtureFetch(options)).getSalesReport(filters)).rejects.toThrow();
  });
  it.each([{ fromDate: '2026-11-02' }, { toDate: '2026-11-02' }])('keeps single-day semantics for a single supplied date: %j', async range => {
    const fetcher = fixtureFetch(), instance = service(fetcher);
    await instance.getSalesReport(range); await instance.getSaleReturnsReport(range);
    const urls = fetcher.mock.calls.map(([input]) => new URL(input));
    const sale = urls.find(url => url.pathname.endsWith('/sales'));
    expect(sale.searchParams.get('date') || sale.searchParams.get('dateEnd')).toBe('2026-11-02');
    for (const url of urls.filter(url => url.pathname.endsWith('/sale-returns'))) {
      expect(url.searchParams.get('startDate')).toBe('2026-11-02'); expect(url.searchParams.get('endDate')).toBe('2026-11-02');
    }
  });
  it('leaves ordinary Sales list pagination as one requested page', async () => {
    const fetcher = fixtureFetch(), result = await service(fetcher).getSales({ page: 3, limit: 25 });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(result.data).toHaveLength(25); expect(result.pagination.page).toBe(3);
  });
});
