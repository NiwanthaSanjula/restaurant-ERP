import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import getRoutes from './getRoutes';
import { buildZonedDateRange } from '../utils/timezone';

const mocks = { saleFind: jest.fn(), saleCount: jest.fn(), returnFind: jest.fn(), returnCount: jest.fn() };
jest.mock('../models/Sale', () => ({ __esModule: true, default: { find: (...args: unknown[]) => mocks.saleFind(...args), countDocuments: (...args: unknown[]) => mocks.saleCount(...args) } }));
jest.mock('../models/SaleReturn', () => ({ __esModule: true, default: { find: (...args: unknown[]) => mocks.returnFind(...args), countDocuments: (...args: unknown[]) => mocks.returnCount(...args) } }));
jest.mock('../models/User', () => ({ __esModule: true, default: { findById: () => query({ _id: 'reader', isActive: true, roleId: 'a'.repeat(24) }), find: () => query([]) } }));
jest.mock('../models/Role', () => ({ __esModule: true, default: { findById: () => query({ _id: 'a'.repeat(24), isActive: true, permissions: [{ component: 'manageReports', actions: { view_reports: true } }] }) } }));
jest.mock('../models/Customer', () => ({ __esModule: true, default: { find: () => query([]) } }));
jest.mock('../models/Warehouse', () => ({ __esModule: true, default: { find: () => query([]) } }));
jest.mock('jsonwebtoken', () => ({ __esModule: true, default: { verify: () => ({ id: 'reader' }) } }));
jest.mock('../utils/email', () => ({ sendEmail: () => { throw new Error('Email forbidden in read tests'); } }));

function query(value: unknown) {
  const result = { select: () => result, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  return result;
}
const WAREHOUSE = 'b'.repeat(24), OTHER = 'c'.repeat(24);
const range = buildZonedDateRange('2026-11-02', '2026-11-02');
const rows = [range.start.getTime() - 1, range.start.getTime(), range.end.getTime(), range.end.getTime() + 1, range.start.getTime()]
  .map((time, index) => ({ _id: String(index + 1).padStart(24, '0'), businessType: 'restaurant', date: new Date(time), returnDate: new Date(time),
    warehouseId: index === 4 ? OTHER : WAREHOUSE, createdAt: new Date('2026-11-02T10:00:00Z'), total: 10, totalReturnAmount: index === 1 ? 35 : 0 }));
function match(filter: any) {
  return rows.filter(row => Object.entries(filter).every(([field, value]: [string, any]) => {
    if (field === 'date' || field === 'returnDate') return (!value.$gte || row[field] >= value.$gte) && (!value.$lte || row[field] <= value.$lte);
    return String(row[field]) === String(value);
  }));
}
function find(filter: unknown) {
  let skip = 0, limit = 50;
  const result = { populate: () => result, sort: jest.fn(() => result), skip: (n: number) => { skip = n; return result; },
    limit: (n: number) => { limit = n; return result; }, lean: async () => structuredClone(match(filter).slice().reverse().slice(skip, skip + limit)) };
  return result;
}
const app = express(); app.use('/api', getRoutes);
function request(path: string, authenticated = true): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), { method: 'GET', url: path, headers: { host: 'sales.test', ...(authenticated ? { authorization: 'Bearer test-only-reader' } : {}) } });
    const res = new ServerResponse(req);
    jest.spyOn(res, 'end').mockImplementation((chunk: unknown) => {
      try { resolve({ status: res.statusCode, body: JSON.parse(String(chunk)) }); } catch (error) { reject(error); }
      socket.destroy(); return res;
    }); app(req, res);
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  mocks.saleFind.mockImplementation(find); mocks.returnFind.mockImplementation(find);
  mocks.saleCount.mockImplementation(async filter => match(filter).length); mocks.returnCount.mockImplementation(async filter => match(filter).length);
});
describe('mounted sales/report read contracts', () => {
  it('retains authenticated Sales access and ordinary list pagination', async () => {
    expect((await request('/api/sales', false)).status).toBe(401);
    const result = await request('/api/sales?page=2&limit=2');
    expect(result.status).toBe(200); expect(result.body.data).toHaveLength(2);
    expect(result.body.pagination).toMatchObject({ page: 2, limit: 2, total: 5, pages: 3 });
  });
  it.each([
    ['/api/sales?date=2026-11-02&dateEnd=2026-11-02', 'date', 'saleFind', 'saleCount'],
    ['/api/sale-returns?startDate=2026-11-02&endDate=2026-11-02', 'returnDate', 'returnFind', 'returnCount']
  ])('applies inclusive business-day boundaries and warehouse filtering consistently: %s', async (endpoint, field, findMock, countMock) => {
    const result = await request(endpoint + '&warehouseId=' + WAREHOUSE);
    expect(result.status).toBe(200); expect(result.body.data).toHaveLength(2); expect(result.body.pagination.total).toBe(2);
    const filter = mocks[findMock].mock.calls[0][0];
    expect(filter[field]).toEqual({ $gte: range.start, $lte: range.end });
    expect(String(filter.warehouseId)).toBe(WAREHOUSE);
    expect(mocks[countMock].mock.calls[0][0]).toEqual(filter);
    expect(mocks[findMock].mock.results[0].value.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  });
  it('returns the authoritative numeric 35 and zero return amounts unchanged', async () => {
    const result = await request('/api/sale-returns?startDate=2026-11-02&endDate=2026-11-02&warehouseId=' + WAREHOUSE);
    expect(result.body.data.map(row => row.totalReturnAmount).sort((a, b) => a - b)).toEqual([0, 35]);
  });
  it('uses the existing Asia/Colombo day boundaries', () => {
    const colombo = buildZonedDateRange('2026-11-02', '2026-11-02', 'Asia/Colombo');
    expect(colombo.start.toISOString()).toBe('2026-11-01T18:30:00.000Z');
    expect(colombo.end.toISOString()).toBe('2026-11-02T18:29:59.999Z');
  });
  it('retains one-sided return filters for existing list callers', async () => {
    await request('/api/sale-returns?startDate=2026-11-02');
    expect(mocks.returnFind.mock.calls[0][0].returnDate).toEqual({ $gte: range.start });
  });
  it('rejects an invalid warehouse instead of silently returning unfiltered returns', async () => {
    expect((await request('/api/sale-returns?warehouseId=invalid')).status).toBe(400);
    expect(mocks.returnFind).not.toHaveBeenCalled();
  });
});
