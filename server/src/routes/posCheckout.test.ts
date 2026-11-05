import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import mongoose from 'mongoose';
import postRoutes from './postRoutes';
import getRoutes from './getRoutes';
import putRoutes from './putRoutes';
import { checkoutCashSale, checkoutReceipt } from '../services/posCheckout';
import { postKitchenIssue, previewKitchenIssue, saveKitchenIssueConversion } from '../services/kitchenIssue';

const USER = '1'.repeat(24), ROLE = '2'.repeat(24), SESSION = '3'.repeat(24);
const SELECTED = '4'.repeat(24), OTHER = '5'.repeat(24), CUSTOMER = '6'.repeat(24);
const DISH = '7'.repeat(24), PACKAGED = '8'.repeat(24), RICE = '9'.repeat(24), OIL = 'a'.repeat(24);
const RAW = 'c'.repeat(24), BAG_UNIT = 'd'.repeat(24), G_UNIT = 'e'.repeat(24), ML_UNIT = 'b'.repeat(24);
let warehousePermission = true, kitchenPermission = true, failAudit = false, failIncoming = false;
let dishCreateGranted = true, failRecipeSave = false;
let state: any, permitted = true, failMovement = false, unsupported = false, lostAcknowledgement = false, retryTransaction = false;
const writes: Array<{ kind: string; session: unknown }> = [];
const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
function query(read: () => any, hydrate?: (value: any) => any) {
  const q = { select: () => q, populate: () => q, session: () => q, sort: () => q, limit: () => q, lean: async () => copy(read()),
    then: (resolve, reject) => Promise.resolve(hydrate ? hydrate(copy(read())) : copy(read())).then(resolve, reject) };
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
  findById: (id: string) => query(() => state.products[String(id)] ?? null, value => value ? { ...value, toObject: () => copy(value) } : null),
  find: () => query(() => Object.values(state.products)),
  findOne: (filter: any) => query(() => Object.values(state.products).find((product: any) => (!filter._id?.$ne || product._id !== filter._id.$ne) && (!filter.name || filter.name.test(product.name))) ?? null),
  create: async (body: any) => {
    const id = String(body._id);
    if (state.products[id] || Object.values(state.products).some((product: any) => product.code === body.code)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    state.products[id] = copy(body); return { ...copy(body), toObject: () => copy(body) };
  },
  findByIdAndUpdate: async (id: string, body: any) => { Object.assign(state.products[id], copy(body)); return { ...copy(state.products[id]), toObject: () => copy(state.products[id]) }; },
  updateOne: async (filter: any, update: any, options: any) => {
    write('issue warehouse stock', options); const product = state.products[String(filter._id)];
    if (!product || Object.entries(filter).some(([path, condition]: [string, any]) => path !== '_id' && readPath(product, path) < condition.$gte)) return { matchedCount: 0 };
    for (const [path, delta] of Object.entries(update.$inc) as Array<[string, number]>) increment(product, path, delta);
    return { matchedCount: 1 };
  },
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
jest.mock('../models/Warehouse', () => ({ __esModule: true, default: {
  findById: (id: string) => query(() => state.warehouses.find((warehouse: any) => warehouse._id === id)),
  findOne: (filter: any) => query(() => state.warehouses.find((warehouse: any) => warehouse._id === filter._id && warehouse.isActive))
} }));
jest.mock('../models/Customer', () => ({ __esModule: true, default: {
  findOne: () => query(() => Object.values(state.customers)[0] || null),
  findById: (id: string) => query(() => state.customers[id] || null)
} }));
jest.mock('../models/DailyOrderCounter', () => ({ __esModule: true, default: { findOneAndUpdate: async (_filter: unknown, _update: unknown, options: unknown) => {
  write('invoice counter', options); return { seq: ++state.sequence };
} } }));
jest.mock('../models/KitchenRecipe', () => ({ __esModule: true, default: {
  findOne: (filter: any) => query(() => state.recipes.find((recipe: any) => String(recipe.productId) === String(filter.productId) && (filter.variationName ? recipe.variationName === filter.variationName : !recipe.variationName)) ?? null),
  findOneAndUpdate: async (filter: any, update: any) => {
    if (failRecipeSave) throw new Error('Fixture recipe storage unavailable');
    let row = state.recipes.find((recipe: any) => String(recipe.productId) === String(filter.productId) && !recipe.variationName);
    if (!row) { row = copy(update.$setOnInsert); state.recipes.push(row); } Object.assign(row, copy(update.$set)); return row;
  }
} }));
jest.mock('../models/Category', () => ({ __esModule: true, default: { find: () => query(() => [{ _id: RAW, category: 'Hot Meals' }]), findOne: (filter: any) => query(() => filter.category === 'Hot Meals' ? { _id: RAW, category: 'Hot Meals' } : null) } }));
jest.mock('../models/Brand', () => ({ __esModule: true, default: { find: () => query(() => []) } }));
jest.mock('../services/logActivity', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../models/KitchenInventoryProduct', () => ({ __esModule: true, default: {
  find: (filter: any) => query(() => filter._id ? filter._id.$in.map((id: unknown) => state.ingredients[String(id)]).filter(Boolean) : Object.values(state.ingredients).filter((item: any) => !item.inventoryProductId || item.inventoryProductId === filter.$or[0].inventoryProductId)),
  findById: (id: string) => query(() => state.ingredients[id] ?? null),
  updateOne: async (filter: any, update: any, options: any) => {
    write('issue ingredient stock or conversion', options);
    if (failIncoming) throw new Error('Fixture incoming failure');
    const ingredient = state.ingredients[String(filter._id)];
    const id = (value: any) => String(value?._id ?? value);
    if (!ingredient || Object.entries(filter).some(([path, condition]: [string, any]) => {
      if (path === '_id') return false;
      const value = readPath(ingredient, path);
      if (condition?.$gte !== undefined) return !(value >= condition.$gte);
      if (condition?.$exists !== undefined) return (value !== undefined) !== condition.$exists;
      if (condition === null) return value != null;
      return id(value) !== id(condition);
    })) return { matchedCount: 0 };
    Object.assign(ingredient, copy(update.$set || {}));
    if (update.$inc) ingredient.currentStock += update.$inc.currentStock;
    return { matchedCount: 1 };
  },
  findOneAndUpdate: async (filter: any, update: any, options: unknown) => {
    write('ingredient stock', options); const ingredient = state.ingredients[filter._id];
    if (!ingredient || ingredient.currentStock < filter.currentStock.$gte) return null;
    ingredient.currentStock += update.$inc.currentStock; return copy(ingredient);
  }
} }));
jest.mock('../models/KitchenStockMovement', () => ({ __esModule: true, default: {
  findById: (id: string) => query(() => state.movements.find((movement: any) => String(movement._id) === id) ?? null),
  find: (filter: any) => query(() => state.movements.filter((movement: any) => Object.entries(filter).every(([path, value]) => readPath(movement, path) === value))),
  findOne: (filter: any) => query(() => state.movements.find((movement: any) => movement.saleId === String(filter.saleId)) ?? null),
  create: async (documents: any[], options: unknown) => {
    write('ingredient movement', options);
    if (documents.some(document => document._id && state.movements.some((existing: any) => existing._id === document._id))) throw Object.assign(new Error('duplicate'), { code: 11000 });
    state.movements.push(...copy(documents));
    if (failMovement) throw new Error('Mock movement storage failed'); return documents.map(document => ({ ...document, toObject: () => copy(document) }));
  }
} }));
jest.mock('../models/Unit', () => ({ __esModule: true, default: {
  find: () => query(() => Object.values(state.units || {})),
  findById: (id: string) => query(() => state.units?.[id] ?? null),
  findOne: (filter: any) => query(() => filter.unitName ? Object.values(state.units || {}).find((unit: any) => unit.unitName === filter.unitName) || null : ({ _id: filter.shortName.$regex.test('kg') ? 'kg-unit' : 'g-unit' }))
} }));
jest.mock('../models/ActivityLog', () => ({ __esModule: true, default: { create: async (documents: any[], options: any) => {
  write('issue audit', options); if (failAudit) throw new Error('Fixture audit failure'); state.audits = [...(state.audits || []), ...copy(documents)]; return documents;
} } }));
jest.mock('../models/KitchenUnitConversion', () => ({ __esModule: true, default: { findOne: () => query(() => ({ factor: 0.001 })) } }));
jest.mock('../models/SpecialOffer', () => ({ __esModule: true, default: { findById: () => query(() => state.offer) } }));
jest.mock('../models/User', () => ({ __esModule: true, default: { findById: () => query(() => ({ _id: USER, isActive: true, roleId: ROLE })) } }));
jest.mock('../models/Role', () => ({ __esModule: true, default: { findById: () => query(() => ({ _id: ROLE, isActive: true, permissions: [
  { component: 'managePOS', actions: { create_sale: permitted, view_cashier_report: true, view_pos: true } },
  { component: 'manageProducts', actions: { create: dishCreateGranted, read: true, update: warehousePermission } },
  { component: 'manageKitchen', actions: { view_recipe: true, create_recipe: kitchenPermission, view_kitchen_inventory: true, edit_kitchen_inventory: kitchenPermission } }
] })) } }));
jest.mock('jsonwebtoken', () => ({ __esModule: true, default: { verify: () => ({ id: USER }) } }));
jest.mock('../utils/email', () => ({ sendEmail: () => { throw new Error('Email forbidden in checkout fixtures'); } }));

let transactionQueue = Promise.resolve();
beforeEach(() => {
  permitted = true; failMovement = false; unsupported = false; lostAcknowledgement = false; retryTransaction = false; writes.length = 0;
  warehousePermission = true; kitchenPermission = true; failAudit = false; failIncoming = false;
  dishCreateGranted = true; failRecipeSave = false;
  state = { sales: {}, customers: { [CUSTOMER]: { _id: CUSTOMER, name: 'Fixture named customer' } }, sequence: 0, movements: [], offer: null,
    register: { _id: SESSION, userId: USER, status: 'OPEN', username: 'Fictional cashier', openingCash: 20, checkoutRevision: 0 },
    warehouses: [{ _id: OTHER, name: 'Main Kitchen', isActive: true }, { _id: SELECTED, name: 'Dry Store', isActive: true }],
    products: {
      [DISH]: { _id: DISH, name: 'Rice bowl', status: 'Active', isInventory: false, isSellable: true,
        warehouse: { [OTHER]: { productPrice: 99, productCost: 4 }, [SELECTED]: { productPrice: 9.5, productCost: 4 } } },
      [PACKAGED]: { _id: PACKAGED, name: 'Bottled water', status: 'Active', isInventory: true, isSellable: true,
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
function riceIssueFixture() {
  state.products[RAW] = { _id: RAW, name: 'Raw rice — 50 kg bag', code: 'FIXTURE-RICE-BAG', ptype: 'Single', unit: 'bag(s)', isInventory: true, isSellable: false,
    warehouse: { [SELECTED]: { warehouseName: 'Dry Store', productQty: 10 }, [OTHER]: { warehouseName: 'Main Kitchen', productQty: 3 } } };
  state.units = { [BAG_UNIT]: { _id: BAG_UNIT, unitName: 'Bag', shortName: 'bag(s)' }, [G_UNIT]: { _id: G_UNIT, unitName: 'Grams', shortName: 'g' }, [ML_UNIT]: { _id: ML_UNIT, unitName: 'Millilitres', shortName: 'ml' } };
  state.ingredients[RICE] = { _id: RICE, name: 'Recipe rice', unitId: { _id: G_UNIT, shortName: 'g' }, inventoryProductId: RAW, currentStock: 0 };
  state.ingredients[OIL].unitId = { _id: ML_UNIT, shortName: 'ml' };
  state.recipes[0].ingredients = [{ kitchenProductId: RICE, quantity: 150, unit: 'g' }];
}
const conversion = (extra: Record<string, unknown> = {}) => ({ warehouseId: SELECTED, kitchenProductId: RICE, sourceUnitId: BAG_UNIT, warehouseQuantity: 1, kitchenQuantity: 50000, expectedRevision: 0, ...extra });
const issue = (extra: Record<string, unknown> = {}) => ({ productId: RAW, kitchenProductId: RICE, quantity: 1, conversionRevision: 1, requestId: 'fixture-kitchen-issue-0001', ...extra });
const payload = (extra: Record<string, unknown> = {}) => ({ sessionId: SESSION, warehouseId: SELECTED,
  checkoutRequestId: 'fixture-checkout-0001', items: [{ id: DISH, name: 'Forged name', price: 0.01, qty: 1 }],
  payments: [{ type: 'cash', amount: 10 }], ...extra });
const app = express(); app.use(express.json()); app.use('/api', postRoutes); app.use('/api', getRoutes); app.use('/api', putRoutes);
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

describe('Saved kitchen tickets through the actual POS checkout and saved-sale routes', () => {
  beforeEach(() => {
    state.products[DISH].name = 'Fried Rice';
    state.products[DISH].warehouse[SELECTED].productPrice = 500;
    state.products[PACKAGED].warehouse[SELECTED].productPrice = 100;
    state.ingredients[RICE] = { _id: RICE, name: 'Rice', unitId: { shortName: 'g' }, currentStock: 1000 };
    state.recipes[0].ingredients = [{ kitchenProductId: RICE, quantity: 150, unit: 'g' }];
  });
  const mixed = () => payload({ items: [{ id: DISH, qty: 2, isPrepared: false }, { id: PACKAGED, qty: 1, isPrepared: true }], payments: [{ type: 'cash', amount: 1100 }] });
  it('receipts both items, tickets 2 Fried Rice, and reprints/retries without another sale or deduction', async () => {
    const checkout = await request('POST', '/api/pos/sale', mixed());
    expect(checkout.status).toBe(201);
    expect(checkout.body.data.items).toEqual([{ name: 'Fried Rice', quantity: 2, price: 500 }, { name: 'Bottled water', quantity: 1, price: 100 }]);
    const ticket = checkout.body.data.kitchenTicket;
    expect(ticket).toMatchObject({ status: 'available', items: [{ name: 'Fried Rice', quantity: 2 }], reference: checkout.body.data.orderId });
    expect(Number.isFinite(new Date(ticket.orderedAt).getTime())).toBe(true);
    expect(JSON.stringify(ticket)).not.toMatch(/Bottled|price|payment|cost|total|cash/i);
    const saved = state.sales[ticket.saleId]; expect(saved.products.map((line: any) => line.isPrepared)).toEqual([true, false]);
    const SaleModel = jest.requireActual('../models/Sale').default;
    const validated = new SaleModel(saved); await expect(validated.validate()).resolves.toBeUndefined();
    expect(validated.toObject().products.map((line: any) => line.isPrepared)).toEqual([true, false]);
    expect(state.ingredients[RICE].currentStock).toBe(700); expect(state.products[PACKAGED].warehouse[SELECTED].productQty).toBe(4);
    expect(state.movements).toHaveLength(1); expect(state.movements[0].quantity).toBe(300);

    // Live catalog edits cannot change historical names or prepared classification.
    state.products[DISH].name = 'Renamed stocked item'; state.products[DISH].isInventory = true;
    state.products[PACKAGED].isInventory = false; state.recipes = [];
    const snapshot = copy(state), writeCount = writes.length;
    expect((await request('GET', `/api/sales/${ticket.saleId}`, undefined, false)).status).toBe(401);
    for (let n = 0; n < 2; n++) {
      const reopened = await request('GET', `/api/sales/${ticket.saleId}`);
      expect(reopened.status).toBe(200); expect(reopened.body.data.kitchenTicket).toEqual(ticket);
    }
    const retry = await request('POST', '/api/pos/sale', mixed());
    expect(retry.status).toBe(200); expect(retry.body.replayed).toBe(true); expect(retry.body.data.kitchenTicket).toEqual(ticket);
    expect(copy(state)).toEqual(snapshot); expect(writes).toHaveLength(writeCount); expect(Object.keys(state.sales)).toHaveLength(1);
  });
  it('omits tickets for reliably stocked-only sales and refuses to guess historical classification', async () => {
    const checkout = await request('POST', '/api/pos/sale', payload({ items: [{ id: PACKAGED, qty: 1 }], payments: [{ type: 'cash', amount: 100 }] }));
    expect(checkout.status).toBe(201); expect(checkout.body.data.kitchenTicket).toEqual({ status: 'none' });
    const sale = state.sales[checkout.body.data.saleId]; delete sale.products[0].isPrepared;
    const old = await request('GET', `/api/sales/${sale._id}`);
    expect(old.body.data.kitchenTicket).toMatchObject({ status: 'unavailable', reason: expect.stringMatching(/reliable saved/) });
    expect(new (jest.requireActual('../models/Sale').default)(sale).products[0].isPrepared).toBeUndefined();
  });
});

describe('Guided single-serving dish through existing product, recipe and POS handlers', () => {
  const details = (extra: Record<string, unknown> = {}) => ({ dishDraftRequestId: 'fixture-guided-dish-0001', name: 'Fried Rice', code: 'FRIED-RICE-FIXTURE', category: 'Hot Meals', unit: 'Portion', ptype: 'Single', isInventory: false, isSellable: true, status: 'Pending', warehouse: { [SELECTED]: { warehouseName: 'Selling counter', productCost: 60, productPrice: 500 } }, ...extra });
  const recipe = (id: string, extra: Record<string, unknown> = {}) => ({ productId: id, ingredients: [{ ingredientProductId: RICE, quantity: 150, unit: 'g' }], ...extra });
  const create = async () => { const response = await request('POST', '/api/products', details()); expect(response.status).toBe(201); return String(response.body.data.id); };
  beforeEach(() => {
    state.units = { [G_UNIT]: { _id: G_UNIT, unitName: 'Gram', shortName: 'g' }, [RAW]: { _id: RAW, unitName: 'Portion', shortName: 'ptn' } };
    state.ingredients[RICE] = { _id: RICE, name: 'Rice', unitId: { _id: G_UNIT, shortName: 'g' }, currentStock: 1000 };
    jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  it('keeps an incomplete draft out of POS, activates only after its recipe, then consumes 150 g exactly once', async () => {
    const id = await create();
    expect(state.products[id]).toMatchObject({ status: 'Pending', ptype: 'Single', isInventory: false, isSellable: true });
    expect((await request('GET', `/api/pos/catalog?warehouseId=${SELECTED}`)).body.data.items.map((item: any) => item.id)).not.toContain(id);
    const refused = await request('PUT', `/api/products/${id}`, { status: 'Active' }); expect(refused.status).toBe(400); expect(refused.body.message).toMatch(/Save a recipe/); expect(state.products[id].status).toBe('Pending');
    expect((await request('PUT', `/api/products/${id}`, { $set: { status: 'Active' }, $unset: { guidedDishDraft: '' } })).status).toBe(400); expect(state.products[id].status).toBe('Pending');
    expect((await request('POST', '/api/kitchen/recipes', recipe(id))).status).toBe(200);
    expect(state.products[id].status).toBe('Pending');
    expect((await request('PUT', `/api/products/${id}`, { status: 'Active' })).status).toBe(200);
    expect((await request('GET', `/api/pos/catalog?warehouseId=${SELECTED}`)).body.data.items).toEqual(expect.arrayContaining([expect.objectContaining({ id, name: 'Fried Rice', price: 500 })]));
    expect((await request('GET', `/api/pos/catalog?warehouseId=${OTHER}`)).body.data.items.map((item: any) => item.id)).not.toContain(id);
    const checkout = payload({ items: [{ id, qty: 1 }], payments: [{ type: 'cash', amount: 500 }] });
    expect((await request('POST', '/api/pos/sale', checkout)).status).toBe(201); expect(state.ingredients[RICE].currentStock).toBe(850);
    expect((await request('POST', '/api/pos/sale', checkout)).body.replayed).toBe(true); expect(state.ingredients[RICE].currentStock).toBe(850);
    expect(Object.keys(state.sales)).toHaveLength(1); expect(state.movements).toHaveLength(1); expect(state.movements[0]).toMatchObject({ source: 'sale', type: 'out', quantity: 150 });
    const ProductModel = jest.requireActual('../models/Product').default; await expect(new ProductModel(state.products[id]).validate()).resolves.toBeUndefined();
  });
  it('resumes the same Pending product after failed recipe storage or an uncertain product response without creating duplicates', async () => {
    const id = await create(), count = Object.keys(state.products).length;
    failRecipeSave = true; expect((await request('POST', '/api/kitchen/recipes', recipe(id))).status).toBe(500);
    expect(state.products[id].status).toBe('Pending'); expect(state.recipes.filter((row: any) => String(row.productId) === id)).toHaveLength(0);
    const retried = await request('POST', '/api/products', details()); expect(retried.status).toBe(200); expect(retried.body.replayed).toBe(true); expect(String(retried.body.data.id)).toBe(id); expect(Object.keys(state.products)).toHaveLength(count);
    failRecipeSave = false; expect((await request('POST', '/api/kitchen/recipes', recipe(id))).status).toBe(200); expect((await request('POST', '/api/kitchen/recipes', recipe(id))).status).toBe(200);
    expect(state.recipes.filter((row: any) => String(row.productId) === id)).toHaveLength(1);
  });
  it('rejects early activation, changed creation details and unavailable selling/recipe setup', async () => {
    expect((await request('POST', '/api/products', details({ status: 'Active' }))).status).toBe(400);
    const id = await create(); expect((await request('POST', '/api/products', details({ code: 'CHANGED-SKU' }))).status).toBe(409);
    expect((await request('POST', '/api/kitchen/recipes', recipe(id, { ingredients: [{ ingredientProductId: RICE, quantity: 150, unit: 'kg' }] }))).status).toBe(400);
    expect((await request('POST', '/api/kitchen/recipes', recipe(id))).status).toBe(200);
    state.warehouses.find((item: any) => item._id === SELECTED).isActive = false;
    expect((await request('PUT', `/api/products/${id}`, { status: 'Active' })).status).toBe(400); expect(state.products[id].status).toBe('Pending');
    state.warehouses.find((item: any) => item._id === SELECTED).isActive = true; state.ingredients[RICE].unitId.shortName = 'kg';
    expect((await request('PUT', `/api/products/${id}`, { status: 'Active' })).status).toBe(400); expect(state.products[id].status).toBe('Pending');
  });
  it('preserves the existing create, recipe and activation permissions', async () => {
    expect((await request('POST', '/api/products', details(), false)).status).toBe(401); dishCreateGranted = false;
    expect((await request('POST', '/api/products', details())).status).toBe(403); dishCreateGranted = true;
    const id = await create(); kitchenPermission = false; expect((await request('POST', '/api/kitchen/recipes', recipe(id))).status).toBe(403); kitchenPermission = true;
    await request('POST', '/api/kitchen/recipes', recipe(id)); warehousePermission = false;
    expect((await request('PUT', `/api/products/${id}`, { status: 'Active' })).status).toBe(403); expect(state.products[id].status).toBe('Pending');
  });
});

describe('Issue to Kitchen: mounted authorization, explicit units and atomic stock legs', () => {
  beforeEach(riceIssueFixture);
  const configure = () => saveKitchenIssueConversion(RAW, conversion(), USER);
  it('moves 1 of 10 rice bags into 50,000 g, consumes 150 g at real POS checkout, and replays without another posting', async () => {
    const before = copy(state);
    const config = await request('PUT', `/api/products/${RAW}/kitchen-issue-conversion`, conversion());
    expect(config.status).toBe(200); expect(config.body.data).toMatchObject({ factor: 50000, revision: 1 });
    expect(state.products).toEqual(before.products); expect(state.ingredients[RICE].currentStock).toBe(0);
    const { requestId: _request, ...previewBody } = issue();
    const preview = await request('POST', `/api/warehouses/${SELECTED}/kitchen-issues/preview`, previewBody);
    expect(preview.status).toBe(200); expect(preview.body.data).toMatchObject({ sourceBefore: 10, sourceAfter: 9, kitchenBefore: 0, kitchenAfter: 50000, quantity: 50000 });
    expect(state.products[RAW].warehouse[SELECTED].productQty).toBe(10);
    const first = await request('POST', `/api/warehouses/${SELECTED}/kitchen-issues`, issue());
    expect(first.status).toBe(201); expect(first.body.issue).toMatchObject({ sourceQuantity: 1, quantity: 50000, sourceBefore: 10, sourceAfter: 9, kitchenBefore: 0, kitchenAfter: 50000 });
    expect(first.body.issue.requestHash).toBeUndefined();
    expect(state.products[RAW].warehouse[SELECTED].productQty).toBe(9); expect(state.ingredients[RICE].currentStock).toBe(50000);
    const sale = await request('POST', '/api/pos/sale', payload());
    expect(sale.status).toBe(201); expect(state.ingredients[RICE].currentStock).toBe(49850);
    const retry = await request('POST', `/api/warehouses/${SELECTED}/kitchen-issues`, issue());
    expect(retry.status).toBe(200); expect(retry.body.replayed).toBe(true); expect(retry.body.issue).toEqual(first.body.issue);
    expect(state.products[RAW].warehouse[SELECTED].productQty).toBe(9); expect(state.products[RAW].warehouse[OTHER].productQty).toBe(3); expect(state.ingredients[RICE].currentStock).toBe(49850);
    expect(state.movements.filter((movement: any) => movement.source === 'warehouse_issue')).toHaveLength(1);
    expect(state.movements.filter((movement: any) => movement.source === 'sale')).toHaveLength(1);
    expect(writes.every(operation => operation.session)).toBe(true);
    const MovementModel = jest.requireActual('../models/KitchenStockMovement').default;
    const saved = new MovementModel(state.movements[0]); await expect(saved.validate()).resolves.toBeUndefined(); expect(saved.costAtTime).toBeUndefined();
    const IngredientModel = jest.requireActual('../models/KitchenInventoryProduct').default;
    await expect(new IngredientModel({ ...state.ingredients[RICE], unitId: G_UNIT }).validate()).resolves.toBeUndefined();
    const options = await request('GET', `/api/warehouses/${SELECTED}/kitchen-issue-options?productId=${RAW}`);
    expect(options.status).toBe(200); expect(options.body.data.history).toHaveLength(1); expect(JSON.stringify(options.body)).not.toContain('requestHash');
  });
  it.each(['GET', 'PUT', 'POST', 'PREVIEW'])('requires authentication for %s', async method => {
    const url = method === 'GET' ? `/api/warehouses/${SELECTED}/kitchen-issue-options?productId=${RAW}` : method === 'PUT' ? `/api/products/${RAW}/kitchen-issue-conversion` : `/api/warehouses/${SELECTED}/kitchen-issues${method === 'PREVIEW' ? '/preview' : ''}`;
    expect((await request(method === 'PREVIEW' ? 'POST' : method, url, issue(), false)).status).toBe(401); expect(writes).toHaveLength(0);
  });
  it.each(['warehouse', 'kitchen'])('requires the existing %s update grant, without a role-name bypass', async denied => {
    if (denied === 'warehouse') warehousePermission = false; else kitchenPermission = false;
    expect((await request('POST', `/api/warehouses/${SELECTED}/kitchen-issues`, issue())).status).toBe(403);
    expect((await request('PUT', `/api/products/${RAW}/kitchen-issue-conversion`, conversion())).status).toBe(403); expect(writes).toHaveLength(0);
  });
  it('rejects a missing conversion before balance writes', async () => {
    const before = copy(state); await expect(postKitchenIssue(SELECTED, issue(), USER)).rejects.toThrow(/explicit per-item conversion/); expect(state).toEqual(before); expect(writes).toHaveLength(0);
  });
  it('requires explicit consent to link an existing unlinked ingredient and preserves both stocks', async () => {
    delete state.ingredients[RICE].inventoryProductId;
    await expect(configure()).rejects.toThrow(/Explicitly confirm/);
    await saveKitchenIssueConversion(RAW, conversion({ linkIngredient: true }), USER);
    expect(state.ingredients[RICE].inventoryProductId).toBe(RAW); expect(state.ingredients[RICE].currentStock).toBe(0); expect(state.products[RAW].warehouse[SELECTED].productQty).toBe(10);
  });
  it('refuses to relink an ingredient belonging to another item', async () => {
    state.ingredients[RICE].inventoryProductId = PACKAGED; await expect(saveKitchenIssueConversion(RAW, conversion({ linkIngredient: true }), USER)).rejects.toThrow(/another item/); expect(writes).toHaveLength(0);
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid conversion quantity %p', async value => {
    await expect(saveKitchenIssueConversion(RAW, conversion({ kitchenQuantity: value }), USER)).rejects.toThrow(/positive finite/); expect(writes).toHaveLength(0);
  });
  it('rejects missing, mismatched and incompatible source/recipe units without writes', async () => {
    await expect(saveKitchenIssueConversion(RAW, conversion({ sourceUnitId: G_UNIT }), USER)).rejects.toThrow(/do not match/);
    state.products[RAW].unit = 'g'; state.ingredients[RICE].unitId = ML_UNIT;
    await expect(saveKitchenIssueConversion(RAW, conversion({ sourceUnitId: G_UNIT }), USER)).rejects.toThrow(/Mass and volume/);
    state.ingredients[RICE].unitId = G_UNIT;
    await expect(saveKitchenIssueConversion(RAW, conversion({ sourceUnitId: G_UNIT }), USER)).rejects.toThrow(/incompatible/); expect(writes).toHaveLength(0);
  });
  it.each(['variation', 'batch', 'legacy key', 'missing tracking'])('rejects unsupported %s stock', async kind => {
    if (kind === 'variation') state.products[RAW].ptype = 'Variation';
    if (kind === 'batch') state.products[RAW].warehouse[SELECTED].batches = [{ batchNumber: 'fixture' }];
    if (kind === 'legacy key') { state.products[RAW].warehouse['Dry Store'] = state.products[RAW].warehouse[SELECTED]; delete state.products[RAW].warehouse[SELECTED]; }
    if (kind === 'missing tracking') delete state.products[RAW].isInventory;
    await expect(configure()).rejects.toThrow(); expect(writes).toHaveLength(0);
  });
  it('rejects insufficient stock, stale revision, changed unit or item link before debit', async () => {
    await configure(); writes.length = 0;
    await expect(postKitchenIssue(SELECTED, issue({ quantity: 11 }), USER)).rejects.toThrow(/Insufficient/);
    await expect(postKitchenIssue(SELECTED, issue({ conversionRevision: 0 }), USER)).rejects.toThrow(/conversion changed/);
    state.ingredients[RICE].unitId = ML_UNIT;
    await expect(postKitchenIssue(SELECTED, issue(), USER)).rejects.toThrow(/no longer matches/);
    state.ingredients[RICE].inventoryProductId = PACKAGED;
    await expect(postKitchenIssue(SELECTED, issue(), USER)).rejects.toThrow(/linked/); expect(writes).toHaveLength(0);
  });
  it.each(['incoming', 'movement', 'audit'])('rolls back both balances and history if %s storage fails', async kind => {
    await configure(); const before = copy(state);
    failIncoming = kind === 'incoming'; failMovement = kind === 'movement'; failAudit = kind === 'audit';
    await expect(postKitchenIssue(SELECTED, issue(), USER)).rejects.toThrow(/failure|failed/); expect(state).toEqual(before);
  });
  it('handles concurrent duplicates and a transaction callback retry once', async () => {
    await configure(); retryTransaction = true;
    const results = await Promise.all([postKitchenIssue(SELECTED, issue(), USER), postKitchenIssue(SELECTED, issue(), USER)]);
    expect(results.filter(result => !result.replayed)).toHaveLength(1); expect(state.products[RAW].warehouse[SELECTED].productQty).toBe(9); expect(state.ingredients[RICE].currentStock).toBe(50000); expect(state.movements).toHaveLength(1);
  });
  it('recovers an uncertain commit with the original key, even after conversion or stock changes', async () => {
    await configure(); lostAcknowledgement = true;
    expect((await request('POST', `/api/warehouses/${SELECTED}/kitchen-issues`, issue())).status).toBe(503);
    state.ingredients[RICE].currentStock -= 150; delete state.ingredients[RICE].warehouseIssueConversion;
    const retry = await postKitchenIssue(SELECTED, issue(), USER); expect(retry.replayed).toBe(true);
    expect(state.products[RAW].warehouse[SELECTED].productQty).toBe(9); expect(state.ingredients[RICE].currentStock).toBe(49850); expect(state.movements).toHaveLength(1);
    await expect(postKitchenIssue(SELECTED, issue({ quantity: 2 }), USER)).rejects.toThrow(/different issue/);
  });
  it('fails closed when transactions are unavailable', async () => {
    await configure(); const before = copy(state); unsupported = true;
    expect((await request('POST', `/api/warehouses/${SELECTED}/kitchen-issues`, issue())).status).toBe(503); expect(state).toEqual(before);
  });
});

describe('POS cash checkout through mounted permissions, recipe stock and register report', () => {
  it('handles the real JSON checkout request for one Rs 100 Lucky Bottled Water with zero customers, preserving named-customer recovery and retry protection', async () => {
    state.customers = {};
    state.products[PACKAGED].name = 'Lucky Bottled Water';
    state.products[PACKAGED].warehouse[SELECTED].productPrice = 100;
    state.products[PACKAGED].warehouse[SELECTED].productQty = 100;
    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise<void>(resolve => server.once('listening', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Fixture HTTP server did not start');
      const send = async (body: object) => {
        const response = await fetch(`http://127.0.0.1:${address.port}/api/pos/sale`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-only-cashier', Connection: 'close' }, body: JSON.stringify(body) });
        return { status: response.status, body: await response.json() as any };
      };
      const body = payload({ items: [{ id: PACKAGED, qty: 1 }], payments: [{ type: 'cash', amount: 100 }] });
      expect(Object.prototype.hasOwnProperty.call(body, 'customerId')).toBe(false);
      const first = await send(body);
      expect(first.status).toBe(201); expect(first.body.data).toMatchObject({ items: [{ name: 'Lucky Bottled Water', quantity: 1, price: 100 }], total: 100, paid: 100, change: 0, due: 0 });
      expect((Object.values(state.sales)[0] as any).customerId).toBeNull();
      expect((await send(body)).body.replayed).toBe(true);
      expect(Object.keys(state.sales)).toHaveLength(1); expect(state.products[PACKAGED].warehouse[SELECTED].productQty).toBe(99);
      const before = copy(state), named = { ...body, customerId: CUSTOMER, checkoutRequestId: 'fixture-http-named-unavailable' };
      const denied = await send(named);
      expect(denied.status).toBe(400); expect(denied.body.code).toBe('customer_unavailable'); expect(denied.body.message).toMatch(/choose another customer or switch to Walk-in/i);
      expect(state).toEqual(before); expect(named.items).toEqual(body.items); expect(named.payments).toEqual(body.payments);
      const recovered = { ...named, customerId: null, checkoutRequestId: 'fixture-http-explicit-walkin' };
      expect((await send(recovered)).status).toBe(201); expect((await send(recovered)).body.replayed).toBe(true);
      expect(Object.keys(state.sales)).toHaveLength(2); expect(state.products[PACKAGED].warehouse[SELECTED].productQty).toBe(98); expect(state.customers).toEqual({});
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
  it('checks out bottled water as Walk-in with no customer records, preserves stock/receipt semantics and retries once', async () => {
    state.customers = {};
    const body = payload({ items: [{ id: PACKAGED, qty: 1 }] });
    const first = await request('POST', '/api/pos/sale', body);
    expect(first.body.message).toBeUndefined(); expect(first.status).toBe(201);
    const saved: any = Object.values(state.sales)[0]; expect(saved.customerId).toBeNull();
    const SaleModel = jest.requireActual('../models/Sale').default;
    await expect(new SaleModel(saved).validate()).resolves.toBeUndefined();
    await expect(new SaleModel({ ...saved, saleType: 'non-pos' }).validate()).rejects.toThrow(/customerId/);
    expect(state.products[PACKAGED].warehouse[SELECTED].productQty).toBe(4);
    expect(first.body.data).toMatchObject({ total: 9.5, paid: 10, change: 0.5 });
    expect((await request('POST', '/api/pos/sale', body)).body.replayed).toBe(true);
    expect(Object.keys(state.sales)).toHaveLength(1); expect(state.products[PACKAGED].warehouse[SELECTED].productQty).toBe(4); expect(state.customers).toEqual({});
  });
  it('never attributes Walk-in to an arbitrary existing named customer', async () => {
    const { sale } = await checkoutCashSale(payload({ customerId: null }), USER);
    expect(sale.customerId).toBeNull(); expect(Object.keys(state.customers)).toHaveLength(1);
  });
  it.each(['', 'deleted-customer', false])('rejects an invalid explicit customer %p instead of silently making the sale Walk-in', async customerId => {
    const before = copy(state);
    const result = await request('POST', '/api/pos/sale', payload({ customerId }));
    expect(result.status).toBe(400); expect(result.body.code).toBe('customer_unavailable'); expect(state).toEqual(before);
  });
  it('rejects a deleted named customer; the same cart can explicitly switch to Walk-in after definite rollback', async () => {
    const before = copy(state); const body = payload({ customerId: OTHER, items: [{ id: PACKAGED, qty: 1 }] });
    const result = await request('POST', '/api/pos/sale', body);
    expect(result.status).toBe(400); expect(result.body).toMatchObject({ code: 'customer_unavailable' }); expect(result.body.message).toMatch(/choose another customer or switch to Walk-in/i); expect(state).toEqual(before);
    const recovered = await request('POST', '/api/pos/sale', { ...body, customerId: null, checkoutRequestId: 'fixture-customer-recovery-0001' });
    expect(recovered.status).toBe(201); expect(state.products[PACKAGED].warehouse[SELECTED].productQty).toBe(4); expect(Object.keys(state.sales)).toHaveLength(1);
  });
  it('retains an explicitly selected valid customer and rejects an inactive legacy customer', async () => {
    state.customers[CUSTOMER].isActive = false;
    expect((await request('POST', '/api/pos/sale', payload({ customerId: CUSTOMER }))).status).toBe(400);
    state.customers[CUSTOMER].isActive = true;
    expect((await request('POST', '/api/pos/sale', payload({ customerId: CUSTOMER }))).status).toBe(201);
    expect((Object.values(state.sales)[0] as any).customerId).toBe(CUSTOMER);
  });
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
  it.each([false, undefined, null, 'true'])('rejects stale/direct carts with non-sellable classification %p before any sale or stock write', async classification => {
    state.products[PACKAGED].isSellable = classification;
    const before = copy(state);
    const result = await request('POST', '/api/pos/sale', payload({ items: [{ id: DISH, qty: 1 }, { id: PACKAGED, qty: 1 }] }));
    expect(result.status).toBe(400);
    expect(result.body.message).toMatch(/inventory-only|selling type review/i);
    expect(state).toEqual(before);
    expect(writes.filter(write => ['sale', 'product stock', 'ingredient stock', 'ingredient movement', 'invoice counter'].includes(write.kind))).toHaveLength(0);
  });
  it('rejects a brand-new raw rice SKU and a standalone kitchen ingredient before sale or stock writes', async () => {
    const raw = 'c'.repeat(24);
    state.products[raw] = { _id: raw, name: 'Fixture raw rice', code: 'FIXTURE-RAW', status: 'Active', isInventory: true, isSellable: false,
      warehouse: { [SELECTED]: { productPrice: 120, productCost: 90, productQty: 30 } } };
    const before = copy(state);
    for (const id of [raw, RICE]) {
      const result = await request('POST', '/api/pos/sale', payload({ items: [{ id, qty: 1 }] }));
      expect(result.status).toBe(400);
      expect(state).toEqual(before);
    }
    expect(writes.filter(write => ['sale', 'product stock', 'ingredient stock', 'ingredient movement', 'invoice counter'].includes(write.kind))).toHaveLength(0);
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
