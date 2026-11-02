import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { canonicalPermission } from '../config/permissionDefinitions';

const client = path.resolve(__dirname, '../../../client/src');
const compile = (source: string) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
const load = (file: string) => new Function('exports', compile(fs.readFileSync(path.join(client, file), 'utf8')) + '\nreturn exports;')({});
const report = load('services/purchaseReportData.ts');
const payments = load('utils/purchasePayments.ts');
const params = { fromDate: '2026-08-10', toDate: '2026-11-02', warehouseId: 'warehouse-test' };
const records = [11, 0, 23, 7, 19].map((amount, index) => ({ _id: String(index), purchaseId: `TEST-${index}`,
  grandTotal: amount, totalReturnAmount: amount, paymentStatus: 'Paid', purchaseDate: '2026-10-21', returnDate: '2026-10-21' }));
function pagedFetch(rows = records, options: { aggregate?: boolean; transform?: (body: any, page: number) => void } = {}) {
  return jest.fn(async (input: string) => {
    const url = new URL(input), page = Number(url.searchParams.get('page'));
    const body = { status: 'success', data: rows.slice((page - 1) * 2, page * 2),
      pagination: { total: rows.length, page, limit: 2, pages: Math.ceil(rows.length / 2) },
      ...(options.aggregate === false ? {} : { summary: { totalPurchases: rows.reduce((sum, row) => sum + row.grandTotal, 0) } }) };
    options.transform?.(body, page);
    return { ok: true, json: async () => body };
  });
}
type ReadFetcher = (input: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
const complete = (fetcher: ReadFetcher, aggregate = true) => report.fetchCompletePurchaseReport(
  'http://localhost.test/api/purchases', params, { Authorization: 'Bearer test-only-reader' },
  row => aggregate ? row.grandTotal : row.totalReturnAmount, aggregate, fetcher
);

describe('complete filtered purchase reports and exports', () => {
  it('retrieves every page and preserves zero amounts and all export rows', async () => {
    const fetcher = pagedFetch();
    const result = await complete(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.data).toEqual(records);
    expect(result.summary.totalAmount).toBe(60);
    expect(result.data.map(row => row.purchaseId)).toEqual(records.map(row => row.purchaseId));
    for (const [input, init] of fetcher.mock.calls as unknown as [string, { method: string; headers: object }][]) {
      const url = new URL(input);
      expect(url.searchParams.get('startDate')).toBe(params.fromDate);
      expect(url.searchParams.get('endDate')).toBe(params.toDate);
      expect(url.searchParams.get('warehouseId')).toBe(params.warehouseId);
      expect(init.method).toBe('GET'); expect(init.headers).toEqual({ Authorization: 'Bearer test-only-reader' });
    }
  });
  it('represents empty filtered results and totals as empty/zero', async () => {
    const fetcher = pagedFetch([]);
    expect(await complete(fetcher)).toEqual({ status: 'success', data: [], summary: { totalAmount: 0 } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('totals purchase returns from all pages using their persisted amount field', async () => {
    expect((await complete(pagedFetch(records, { aggregate: false }), false)).summary.totalAmount).toBe(60);
  });
  it.each([
    ['duplicate IDs', (body: any, page: number) => { if (page === 2) body.data[0] = records[0]; }],
    ['short page', (body: any, page: number) => { if (page === 2) body.data.pop(); }],
    ['changed count', (body: any, page: number) => { if (page === 2) body.pagination.total++; }],
    ['changed aggregate', (body: any, page: number) => { if (page === 2) body.summary.totalPurchases++; }],
    ['inconsistent aggregate', (body: any) => { body.summary.totalPurchases++; }],
    ['missing amount', (body: any, page: number) => { if (page === 2) body.data[0] = { _id: 'missing' }; }],
    ['missing aggregate', (body: any) => { delete body.summary; }],
    ['wrong page', (body: any, page: number) => { if (page === 2) body.pagination.page = 1; }]
  ])('rejects %s instead of exposing a partial or misleading report', async (_name, transform) => {
    await expect(complete(pagedFetch(records, { transform: transform as (body: any, page: number) => void }))).rejects.toThrow();
  });
  it('does not turn a denied or failed page into a successful partial export', async () => {
    const denied = jest.fn(async () => ({ ok: false, json: async () => ({ status: 'error', message: 'Access denied' }) }));
    await expect(complete(denied)).rejects.toThrow('Access denied');
    const fetcher = pagedFetch();
    fetcher.mockImplementationOnce(async input => {
      const first = await pagedFetch()(input);
      return first;
    }).mockImplementationOnce(async () => { throw new Error('Second page failed'); });
    await expect(complete(fetcher)).rejects.toThrow('Second page failed');
  });
  it('actual purchase service returns complete rows, aggregate and return amounts to the report/export', async () => {
    const source = fs.readFileSync(path.join(client, 'services/purchaseService.ts'), 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined');
    const fetcher = pagedFetch();
    const service = new Function('exports', 'require', 'fetch', 'localStorage', compile(source) + '\nreturn exports;')({},
      (name: string) => name === './purchaseReportData' ? {
        fetchCompletePurchaseReport: (...args: unknown[]) => report.fetchCompletePurchaseReport(...args, fetcher)
      } : { formatDate: (date: string) => date }, fetcher, { getItem: () => 'test-only-reader' });
    const purchases = await service.getPurchaseReport(params);
    expect(purchases.data).toHaveLength(5); expect(purchases.summary.totalAmount).toBe(60);
    expect(purchases.data[1].total).toBe(0);
    const returns = await service.getPurchaseReturnsReport(params);
    expect(returns.data).toHaveLength(5); expect(returns.data.map(row => row.total)).toEqual([11, 0, 23, 7, 19]);
  });
});

describe('purchase amount presentation without fabricated payments', () => {
  it.each(['Paid', 'Unpaid', 'Partial'])('shows unrecorded amounts for %s status', status => {
    const row = { paymentStatus: status, paid: null, due: null };
    expect(payments.formatPurchasePayment(row.paid, 'LKR')).toBe('Not recorded');
    expect(payments.formatPurchasePayment(row.due, 'LKR')).toBe('Not recorded');
    expect(payments.purchasePaymentTotal([row], 'paid')).toBeNull();
  });
  it('preserves explicit zero and independently recorded partial amounts', () => {
    expect(payments.formatPurchasePayment(0, 'LKR')).toBe('LKR 0');
    expect(payments.purchasePaymentTotal([{ paid: 0 }, { paid: 25 }], 'paid')).toBe(25);
    expect(payments.formatPurchasePayment(25, 'LKR')).toBe('LKR 25');
    expect(payments.formatPurchasePayment(75, 'LKR')).toBe('LKR 75');
  });
  it.each([undefined, null, NaN, Infinity, -1, '0', '25'])('does not silently turn invalid/missing %p into zero', value => {
    expect(payments.formatPurchasePayment(value, 'LKR')).toBe('Not recorded');
    expect(payments.purchasePaymentTotal([{ due: 0 }, { due: value }], 'due')).toBeNull();
  });
  it('uses recognized explicit purchase permissions for list/report/legacy navigation', () => {
    const routes = load('utils/permissionRoutes.ts');
    for (const path of ['/purchases', '/reports/purchase', '/viewPurchaseReturns', '/return_to_supplier', '/purchaseReturnDetails/id']) {
      const permission = routes.permissionForPath(path);
      expect(permission).toEqual({ component: 'managePurchases', action: 'read' });
      expect(canonicalPermission(permission.component, permission.action)).toEqual(permission);
    }
  });
});
