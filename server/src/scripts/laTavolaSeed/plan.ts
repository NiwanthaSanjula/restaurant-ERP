import crypto from 'crypto';
import mongoose from 'mongoose';
import { addDaysToDateOnlyParts, formatDateOnlyParts, parseDateOnlyParts, zonedDateTimeToUtc } from '../../utils/timezone';
import { canonical, fingerprint, money, quantity, Row } from '../demoSeed/plan';

export { canonical, fingerprint, money, quantity, Row };
export const NAMESPACE = 'latavola-portfolio-v1';
export const RANDOM_SEED = 20261104;
export const oid = (key: string) => new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`${NAMESPACE}/${key}`).digest('hex').slice(0, 24));
export type Entry = { model: string; key: string; doc: Row };
export type Patch = { model: 'Product'; before: Row; after: Row; increments: Record<string, number>; sets: Row };
export type Plan = { namespace: string; anchor: { asOf: string; cutoff: number; actorId: string; currency: 'LKR' }; entries: Entry[]; references: Entry[]; patches: Patch[]; dates: string[]; summary: Row };
export const forbiddenLabel = (value: string) => /\b(demo|test|sample|lorem\s+ipsum)\b/i.test(value);
export const denominations = (value: number) => {
  if (!Number.isInteger(value) || value < 0) throw new Error('Cash denomination amount must be a nonnegative whole LKR amount.');
  const result: Row = {};
  for (const unit of [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1]) { result[String(unit)] = Math.floor(value / unit); value %= unit; }
  return result;
};
export const businessInstant = (date: string, minute: number) => zonedDateTimeToUtc({ ...parseDateOnlyParts(date, 'Asia/Colombo'), hour: Math.floor(minute / 60), minute: minute % 60, second: 0 }, 0, 'Asia/Colombo');
export function tradingDates(asOf: string) {
  const end = parseDateOnlyParts(asOf, 'Asia/Colombo');
  return Array.from({ length: 30 }, (_, day) => formatDateOnlyParts(addDaysToDateOnlyParts(end, day - 29)));
}

const ingredients = [
  { key: 'rice', name: 'Nadu Rice', unit: 'Kilogram', recipeUnit: 'Gram', factor: 1000, cost: 320, reserve: 30, alert: 10, kitchenBuffer: 20, supplier: 'Araliya Rice Mills (Pvt) Ltd' },
  { key: 'chicken', name: 'Chicken Breast', unit: 'Kilogram', recipeUnit: 'Gram', factor: 1000, cost: 1800, reserve: 6, alert: 3, kitchenBuffer: 8, supplier: 'Bairaha Farms PLC' },
  { key: 'vegetables', name: 'Mixed Vegetables', unit: 'Kilogram', recipeUnit: 'Gram', factor: 1000, cost: 450, reserve: 10, alert: 4, kitchenBuffer: 8, supplier: 'Senaka Fresh Produce' },
  { key: 'flour', name: 'Wheat Flour', unit: 'Kilogram', recipeUnit: 'Gram', factor: 1000, cost: 260, reserve: 4, alert: 5, kitchenBuffer: 15, supplier: 'Prima Ceylon (Pvt) Ltd' },
  { key: 'eggs', name: 'Brown Eggs', unit: 'Piece', recipeUnit: 'Piece', factor: 1, cost: 45, reserve: 30, alert: 12, kitchenBuffer: 36, supplier: 'Senaka Fresh Produce' },
  { key: 'oil', name: 'Coconut Cooking Oil', unit: 'Litre', recipeUnit: 'Millilitre', factor: 1000, cost: 950, reserve: 8, alert: 3, kitchenBuffer: 8, supplier: 'Cinnamon Lane Pantry' },
  { key: 'sugar', name: 'White Sugar', unit: 'Kilogram', recipeUnit: 'Gram', factor: 1000, cost: 300, reserve: 10, alert: 3, kitchenBuffer: 5, supplier: 'Cinnamon Lane Pantry' },
  { key: 'lime', name: 'Fresh Lime', unit: 'Kilogram', recipeUnit: 'Gram', factor: 1000, cost: 850, reserve: 5, alert: 2, kitchenBuffer: 4, supplier: 'Senaka Fresh Produce' },
  { key: 'tea', name: 'Ceylon Black Tea Leaves', unit: 'Kilogram', recipeUnit: 'Gram', factor: 1000, cost: 2200, reserve: 3, alert: 1, kitchenBuffer: 1, supplier: 'Cinnamon Lane Pantry' },
  { key: 'milk', name: 'Fresh Milk', unit: 'Litre', recipeUnit: 'Millilitre', factor: 1000, cost: 550, reserve: 8, alert: 3, kitchenBuffer: 8, supplier: 'Pelwatte Dairy Industries Ltd' },
  { key: 'coconut', name: 'Coconut Milk', unit: 'Litre', recipeUnit: 'Millilitre', factor: 1000, cost: 850, reserve: 8, alert: 3, kitchenBuffer: 6, supplier: 'Cinnamon Lane Pantry' },
  { key: 'dhal', name: 'Red Lentils', unit: 'Kilogram', recipeUnit: 'Gram', factor: 1000, cost: 420, reserve: 10, alert: 3, kitchenBuffer: 6, supplier: 'Cinnamon Lane Pantry' },
];
type Recipe = Array<[string, number]>;
const fried: Recipe = [['rice', 150], ['vegetables', 80], ['eggs', 1], ['oil', 15]];
const kottu: Recipe = [['flour', 180], ['vegetables', 80], ['eggs', 1], ['oil', 20]];
export const dishes: Array<{ key: string; name: string; price: number; category: string; recipe: Recipe }> = [
  { key: 'chicken-fried-rice', name: 'Chicken Fried Rice', price: 1150, category: 'Hot Meals', recipe: [...fried, ['chicken', 120]] },
  { key: 'vegetable-fried-rice', name: 'Vegetable Fried Rice', price: 850, category: 'Hot Meals', recipe: [['rice', 150], ['vegetables', 150], ['oil', 15]] },
  { key: 'chicken-kottu', name: 'Chicken Kottu', price: 1250, category: 'Hot Meals', recipe: [...kottu, ['chicken', 120]] },
  { key: 'egg-kottu', name: 'Egg Kottu', price: 950, category: 'Hot Meals', recipe: [...kottu.filter(([key]) => key !== 'eggs'), ['eggs', 2]] },
  { key: 'vegetable-kottu', name: 'Vegetable Kottu', price: 850, category: 'Hot Meals', recipe: [['flour', 200], ['vegetables', 150], ['oil', 20]] },
  { key: 'egg-fried-rice', name: 'Egg Fried Rice', price: 950, category: 'Hot Meals', recipe: [...fried.filter(([key]) => key !== 'eggs'), ['eggs', 2]] },
  { key: 'chicken-rice-curry', name: 'Chicken Rice & Curry', price: 1100, category: 'Hot Meals', recipe: [['rice', 180], ['chicken', 120], ['vegetables', 100], ['dhal', 40], ['coconut', 70], ['oil', 15]] },
  { key: 'vegetable-rice-curry', name: 'Vegetable Rice & Curry', price: 800, category: 'Hot Meals', recipe: [['rice', 180], ['vegetables', 160], ['dhal', 50], ['coconut', 70], ['oil', 15]] },
  { key: 'dhal-curry', name: 'Dhal Curry', price: 350, category: 'Hot Meals', recipe: [['dhal', 90], ['coconut', 60], ['oil', 10]] },
  { key: 'coconut-roti', name: 'Coconut Roti', price: 180, category: 'Hot Meals', recipe: [['flour', 90], ['coconut', 40], ['oil', 5]] },
  { key: 'egg-roti', name: 'Egg Roti', price: 300, category: 'Hot Meals', recipe: [['flour', 90], ['eggs', 1], ['oil', 10]] },
  { key: 'lime-juice', name: 'Lime Juice', price: 350, category: 'Cold Drinks', recipe: [['lime', 90], ['sugar', 25]] },
  { key: 'milk-tea', name: 'Ceylon Milk Tea', price: 250, category: 'Hot Drinks', recipe: [['tea', 4], ['milk', 120], ['sugar', 20]] },
  { key: 'watalappan', name: 'Watalappan', price: 450, category: 'Desserts', recipe: [['eggs', 1], ['coconut', 90], ['sugar', 40]] },
];

/** A deterministic business ledger, with current masters reused without renaming or reclassification. */
export function buildLaTavolaPlan(existing: Record<string, Row[]>, asOf: string, cutoff: number, actor: Row): Plan {
  if (!mongoose.isValidObjectId(actor._id) || forbiddenLabel(actor.name || '')) throw new Error('A non-placeholder existing attribution account is required; no users will be created or renamed.');
  if (!Number.isInteger(cutoff) || cutoff < 20 * 60 || cutoff > 23 * 60 + 59) throw new Error('A closed historical shift requires a reviewed cutoff at or after 20:00 Colombo time.');
  const dates = tradingDates(asOf), start = businessInstant(dates[0], 360);
  const entries: Entry[] = [], references: Entry[] = [], patches: Patch[] = [];
  const add = (model: string, key: string, values: Row, stamp = start) => {
    const doc: Row = { _id: oid(key), ...values, createdAt: stamp, updatedAt: stamp, __v: 0 };
    entries.push({ model, key, doc }); return doc;
  };
  const reference = (model: string, key: string, doc: Row) => {
    if (!references.some(e => e.model === model && String(e.doc._id) === String(doc._id))) references.push({ model, key, doc });
    return doc;
  };
  const master = (model: string, field: string, name: string, defaults: Row = {}, aliases: string[] = []) => {
    const names = [name, ...aliases].map(value => value.trim().toLowerCase());
    const matches = (existing[model] || []).filter(doc => names.includes(String(doc[field] || '').trim().toLowerCase()));
    if (matches.length > 1) throw new Error(`Ambiguous existing ${model}: ${name}. No records will be merged.`);
    return matches.length ? reference(model, `reuse/${model}/${name}`, matches[0]) : add(model, `${model}/${name}`, { [field]: name, ...defaults });
  };
  reference('User', 'attribution', actor);
  const storage = master('Warehouse', 'name', 'Storage', { isActive: true, country: 'Sri Lanka', location: 'Receiving and dry goods' }, ['Main Storage']);
  const counter = master('Warehouse', 'name', 'Sales Counter', { isActive: true, country: 'Sri Lanka', location: 'Restaurant service counter' });
  if (storage.isActive !== true || counter.isActive !== true) throw new Error('Storage and Sales Counter must already be active or safely creatable; existing activation settings will not be changed.');
  const sid = String(storage._id), cid = String(counter._id);
  const unitSpecs: Array<[string, string]> = [['Kilogram', 'kg'], ['Gram', 'g'], ['Litre', 'l'], ['Millilitre', 'ml'], ['Piece', 'pcs'], ['Portion', 'ptn']];
  const units = Object.fromEntries(unitSpecs.map(([name, shortName]) => [name, master('Unit', 'unitName', name, { shortName, businessType: 'restaurant' })]));
  for (const [name, expected] of unitSpecs) if (name !== 'Piece' && String(units[name].shortName).toLowerCase() !== expected) throw new Error(`Incompatible existing unit: ${name}.`);
  const categories = Object.fromEntries(['Ingredients', 'Hot Meals', 'Cold Drinks', 'Hot Drinks', 'Desserts'].map(name => [name, master('Category', 'category', name)]));
  const house = master('Brand', 'brandName', 'La Tavola');
  const supplierNames = [...new Set([...ingredients.map(row => row.supplier), 'Ceylon Cold Stores PLC (Elephant House)', 'Nilu Beverage Traders'])];
  const suppliers = Object.fromEntries(supplierNames.map(name => [name, master('Supplier', 'name', name, { companyName: name })]));
  const expenseCategories = ['Utilities', 'Cleaning & Laundry', 'Transport & Delivery', 'Repairs & Maintenance'].map(name => master('ExpenseCategory', 'name', name));
  const rawProducts: Record<string, Row> = {}, kitchen: Record<string, Row> = {}, menu: Record<string, Row> = {};
  const stock = new Map<string, number>(), kitchenStock = new Map<string, number>();
  const key = (pid: unknown, wid: unknown) => `${pid}/${wid}`;
  const balance = (pid: unknown, wid: unknown) => stock.get(key(pid, wid)) || 0;
  const bump = (pid: unknown, wid: unknown, delta: number) => { const value = quantity(balance(pid, wid) + delta); if (value < 0) throw new Error('Planned warehouse stock would become negative.'); stock.set(key(pid, wid), value); };
  for (const spec of ingredients) {
    const p = add('Product', `raw/${spec.key}`, { name: spec.name, code: `LT-RAW-${spec.key.toUpperCase()}`, category: categories.Ingredients.category, brand: house.brandName, unit: units[spec.unit].unitName, ptype: 'Single', isInventory: true, isSellable: false, status: 'Active', supplier: spec.supplier,
      warehouse: { [sid]: { warehouseName: storage.name, productQty: 0, productCost: spec.cost, productPrice: 0, stockAlert: spec.alert } } });
    rawProducts[spec.key] = p;
    const unit = units[spec.recipeUnit], source = units[spec.unit];
    kitchen[spec.key] = add('KitchenInventoryProduct', `ingredient/${spec.key}`, { name: spec.name, unitId: unit._id, inventoryProductId: p._id, isSellable: false, currentStock: 0, averageCost: spec.cost / spec.factor, lastPurchasePrice: spec.cost / spec.factor, minStockLevel: spec.kitchenBuffer * spec.factor / 4,
      warehouseIssueConversion: { productId: p._id, sourceUnitId: source._id, stockUnit: source.unitName, sourceShort: String(source.shortName), kitchenUnitId: unit._id, kitchenShort: String(unit.shortName), warehouseQuantity: 1, kitchenQuantity: spec.factor, factor: spec.factor, revision: 1, confirmedBy: actor._id, confirmedAt: start } });
    kitchenStock.set(spec.key, 0);
  }
  for (const spec of dishes) {
    const cost = money(spec.recipe.reduce((sum, [ingredient, qty]) => sum + kitchen[ingredient].averageCost * qty, 0));
    menu[spec.key] = add('Product', `dish/${spec.key}`, { name: spec.name, code: `LT-${spec.key.toUpperCase()}`, category: categories[spec.category].category, brand: house.brandName, unit: units.Portion.unitName, ptype: 'Single', isInventory: false, isSellable: true, status: 'Active', warehouse: { [cid]: { warehouseName: counter.name, productCost: cost, productPrice: spec.price } } });
    add('KitchenRecipe', `recipe/${spec.key}`, { productId: menu[spec.key]._id, variationName: null, ingredients: spec.recipe.map(([ingredient, qty]) => ({ kitchenProductId: kitchen[ingredient]._id, ingredientName: kitchen[ingredient].name, quantity: qty, unit: String(units[ingredients.find(row => row.key === ingredient)!.recipeUnit].shortName).toLowerCase() })) });
  }
  // Reuse the explicit existing 1 L SKU, never infer a pack size or eligibility from price/category.
  const waters = (existing.Product || []).filter(p => p.code === 'LKY-BTLW-1L' || p.code === 'LT-WATER-1L' || p.name === 'Bottled Water 1L');
  if (waters.length > 1) throw new Error('Multiple existing 1 L water records need review; no duplicate item will be created.');
  let water: Row;
  if (waters.length) {
    const before = waters[0], source = before.warehouse?.[sid], destination = before.warehouse?.[cid];
    if (before.isSellable !== true || before.isInventory !== true || before.ptype !== 'Single' || before.unit !== units.Piece.unitName || before.status !== 'Active' || !source || !(source.productPrice > 0) || !(source.productCost > 0) || !Number.isFinite(source.productQty) || destination || Object.entries<Row>(before.warehouse).some(([wid, w]) => ![sid, cid].includes(wid) && [storage.name, counter.name].some(name => name.toLowerCase() === String(w.warehouseName || wid).toLowerCase()))) throw new Error('Existing bottled water needs canonical single-item stock review. Seed will not reclassify it, replace a counter balance, or overwrite prices.');
    water = { ...before, warehouse: { ...before.warehouse, [sid]: { ...source }, [cid]: { warehouseName: counter.name, productCost: source.productCost, productPrice: source.productPrice, productQty: 0, stockAlert: 10, batches: [] } } };
    reference('Product', 'water-existing', before);
    patches.push({ model: 'Product', before, after: water, increments: {}, sets: {} });
  } else water = add('Product', 'drink/water', { name: 'Bottled Water 1L', code: 'LT-WATER-1L', category: categories['Cold Drinks'].category, brand: house.brandName, unit: units.Piece.unitName, ptype: 'Single', isInventory: true, isSellable: true, status: 'Active', supplier: 'Nilu Beverage Traders', warehouse: { [sid]: { warehouseName: storage.name, productQty: 0, productCost: 75, productPrice: 100, stockAlert: 50 }, [cid]: { warehouseName: counter.name, productQty: 0, productCost: 75, productPrice: 100, stockAlert: 10 } } });
  menu.water = water;
  menu.ginger = add('Product', 'drink/ginger', { name: 'Ginger Beer 330ml', code: 'LT-GINGER-330', category: categories['Cold Drinks'].category, brand: house.brandName, unit: units.Piece.unitName, ptype: 'Single', isInventory: true, isSellable: true, status: 'Active', supplier: 'Ceylon Cold Stores PLC (Elephant House)', warehouse: Object.fromEntries([[sid, storage], [cid, counter]].map(([wid, w]: any[]) => [wid, { warehouseName: w.name, productQty: 0, productCost: 180, productPrice: 300, stockAlert: 12 }])) });

  let randomState = RANDOM_SEED;
  let saleReference = 7000;
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  const schedule = dates.map((date, day) => Array.from({ length: 4 + Math.floor(random() * 3) }, (_, index) => {
    const selected = new Map<string, number>(), first = dishes[Math.floor(random() * 11)].key;
    selected.set(first, random() < .25 ? 2 : 1);
    if (random() < .5) { const next = dishes[Math.floor(random() * dishes.length)].key; selected.set(next, (selected.get(next) || 0) + 1); }
    if (random() < .7) selected.set(random() < .7 ? 'water' : 'ginger', 1 + (random() < .15 ? 1 : 0));
    if (day === dates.length - 1 && index === 0) { selected.clear(); selected.set('chicken-fried-rice', 2); selected.set('water', 1); }
    return { date, day, index, items: [...selected.entries()], time: businessInstant(date, 9 * 60 + index * 90), method: (day + index) % 4 };
  }));
  const purchase = (date: string, tag: string, lines: Row[], supplierName: string, received = true, minute = 7 * 60) => {
    const total = money(lines.reduce((sum, line) => sum + line.quantity * line.cost, 0));
    const doc = add('Purchase', `purchase/${date}/${tag}`, { purchaseId: `LT-P-${date.replace(/-/g, '')}-${tag.toUpperCase()}`, supplierId: suppliers[supplierName]._id, warehouseId: storage._id, purchaseDate: businessInstant(date, minute), items: lines.map((line, index) => ({ ...line, _id: oid(`purchase/${date}/${tag}/line/${index}`), subTotal: money(line.quantity * line.cost) })), subtotal: total, grandTotal: total, discount: 0, discountType: 'fixed', tax: 0, taxType: 'fixed', purchaseStatus: received ? 'Received' : 'Ordered', paymentStatus: 'Unpaid', stockReceiptVersion: 1, ...(received ? { stockReceivedAt: businessInstant(date, minute) } : {}), createdBy: actor._id }, businessInstant(date, minute));
    if (received) for (const line of lines) bump(line.productId, sid, line.quantity);
    return doc;
  };
  const transfer = (date: string, tag: string, lines: Array<[Row, number]>, minute: number, completed = true) => {
    const items = lines.filter(([, qty]) => qty > 0).map(([p, qty], index) => ({ _id: oid(`transfer/${date}/${tag}/line/${index}`), productId: p._id, productName: p.name, qty, cost: p.warehouse[sid].productCost, subtotal: money(p.warehouse[sid].productCost * qty) }));
    const total = money(items.reduce((sum, line) => sum + line.subtotal, 0));
    const doc = add('Transfer', `transfer/${date}/${tag}`, { reference: `LT-TR-${date.replace(/-/g, '')}-${tag.toUpperCase()}`, fromWarehouse: storage._id, toWarehouse: counter._id, fromWarehouseName: storage.name, toWarehouseName: counter.name, date: businessInstant(date, minute), items, subtotal: total, grandTotal: total, tax: 0, discount: 0, shipping: 0, status: completed ? 'Completed' : 'Pending', notes: completed ? 'Delivery to the restaurant service counter.' : 'Awaiting approval and physical delivery.' }, businessInstant(date, minute));
    if (completed) for (const [p, qty] of lines) { bump(p._id, sid, -qty); bump(p._id, cid, qty); }
    return doc;
  };
  for (let offset = 0; offset < dates.length; offset += 7) {
    const date = dates[offset], weekSales = schedule.slice(offset, offset + 7).flat();
    const needs = Object.fromEntries(ingredients.map(spec => [spec.key, 0]));
    for (const sale of weekSales) for (const [item, qty] of sale.items) for (const [ingredient, amount] of dishes.find(d => d.key === item)?.recipe || []) needs[ingredient] = quantity(needs[ingredient] + amount * qty);
    const issueQty = Object.fromEntries(ingredients.map(spec => [spec.key, Math.max(0, Math.ceil((needs[spec.key] + spec.kitchenBuffer * spec.factor - kitchenStock.get(spec.key)!) / spec.factor))]));
    for (const supplierName of [...new Set(ingredients.map(spec => spec.supplier))]) {
      const lines = ingredients.filter(spec => spec.supplier === supplierName).map(spec => ({ productId: rawProducts[spec.key]._id, quantity: issueQty[spec.key] + (offset === 0 ? spec.reserve : 0), cost: spec.cost, stockUnit: units[spec.unit].unitName })).filter(line => line.quantity > 0);
      if (lines.length) purchase(date, `RAW${supplierNames.indexOf(supplierName) + 1}`, lines, supplierName);
    }
    for (const spec of ingredients) {
      const qty = issueQty[spec.key]; if (!qty) continue;
      const p = rawProducts[spec.key], k = kitchen[spec.key], sourceBefore = balance(p._id, sid), kitchenBefore = kitchenStock.get(spec.key)!;
      const moved = qty * spec.factor;
      bump(p._id, sid, -qty); kitchenStock.set(spec.key, quantity(kitchenBefore + moved));
      add('KitchenStockMovement', `issue/${date}/${spec.key}`, { kitchenProductId: k._id, source: 'warehouse_issue', type: 'in', quantity: moved, reason: 'Kitchen replenishment', note: `Issue from ${storage.name}: ${qty} ${units[spec.unit].unitName} to ${String(units[spec.recipeUnit].shortName).toLowerCase()} recipe stock.`, createdBy: actor._id,
        warehouseIssue: { warehouseId: storage._id, productId: p._id, warehouseName: storage.name, productName: p.name, kitchenName: k.name, sourceQuantity: qty, sourceUnit: units[spec.unit].unitName, kitchenUnit: String(units[spec.recipeUnit].shortName).toLowerCase(), sourceBefore, sourceAfter: balance(p._id, sid), kitchenBefore, kitchenAfter: kitchenStock.get(spec.key), factor: spec.factor, conversionRevision: 1, warehouseQuantity: 1, kitchenQuantity: spec.factor, requestHash: fingerprint({ namespace: NAMESPACE, date, ingredient: spec.key, qty }) } }, businessInstant(date, 7 * 60 + 30));
    }
    const drinkLines: Array<[Row, number]> = ['water', 'ginger'].map(drink => [menu[drink], weekSales.reduce((sum, sale) => sum + (sale.items.find(([item]) => item === drink)?.[1] || 0), 0) + (drink === 'ginger' && offset + 7 >= dates.length ? 60 : 0)]);
    for (const [drink, qty] of drinkLines) if (qty) purchase(date, drink === water ? 'WATERH' : 'GINGER', [{ productId: drink._id, quantity: qty + (drink === menu.ginger && offset === 0 ? 48 : 0), cost: drink.warehouse[sid].productCost, stockUnit: drink.unit }], drink === water ? 'Nilu Beverage Traders' : 'Ceylon Cold Stores PLC (Elephant House)', true, 7 * 60 + 40);
    if (drinkLines.some(([, qty]) => qty > 0)) transfer(date, 'SERVICE', drinkLines.filter(([, qty]) => qty > 0), 8 * 60);

    for (const [dayInWeek, daily] of schedule.slice(offset, offset + 7).entries()) {
      const day = offset + dayInWeek, dayDate = dates[day], register = add('PosSession', `register/${dayDate}`, { userId: actor._id, username: actor.name, openTime: businessInstant(dayDate, 8 * 60 + 15), closeTime: businessInstant(dayDate, 19 * 60), status: 'CLOSED', openingCash: 5000, denominations: denominations(5000), closingCash: 5000, closingDenominations: denominations(5000), cashVariance: 0, checkoutRevision: daily.length }, businessInstant(dayDate, 8 * 60 + 15));
      let cashTotal = 0;
      for (const planned of daily) {
        const requestId = `lt-${dayDate}-${String(planned.index + 1).padStart(3, '0')}-checkout`, saleId = new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`pos:${actor._id}:${requestId}`).digest('hex').slice(0, 24));
        const products = planned.items.map(([item, qty]) => {
          const p = menu[item], wh = p.warehouse[cid], stockQtyAtSale = p.isInventory ? balance(p._id, cid) : 0;
          if (p.isInventory) bump(p._id, cid, -qty);
          return { productId: String(p._id), productName: p.name, isPrepared: !p.isInventory, variation: null, batch: null, stockQtyAtSale, qty, price: wh.productPrice, cost: wh.productCost, discount: 0, discountType: 'fixed', tax: 0, subtotal: money(qty * wh.productPrice) };
        });
        const total = money(products.reduce((sum, line) => sum + line.subtotal, 0)), cost = money(products.reduce((sum, line) => sum + line.cost * line.qty, 0));
        const cash = planned.method === 0 ? total : planned.method === 3 ? total / 2 : 0;
        const card = planned.method === 1 ? total : planned.method === 3 ? total / 2 : 0, bankTransfer = planned.method === 2 ? total : 0;
        const change = planned.method === 0 ? (100 - total % 100) % 100 : 0;
        const tender = { cash: cash + change, card, bankTransfer };
        const normalized = { checkoutRequestId: requestId, warehouseId: cid, sessionId: String(register._id), items: products.map(p => ({ productId: p.productId, qty: p.qty, variation: null, batch: null })), tender, discount: 0, discountType: 'fixed', tax: 0, shipping: 0, customerId: null, specialOfferId: null, serviceType: 'takeaway', tableId: '' };
        const sale = add('Sale', `sale/${dayDate}/${planned.index}`, { _id: saleId, checkoutRequestId: requestId, checkoutFingerprint: crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex'), invoiceId: `SALE-${saleReference++}`, warehouseId: cid, customerId: null, date: planned.time, createdBy: actor._id, posSessionId: register._id, businessType: 'restaurant', saleType: 'pos', status: 'completed', paymentStatus: 'paid', serviceType: 'takeaway', tableId: '', products, total, profit: money(total - cost), balance: 0, cashAmount: cash, cashTendered: cash + change, changeAmount: change, cardAmount: card, bankTransferAmount: bankTransfer, payments: ([['cash', cash], ['card', card], ['bankTransfer', bankTransfer]] as const).filter(([, amount]) => amount > 0).map(([paymentType, amount]) => ({ paymentType, amount, date: planned.time })), saleDiscountValue: 0, saleDiscountType: 'fixed', saleTaxValue: 0, shippingCost: 0, specialOfferDiscount: 0, mainStockDeductionAppliedAt: planned.time, kitchenDeductionAppliedAt: planned.time }, planned.time);
        cashTotal += cash;
        const used = new Map<string, number>();
        for (const [item, qty] of planned.items) for (const [ingredient, amount] of dishes.find(d => d.key === item)?.recipe || []) used.set(ingredient, quantity((used.get(ingredient) || 0) + amount * qty));
        for (const [ingredient, amount] of used) {
          const remaining = quantity(kitchenStock.get(ingredient)! - amount); if (remaining < 0) throw new Error('Planned recipe consumption exceeds kitchen stock.'); kitchenStock.set(ingredient, remaining);
          add('KitchenStockMovement', `consume/${sale._id}/${ingredient}`, { kitchenProductId: kitchen[ingredient]._id, source: 'sale', type: 'out', quantity: amount, costAtTime: kitchen[ingredient].averageCost, saleId: sale._id, createdBy: actor._id, reason: 'sale', note: `Recipe consumption for ${sale.invoiceId}` }, planned.time);
        }
      }
      register.closingCash = 5000 + cashTotal; register.closingDenominations = denominations(register.closingCash); register.updatedAt = register.closeTime;
      const categoryIndex = day % expenseCategories.length;
      add('Expense', `expense/${dayDate}`, { reference: `LT-E-${dayDate.replace(/-/g, '')}`, date: businessInstant(dayDate, 17 * 60 + 30), title: ['Electricity and water', 'Table linen laundry', 'Produce delivery', 'Kitchen equipment servicing'][categoryIndex], warehouse: storage._id, category: expenseCategories[categoryIndex]._id, amount: [2500, 1800, 900, 3200][categoryIndex] + 50 * Math.floor(random() * 8), details: 'Operating account expense, outside the POS cash drawer.', createdBy: actor._id }, businessInstant(dayDate, 17 * 60 + 30));
    }
  }
  purchase(asOf, 'WATER200', [{ productId: water._id, quantity: 200, cost: water.warehouse[sid].productCost, stockUnit: water.unit }], 'Nilu Beverage Traders', true, 18 * 60);
  const latestTransfer = transfer(asOf, 'COUNTER50', [[water, 50]], 18 * 60 + 15);
  const flourOrder = purchase(asOf, 'FLOURORDER', [{ productId: rawProducts.flour._id, quantity: 10, cost: ingredients.find(row => row.key === 'flour')!.cost, stockUnit: rawProducts.flour.unit }], 'Prima Ceylon (Pvt) Ltd', false, 18 * 60 + 30);
  const vegetableOrder = purchase(asOf, 'PRODUCEORDER', [{ productId: rawProducts.vegetables._id, quantity: 6, cost: 450, stockUnit: rawProducts.vegetables.unit }], 'Senaka Fresh Produce', false, 18 * 60 + 35); vegetableOrder.purchaseStatus = 'Pending';
  transfer(asOf, 'NEXTSERVICE', [[menu.ginger, 12]], 18 * 60 + 40, false);
  for (const p of [...Object.values(rawProducts), ...Object.values(menu)].filter(p => p.isInventory)) for (const [wid, w] of Object.entries<Row>(p.warehouse)) {
    const baseline = patches.find(patch => String(patch.before._id) === String(p._id))?.before.warehouse?.[wid]?.productQty || 0;
    w.productQty = quantity(balance(p._id, wid) + baseline);
  }
  for (const spec of ingredients) kitchen[spec.key].currentStock = kitchenStock.get(spec.key);
  for (const patch of patches) {
    patch.increments[`warehouse.${sid}.productQty`] = balance(patch.after._id, sid);
    patch.sets[`warehouse.${cid}`] = patch.after.warehouse[cid];
  }
  const counts = Object.fromEntries([...new Set(entries.map(e => e.model))].map(model => [model, entries.filter(e => e.model === model).length]));
  return { namespace: NAMESPACE, anchor: { asOf, cutoff, actorId: String(actor._id), currency: 'LKR' }, entries, references, patches, dates,
    summary: { counts, reused: Object.fromEntries([...new Set(references.map(e => e.model))].map(model => [model, references.filter(e => e.model === model).length])), storageId: sid, storageName: storage.name, counterId: cid, menuItems: Object.values(menu).map(p => ({ id: String(p._id), name: p.name, sku: p.code, price: p.warehouse[cid].productPrice })), water: { id: String(water._id), name: water.name, existingStoragePreserved: patches[0]?.before.warehouse?.[sid]?.productQty || 0, addedToStorage: 150, finalStorage: water.warehouse[sid].productQty, finalCounter: water.warehouse[cid].productQty, latestTransferId: String(latestTransfer._id) }, flour: { id: String(rawProducts.flour._id), onHand: rawProducts.flour.warehouse[sid].productQty, threshold: rawProducts.flour.warehouse[sid].stockAlert, incoming: 10, unit: rawProducts.flour.unit, orderId: String(flourOrder._id) }, receiptId: String(entries.find(e => e.key === `sale/${asOf}/0`)!.doc._id), firstDate: dates[0], lastDate: asOf, skipped: { Customer: 'Required mobile number cannot be left blank; completed POS sales use the supported Walk-in contract.', User: 'Existing authorized attribution account reused; no account creation or grants.', Role: 'Existing role assignments and permissions preserved.', BaseUnit: 'Units are independent in the active model; existing units reused.', Variation: 'Single serving sizes only.', SaleReturn: 'Prepared returns lack a verified kitchen/refund reversal contract.', PurchaseReturn: 'Return stock replay/refund paths are outside the validated receipt ledger.', MenuItem: 'Legacy menu/order flow is not connected to active POS.', Order: 'Completed POS sales are the authoritative active contract.', Table: 'No new order types or table workflow.', KitchenUnitConversion: 'Recipe quantities use the ingredient unit directly; per-item warehouse issue conversions are explicit.', InventoryAdjustment: 'Warehouse issues use linked warehouse_issue movements; no invented opening adjustment.', ActivityLog: 'Imported business records and linked movements preserve history; no fabricated API activity.', Receipt: 'Derived from saved sales; no separate receipt collection.', Settings: 'Configured La Tavola branding, LKR and receipt preferences are preserved.' } } };
}
