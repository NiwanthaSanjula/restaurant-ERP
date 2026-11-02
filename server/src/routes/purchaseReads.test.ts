import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import mongoose from 'mongoose';
import getRoutes from './getRoutes';

const mocks = {
  user: jest.fn(), role: jest.fn(), find: jest.fn(), count: jest.fn(), aggregate: jest.fn(),
  detail: jest.fn(), product: jest.fn(), returns: jest.fn(), returnCount: jest.fn(), returnDetail: jest.fn()
};
jest.mock('jsonwebtoken', () => ({ __esModule: true, default: { verify: (token: string) => ({ id: token }) } }));
jest.mock('../models/User', () => ({ __esModule: true, default: { findById: (...args: unknown[]) => mocks.user(...args) } }));
jest.mock('../models/Role', () => ({ __esModule: true, default: { findById: (...args: unknown[]) => mocks.role(...args) } }));
jest.mock('../models/Purchase', () => ({ __esModule: true, default: {
  find: (...args: unknown[]) => mocks.find(...args), countDocuments: (...args: unknown[]) => mocks.count(...args),
  aggregate: (...args: unknown[]) => mocks.aggregate(...args), findById: (...args: unknown[]) => mocks.detail(...args)
} }));
jest.mock('../models/PurchaseReturn', () => ({ __esModule: true, default: {
  find: (...args: unknown[]) => mocks.returns(...args), countDocuments: (...args: unknown[]) => mocks.returnCount(...args),
  findById: (...args: unknown[]) => mocks.returnDetail(...args)
} }));
jest.mock('../models/Product', () => ({ __esModule: true, default: { findById: (...args: unknown[]) => mocks.product(...args) } }));
jest.mock('../utils/email', () => ({ sendEmail: () => { throw new Error('Email forbidden in read tests'); } }));
jest.mock('../services/logActivity', () => ({ __esModule: true, default: () => { throw new Error('Writes forbidden in read tests'); } }));

const ID = 'a'.repeat(24), WAREHOUSE = 'b'.repeat(24), SUPPLIER = 'c'.repeat(24);
const app = express();
// Production router, mount, controllers, authentication and permission middleware.
app.use('/api', getRoutes);
function request(url: string, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), { method: 'GET', url, headers: {
      host: 'purchase.test', ...(token ? { authorization: `Bearer ${token}` } : {})
    } });
    const res = new ServerResponse(req);
    jest.spyOn(res, 'end').mockImplementation((chunk: unknown) => {
      try { resolve({ status: res.statusCode, body: JSON.parse(String(chunk)) }); } catch (error) { reject(error); }
      socket.destroy(); return res;
    });
    app(req, res);
  });
}
function query(value: unknown) {
  const result = { populate: () => result, select: () => result, lean: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  return result;
}
let rows: any[];
let granted: boolean;
function matching(filter: any) {
  return rows.filter(row => Object.entries(filter).every(([field, value]: [string, any]) => {
    if (field === '$or') return value.some(part => new RegExp(part.purchaseId.$regex, part.purchaseId.$options).test(row.purchaseId));
    if (field === 'purchaseDate') return row.purchaseDate >= value.$gte && row.purchaseDate <= value.$lte;
    return String(row[field]) === String(value);
  }));
}
beforeEach(() => {
  jest.clearAllMocks();
  granted = true;
  rows = ['Paid', 'Unpaid', 'Partial'].map((status, index) => ({
    _id: String(index + 1).padStart(24, '0'), purchaseId: `TEST-P-${index}`, paymentStatus: status,
    purchaseStatus: 'Received', warehouseId: WAREHOUSE, supplierId: SUPPLIER,
    purchaseDate: new Date(`2026-10-${20 + index}T03:00:00Z`), createdAt: new Date('2026-10-22T03:00:00Z'),
    grandTotal: index === 2 ? 0 : (index + 1) * 10, items: [{ productId: ID, subTotal: index === 2 ? 0 : (index + 1) * 10 }]
  }));
  mocks.user.mockImplementation(token => query({ _id: ID, isActive: true, role: 'admin', roleId: token === 'reader' ? ID : WAREHOUSE }));
  mocks.role.mockImplementation(id => query({ _id: id, name: 'Explicit test role', isActive: true, permissions: String(id) === ID && granted
    ? [{ component: 'managePurchases', actions: { read: true } }]
    : [{ component: 'manageReports', actions: { view_reports: true } }] }));
  mocks.find.mockImplementation(filter => {
    let skip = 0, limit = 10;
    const result = { populate: () => result, sort: () => result,
      skip: (value: number) => { skip = value; return result; }, limit: (value: number) => { limit = value; return result; },
      lean: async () => matching(filter).slice().reverse().slice(skip, skip + limit) };
    return result;
  });
  mocks.count.mockImplementation(async filter => matching(filter).length);
  mocks.aggregate.mockImplementation(async pipeline => [{ total: matching(pipeline[0].$match).reduce((sum, row) => sum + row.grandTotal, 0) }]);
  mocks.detail.mockImplementation(id => query(rows.find(row => row._id === id)));
  mocks.product.mockImplementation(() => query({ name: 'Fictional test product', code: 'TEST', warehouse: {} }));
  mocks.returns.mockImplementation(() => {
    const result = { populate: () => result, sort: () => result, skip: () => result, limit: async () => [] };
    return result;
  });
  mocks.returnCount.mockResolvedValue(0);
  mocks.returnDetail.mockImplementation(() => query({ _id: ID, items: [] }));
});

describe('mounted purchase read authorization', () => {
  const paths = ['/api/purchases', `/api/purchases/${'1'.padStart(24, '0')}`, '/api/purchases?startDate=2026-10-01&endDate=2026-10-31',
    '/api/purchase-returns', `/api/purchase-returns/${ID}`];
  it.each(paths)('rejects unauthenticated %s before storage', async url => {
    expect((await request(url)).status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.detail).not.toHaveBeenCalled(); expect(mocks.returns).not.toHaveBeenCalled();
  });
  it.each(paths)('rejects authenticated %s without the purchase grant, including admin labels/report grants', async url => {
    expect((await request(url, 'restricted')).status).toBe(403);
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.detail).not.toHaveBeenCalled(); expect(mocks.returns).not.toHaveBeenCalled();
  });
  it.each(paths)('allows explicit purchase readers through %s', async url => {
    expect((await request(url, 'reader')).status).toBe(200);
  });
  it('uses current role grants on subsequent reads', async () => {
    expect((await request('/api/purchases', 'reader')).status).toBe(200);
    granted = false;
    expect((await request('/api/purchases', 'reader')).status).toBe(403);
  });
});

describe('purchase list/detail financial and pagination contracts', () => {
  it('retains list pagination and whole-filter aggregates on every page', async () => {
    const first = await request('/api/purchases?page=1&limit=2', 'reader');
    const last = await request('/api/purchases?page=2&limit=2', 'reader');
    expect(first.body.data).toHaveLength(2); expect(last.body.data).toHaveLength(1);
    expect(first.body.summary.totalPurchases).toBe(30); expect(last.body.summary.totalPurchases).toBe(30);
    expect(new Set([...first.body.data, ...last.body.data].map(row => row._id)).size).toBe(3);
  });
  it('applies date, warehouse, supplier, status and search filters equally to rows and totals', async () => {
    const result = await request(`/api/purchases?warehouseId=${WAREHOUSE}&supplierId=${SUPPLIER}&startDate=2026-10-20&endDate=2026-10-21&q=TEST&paymentStatus=Paid&purchaseStatus=Received`, 'reader');
    expect(result.status).toBe(200); expect(result.body.data).toHaveLength(1); expect(result.body.summary.totalPurchases).toBe(10);
    const filter = mocks.aggregate.mock.calls[0][0][0].$match;
    expect(filter.warehouseId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(filter.supplierId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(mocks.find.mock.calls[0][0]).toEqual(filter);
  });
  it('returns an empty page and zero aggregate for no matches', async () => {
    const result = await request('/api/purchases?q=NO-MATCH', 'reader');
    expect(result.body.data).toEqual([]); expect(result.body.pagination.total).toBe(0); expect(result.body.summary.totalPurchases).toBe(0);
  });
  it.each(['page=0', 'limit=-1', 'page=not-a-number', 'warehouseId=invalid', 'supplierId=invalid'])('rejects invalid %s without querying purchases', async query => {
    expect((await request('/api/purchases?' + query, 'reader')).status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it.each(['Paid', 'Unpaid', 'Partial', undefined])('never invents paid/due amounts from %s status, including zero totals', async status => {
    rows[0].paymentStatus = status; rows[0].grandTotal = 0;
    // Even stale unsupported properties are not evidence of an authoritative ledger.
    rows[0].paid = 0; rows[0].due = 0;
    const list = await request('/api/purchases', 'reader');
    const detail = await request('/api/purchases/' + rows[0]._id, 'reader');
    for (const row of [...list.body.data, detail.body.data]) {
      expect(row.paid).toBeNull(); expect(row.due).toBeNull();
    }
  });
});
