import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import getRoutes from './getRoutes';
import postRoutes from './postRoutes';
import putRoutes from './putRoutes';
import { isPosEligibleProduct, posEligibilityFilter } from '../utils/productEligibility';

const USER = '1'.repeat(24), ROLE = '2'.repeat(24), WAREHOUSE = '3'.repeat(24), UNIT = '4'.repeat(24);
const RAW = 'a'.repeat(24), DISH = 'b'.repeat(24), DRINK = 'c'.repeat(24), INGREDIENT = 'd'.repeat(24);
let products: any[], ingredients: any[], permitted: boolean;
const update = jest.fn(), stockWrite = jest.fn(), saleWrite = jest.fn(), activity = jest.fn();
const copy = (value: any) => JSON.parse(JSON.stringify(value));
const doc = (value: any) => value ? { ...copy(value), toObject: () => copy(value) } : null;
// Evaluate the production query against fixture records, including compound search filters.
function matches(row: any, filter: any): boolean {
  return Object.entries(filter).every(([key, value]: [string, any]) => {
    if (key === '$and') return value.every((entry: any) => matches(row, entry));
    if (key === '$or') return value.some((entry: any) => matches(row, entry));
    if (value instanceof RegExp) return value.test(row[key] || '');
    if (value && typeof value === 'object') {
      if ('$regex' in value) return new RegExp(value.$regex, value.$options || '').test(row[key] || '');
      if ('$nin' in value) return !value.$nin.includes(row[key]);
    }
    return row[key] === value;
  });
}
function query(value: any) {
  let skip = 0, limit = Infinity;
  const get = () => Array.isArray(value) ? value.slice(skip, skip + limit) : value;
  const result = { select: () => result, sort: () => result, populate: () => result,
    skip: (n: number) => { skip = n; return result; }, limit: (n: number) => { limit = n; return result; },
    lean: async () => get(), then: (resolve: any, reject: any) => Promise.resolve(get()).then(resolve, reject) };
  return result;
}
jest.mock('../models/Product', () => ({ __esModule: true, default: {
  find: (filter: any) => query(products.filter(row => matches(row, filter))),
  countDocuments: async (filter: any) => products.filter(row => matches(row, filter)).length,
  findById: (id: string) => query(doc(products.find(row => row._id === id))),
  findOne: (filter: any) => query(products.find(row => matches(row, filter)) || null),
  create: async (body: any) => { const row = { ...copy(body), _id: RAW, status: body.status ?? 'Pending' }; products.push(row); return row; },
  findByIdAndUpdate: async (id: string, values: any) => {
    update(id, copy(values)); const row = products.find(row => row._id === id); Object.assign(row, copy(values)); return doc(row);
  },
  findOneAndUpdate: (...args: any[]) => stockWrite(...args)
} }));
jest.mock('../models/KitchenInventoryProduct', () => ({ __esModule: true, default: {
  find: () => query(ingredients), findOne: () => query(null),
  findById: (id: any) => query(ingredients.find(row => String(row._id) === String(id))),
  create: async (body: any) => { const row = { ...copy(body), _id: INGREDIENT }; ingredients.push(row); return row; }
} }));
jest.mock('../models/KitchenStockMovement', () => ({ __esModule: true, default: { create: (...args: any[]) => stockWrite(...args) } }));
jest.mock('../models/Sale', () => ({ __esModule: true, default: { create: (...args: any[]) => saleWrite(...args) } }));
jest.mock('../models/Unit', () => ({ __esModule: true, default: { findById: () => query({ _id: UNIT, unitName: 'Kilogram', shortName: 'kg' }) } }));
jest.mock('../models/Warehouse', () => ({ __esModule: true, default: { findById: () => query({ _id: WAREHOUSE }) } }));
jest.mock('../models/Customer', () => ({ __esModule: true, default: { findById: () => query({ _id: USER }) } }));
jest.mock('../models/Category', () => ({ __esModule: true, default: { find: () => query(['Menu', 'Drinks', 'Ingredients', 'Unused'].map(category => ({ _id: category, category }))) } }));
jest.mock('../models/Brand', () => ({ __esModule: true, default: { find: () => query(['Kitchen', 'Bottle', 'Raw', 'Unused'].map(brandName => ({ _id: brandName, brandName }))) } }));
jest.mock('../models/User', () => ({ __esModule: true, default: { findById: () => query({ _id: USER, isActive: true, roleId: ROLE }) } }));
jest.mock('../models/Role', () => ({ __esModule: true, default: { findById: () => query({ _id: ROLE, isActive: true, permissions: [
  { component: 'manageProducts', actions: { read: permitted, create: permitted, update: permitted } },
  { component: 'managePOS', actions: { view_pos: permitted } },
  { component: 'manageKitchen', actions: { view_kitchen_inventory: permitted } }
] }) } }));
jest.mock('jsonwebtoken', () => ({ __esModule: true, default: { verify: () => ({ id: USER }) } }));
jest.mock('../services/logActivity', () => ({ __esModule: true, default: (...args: any[]) => activity(...args) }));
jest.mock('../utils/email', () => ({ sendEmail: () => { throw new Error('Email forbidden'); } }));

const app = express(); app.use('/api', getRoutes); app.use('/api', postRoutes); app.use('/api', putRoutes);
function request(method: string, url: string, body?: any, authenticated = true): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), { method, url, body, headers: {
      host: 'eligibility.test', ...(authenticated ? { authorization: 'Bearer fixture-only' } : {})
    } });
    const res = new ServerResponse(req);
    jest.spyOn(res, 'end').mockImplementation((chunk: any) => {
      try { resolve({ status: res.statusCode, body: JSON.parse(String(chunk)) }); } catch (error) { reject(error); }
      socket.destroy(); return res;
    }); app(req, res);
  });
}
function rawPayload(extra = {}) {
  return { name: 'Fixture raw rice', code: 'FIXTURE-RICE', barcode: '100000000001', category: 'Ingredients', brand: 'Raw',
    unit: 'kg', ptype: 'Single', isInventory: true, isSellable: false,
    warehouse: { [WAREHOUSE]: { warehouseName: 'Fixture warehouse', productPrice: 120, productCost: 90, productQty: 30, stockAlert: 2 } }, ...extra };
}
beforeEach(() => {
  jest.clearAllMocks(); permitted = true; ingredients = [];
  products = [
    { _id: DISH, name: 'Fixture prepared dish', code: 'FIXTURE-DISH', barcode: '100000000002', category: 'Menu', brand: 'Kitchen',
      isInventory: false, isSellable: true, status: 'Active', warehouse: { [WAREHOUSE]: { warehouseName: 'Fixture warehouse', productPrice: 9.5, productCost: 4 } } },
    { _id: DRINK, name: 'Fixture bottled drink', code: 'FIXTURE-DRINK', barcode: '100000000003', category: 'Drinks', brand: 'Bottle',
      isInventory: true, isSellable: true, status: 'Active', warehouse: { [WAREHOUSE]: { warehouseName: 'Fixture warehouse', productPrice: 5, productCost: 2, productQty: 8, stockAlert: 2 } } }
  ];
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Explicit selling types through actual mounted routes with mocked storage', () => {
  it('defaults new kitchen documents to Inventory only and preserves an unknown legacy Product classification', () => {
    const KitchenProduct = jest.requireActual('../models/KitchenInventoryProduct').default;
    const Product = jest.requireActual('../models/Product').default;
    const ingredient = new KitchenProduct({ name: 'New ingredient', unitId: UNIT });
    expect(ingredient.isSellable).toBe(false);
    expect(ingredient.validateSync()).toBeUndefined();
    ingredient.isSellable = true;
    expect(ingredient.validateSync()?.errors.isSellable).toBeDefined();
    expect(new Product({ name: 'Unclassified legacy item' }).isSellable).toBeUndefined();
    expect(new Product({ name: 'New pending product' }).status).toBe('Pending');
  });
  it('creates a brand-new raw ingredient SKU, keeps inventory access and excludes every POS lookup', async () => {
    const created = await request('POST', '/api/products', rawPayload());
    expect(created.status).toBe(201);
    expect(products.find(row => row._id === RAW)).toMatchObject({ isSellable: false, isInventory: true });
    expect(products.find(row => row._id === RAW)?.warehouse[WAREHOUSE]).toMatchObject({ productQty: 30, productPrice: 120, productCost: 90 });
    const inventory = await request('GET', '/api/products?isSellable=false');
    expect(inventory.body.data.map((row: any) => row._id)).toEqual([RAW]);
    const detail = await request('GET', `/api/products/${RAW}`);
    expect(detail.body.data).toMatchObject({ _id: RAW, code: 'FIXTURE-RICE', isSellable: false });
    const defaults = await request('GET', '/api/products?isSellable=true');
    expect(defaults.body.data.map((row: any) => row._id)).toEqual([DISH, DRINK]);
    for (const search of ['', 'rice', 'FIXTURE-RICE', '100000000001']) {
      const catalog = await request('GET', `/api/pos/catalog?warehouseId=${WAREHOUSE}&q=${search}`);
      expect(catalog.status).toBe(200);
      expect(catalog.body.data.items.map((row: any) => row.id)).not.toContain(RAW);
      if (!search) {
        expect(catalog.body.data.items.map((row: any) => row.id)).toEqual([DISH, DRINK]);
        expect(catalog.body.data.categories.map((row: any) => row.name)).toEqual(['Menu', 'Drinks']);
        expect(catalog.body.data.brands.map((row: any) => row.name)).toEqual(['Kitchen', 'Bottle']);
      } else expect(catalog.body.data.items).toEqual([]);
    }
    // Generic inventory/purchase selectors remain unfiltered; prepared recipe selectors remain intact.
    expect((await request('GET', '/api/products')).body.data.map((row: any) => row._id)).toContain(RAW);
    expect((await request('GET', '/api/products?isInventory=false')).body.data.map((row: any) => row._id)).toEqual([DISH]);
  });
  it('kitchen creation always defaults to Inventory only and never creates a POS product', async () => {
    const before = copy(products);
    const result = await request('POST', '/api/kitchen/products', { name: 'Brand-new raw rice', unitId: UNIT, isSellable: true });
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ isSellable: false, currentStock: 0 });
    expect((await request('GET', '/api/kitchen/products')).body.data).toHaveLength(1);
    expect(products).toEqual(before);
    expect((await request('GET', '/api/pos/catalog')).body.data.items.map((row: any) => row.id)).not.toContain(INGREDIENT);
  });
  it.each([false, true])('creates an explicitly Active Sellable item with warehouse stock tracking %p and exposes it in POS', async isInventory => {
    const created = await request('POST', '/api/products', rawPayload({ name: 'New sellable fixture', code: 'FIXTURE-SELLABLE', isSellable: true, isInventory, status: 'Active' }));
    expect(created.status).toBe(201);
    expect((await request('GET', '/api/products?isSellable=true')).body.data.map((row: any) => row._id)).toContain(RAW);
    expect((await request('GET', `/api/pos/catalog?warehouseId=${WAREHOUSE}`)).body.data.items.map((row: any) => row.id)).toContain(RAW);
    expect(products.find(row => row._id === RAW)?.isInventory).toBe(isInventory);
  });
  it('keeps new Sellable items Pending by default until explicitly activated', async () => {
    expect((await request('POST', '/api/products', rawPayload({ isSellable: true }))).status).toBe(201);
    expect(products.find(row => row._id === RAW)?.status).toBe('Pending');
    expect((await request('GET', '/api/pos/catalog')).body.data.items.map((row: any) => row.id)).not.toContain(RAW);
  });
  it.each([undefined, null, 'false', 0])('requires an explicit boolean on generic creation (%p)', async value => {
    const result = await request('POST', '/api/products', rawPayload({ isSellable: value }));
    expect(result.status).toBe(400); expect(products).toHaveLength(2);
  });
  it('creates an item at zero opening balance and still rejects negative stock', async () => {
    const warehouse = { [WAREHOUSE]: { warehouseName: 'Fixture warehouse', productPrice: 0, productCost: 0, productQty: 0, stockAlert: 0 } };
    expect((await request('POST', '/api/products', rawPayload({ warehouse }))).status).toBe(201);
    expect(products.find(row => row._id === RAW)?.warehouse[WAREHOUSE].productQty).toBe(0);
    warehouse[WAREHOUSE].productQty = -1;
    expect((await request('POST', '/api/products', rawPayload({ name: 'Negative fixture', code: 'NEGATIVE', warehouse }))).status).toBe(400);
  });
  it.each([null, 'false', 0])('rejects invalid selling type updates (%p) without touching the record', async value => {
    const before = copy(products);
    expect((await request('PUT', `/api/products/${DRINK}`, { isSellable: value })).status).toBe(400);
    expect(products).toEqual(before); expect(update).not.toHaveBeenCalled();
  });
  it('preserves stock and references when only the selling type changes, and preserves classification on omitted updates', async () => {
    const before = copy(products[1]);
    expect((await request('PUT', `/api/products/${DRINK}`, { isSellable: false })).status).toBe(200);
    expect(update).toHaveBeenLastCalledWith(DRINK, { isSellable: false });
    expect(products[1]).toEqual({ ...before, isSellable: false });
    expect((await request('PUT', `/api/products/${DRINK}`, { note: 'Existing fixture note', warehouse: before.warehouse })).status).toBe(200);
    expect(products[1].isSellable).toBe(false);
    expect(stockWrite).not.toHaveBeenCalled(); expect(saleWrite).not.toHaveBeenCalled();
  });
  it('filters unclassified records for review without silently treating them as Sellable or Inventory only', async () => {
    delete products[0].isSellable;
    expect((await request('GET', '/api/products?isSellable=unclassified&q=FIXTURE-DISH')).body.data.map((row: any) => row._id)).toEqual([DISH]);
    expect((await request('GET', '/api/products?isSellable=true')).body.data.map((row: any) => row._id)).toEqual([DRINK]);
    expect((await request('GET', '/api/pos/catalog')).body.data.items.map((row: any) => row.id)).toEqual([DRINK]);
  });
  it('keeps zero-priced Sellable items eligible and filters inactive and other-warehouse items', async () => {
    products[0].warehouse[WAREHOUSE].productPrice = 0;
    expect((await request('GET', `/api/pos/catalog?warehouseId=${WAREHOUSE}`)).body.data.items[0].price).toBe(0);
    products[0].status = 'Inactive';
    expect((await request('GET', '/api/pos/catalog')).body.data.items.map((row: any) => row.id)).toEqual([DRINK]);
    expect((await request('GET', `/api/pos/catalog?warehouseId=${'f'.repeat(24)}`)).body.data).toEqual({ categories: [], brands: [], items: [] });
  });
  it.each(['pos', 'non-pos'])('rejects inventory-only items through the alternate %s sales creation route without writes', async saleType => {
    products.push({ ...rawPayload(), _id: RAW, status: 'Active' });
    const result = await request('POST', '/api/sales', { warehouseId: WAREHOUSE, customerId: USER, saleType, products: [{ productId: RAW, qty: 1 }] });
    expect(result.status).toBe(400); expect(result.body.message).toMatch(/explicitly Sellable/);
    expect(saleWrite).not.toHaveBeenCalled(); expect(stockWrite).not.toHaveBeenCalled();
  });
  it('preserves authentication and permission enforcement', async () => {
    expect((await request('GET', '/api/pos/catalog', undefined, false)).status).toBe(401);
    permitted = false;
    expect((await request('GET', '/api/pos/catalog')).status).toBe(403);
    expect((await request('PUT', `/api/products/${DRINK}`, { isSellable: false })).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
  it.each([undefined, null, false, true, 'true', 0])('keeps Mongo filtering and the eligibility predicate equivalent for %p', classification => {
    for (const status of ['Active', 'Inactive', undefined]) {
      const product = { status, isSellable: classification };
      expect(matches(product, posEligibilityFilter())).toBe(isPosEligibleProduct(product));
    }
  });
});
