import mongoose from 'mongoose';
import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { createStockPurchase, receiveStockPurchase, editStockPurchase, deleteUnreceivedPurchase } from './purchaseStock';
import { warehouseStockRows } from '../utils/warehouseStock';
import { warehouseIncomingStock } from '../utils/warehouseIncoming';
import getRoutes from '../routes/getRoutes';
import postRoutes from '../routes/postRoutes';
import putRoutes from '../routes/putRoutes';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
const submissionSource = fs.readFileSync(path.resolve(__dirname, '../../../client/src/services/purchaseSubmission.ts'), 'utf8');
const submission = new Function('exports', ts.transpileModule(submissionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText + ';return exports;')({});
const reorder = new Function('exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../../client/src/services/purchaseReorder.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText + ';return exports;')({});
const draftStorage = () => { const entries = new Map<string, string>(); return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } }; };

const USER = '1'.repeat(24), ROLE = '2'.repeat(24), DRY = '3'.repeat(24), KITCHEN = '4'.repeat(24), RICE = '5'.repeat(24), DRINK = '6'.repeat(24), SUPPLIER = '7'.repeat(24), UNIT = '8'.repeat(24);
let state: any, granted = true, failProduct = '', queue = Promise.resolve(), sequence = 0, requestSequence = 0;
let failTransferUpdate = false, unsupportedTransferTransaction = false, legacyRole = 'admin';
let updateGranted = true, purchaseReadGranted = true;
const writes: string[] = [];
const copy = (value: any) => JSON.parse(JSON.stringify(value, (_key, item) => item instanceof Map ? Object.fromEntries(item) : item));
function query(get: () => any, hydrate?: (value: any) => any) {
  const result = { session: () => result, select: () => result, sort: () => result, populate: () => result, collation: () => result,
    lean: async () => get(), then: (resolve: any, reject: any) => Promise.resolve(hydrate ? hydrate(get()) : get()).then(resolve, reject) };
  return result;
}
function productDocument(row: any) {
  return row ? { ...copy(row), warehouse: new Map(Object.entries(copy(row.warehouse))),
    async save(options: any) { expect(options.session).toBeDefined(); if (row._id === failProduct) throw new Error('Fixture product save failure'); writes.push('transfer stock'); state.products[row._id] = this.toObject(); },
    toObject() { return copy(this); }
  } : null;
}
function document(id: string): any {
  const value = state.purchases[id];
  return value ? Object.assign(copy(value), {
    set(key: string, value: any) { this[key] = value; },
    async save(options: any) { expect(options.session).toBeDefined(); writes.push('purchase'); state.purchases[id] = this.toObject(); },
    toObject() { return copy(this); }
  }) : null;
}
jest.mock('../models/Product', () => ({ __esModule: true, default: {
  findById: (id: any) => query(() => state.products[String(id)] || null, productDocument),
  find: () => query(() => Object.values(state.products)), findOne: () => query(() => null),
  create: async (body: any) => { const row = { ...copy(body), _id: 'a'.repeat(24) }; state.products[row._id] = row; return { ...row, toObject: () => copy(row) }; },
  updateOne: async (filter: any, update: any, options: any) => {
    const thresholdOnly = !update.$inc && Object.keys({ ...update.$set, ...update.$unset }).every(path => path.endsWith('.stockAlert'));
    if (thresholdOnly) writes.push('threshold'); else { expect(options.session).toBeDefined(); writes.push('stock'); }
    if (filter._id === failProduct) throw new Error('Fixture storage failure');
    const product = state.products[String(filter._id)]; if (!product || (filter.unit && product.unit !== filter.unit)) return { matchedCount: 0 };
    for (const [path, value] of Object.entries(update.$set || {})) {
      const [, wid, field] = path.split('.'); product.warehouse[wid] ||= {}; product.warehouse[wid][field] = value;
    }
    for (const [path, value] of Object.entries(update.$inc || {}) as [string, number][]) {
      const [, wid, field] = path.split('.'); product.warehouse[wid] ||= {}; product.warehouse[wid][field] = (product.warehouse[wid][field] || 0) + value;
    }
    for (const path of Object.keys(update.$unset || {})) { const [, wid, field] = path.split('.'); delete product.warehouse[wid][field]; }
    return { matchedCount: 1 };
  }
} }));
jest.mock('../models/Transfer', () => ({ __esModule: true, default: {
  findById: (id: any) => query(() => state.transfers[String(id)] ? copy(state.transfers[String(id)]) : null),
  create: async (input: any, options?: any) => {
    const rows = Array.isArray(input) ? input : [input];
    if (Array.isArray(input)) expect(options?.session).toBeDefined();
    const results = rows.map((row: any) => { const id = 'f' + (++sequence).toString(16).padStart(23, '0'); const saved = { ...copy(row), _id: id }; state.transfers[id] = saved; writes.push('transfer create'); return saved; });
    return Array.isArray(input) ? results : results[0];
  },
  findByIdAndUpdate: async (id: string, update: any, options: any) => {
    expect(options.session).toBeDefined(); if (failTransferUpdate) throw new Error('Fixture transfer save failure');
    writes.push('transfer status'); Object.assign(state.transfers[id], copy(update)); return copy(state.transfers[id]);
  }
} }));
jest.mock('../models/Category', () => ({ __esModule: true, default: { find: () => query(() => [{ _id: USER, category: 'Cold Drinks' }]) } }));
jest.mock('../models/Brand', () => ({ __esModule: true, default: { find: () => query(() => []) } }));
jest.mock('../models/Purchase', () => ({ __esModule: true, default: {
  find: () => query(() => Object.values(state.purchases)),
  findById: (id: any) => query(() => document(String(id))),
  create: async (rows: any[], options: any) => {
    expect(options.session).toBeDefined(); writes.push('purchase');
    return rows.map(row => { const id = row._id || (++sequence).toString(16).padStart(24, '0'); state.purchases[id] = { ...copy(row), _id: id }; return document(id); });
  },
  deleteOne: async (filter: any, options: any) => { expect(options.session).toBeDefined(); writes.push('purchase delete'); delete state.purchases[String(filter._id)]; }
} }));
jest.mock('../models/Warehouse', () => ({ __esModule: true, default: { findById: (id: any) => query(() => state.warehouses[String(id)] || null) } }));
jest.mock('../models/Supplier', () => ({ __esModule: true, default: {
  findById: (id: any) => query(() => state.suppliers[String(id)] || null),
  findOne: (filter: any) => query(() => Object.values(state.suppliers).find((supplier: any) => supplier.name?.toLowerCase() === filter.name?.toLowerCase()) || null),
  create: async (body: any) => { const row = { ...copy(body), _id: 'b'.repeat(24) }; state.suppliers[row._id] = row; writes.push('new supplier'); return row; }
} }));
jest.mock('../models/Unit', () => ({ __esModule: true, default: { findOne: () => query(() => ({ _id: UNIT, unitName: 'Bag(s)', shortName: 'bag(s)' })) } }));
jest.mock('../models/ActivityLog', () => ({ __esModule: true, default: { create: async (_rows: any[], options: any) => { expect(options.session).toBeDefined(); writes.push('audit'); } } }));
jest.mock('../models/User', () => ({ __esModule: true, default: { findById: () => query(() => ({ _id: USER, isActive: true, roleId: ROLE, role: legacyRole })) } }));
jest.mock('../models/Role', () => ({ __esModule: true, default: { findById: () => query(() => ({ _id: ROLE, isActive: true, permissions: [
  { component: 'managePurchases', actions: { read: purchaseReadGranted } }, { component: 'manageProducts', actions: { read: granted, create: granted, update: granted && updateGranted } }, { component: 'managePOS', actions: { view_pos: true } }
] })) } }));
jest.mock('jsonwebtoken', () => ({ __esModule: true, default: { verify: () => ({ id: USER }) } }));
jest.mock('./logActivity', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../utils/email', () => ({ sendEmail: () => { throw new Error('Email forbidden'); } }));

beforeEach(() => {
  sequence = 0; requestSequence = 0; queue = Promise.resolve(); writes.length = 0; failProduct = ''; granted = true;
  failTransferUpdate = false; unsupportedTransferTransaction = false; legacyRole = 'admin';
  updateGranted = true; purchaseReadGranted = true;
  state = { purchases: {}, transfers: {}, suppliers: { [SUPPLIER]: { _id: SUPPLIER, name: 'Existing fixture supplier' } }, warehouses: { [DRY]: { _id: DRY, name: 'Dry Store', isActive: true }, [KITCHEN]: { _id: KITCHEN, name: 'Main Kitchen', isActive: true } }, products: {
    [RICE]: { _id: RICE, name: 'Fixture rice', code: 'FIX-RICE', unit: 'bag(s)', ptype: 'Single', isInventory: true, isSellable: false, warehouse: { [DRY]: { warehouseName: 'Dry Store', productQty: 0, productPrice: 0, productCost: 13000, stockAlert: 3 } } },
    [DRINK]: { _id: DRINK, name: 'Fixture drink', code: 'FIX-DRINK', unit: 'Piece', ptype: 'Single', isInventory: true, isSellable: true, warehouse: { [DRY]: { warehouseName: 'Dry Store', productQty: 2, productPrice: 200, productCost: 100, stockAlert: 1 } } }
  } };
  jest.spyOn(mongoose, 'startSession').mockImplementation(async () => ({
    endSession: jest.fn(), withTransaction: async (work: () => Promise<void>) => {
      if (unsupportedTransferTransaction) throw new Error('Transactions are unavailable');
      let release!: () => void; const previous = queue; queue = new Promise<void>(resolve => { release = resolve; }); await previous;
      const before = copy(state); try { await work(); } catch (error) { state = before; throw error; } finally { release(); }
    }
  }) as unknown as mongoose.ClientSession);
  jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const payload = (overrides: any = {}) => ({ createRequestId: `fixture-purchase-key-${++requestSequence}`, supplierId: SUPPLIER, warehouseId: DRY, purchaseStatus: 'Ordered', paymentStatus: 'Paid', grandTotal: 130000, subtotal: 130000,
  items: [{ productId: RICE, quantity: 10, cost: 13000, subTotal: 130000 }], ...overrides });
const app = express(); app.use('/api', getRoutes); app.use('/api', postRoutes); app.use('/api', putRoutes);
function request(method: string, url: string, body?: any, authenticated = true): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const socket = new Socket(); const req = Object.assign(new IncomingMessage(socket), { method, url, body, headers: { host: 'stock.test', ...(authenticated ? { authorization: 'Bearer fixture' } : {}) } });
    const res = new ServerResponse(req); jest.spyOn(res, 'end').mockImplementation((chunk: any) => {
      try { resolve({ status: res.statusCode, body: JSON.parse(String(chunk)) }); } catch (error) { reject(error); }
      socket.destroy(); return res;
    }); app(req, res);
  });
}

describe('Warehouse alerts, Incoming and Reorder; actual mounted handlers with isolated storage', () => {
  const stock = async () => {
    const response = await request('GET', `/api/warehouses/${DRY}/stock`); expect(response.status).toBe(200);
    return response.body.data.items.find((row: any) => row.productId === RICE);
  };
  const thresholdPath = () => `/api/warehouses/${DRY}/stock/${RICE}/alert`;
  beforeEach(() => { state.products[RICE].name = 'Flour'; Object.assign(state.products[RICE].warehouse[DRY], { productQty: 4, stockAlert: 5 }); });
  it('keeps 4 bags On Hand with 10 Incoming, then receives to 14/0 once and clears Low Stock', async () => {
    expect(await stock()).toMatchObject({ quantity: 4, incoming: 0, stockAlert: 5, stockUnit: 'bag(s)', alertState: 'low_stock' });
    const before = copy(state.products[RICE]);
    const changed = await request('PUT', thresholdPath(), { stockAlert: 5, stockUnit: 'bag(s)' });
    expect(changed.status).toBe(200); expect(state.products[RICE]).toEqual(before); expect(writes).toEqual(['threshold']);
    const draft = reorder.purchaseReorderDraft(state.products[RICE], state.warehouses[DRY], Object.values(state.suppliers));
    expect(draft).toMatchObject({ warehouseId: DRY, supplierId: '', item: { productId: RICE, qty: 0, cost: '13000.00', stock: 4 } });
    const created = await request('POST', '/api/purchases', payload({ paymentStatus: 'Unpaid' }));
    expect(created.status).toBe(201); expect(await stock()).toMatchObject({ quantity: 4, incoming: 10, alertState: 'low_stock' });
    const id = created.body.data._id;
    const received = await request('POST', `/api/purchases/${id}/receive`, {});
    expect(received.status).toBe(200); expect(received.body.replayed).toBe(false);
    expect(await stock()).toMatchObject({ quantity: 14, incoming: 0, stockAlert: 5, alertState: 'healthy' });
    const snapshot = copy(state), stockPosts = writes.filter(kind => kind === 'stock').length;
    expect((await request('POST', `/api/purchases/${id}/receive`, {})).body.replayed).toBe(true);
    expect(copy(state)).toEqual(snapshot); expect(writes.filter(kind => kind === 'stock')).toHaveLength(stockPosts);
    expect(Object.keys(state.purchases)).toHaveLength(1);
  });
  it('edits or clears only the location threshold; zero, missing and Out of Stock remain distinct', async () => {
    const before = copy(state.products[RICE]);
    expect((await request('PUT', thresholdPath(), { stockAlert: 0, stockUnit: 'bag(s)' })).status).toBe(200);
    expect(state.products[RICE]).toEqual({ ...before, warehouse: { [DRY]: { ...before.warehouse[DRY], stockAlert: 0 } } });
    expect(await stock()).toMatchObject({ stockAlert: 0, alertState: 'healthy' });
    expect((await request('PUT', thresholdPath(), { stockAlert: null, stockUnit: 'bag(s)' })).status).toBe(200);
    expect(await stock()).toMatchObject({ quantity: 4, stockAlert: null, alertState: 'threshold_missing' });
    state.products[RICE].warehouse[DRY].productQty = 0;
    expect(await stock()).toMatchObject({ quantity: 0, stockAlert: null, alertState: 'out_of_stock' });
    state.products[RICE].warehouse[DRY].stockAlert = 5; state.products[RICE].warehouse[DRY].productQty = 5;
    expect(await stock()).toMatchObject({ quantity: 5, alertState: 'low_stock' });
  });
  it('keeps incoming purchase quantities behind Purchases Read, while preserving stock read access', async () => {
    await createStockPurchase(payload(), USER); purchaseReadGranted = false;
    expect(await stock()).toMatchObject({ quantity: 4, incoming: null, incomingNote: expect.stringMatching(/permission/) });
  });
  it('denies unauthenticated and restricted threshold writes, even with an admin role label', async () => {
    const before = copy(state);
    expect((await request('PUT', thresholdPath(), { stockAlert: 5, stockUnit: 'bag(s)' }, false)).status).toBe(401);
    updateGranted = false;
    expect((await request('PUT', thresholdPath(), { stockAlert: 5, stockUnit: 'bag(s)' })).status).toBe(403);
    expect(await stock()).toMatchObject({ quantity: 4, stockAlert: 5 }); expect(copy(state)).toEqual(before); expect(writes).toHaveLength(0);
  });
  it.each([{ stockAlert: -1, stockUnit: 'bag(s)' }, { stockAlert: '5', stockUnit: 'bag(s)' }, { stockAlert: 5, stockUnit: 'bag(s)', productQty: 99 }, { stockUnit: 'bag(s)' }])('rejects invalid threshold payload %j without balance changes', async body => {
    const before = copy(state); expect((await request('PUT', thresholdPath(), body)).status).toBe(400); expect(copy(state)).toEqual(before); expect(writes).toHaveLength(0);
  });
  it('rejects changed units and ambiguous legacy balances without migrating them', async () => {
    expect((await request('PUT', thresholdPath(), { stockAlert: 5, stockUnit: 'kg' })).status).toBe(409);
    state.products[RICE].warehouse['Dry Store'] = { ...state.products[RICE].warehouse[DRY] };
    const before = copy(state); expect((await request('PUT', thresholdPath(), { stockAlert: 5, stockUnit: 'bag(s)' })).status).toBe(409);
    expect(copy(state)).toEqual(before); expect(writes).toHaveLength(0);
  });
  it('totals all matching unreceived orders, not another location or Received records; flags unknown posting/units', async () => {
    await createStockPurchase(payload({ items: [{ productId: RICE, quantity: 3, cost: 1, subTotal: 3 }] }), USER);
    await createStockPurchase(payload({ items: [{ productId: RICE, quantity: 7, cost: 1, subTotal: 7 }], purchaseStatus: 'Pending' }), USER);
    const elsewhere = await createStockPurchase(payload({ warehouseId: KITCHEN }), USER);
    expect(await stock()).toMatchObject({ incoming: 10 });
    state.purchases[elsewhere._id].warehouseId = DRY; state.purchases[elsewhere._id].purchaseStatus = 'Received';
    expect(await stock()).toMatchObject({ incoming: 10 });
    state.purchases[elsewhere._id].purchaseStatus = 'Ordered'; state.purchases[elsewhere._id].stockReceivedAt = '2026-11-04';
    expect(await stock()).toMatchObject({ incoming: 10 }); delete state.purchases[elsewhere._id].stockReceivedAt;
    delete state.purchases[elsewhere._id].stockReceiptVersion;
    expect(await stock()).toMatchObject({ incoming: null, incomingNote: expect.stringMatching(/unverified/) });
    state.purchases[elsewhere._id].stockReceiptVersion = 1; state.purchases[elsewhere._id].items[0].stockUnit = 'kg';
    expect(await stock()).toMatchObject({ incoming: null });
  });
  it('shows first-time incoming stock without creating a balance or inventing a threshold', async () => {
    await createStockPurchase(payload({ warehouseId: KITCHEN }), USER); const before = copy(state);
    const rows = warehouseIncomingStock(Object.values(state.products), Object.values(state.purchases), KITCHEN, 'Main Kitchen');
    expect(rows.find(row => row.productId === RICE)).toMatchObject({ quantity: 0, incoming: 10, stockAlert: null, alertEditable: false, onOrderOnly: true });
    expect(copy(state)).toEqual(before);
  });
  it('prefills only a unique explicit saved supplier; leaves quantities empty and ambiguous suppliers unselected', () => {
    const product = state.products[RICE], warehouse = state.warehouses[DRY], suppliers = Object.values(state.suppliers);
    product.supplier = 'Existing fixture supplier';
    expect(reorder.purchaseReorderDraft(product, warehouse, suppliers)).toMatchObject({ supplierId: SUPPLIER, item: { qty: 0, subTotal: 0 } });
    expect(reorder.purchaseReorderDraft(product, warehouse, [...suppliers, { _id: DRINK, name: product.supplier }]).supplierId).toBe('');
    delete product.supplier; expect(reorder.purchaseReorderDraft(product, warehouse, suppliers).supplierId).toBe('');
    product.isInventory = false; expect(() => reorder.purchaseReorderDraft(product, warehouse, suppliers)).toThrow(/needs review/);
  });
});

describe('Storage to Sales Counter transfers through mounted routes; no real database', () => {
  const body = (status = 'Pending') => ({ fromWarehouse: DRY, toWarehouse: KITCHEN, fromWarehouseName: 'Storage', toWarehouseName: 'Sales Counter', date: '2026-11-04', items: [{ productId: DRINK, productName: 'Bottled Water', qty: 50, cost: 80, subtotal: 4000 }], subtotal: 4000, grandTotal: 4000, status });
  const complete = (id: string) => request('PUT', `/api/transfers/${id}`, body('Completed'));
  const ordered = async () => {
    const received = await createStockPurchase(payload({ items: [{ productId: DRINK, quantity: 200, cost: 80, subTotal: 16000 }], subtotal: 16000, grandTotal: 16000 }), USER);
    expect(state.products[DRINK].warehouse[DRY].productQty).toBe(0);
    await receiveStockPurchase(received._id, USER);
    const created = await request('POST', '/api/transfers', body());
    expect(created.status).toBe(201); expect(created.body.message).toBe('Transfer created — Pending');
    expect(state.products[DRINK].warehouse[DRY].productQty).toBe(200);
    expect(state.products[DRINK].warehouse[KITCHEN]).toBeUndefined();
    const id = created.body.data._id;
    expect((await request('PUT', `/api/transfers/${id}`, body('Approved'))).status).toBe(200);
    return id;
  };
  beforeEach(() => {
    state.warehouses[DRY].name = 'Storage'; state.warehouses[KITCHEN].name = 'Sales Counter';
    Object.assign(state.products[DRINK], { name: 'Bottled Water', category: 'Cold Drinks', status: 'Active', warehouse: { [DRY]: { warehouseName: 'Storage', productQty: 0, productCost: 80, productPrice: 100, stockAlert: 2 } } });
  });
  it('receives 200 bottles, keeps Pending/Approved unchanged, completes 50 using the destination ID and exposes the item in POS', async () => {
    const id = await ordered();
    expect((await request('GET', `/api/pos/catalog?warehouseId=${KITCHEN}`)).body.data.items).toEqual([]);
    expect(state.products[DRINK].warehouse[DRY].productQty).toBe(200);
    const response = await complete(id); expect(response.status).toBe(200);
    const water = state.products[DRINK];
    expect(water.warehouse[DRY].productQty).toBe(150); expect(water.warehouse[KITCHEN]).toMatchObject({ warehouseName: 'Sales Counter', productQty: 50, productPrice: 100, productCost: 80 });
    expect(Object.keys(water.warehouse).sort()).toEqual([DRY, KITCHEN].sort()); expect(water.isSellable).toBe(true); expect(water.status).toBe('Active');
    expect(state.transfers[id].status).toBe('Completed');
    expect((await request('GET', `/api/pos/catalog?warehouseId=${KITCHEN}`)).body.data.items).toEqual([expect.objectContaining({ id: DRINK, price: 100 })]);
    const before = copy(state); expect((await complete(id)).status).toBe(403); expect(state).toEqual(before);
    const ProductModel = jest.requireActual('../models/Product').default; await expect(new ProductModel(water).validate()).resolves.toBeUndefined();
  });
  it('serializes concurrent completion requests; the repeated completion stays read-only', async () => {
    const id = await ordered(); const results = await Promise.all([complete(id), complete(id)]);
    expect(results.map(response => response.status).sort()).toEqual([200, 403]);
    expect(state.products[DRINK].warehouse[DRY].productQty).toBe(150); expect(state.products[DRINK].warehouse[KITCHEN].productQty).toBe(50);
  });
  it.each(['legacy only', 'canonical and legacy', 'two legacy keys'])('rejects %s destination balances with separate review details and no merge or duplicate', async kind => {
    const id = await ordered(), warehouse = state.products[DRINK].warehouse;
    warehouse['Sales Counter'] = { warehouseName: 'Sales Counter', productQty: 7, productPrice: 125, productCost: 80, stockAlert: 2 };
    if (kind === 'canonical and legacy') warehouse[KITCHEN] = { ...warehouse['Sales Counter'], productQty: 3 };
    if (kind === 'two legacy keys') warehouse['sales counter'] = { ...warehouse['Sales Counter'], productQty: 2 };
    const before = copy(state), result = await complete(id);
    expect(result.status).toBe(409); expect(result.body.code).toBe('legacy_warehouse_balance'); expect(result.body.review).toEqual([expect.objectContaining({ productId: DRINK, sku: 'FIX-DRINK', side: 'destination', locationId: KITCHEN, ambiguous: kind !== 'legacy only' })]);
    expect(state).toEqual(before);
  });
  it('does not silently migrate a legacy source balance', async () => {
    const id = await ordered(), warehouse = state.products[DRINK].warehouse;
    warehouse.Storage = warehouse[DRY]; delete warehouse[DRY]; const before = copy(state);
    const result = await complete(id); expect(result.status).toBe(409); expect(result.body.review[0].side).toBe('source'); expect(state).toEqual(before);
  });
  it('preserves an existing counter price and quantity, and the original fallback price for a newly stocked destination', async () => {
    const id = await ordered();
    state.products[DRINK].warehouse[KITCHEN] = { warehouseName: 'Sales Counter', productQty: 10, productPrice: 125, productCost: 75, stockAlert: 5 };
    expect((await complete(id)).status).toBe(200);
    expect(state.products[DRINK].warehouse[KITCHEN]).toMatchObject({ productQty: 60, productPrice: 125, productCost: 75, stockAlert: 5 });
    const next = await request('POST', '/api/transfers', body()); const nextId = next.body.data._id;
    await request('PUT', `/api/transfers/${nextId}`, body('Approved'));
    delete state.products[DRINK].warehouse[KITCHEN]; state.products[DRINK].warehouse[DRY].productPrice = 0;
    expect((await complete(nextId)).status).toBe(200); expect(state.products[DRINK].warehouse[KITCHEN].productPrice).toBe(96);
  });
  it.each(['inactive', 'inventory only'])('does not activate or make %s items sellable', async kind => {
    const id = await ordered(); if (kind === 'inactive') state.products[DRINK].status = 'Inactive'; else state.products[DRINK].isSellable = false;
    const before = copy(state.products[DRINK]); expect((await complete(id)).status).toBe(200);
    expect(state.products[DRINK].status).toBe(before.status); expect(state.products[DRINK].isSellable).toBe(before.isSellable);
    expect((await request('GET', `/api/pos/catalog?warehouseId=${KITCHEN}`)).body.data.items).toEqual([]);
  });
  it.each(['product', 'transfer', 'transactions'])('rolls back stock and completion when %s storage is unavailable', async kind => {
    const id = await ordered(), before = copy(state);
    failProduct = kind === 'product' ? DRINK : ''; failTransferUpdate = kind === 'transfer'; unsupportedTransferTransaction = kind === 'transactions';
    expect((await complete(id)).status).toBe(503); expect(state).toEqual(before);
  });
  it('preserves authentication, the existing admin requirement and Pending → Approved → Completed order', async () => {
    const id = await ordered(); expect((await request('POST', '/api/transfers', body(), false)).status).toBe(401); expect((await request('PUT', `/api/transfers/${id}`, body('Completed'), false)).status).toBe(401);
    legacyRole = 'staff'; expect((await request('POST', '/api/transfers', body())).status).toBe(403); expect((await complete(id)).status).toBe(403);
    legacyRole = 'admin'; state.transfers[id].status = 'Pending'; const before = copy(state); expect((await complete(id)).status).toBe(400); expect(state).toEqual(before);
  });
  it('handles the existing immediate Completed creation path using the same canonical destination and atomic updates', async () => {
    state.products[DRINK].warehouse[DRY].productQty = 200;
    expect((await request('POST', '/api/transfers', body('Completed'))).status).toBe(201);
    expect(state.products[DRINK].warehouse[DRY].productQty).toBe(150); expect(state.products[DRINK].warehouse[KITCHEN].productQty).toBe(50); expect(state.products[DRINK].warehouse['Sales Counter']).toBeUndefined();
  });
});

describe('Warehouse stock receipt fixtures; no real database', () => {
  const post = async (url: string, body: any) => { const response = await request('POST', '/api' + url, body); if (response.status >= 400) throw Object.assign(new Error(response.body.message), { response: { status: response.status } }); return response.body.data; };
  it('creates a first-time supplier and inline inventory item using mounted validation, and orders their exact IDs with zero stock', async () => {
    expect((await request('POST', '/api/suppliers', { name: '' })).status).toBe(400);
    expect((await request('POST', '/api/suppliers', { name: 'Fixture new supplier' }, false)).status).toBe(401);
    const supplier = await post('/suppliers', { name: 'Fixture new supplier', companyName: 'Fictional Foods', mobile: '' });
    expect((await request('POST', '/api/suppliers', { name: 'fixture NEW supplier' })).status).toBe(409);
    const item = await post('/purchases/quick-product', { name: 'First rice bag', code: 'FIXTURE-NEW-RICE', category: 'Ingredients', unit: 'bag(s)', isSellable: false, warehouseId: DRY, productCost: 13000, productPrice: 0 });
    expect(item.isSellable).toBe(false); expect(item.warehouse[DRY].productQty).toBe(0);
    const body = payload({ supplierId: supplier._id, items: [{ productId: item._id, quantity: 10, cost: 13000, subTotal: 130000 }] });
    const storage = draftStorage(); submission.preparePurchase(storage, USER, body, false, { warehouseName: 'Dry Store' });
    const result = await submission.completePurchase(storage, USER, post);
    expect(result.purchase.purchaseStatus).toBe('Ordered'); expect(state.purchases[result.purchase._id].supplierId).toBe(supplier._id); expect(state.purchases[result.purchase._id].items[0].productId).toBe(item._id);
    expect(state.products[item._id].warehouse[DRY].productQty).toBe(0); expect(submission.pendingPurchase(storage, USER)).toBeNull();
  });
  it('Save & Receive keeps the saved order checkpoint after receiving fails, then retries only receipt and adds 10 bags once', async () => {
    const storage = draftStorage(), body = payload(); const paths: string[] = [];
    const send = async (url: string, data: any) => { paths.push(url); return post(url, data); };
    submission.preparePurchase(storage, USER, body, true, { warehouseName: 'Dry Store' }); failProduct = RICE;
    await expect(submission.completePurchase(storage, USER, send)).rejects.toThrow();
    const pending = submission.pendingPurchase(storage, USER); expect(pending.purchase.purchaseStatus).toBe('Ordered');
    expect(Object.keys(state.purchases)).toHaveLength(1); expect(state.products[RICE].warehouse[DRY].productQty).toBe(0);
    expect(() => submission.preparePurchase(storage, USER, payload(), false, {})).toThrow(/awaiting confirmation/);
    failProduct = ''; const recovered = await submission.completePurchase(storage, USER, send);
    expect(paths.filter(url => url === '/purchases')).toHaveLength(1); expect(recovered.purchase.purchaseStatus).toBe('Received');
    expect(Object.keys(state.purchases)).toHaveLength(1); expect(state.products[RICE].warehouse[DRY].productQty).toBe(10);
    expect((await receiveStockPurchase(recovered.purchase._id)).replayed).toBe(true); expect(state.products[RICE].warehouse[DRY].productQty).toBe(10);
  });
  it.each(['creation', 'receipt'])('recovers a lost %s response after reload without another purchase or stock posting', async lost => {
    const storage = draftStorage(); submission.preparePurchase(storage, USER, payload(), true, { warehouseName: 'Dry Store' }); let failed = false;
    const send = async (url: string, data: any) => { const result = await post(url, data); if (!failed && (lost === 'creation' ? url === '/purchases' : url.endsWith('/receive'))) { failed = true; throw new Error('Fixture response lost after commit'); } return result; };
    await expect(submission.completePurchase(storage, USER, send)).rejects.toThrow(/response lost/);
    const persisted = submission.pendingPurchase(storage, USER); expect(persisted).not.toBeNull();
    const result = await submission.completePurchase(storage, USER, send);
    expect(result.purchase.purchaseStatus).toBe('Received'); expect(Object.keys(state.purchases)).toHaveLength(1); expect(state.products[RICE].warehouse[DRY].productQty).toBe(10); expect(writes.filter(kind => kind === 'stock')).toHaveLength(1);
  });
  it('does not send a purchase when durable draft storage is unavailable, and clears a definite create validation failure', async () => {
    const local = draftStorage(); const unavailable = { ...local, setItem: () => { throw new Error('storage unavailable'); } };
    expect(() => submission.preparePurchase(unavailable, USER, payload(), true, {})).toThrow(/storage unavailable/); expect(Object.keys(state.purchases)).toHaveLength(0);
    submission.preparePurchase(local, USER, payload({ supplierId: DRINK }), true, {});
    await expect(submission.completePurchase(local, USER, post)).rejects.toThrow(/Supplier not found/); expect(submission.pendingPurchase(local, USER)).toBeNull(); expect(Object.keys(state.purchases)).toHaveLength(0);
  });
  it.each(['Paid', 'Partial', 'Unpaid'])('Ordered %s adds no on-hand stock and creates no item records', async paymentStatus => {
    const before = copy(state.products); const created = await createStockPurchase(payload({ paymentStatus }), USER);
    expect(created.purchaseStatus).toBe('Ordered'); expect(created.stockReceiptVersion).toBe(1);
    expect(created.items[0].stockUnit).toBe('bag(s)'); expect(state.products).toEqual(before); expect(writes).not.toContain('stock');
  });
  it('receives once into the selected warehouse; replay after consumption cannot replenish stock', async () => {
    const created = await createStockPurchase(payload(), USER);
    const first = await request('POST', `/api/purchases/${created._id}/receive`, { warehouseId: KITCHEN });
    expect(first.status).toBe(200); expect(first.body.replayed).toBe(false);
    expect(state.products[RICE].warehouse[DRY].productQty).toBe(10); expect(state.products[RICE].warehouse[KITCHEN]).toBeUndefined();
    state.products[RICE].warehouse[DRY].productQty = 8;
    const count = writes.filter(value => value === 'stock').length;
    expect((await receiveStockPurchase(created._id)).replayed).toBe(true);
    expect(state.products[RICE].warehouse[DRY].productQty).toBe(8); expect(writes.filter(value => value === 'stock')).toHaveLength(count);
    expect(warehouseStockRows(Object.values(state.products), DRY, 'Dry Store').find(row => row.productId === RICE)).toMatchObject({ quantity: 8, stockUnit: 'bag(s)' });
  });
  it('serializes concurrent receipt requests without a second increment', async () => {
    const created = await createStockPurchase(payload(), USER);
    const results = await Promise.all([receiveStockPurchase(created._id), receiveStockPurchase(created._id)]);
    expect(results.map(value => value.replayed).sort()).toEqual([false, true]); expect(state.products[RICE].warehouse[DRY].productQty).toBe(10);
  });
  it('deduplicates retries of an immediate Received creation and rejects reuse with changed quantities', async () => {
    const body = payload({ purchaseStatus: 'Received', createRequestId: 'fixture-create-request-0001' });
    const first = await createStockPurchase(body, USER), second = await createStockPurchase(body, USER);
    expect(first._id).toBe(second._id); expect(Object.keys(state.purchases)).toHaveLength(1); expect(state.products[RICE].warehouse[DRY].productQty).toBe(10);
    await expect(createStockPurchase({ ...body, items: [{ ...body.items[0], quantity: 11 }] }, USER)).rejects.toThrow(/different data/);
    expect(state.products[RICE].warehouse[DRY].productQty).toBe(10);
  });
  it('requires an idempotency key before an immediate receipt can write anything', async () => {
    const body = payload({ purchaseStatus: 'Received' }); delete body.createRequestId;
    await expect(createStockPurchase(body, USER)).rejects.toThrow(/stable createRequestId/);
    expect(writes).toEqual([]); expect(Object.keys(state.purchases)).toHaveLength(0);
  });
  it('Received Unpaid is a physical receipt; payment status does not establish on-hand stock', async () => {
    const created = await createStockPurchase(payload({ purchaseStatus: 'Received', paymentStatus: 'Unpaid' }), USER);
    expect(created.stockReceivedAt).toBeDefined(); expect(created.paymentStatus).toBe('Unpaid'); expect(state.products[RICE].warehouse[DRY].productQty).toBe(10);
  });
  it('rolls back every stock line and purchase creation on a later storage failure', async () => {
    const before = copy(state); failProduct = DRINK;
    await expect(createStockPurchase(payload({ purchaseStatus: 'Received', items: [...payload().items, { productId: DRINK, quantity: 3, cost: 100, subTotal: 300 }] }), USER)).rejects.toThrow('Fixture storage failure');
    expect(state).toEqual(before);
  });
  it('rejects changed stock units and unsupported variation identities without writing stock', async () => {
    const created = await createStockPurchase(payload(), USER); state.products[RICE].unit = 'kg'; writes.length = 0;
    await expect(receiveStockPurchase(created._id)).rejects.toThrow(/unit changed/); expect(writes).toEqual([]);
    state.products[RICE].ptype = 'Variation'; await expect(createStockPurchase(payload(), USER)).rejects.toThrow(/persisted stock identity/);
  });
  it('does not guess or migrate legacy postings, and never replays an already Received legacy purchase', async () => {
    const created = await createStockPurchase(payload(), USER); delete state.purchases[created._id].stockReceiptVersion; writes.length = 0;
    await expect(receiveStockPurchase(created._id)).rejects.toThrow(/Legacy purchase stock posting is unverified/); expect(writes).toEqual([]);
    state.purchases[created._id].purchaseStatus = 'Received'; expect((await receiveStockPurchase(created._id)).replayed).toBe(true); expect(writes).toEqual([]);
  });
  it('Received metadata edits preserve consumed stock, reject item rewrites, and prevent deletion', async () => {
    const created = await createStockPurchase(payload({ purchaseStatus: 'Received' }), USER); state.products[RICE].warehouse[DRY].productQty = 8; writes.length = 0;
    await editStockPurchase(created._id, payload({ purchaseStatus: 'Received', paymentStatus: 'Partial' }), USER);
    expect(state.products[RICE].warehouse[DRY].productQty).toBe(8); expect(writes).not.toContain('stock');
    await expect(editStockPurchase(created._id, payload({ purchaseStatus: 'Received', items: [{ productId: RICE, quantity: 11, cost: 13000, subTotal: 143000 }] }), USER)).rejects.toThrow(/quantities and warehouse are locked/);
    await expect(deleteUnreceivedPurchase(created._id)).rejects.toThrow(/cannot be deleted/);
  });
  it('warehouse details include inventory-only and stocked sellable goods with real zero values', async () => {
    const result = await request('GET', `/api/warehouses/${DRY}/stock`);
    expect(result.status).toBe(200); expect(result.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: RICE, quantity: 0, isSellable: false }), expect.objectContaining({ productId: DRINK, quantity: 2, isSellable: true })
    ]));
    expect((await request('GET', `/api/warehouses/${KITCHEN}/stock`)).body.data.items).toEqual([]);
  });
  it('quick item creation requires classification and unit, starts at zero, and retains the same ID for purchases', async () => {
    const base = { name: 'Brand-new ingredient', code: 'NEW-INGREDIENT', category: 'Ingredients', unit: 'bag(s)', warehouseId: DRY, productCost: 13000, productPrice: 0 };
    expect((await request('POST', '/api/purchases/quick-product', base)).status).toBe(400);
    const result = await request('POST', '/api/purchases/quick-product', { ...base, isSellable: false });
    expect(result.status).toBe(201); const row = result.body.data;
    expect(row.isSellable).toBe(false); expect(row.unit).toBe('bag(s)'); expect(row.warehouse[DRY].productQty).toBe(0);
    const keys = Object.keys(state.products); const created = await createStockPurchase(payload({ items: [{ productId: row._id, quantity: 10, cost: 13000, subTotal: 130000 }] }), USER);
    expect(created.items[0].productId).toBe(row._id); expect(Object.keys(state.products)).toEqual(keys);
  });
  it('actual mounted receipt, stock-read and quick-create routes enforce authentication and canonical grants', async () => {
    expect((await request('POST', `/api/purchases/${USER}/receive`, {}, false)).status).toBe(401);
    expect((await request('GET', `/api/warehouses/${DRY}/stock`, undefined, false)).status).toBe(401);
    granted = false;
    expect((await request('POST', '/api/purchases', payload())).status).toBe(403);
    expect((await request('POST', `/api/purchases/${USER}/receive`, {})).status).toBe(403);
    expect((await request('POST', '/api/purchases/quick-product', {})).status).toBe(403);
    expect((await request('GET', `/api/warehouses/${DRY}/stock`)).status).toBe(403);
    expect(writes).toEqual([]);
  });
});
