import mongoose from 'mongoose';
import Transfer from '../../models/Transfer';
import { models as existingModels } from '../demoSeed/validate';
import { Entry, fingerprint, money, Plan, quantity, Row, forbiddenLabel } from './plan';
import { formatDateOnlyParts, getZonedParts } from '../../utils/timezone';

export const models = { ...existingModels, Transfer } as Record<string, mongoose.Model<any>>;
const ensure: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };
const close = (actual: number, expected: number, label: string) => ensure(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) < .00001, `${label} does not reconcile.`);
export async function validateSchemas(plan: Plan) {
  for (const entry of plan.entries) {
    try {
      const model = new models[entry.model](entry.doc, undefined, { strict: 'throw' });
      await model.validate(); entry.doc = model.toObject({ flattenMaps: true });
    } catch { throw new Error(`Schema validation failed for ${entry.model}: ${entry.key}.`); }
  }
}
export function reconcile(plan: Plan) {
  const rows = (model: string) => plan.entries.filter(e => e.model === model).map(e => e.doc);
  const all = new Map([...plan.references, ...plan.entries, ...plan.patches.map(p => ({ model: p.model, doc: p.after }))].map(e => [`${e.model}/${e.doc._id}`, e.doc]));
  const lookup = (model: string, id: unknown): Row => { const value = all.get(`${model}/${id}`); ensure(value, `Missing ${model} reference.`); return value; };
  const identities = new Set<string>();
  for (const entry of plan.entries) {
    ensure(!['User', 'Role', 'Setting', 'ReceiptSettings', 'Currency'].includes(entry.model), 'Protected identity/settings records cannot be inserted by this seed.');
    const identity = `${entry.model}/${entry.doc._id}`; ensure(!identities.has(identity), 'Duplicate deterministic identity.'); identities.add(identity);
    ensure(entry.doc.createdAt instanceof Date && entry.doc.updatedAt instanceof Date, 'Business record timestamps must be explicit.');
    for (const field of ['name', 'productName', 'title', 'category', 'brandName', 'companyName', 'username']) if (typeof entry.doc[field] === 'string') ensure(!forbiddenLabel(entry.doc[field]), 'Visible placeholder labels are not permitted.');
    const visit = (schema: mongoose.Schema, doc: Row) => schema.eachPath((path, field: any) => {
      const value = doc[path]; if (value == null) return;
      if (field.options?.ref) lookup(field.options.ref, value);
      if (field.schema) for (const nested of Array.isArray(value) ? value : [value]) visit(field.schema, nested);
    });
    visit(models[entry.model].schema, entry.doc);
  }
  const products = [...all.entries()].filter(([key]) => key.startsWith('Product/')).map(([, doc]) => doc);
  const unitByName = new Map([...all.entries()].filter(([key]) => key.startsWith('Unit/')).map(([, doc]) => [doc.unitName, doc]));
  const recipes = new Map(rows('KitchenRecipe').map(recipe => [String(recipe.productId), recipe]));
  for (const p of products) {
    ensure(unitByName.has(p.unit), 'Product stock unit is not a recorded Unit.');
    ensure(typeof p.isInventory === 'boolean' && typeof p.isSellable === 'boolean', 'Selling classification must be explicit.');
    for (const [wid, wh] of Object.entries<Row>(p.warehouse || {})) {
      const warehouse = lookup('Warehouse', wid); ensure(warehouse.name === wh.warehouseName, 'Canonical location name/id mismatch.');
      ensure(Number.isFinite(wh.productCost) && wh.productCost >= 0 && Number.isFinite(wh.productPrice) && wh.productPrice >= 0, 'A location is missing its explicit cost/price.');
      if (p.isInventory) ensure(Number.isFinite(wh.productQty) && wh.productQty >= 0 && Number.isFinite(wh.stockAlert) && wh.stockAlert >= 0, 'Stock quantity/threshold is invalid.');
    }
    if (p.isInventory === false) ensure(p.isSellable === true && p.status === 'Active' && recipes.has(String(p._id)), 'Active prepared dish must have a saved recipe.');
    if (!p.isSellable) ensure(p.isInventory === true, 'Inventory-only item must be stock tracked.');
  }
  const stock = new Map<string, number>(), kitchen = new Map<string, number>();
  const stockKey = (pid: unknown, wid: unknown) => `${pid}/${wid}`;
  const bump = (map: Map<string, number>, key: string, delta: number) => { const after = quantity((map.get(key) || 0) + delta); ensure(after >= -.000001, 'Chronological stock becomes negative.'); map.set(key, after); };
  const events: Array<{ date: Date; kind: 'purchase' | 'transfer' | 'issue' | 'sale'; doc: Row }> = [];
  for (const p of rows('Purchase')) {
    ensure(p.stockReceiptVersion === 1 && ['Ordered', 'Pending', 'Received'].includes(p.purchaseStatus), 'Unsupported purchase status or receipt marker.');
    const received = p.purchaseStatus === 'Received'; ensure(received === !!p.stockReceivedAt, 'Purchase receipt status/marker mismatch.');
    close(p.items.reduce((sum: number, line: Row) => sum + line.subTotal, 0), p.subtotal, 'Purchase subtotal'); close(p.subtotal, p.grandTotal, 'Purchase grand total');
    ensure(p.paymentStatus === 'Unpaid', 'Seed cannot manufacture verified purchase payment amounts from status labels.');
    for (const line of p.items) { const product = lookup('Product', line.productId); ensure(product.isInventory === true && line.stockUnit === product.unit && line.quantity > 0 && line.cost > 0, 'Purchase item stock identity/unit invalid.'); close(line.subTotal, money(line.quantity * line.cost), 'Purchase line total'); }
    ensure(p.purchaseDate.getTime() === p.createdAt.getTime(), 'Purchase reporting date differs from fixture date.');
    if (received) events.push({ date: p.stockReceivedAt, kind: 'purchase', doc: p });
  }
  for (const t of rows('Transfer')) {
    ensure(t.fromWarehouseName === lookup('Warehouse', t.fromWarehouse).name && t.toWarehouseName === lookup('Warehouse', t.toWarehouse).name, 'Transfer locations do not match.');
    close(t.items.reduce((sum: number, line: Row) => sum + line.subtotal, 0), t.subtotal, 'Transfer subtotal'); close(t.subtotal, t.grandTotal, 'Transfer grand total');
    for (const line of t.items) { ensure(lookup('Product', line.productId).isInventory === true && line.qty > 0, 'Transfer item is invalid.'); close(line.subtotal, money(line.cost * line.qty), 'Transfer line total'); }
    if (t.status === 'Completed') events.push({ date: t.date, kind: 'transfer', doc: t }); else ensure(t.status === 'Pending', 'Unsupported transfer state.');
  }
  const movementBySale = new Map<string, Row[]>();
  for (const movement of rows('KitchenStockMovement')) {
    const ingredient = lookup('KitchenInventoryProduct', movement.kitchenProductId); ensure(movement.quantity > 0, 'Nonpositive kitchen movement.');
    if (movement.source === 'warehouse_issue') {
      const leg = movement.warehouseIssue, conversion = ingredient.warehouseIssueConversion;
      ensure(movement.type === 'in' && leg && conversion && String(leg.productId) === String(ingredient.inventoryProductId), 'Kitchen issue link is invalid.');
      ensure(String(conversion.productId) === String(leg.productId) && leg.factor === conversion.factor && leg.sourceUnit === lookup('Product', leg.productId).unit, 'Kitchen issue conversion is not the saved per-item conversion.');
      ensure(String(lookup('Unit', ingredient.unitId).shortName).toLowerCase() === leg.kitchenUnit, 'Kitchen issue recipe unit differs.');
      close(leg.warehouseQuantity * leg.factor, leg.kitchenQuantity, 'Conversion factor'); close(leg.sourceQuantity * leg.factor, movement.quantity, 'Issued recipe units');
      events.push({ date: movement.createdAt, kind: 'issue', doc: movement });
    } else {
      ensure(movement.source === 'sale' && movement.type === 'out' && movement.saleId, 'Unsupported kitchen movement source.');
      const list = movementBySale.get(String(movement.saleId)) || []; list.push(movement); movementBySale.set(String(movement.saleId), list);
    }
  }
  for (const sale of rows('Sale')) {
    ensure(sale.status === 'completed' && sale.paymentStatus === 'paid' && sale.saleType === 'pos' && sale.customerId == null, 'Unsupported seeded sale/customer contract.');
    ensure(sale.date.getTime() === sale.createdAt.getTime() && sale.mainStockDeductionAppliedAt && sale.kitchenDeductionAppliedAt, 'Sale timestamps/idempotency markers differ.');
    ensure(sale.saleDiscountValue === 0 && sale.saleTaxValue === 0 && sale.shippingCost === 0 && sale.balance === 0, 'Unexpected financial rule in fixture.');
    const register = lookup('PosSession', sale.posSessionId); ensure(sale.date >= register.openTime && sale.date <= register.closeTime, 'Sale falls outside its closed register.');
    let total = 0, cost = 0; const needs = new Map<string, number>();
    for (const line of sale.products) {
      const p = lookup('Product', line.productId), wh = p.warehouse[sale.warehouseId];
      ensure(p.isSellable === true && wh && line.isPrepared === !p.isInventory && line.qty > 0 && !line.variation && !line.batch, 'Saved sale selling classification or location is invalid.');
      close(line.price, wh.productPrice, 'Saved selling price'); close(line.cost, wh.productCost, 'Saved unit cost'); close(line.subtotal, money(line.qty * line.price), 'Sale line');
      total += line.subtotal; cost += line.cost * line.qty;
      if (!p.isInventory) {
        const recipe = recipes.get(String(p._id)); ensure(recipe?.ingredients.length, 'Prepared sale has no saved recipe.'); let unitCost = 0;
        for (const ingredient of recipe.ingredients) {
          const k = lookup('KitchenInventoryProduct', ingredient.kitchenProductId);
          ensure(ingredient.quantity > 0 && ingredient.unit === String(lookup('Unit', k.unitId).shortName).toLowerCase(), 'Recipe needs unsupported unit conversion.');
          needs.set(String(k._id), quantity((needs.get(String(k._id)) || 0) + ingredient.quantity * line.qty)); unitCost += ingredient.quantity * k.averageCost;
        }
        close(line.cost, money(unitCost), 'Recipe serving cost');
      }
    }
    close(sale.total, money(total), 'Sale total'); close(sale.profit, money(total - cost), 'Sale profit');
    close(sale.cashAmount + sale.cardAmount + sale.bankTransferAmount, sale.total, 'Net payment total'); close(sale.cashTendered + sale.cardAmount + sale.bankTransferAmount - sale.total, sale.changeAmount, 'Cash change');
    for (const [type, field] of [['cash', 'cashAmount'], ['card', 'cardAmount'], ['bankTransfer', 'bankTransferAmount']]) close(sale.payments.filter((payment: Row) => payment.paymentType === type).reduce((sum: number, payment: Row) => sum + payment.amount, 0), sale[field], 'Payment history');
    const movements = movementBySale.get(String(sale._id)) || [];
    ensure(movements.length === needs.size, 'Sale has missing/duplicate ingredient movements.');
    for (const movement of movements) { close(movement.quantity, needs.get(String(movement.kitchenProductId)) ?? NaN, 'Sale ingredient deduction'); close(movement.costAtTime, lookup('KitchenInventoryProduct', movement.kitchenProductId).averageCost, 'Ingredient cost snapshot'); }
    movementBySale.delete(String(sale._id)); events.push({ date: sale.date, kind: 'sale', doc: sale });
  }
  ensure(movementBySale.size === 0, 'Orphaned sale ingredient movements.');
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const { kind, doc } of events) {
    if (kind === 'purchase') for (const line of doc.items) bump(stock, stockKey(line.productId, doc.warehouseId), line.quantity);
    if (kind === 'transfer') for (const line of doc.items) { bump(stock, stockKey(line.productId, doc.fromWarehouse), -line.qty); bump(stock, stockKey(line.productId, doc.toWarehouse), line.qty); }
    if (kind === 'issue') {
      const leg = doc.warehouseIssue, warehouseKey = stockKey(leg.productId, leg.warehouseId), kitchenKey = String(doc.kitchenProductId);
      close(stock.get(warehouseKey) || 0, leg.sourceBefore, 'Issue source-before'); close(kitchen.get(kitchenKey) || 0, leg.kitchenBefore, 'Issue kitchen-before');
      bump(stock, warehouseKey, -leg.sourceQuantity); bump(kitchen, kitchenKey, doc.quantity);
      close(stock.get(warehouseKey) || 0, leg.sourceAfter, 'Issue source-after'); close(kitchen.get(kitchenKey) || 0, leg.kitchenAfter, 'Issue kitchen-after');
    }
    if (kind === 'sale') for (const line of doc.products) {
      const p = lookup('Product', line.productId);
      if (p.isInventory) { const key = stockKey(p._id, doc.warehouseId); close(stock.get(key) || 0, line.stockQtyAtSale, 'Historical counter stock snapshot'); bump(stock, key, -line.qty); }
    }
    if (kind === 'sale') for (const movement of rows('KitchenStockMovement').filter(m => m.source === 'sale' && String(m.saleId) === String(doc._id))) bump(kitchen, String(movement.kitchenProductId), -movement.quantity);
  }
  for (const p of products.filter(p => p.isInventory)) for (const [wid, value] of Object.entries<Row>(p.warehouse)) {
    const baseline = plan.patches.find(patch => String(patch.before._id) === String(p._id))?.before.warehouse?.[wid]?.productQty || 0;
    close(value.productQty, baseline + (stock.get(stockKey(p._id, wid)) || 0), 'Final warehouse stock');
  }
  for (const k of rows('KitchenInventoryProduct')) {
    close(k.currentStock, kitchen.get(String(k._id)) || 0, 'Final kitchen stock'); ensure(k.currentStock > 0, 'Prepared menu needs remaining kitchen stock.');
    const conversion = k.warehouseIssueConversion;
    ensure(conversion.sourceShort === lookup('Unit', conversion.sourceUnitId).shortName && conversion.kitchenShort === lookup('Unit', k.unitId).shortName, 'Issue conversion must preserve the exact stored unit spelling.');
  }
  for (const register of rows('PosSession')) {
    const sales = rows('Sale').filter(sale => String(sale.posSessionId) === String(register._id));
    ensure(register.status === 'CLOSED' && sales.length && String(register.userId) === plan.anchor.actorId, 'Register attribution/history is invalid.');
    close(register.closingCash, register.openingCash + sales.reduce((sum, sale) => sum + sale.cashAmount, 0), 'Register cash'); close(register.cashVariance, 0, 'Register variance');
    for (const [field, expected] of [['denominations', register.openingCash], ['closingDenominations', register.closingCash]] as const) close(Object.entries<number>(register[field]).reduce((sum, [unit, qty]) => { ensure(Number.isInteger(qty) && qty >= 0, 'Fractional cash denomination.'); return sum + Number(unit) * qty; }, 0), expected, 'Register denominations');
  }
  ensure(new Set(rows('Sale').map(sale => formatDateOnlyParts(getZonedParts(sale.date, 'Asia/Colombo')))).size === 30, 'Each of the thirty trading dates must have activity.');
  const flour = lookup('Product', plan.summary.flour.id); ensure(flour.warehouse[plan.summary.storageId].productQty === 4 && flour.warehouse[plan.summary.storageId].stockAlert === 5, 'Low-stock flour fixture differs.');
  const openFlour = rows('Purchase').filter(p => p.purchaseStatus !== 'Received' && !p.stockReceivedAt).flatMap(p => p.items).filter((line: Row) => String(line.productId) === String(flour._id));
  close(openFlour.reduce((sum, line) => sum + line.quantity, 0), 10, 'Flour incoming');
  const cash = rows('Sale').reduce((sum, sale) => sum + sale.cashAmount, 0);
  return { documents: plan.entries.length, sales: rows('Sale').length, salesTotal: money(rows('Sale').reduce((sum, sale) => sum + sale.total, 0)), cashSales: money(cash), stockAndRecipeLedger: true, paymentsAndRegisters: true, thirtyDates: true, references: true };
}

export const planHash = (plan: Plan) => fingerprint(plan);
export function registerOverlap(planned: Row[], existing: Row[]) {
  for (const shift of planned) for (const old of existing) {
    const from = new Date(old.openTime).getTime(), until = old.closeTime ? new Date(old.closeTime).getTime() : Infinity;
    ensure(Number.isFinite(from) && !Number.isNaN(until), 'An existing register has invalid dates.');
    ensure(!(from < shift.closeTime.getTime() && until > shift.openTime.getTime()), 'Planned history overlaps an existing register. Existing sessions will not be closed or modified.');
  }
}
