import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import mongoose from 'mongoose';
import postRoutes from './postRoutes';
import getRoutes from './getRoutes';
import { checkoutCashSale, checkoutReceipt } from '../services/posCheckout';

const USER = '1'.repeat(24), ROLE = '2'.repeat(24), SESSION = '3'.repeat(24);
const SELECTED = '4'.repeat(24), OTHER = '5'.repeat(24), CUSTOMER = '6'.repeat(24);
const DISH = '7'.repeat(24), PACKAGED = '8'.repeat(24), RICE = '9'.repeat(24), OIL = 'a'.repeat(24);
let state: any, permitted = true, failMovement = false, unsupported = false, lostAcknowledgement = false, retryTransaction = false;
const writes: Array<{ kind: string; session: unknown }> = [];
const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
function query(read: () => any) {
  const q = { select: () => q, populate: () => q, session: () => q, lean: async () => copy(read()),
    then: (resolve, reject) => Promise.resolve(copy(read())).then(resolve, reject) };
  return q;
}
const readPath = (object: any, path: string) => path.split('.').reduce((value, part) => value?.[part], object);
function increment(object: any, path: string, delta: number) {
  const parts = path.split('.'), leaf = parts.pop()!;
  const parent = parts.reduce((value, part) => value[part], object); parent[leaf] = (parent[leaf] ?? 0) + delta;
}
function write(kind: string, options: any) {
  writes.push({ kind, session: options?.session });
  if (!options?.session) throw new Error(`${kind} escaped the checkout transaction`);
}

jest.mock('../models/Sale', () => ({ __esModule: true, default: {
  findById: (id: unknown) => query(() => state.sales[String(id)] ?? null),
  create: async (documents: any[], options: unknown) => {
    write('sale', options);
    return documents.map(document => {
      if (state.sales[String(document._id)]) throw Object.assign(new Error('duplicate'), { code: 11000 });
      const saved = copy(document); state.sales[String(document._id)] = saved; return copy(saved);
    });
  },
  findByIdAndUpdate: async (id: unknown, values: unknown, options: unknown) => {
    write('sale flags', options); Object.assign(state.sales[String(id)], values);
  },
  aggregate: async (pipeline: any[]) => {
    const match = pipeline[0].$match;
    const rows = Object.values(state.sales).filter((sale: any) => !match.posSessionId || sale.posSessionId === String(match.posSessionId)) as any[];
    if (pipeline[1].$group.todayTotalSales) return [{ todayTotalSales: rows.reduce((sum, sale) => sum + sale.total, 0) }];
    return [{ userSales: rows.reduce((sum, sale) => sum + sale.total, 0), cashPayments: rows.reduce((sum, sale) => sum + sale.cashAmount, 0),
      cardPayments: rows.reduce((sum, sale) => sum + sale.cardAmount, 0), bankTransferPayments: rows.reduce((sum, sale) => sum + sale.bankTransferAmount, 0), totalDiscount: 0 }];
  }
} }));
jest.mock('../models/Product', () => ({ __esModule: true, default: {
  findById: (id: string) => query(() => state.products[id] ?? null),
  findOneAndUpdate: async (filter: any, update: any, options: any) => {
    write('product stock', options);
    const product = state.products[String(filter._id)];
    for (const [rawPath, delta] of Object.entries(update.$inc) as Array<[string, number]>) {
      const batchNumber = options.arrayFilters?.[0]?.['batch.batchNumber'];
      const index = product.warehouse[SELECTED].batches?.findIndex((batch: any) => batch.batchNumber === batchNumber);
      const path = rawPath.replace('$[batch]', String(index));
      if (readPath(product, path) < -delta) return null;
      increment(product, path, delta);
    }
    return copy(product);
  }
} }));
jest.mock('../models/PosSession', () => ({ __esModule: true, default: {
  findById: () => query(() => state.register),
  findOneAndUpdate: async (filter: any, update: any, options: unknown) => {
    write('register lock', options);
    if (!state.register || state.register._id !== filter._id || state.register.userId !== filter.userId || state.register.status !== filter.status) return null;
    state.register.checkoutRevision += update.$inc.checkoutRevision; return copy(state.register);
  }
} }));
jest.mock('../models/Warehouse', () => ({ __esModule: true, default: { findOne: (filter: any) => query(() => state.warehouses.find((warehouse: any) => warehouse._id === filter._id && warehouse.isActive)) } }));
jest.mock('../models/Customer', () => ({ __esModule: true, default: { findOne: () => query(() => ({ _id: CUSTOMER })), findById: (id: string) => query(() => id === CUSTOMER ? { _id: CUSTOMER } : null) } }));
jest.mock('../models/DailyOrderCounter', () => ({ __esModule: true, default: { findOneAndUpdate: async (_filter: unknown, _update: unknown, options: unknown) => {
  write('invoice counter', options); return { seq: ++state.sequence };
} } }));
jest.mock('../models/KitchenRecipe', () => ({ __esModule: true, default: { findOne: (filter: any) => query(() => state.recipes.find((recipe: any) => recipe.productId === filter.productId && (filter.variationName ? recipe.variationName === filter.variationName : !recipe.variationName)) ?? null) } }));
jest.mock('../models/KitchenInventoryProduct', () => ({ __esModule: true, default: {
  find: (filter: any) => query(() => filter._id.$in.map((id: unknown) => state.ingredients[String(id)]).filter(Boolean)),
  findById: (id: string) => query(() => state.ingredients[id] ?? null),
  findOneAndUpdate: async (filter: any, update: any, options: unknown) => {
    write('ingredient stock', options); const ingredient = state.ingredients[filter._id];
    if (!ingredient || ingredient.currentStock < filter.currentStock.$gte) return null;
    ingredient.currentStock += update.$inc.currentStock; return copy(ingredient);
  }
} }));
jest.mock('../models/KitchenStockMovement', () => ({ __esModule: true, default: {
  findOne: (filter: any) => query(() => state.movements.find((movement: any) => movement.saleId === String(filter.saleId)) ?? null),
  create: async (documents: any[], options: unknown) => {
    write('ingredient movement', options); state.movements.push(...copy(documents));
    if (failMovement) throw new Error('Mock movement storage failed'); return documents;
  }
} }));
jest.mock('../models/Unit', () => ({ __esModule: true, default: { findOne: (filter: any) => query(() => ({ _id: filter.shortName.$regex.test('kg') ? 'kg-unit' : 'g-unit' })) } }));
jest.mock('../models/KitchenUnitConversion', () => ({ __esModule: true, default: { findOne: () => query(() => ({ factor: 0.001 })) } }));
jest.mock('../models/SpecialOffer', () => ({ __esModule: true, default: { findById: () => query(() => state.offer) } }));
jest.mock('../models/User', () => ({ __esModule: true, default: { findById: () => query(() => ({ _id: USER, isActive: true, roleId: ROLE })) } }));
jest.mock('../models/Role', () => ({ __esModule: true, default: { findById: () => query(() => ({ _id: ROLE, isActive: true, permissions: [{ component: 'managePOS', actions: { create_sale: permitted, view_cashier_report: true } }] })) } }));
jest.mock('jsonwebtoken', () => ({ __esModule: true, default: { verify: () => ({ id: USER }) } }));
jest.mock('../utils/email', () => ({ sendEmail: () => { throw new Error('Email forbidden in checkout fixtures'); } }));

let transactionQueue = Promise.resolve();
beforeEach(() => {
  permitted = true; failMovement = false; unsupported = false; lostAcknowledgement = false; retryTransaction = false; writes.length = 0;
  state = { sales: {}, sequence: 0, movements: [], offer: null,
    register: { _id: SESSION, userId: USER, status: 'OPEN', username: 'Fictional cashier', openingCash: 20, checkoutRevision: 0 },
    warehouses: [{ _id: OTHER, isActive: true }, { _id: SELECTED, isActive: true }],
    products: {
      [DISH]: { _id: DISH, name: 'Rice bowl', status: 'Active', isInventory: false,
        warehouse: { [OTHER]: { productPrice: 99, productCost: 4 }, [SELECTED]: { productPrice: 9.5, productCost: 4 } } },
      [PACKAGED]: { _id: PACKAGED, name: 'Bottled water', status: 'Active', isInventory: true,
        warehouse: { [OTHER]: { productPrice: 99, productCost: 1, productQty: 50 }, [SELECTED]: { productPrice: 9.5, productCost: 1, productQty: 5 } } }
    },
    recipes: [{ productId: DISH, variationName: null, ingredients: [{ kitchenProductId: RICE, quantity: 150, unit: 'g' }, { kitchenProductId: OIL, quantity: 10, unit: 'ml' }] }],
    ingredients: { [RICE]: { _id: RICE, name: 'Rice', unitId: { shortName: 'kg' }, currentStock: 10 }, [OIL]: { _id: OIL, name: 'Oil', unitId: { shortName: 'ml' }, currentStock: 1000 } }
  };
  jest.spyOn(mongoose, 'startSession').mockImplementation(async () => {
    const session = { endSession: jest.fn(), withTransaction: async (callback: () => Promise<void>) => {
      if (unsupported) throw Object.assign(new Error('Transaction unsupported'), { code: 20 });
      let release: () => void; const previous = transactionQueue;
      transactionQueue = new Promise<void>(resolve => { release = resolve; }); await previous;
      const snapshot = copy(state);
      try {
        await callback();
        if (retryTransaction) { state = copy(snapshot); retryTransaction = false; await callback(); }
      } catch (error) { state = snapshot; throw error; }
      finally { release!(); }
      if (lostAcknowledgement) { lostAcknowledgement = false; throw new Error('Commit acknowledgement lost'); }
    } };
    return session as unknown as mongoose.ClientSession;
  });
});
afterEach(() => jest.restoreAllMocks());
const payload = (extra: Record<string, unknown> = {}) => ({ sessionId: SESSION, warehouseId: SELECTED,
  checkoutRequestId: 'fixture-checkout-0001', items: [{ id: DISH, name: 'Forged name', price: 0.01, qty: 1 }],
  payments: [{ type: 'cash', amount: 10 }], ...extra });
const app = express(); app.use('/api', postRoutes); app.use('/api', getRoutes);
function request(method: string, url: string, body?: unknown, authenticated = true): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), { method, url, body, headers: { host: 'checkout.test', ...(authenticated ? { authorization: 'Bearer fixture-only-cashier' } : {}) } });
    const res = new ServerResponse(req);
    jest.spyOn(res, 'end').mockImplementation((chunk: unknown) => {
      try { resolve({ status: res.statusCode, body: JSON.parse(String(chunk)) }); } catch (error) { reject(error); }
      socket.destroy(); return res;
    }); app(req, res);
  });
}

describe('POS cash checkout through mounted permissions, recipe stock and register report', () => {
  it('uses selected warehouse and server price, shows 0.50 change, consumes recipe units and registers only 9.50', async () => {
    const response = await request('POST', '/api/pos/sale', payload());
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ warehouseId: SELECTED, total: 9.5, paid: 10, change: 0.5, due: 0,
      items: [{ name: 'Rice bowl', quantity: 1, price: 9.5 }] });
    const saved: any = Object.values(state.sales)[0];
    expect(saved).toMatchObject({ cashAmount: 9.5, cashTendered: 10, changeAmount: 0.5, balance: 0, paymentStatus: 'paid',
      payments: [{ paymentType: 'cash', amount: 9.5 }] });
    expect(state.ingredients[RICE].currentStock).toBeCloseTo(9.85); expect(state.ingredients[OIL].currentStock).toBe(990);
    expect(state.movements).toHaveLength(2); expect(state.movements[0]).toMatchObject({ type: 'out', source: 'sale', saleId: saved._id, quantity: 0.15 });
    expect(saved.mainStockDeductionAppliedAt).toBeDefined(); expect(saved.kitchenDeductionAppliedAt).toBeDefined();
    const SaleModel = jest.requireActual('../models/Sale').default;
    await expect(new SaleModel(saved).validate()).resolves.toBeUndefined();
    expect(writes.every(write => write.session)).toBe(true);
    const report = await request('GET', `/api/pos/report/${SESSION}`);
    expect(report.status).toBe(200); expect(report.body.data).toMatchObject({ cashPayments: 9.5, userSales: 9.5, openingCash: 20 });
  });
  it('deducts packaged inventory only from the selected warehouse', async () => {
    await checkoutCashSale(payload({ items: [{ id: PACKAGED, price: 0, qty: 1 }] }), USER);
    expect(state.products[PACKAGED].warehouse[SELECTED].productQty).toBe(4);
    expect(state.products[PACKAGED].warehouse[OTHER].productQty).toBe(50); expect(state.movements).toHaveLength(0);
  });
  it('retries a completed checkout after register closure without a second sale, counter increment or stock deduction', async () => {
    const first = await request('POST', '/api/pos/sale', payload());
    state.register.status = 'CLOSED';
    const second = await request('POST', '/api/pos/sale', payload());
    expect(second.status).toBe(200); expect(second.body.replayed).toBe(true); expect(second.body.data).toEqual(first.body.data);
    expect(Object.keys(state.sales)).toHaveLength(1); expect(state.sequence).toBe(1); expect(state.movements).toHaveLength(2);
    expect(state.ingredients[RICE].currentStock).toBeCloseTo(9.85);
  });
  it('handles simultaneous copies of the same request and a transaction callback retry once', async () => {
    retryTransaction = true;
    const results = await Promise.all([checkoutCashSale(payload(), USER), checkoutCashSale(payload(), USER)]);
    expect(results.filter(result => !result.replayed)).toHaveLength(1);
    expect(Object.keys(state.sales)).toHaveLength(1); expect(state.sequence).toBe(1); expect(state.movements).toHaveLength(2);
    expect(state.ingredients[OIL].currentStock).toBe(990);
  });
  it('recovers a lost commit acknowledgement with the persisted original receipt', async () => {
    lostAcknowledgement = true;
    const result = await checkoutCashSale(payload(), USER);
    expect(result.replayed).toBe(true); expect(checkoutReceipt(result.sale).change).toBe(0.5);
    await checkoutCashSale(payload(), USER); expect(state.movements).toHaveLength(2);
  });
  it('rejects a changed checkout under the same key', async () => {
    await checkoutCashSale(payload(), USER);
    const result = await request('POST', '/api/pos/sale', payload({ payments: [{ type: 'cash', amount: 20 }] }));
    expect(result.status).toBe(409); expect(Object.keys(state.sales)).toHaveLength(1);
  });
  it.each([
    ['missing warehouse', { warehouseId: undefined }], ['invalid warehouse', { warehouseId: OTHER + 'x' }],
    ['missing retry ID', { checkoutRequestId: undefined }], ['zero quantity', { items: [{ id: DISH, qty: 0 }] }],
    ['negative tender', { payments: [{ type: 'cash', amount: -10 }] }], ['underpayment', { payments: [{ type: 'cash', amount: 1 }] }],
    ['non-cash overpayment', { payments: [{ type: 'card', amount: 10 }] }]
  ])('rejects %s with no sale or stock changes', async (_label, invalid) => {
    const response = await request('POST', '/api/pos/sale', payload(invalid));
    expect(response.status).toBe(400); expect(Object.keys(state.sales)).toHaveLength(0);
    expect(state.ingredients[RICE].currentStock).toBe(10); expect(state.sequence).toBe(0);
  });
  it('rejects unavailable warehouses and products rather than switching warehouses', async () => {
    state.warehouses[1].isActive = false;
    expect((await request('POST', '/api/pos/sale', payload())).status).toBe(400);
    state.warehouses[1].isActive = true; delete state.products[DISH].warehouse[SELECTED];
    expect((await request('POST', '/api/pos/sale', payload())).status).toBe(400);
    expect(Object.keys(state.sales)).toHaveLength(0);
  });
  it('rolls back a mixed packaged/prepared cart on insufficient ingredients, missing recipes or storage failure', async () => {
    const mixed = payload({ items: [{ id: PACKAGED, qty: 1 }, { id: DISH, qty: 1 }], payments: [{ type: 'cash', amount: 20 }] });
    state.ingredients[OIL].currentStock = 0;
    expect((await request('POST', '/api/pos/sale', mixed)).status).toBe(400);
    expect(state.ingredients[RICE].currentStock).toBe(10); expect(state.products[PACKAGED].warehouse[SELECTED].productQty).toBe(5);
    state.ingredients[OIL].currentStock = 1000; state.recipes = [];
    expect((await request('POST', '/api/pos/sale', mixed)).status).toBe(400);
    state.recipes = [{ productId: DISH, ingredients: [{ kitchenProductId: RICE, quantity: 150, unit: 'g' }] }]; failMovement = true;
    expect((await request('POST', '/api/pos/sale', mixed)).status).toBe(500);
    expect(Object.keys(state.sales)).toHaveLength(0); expect(state.movements).toHaveLength(0); expect(state.sequence).toBe(0);
    expect(state.products[PACKAGED].warehouse[SELECTED].productQty).toBe(5); expect(state.ingredients[RICE].currentStock).toBe(10);
    failMovement = false;
    expect((await request('POST', '/api/pos/sale', mixed)).status).toBe(201);
    expect(Object.keys(state.sales)).toHaveLength(1); expect(state.products[PACKAGED].warehouse[SELECTED].productQty).toBe(4);
    expect(state.movements).toHaveLength(1); expect(state.ingredients[RICE].currentStock).toBeCloseTo(9.85);
  });
  it('uses server variation/batch identities for packaged stock and rejects a missing price', async () => {
    const wh = state.products[PACKAGED].warehouse[SELECTED];
    delete wh.productPrice; delete wh.productQty;
    wh.batches = [{ batchNumber: 'B-1', variationValues: { 'Size=Large': { productPrice: 9.5, productCost: 1, productQty: 3 } } }];
    const response = await request('POST', '/api/pos/sale', payload({ items: [{ id: PACKAGED, variation: 'Size=Large', qty: 1, price: 999 }] }));
    expect(response.status).toBe(201); expect(response.body.data.total).toBe(9.5);
    expect(wh.batches[0].variationValues['Size=Large'].productQty).toBe(2);
    const saved: any = Object.values(state.sales)[0]; expect(saved.products[0].batch).toBe('B-1');
    delete state.products[DISH].warehouse[SELECTED].productPrice;
    expect((await request('POST', '/api/pos/sale', payload({ checkoutRequestId: 'fixture-checkout-0002' }))).status).toBe(400);
    expect(Object.keys(state.sales)).toHaveLength(1);
  });
  it('uses variation prices and variation recipes, multiplies recipe quantities, and preserves a genuine zero price', async () => {
    state.products[DISH].warehouse[SELECTED].variationValues = { 'Size=Large': { productPrice: 0, productCost: 2 } };
    state.recipes.push({ productId: DISH, variationName: 'Size=Large', ingredients: [{ kitchenProductId: RICE, quantity: 200, unit: 'g' }] });
    expect((await request('POST', '/api/pos/sale', payload())).status).toBe(400);
    const response = await request('POST', '/api/pos/sale', payload({ items: [{ id: DISH, variation: 'Size=Large', qty: 2, price: 99 }] }));
    expect(response.status).toBe(201); expect(response.body.data).toMatchObject({ total: 0, paid: 10, change: 10 });
    expect(state.ingredients[RICE].currentStock).toBeCloseTo(9.6); expect(state.ingredients[OIL].currentStock).toBe(1000);
  });
  it('keeps split-payment change out of register cash and uses saved offer values', async () => {
    state.offer = { percentage: 10, status: 'Active' };
    const result = await checkoutCashSale(payload({ specialOfferId: 'b'.repeat(24), specialOfferDiscount: 999,
      payments: [{ type: 'cash', amount: 5 }, { type: 'card', amount: 5 }] }), USER);
    expect(result.sale).toMatchObject({ total: 8.55, cashAmount: 3.55, cardAmount: 5, changeAmount: 1.45, specialOfferDiscount: 0.95 });
    expect(checkoutReceipt(result.sale)).toMatchObject({ total: 8.55, paid: 10, change: 1.45 });
  });
  it('fails closed without transaction support and preserves mounted authentication/permissions', async () => {
    expect((await request('POST', '/api/pos/sale', payload(), false)).status).toBe(401);
    permitted = false; expect((await request('POST', '/api/pos/sale', payload())).status).toBe(403);
    permitted = true; unsupported = true;
    expect((await request('POST', '/api/pos/sale', payload())).status).toBe(503);
    expect(Object.keys(state.sales)).toHaveLength(0); expect(writes).toHaveLength(0);
  });
});
