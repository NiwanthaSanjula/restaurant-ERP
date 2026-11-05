import mongoose from 'mongoose';
import { createHash } from 'crypto';
import Product from '../models/Product';
import Purchase from '../models/Purchase';
import Supplier from '../models/Supplier';
import Warehouse from '../models/Warehouse';
import ActivityLog from '../models/ActivityLog';
import { parseDateInputAsZonedStart } from '../utils/timezone';

export class PurchaseStockError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (message: string, status = 400): never => { throw new PurchaseStockError(status, message); };
const legacyStructure = (product: object) => ('hasBatches' in product && product.hasBatches === true) || ('isWeight' in product && product.isWeight === true);
async function audit(purchase: any, action: string, before: any, session: mongoose.ClientSession, actor?: string) {
  await ActivityLog.create([{ action, entityType: 'Purchase', entityId: String(purchase._id), before, after: action === 'DELETE' ? undefined : purchase.toObject(), ...(actor ? { userId: actor } : {}) }], { session });
}
const id = (value: unknown): string => {
  const text = String(value || '');
  return mongoose.isValidObjectId(text) ? text : fail('Invalid stock reference');
};

async function prepare(body: any, actor: string, session: mongoose.ClientSession) {
  const warehouseId = id(body.warehouseId), supplierId = id(body.supplierId);
  // Do not run parallel operations on the same MongoDB transaction session.
  const warehouse = await Warehouse.findById(warehouseId).session(session).lean();
  const supplier = await Supplier.findById(supplierId).session(session).lean();
  if (!warehouse || warehouse.isActive === false) fail('Select an active warehouse');
  if (!supplier) fail('Supplier not found');
  if (!Array.isArray(body.items) || !body.items.length) fail('At least one item is required');
  const status = body.purchaseStatus || 'Ordered';
  if (!['Ordered', 'Pending', 'Received'].includes(status)) fail('Use Ordered, Pending or Received; Draft purchases are not supported');
  const items = [];
  const seen = new Set<string>();
  for (const line of body.items) {
    const productId = id(line.productId);
    if (seen.has(productId)) fail('Combine duplicate purchase lines for the same item');
    seen.add(productId);
    const quantity = Number(line.quantity), cost = Number(line.cost), subTotal = Number(line.subTotal);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(cost) || cost <= 0 || !Number.isFinite(subTotal) || subTotal < 0) fail('Purchase quantities and costs must be positive, with a valid line total');
    const product = await Product.findById(productId).session(session).lean();
    if (!product) fail('A selected item no longer exists');
    if (product.isInventory !== true) fail('Purchases require warehouse stock tracking; prepared recipe dishes cannot be received');
    if (product.ptype !== 'Single' || legacyStructure(product)) fail('Variation, batch and legacy weight receipts need a persisted stock identity; this receipt supports single stock items only');
    const stockUnit = String(product.unit || '').trim();
    if (!stockUnit) fail('The item needs a stock unit before purchasing');
    items.push({ productId, quantity, cost, subTotal, stockUnit });
  }
  for (const key of ['subtotal', 'grandTotal', 'discount', 'tax']) {
    if (body[key] !== undefined && (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0)) fail(`Invalid ${key}`);
  }
  return {
    purchaseId: `PUR-${Date.now()}`,
    supplierId, warehouseId, items, createdBy: actor, purchaseStatus: 'Ordered', stockReceiptVersion: 1,
    purchaseDate: body.purchaseDate ? parseDateInputAsZonedStart(body.purchaseDate) : new Date(),
    subtotal: body.subtotal, discount: body.discount || 0, discountType: body.discountType || 'fixed',
    tax: body.tax || 0, taxType: body.taxType || 'fixed', grandTotal: body.grandTotal,
    paymentStatus: body.paymentStatus || 'Unpaid', paymentMethod: body.paymentMethod
  };
}

/** Warehouse receipts use the item's recorded unit. No pack or kitchen conversion is inferred. */
async function postReceipt(purchase: any, session: mongoose.ClientSession, actor?: string): Promise<boolean> {
  if (purchase.stockReceivedAt || purchase.purchaseStatus === 'Received') return false;
  if (purchase.stockReceiptVersion !== 1) fail('Legacy purchase stock posting is unverified. Review its history before receiving; no stock was changed.', 409);
  const warehouseId = id(purchase.warehouseId);
  const warehouse = await Warehouse.findById(warehouseId).session(session).lean();
  if (!warehouse || warehouse.isActive === false) fail('The receiving warehouse is unavailable');
  if (!purchase.items?.length) fail('The purchase has no receipt lines');
  const before = purchase.toObject();
  const prepared: Array<{ productId: string; quantity: number; cost: number; missing: boolean }> = [];
  for (const line of purchase.items) {
    const productId = id(line.productId);
    const product = await Product.findById(productId).session(session).lean();
    if (!product || product.isInventory !== true || product.ptype !== 'Single' || legacyStructure(product)) fail('A purchase item no longer supports this stock receipt');
    if (!line.stockUnit || line.stockUnit !== product.unit) fail('The item stock unit changed after ordering. Review the order before receiving.', 409);
    const quantity = Number(line.quantity), cost = Number(line.cost);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(cost) || cost <= 0) fail('Invalid receipt quantity or cost');
    const wh = product.warehouse instanceof Map ? product.warehouse.get(warehouseId) : product.warehouse?.[warehouseId];
    // Never duplicate a name-keyed legacy balance under a new ID key.
    const sameName = (value: unknown) => String(value || '').trim().toLowerCase() === warehouse.name.trim().toLowerCase();
    const warehouseEntries: Array<[string, any]> = product.warehouse instanceof Map ? [...product.warehouse.entries()] : Object.entries(product.warehouse || {});
    if (!wh && warehouseEntries.some(([key, value]) => sameName(key) || sameName(value?.warehouseName))) fail('Legacy warehouse stock keys need review before receiving; no balances were migrated.', 409);
    if (wh && (!Number.isFinite(wh.productQty) || wh.productQty < 0 || wh.batches?.length || wh.variationValues)) fail('Warehouse stock structure needs review before receiving', 409);
    prepared.push({ productId, quantity, cost, missing: !wh });
  }
  for (const line of prepared) {
    const fields: Record<string, unknown> = { [`warehouse.${warehouseId}.warehouseName`]: warehouse.name, [`warehouse.${warehouseId}.productCost`]: line.cost };
    if (line.missing) fields[`warehouse.${warehouseId}.stockAlert`] = 0;
    const result = await Product.updateOne({ _id: line.productId }, {
      $inc: { [`warehouse.${warehouseId}.productQty`]: line.quantity }, $set: fields
    }, { session });
    if (result.matchedCount !== 1) fail('A purchase item disappeared during receipt', 409);
  }
  purchase.purchaseStatus = 'Received'; purchase.stockReceivedAt = new Date();
  await purchase.save({ session });
  await audit(purchase, 'RECEIVE', before, session, actor);
  return true;
}

async function transaction<T>(work: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => { result = await work(session); }, {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary'
    });
    return result!;
  } finally { await session.endSession(); }
}

export async function createStockPurchase(body: any, actor: string) {
  id(actor);
  const key = body.createRequestId;
  if (body.purchaseStatus === 'Received' && !key) fail('Immediate receipt requires a stable createRequestId. Alternatively, save an Ordered purchase and receive it by its saved ID.');
  if (key !== undefined && (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(key))) fail('Invalid purchase request ID');
  const stableId = key ? createHash('sha256').update(`purchase:${actor}:${key}`).digest('hex').slice(0, 24) : undefined;
  const payloadHash = stableId ? createHash('sha256').update(JSON.stringify([
    ...['supplierId', 'warehouseId', 'purchaseDate', 'purchaseStatus', 'paymentStatus', 'paymentMethod', 'subtotal', 'discount', 'discountType', 'tax', 'taxType', 'grandTotal'].map(key => body[key] ?? null),
    Array.isArray(body.items) ? body.items.map((line: any) => [String(line.productId), Number(line.quantity), Number(line.cost), Number(line.subTotal)]) : null
  ])).digest('hex') : undefined;
  const replay = (existing: any) => {
    if (String(existing.createdBy) !== actor || existing.createPayloadHash !== payloadHash) fail('This purchase request was already used for different data. Refresh the saved order before retrying.', 409);
    return existing.toObject();
  };
  try { return await transaction(async session => {
    if (stableId) {
      const existing = await Purchase.findById(stableId).session(session);
      if (existing) return replay(existing);
    }
    const data = await prepare(body, id(actor), session);
    const [purchase] = await Purchase.create([{ ...data, ...(stableId ? { _id: stableId, createPayloadHash: payloadHash } : {}) }], { session });
    if (body.purchaseStatus === 'Received') await postReceipt(purchase, session, actor);
    else if (body.purchaseStatus === 'Pending') { purchase.purchaseStatus = 'Pending'; await purchase.save({ session }); }
    await audit(purchase, 'CREATE', undefined, session, actor);
    return purchase.toObject();
  }); } catch (error: any) {
    if (stableId && error.code === 11000) {
      const existing = await Purchase.findById(stableId);
      if (existing) return replay(existing);
    }
    throw error;
  }
}

export async function receiveStockPurchase(purchaseId: string, actor?: string) {
  return transaction(async session => {
    const purchase = await Purchase.findById(id(purchaseId)).session(session);
    if (!purchase) fail('Purchase not found', 404);
    const posted = await postReceipt(purchase, session, actor);
    return { purchase: purchase.toObject(), replayed: !posted };
  });
}

export async function editStockPurchase(purchaseId: string, body: any, actor: string) {
  return transaction(async session => {
    const purchase = await Purchase.findById(id(purchaseId)).session(session);
    if (!purchase) fail('Purchase not found', 404);
    const before = purchase.toObject();
    if (purchase.purchaseStatus === 'Received' || purchase.stockReceivedAt) {
      const lineKey = (line: any) => [String(line.productId), Number(line.quantity), Number(line.cost), Number(line.subTotal)].join('|');
      const oldLines = purchase.items.map(lineKey).sort(), newLines = Array.isArray(body.items) ? body.items.map(lineKey).sort() : [];
      if (String(body.warehouseId) !== String(purchase.warehouseId) || body.purchaseStatus !== 'Received' || JSON.stringify(oldLines) !== JSON.stringify(newLines)) fail('Received item quantities and warehouse are locked. Use a purchase return or stock adjustment instead.', 409);
      // Metadata/payment-label edits must never reverse and reapply an old receipt.
      for (const key of ['supplierId', 'subtotal', 'discount', 'discountType', 'tax', 'taxType', 'grandTotal', 'paymentStatus', 'paymentMethod']) {
        if (body[key] !== undefined) purchase.set(key, body[key]);
      }
      if (body.purchaseDate) purchase.purchaseDate = parseDateInputAsZonedStart(body.purchaseDate);
      await purchase.save({ session });
      await audit(purchase, 'EDIT', before, session, actor);
      return purchase.toObject();
    }
    if (purchase.stockReceiptVersion !== 1) fail('Legacy purchase posting is unverified; editing cannot safely reverse its stock.', 409);
    const data = await prepare(body, actor, session);
    if (!body.purchaseDate) data.purchaseDate = purchase.purchaseDate;
    for (const line of data.items) {
      const oldLine = purchase.items.find((old: any) => String(old.productId) === String(line.productId));
      if (oldLine && oldLine.stockUnit !== line.stockUnit) fail('The stock unit changed after ordering; review the unit before editing this order.', 409);
    }
    const { purchaseId: _newReference, createdBy: _actor, ...editable } = data;
    Object.assign(purchase, editable);
    await purchase.save({ session });
    if (body.purchaseStatus === 'Received') await postReceipt(purchase, session, actor);
    else if (body.purchaseStatus === 'Pending') { purchase.purchaseStatus = 'Pending'; await purchase.save({ session }); }
    await audit(purchase, 'EDIT', before, session, actor);
    return purchase.toObject();
  });
}

export async function deleteUnreceivedPurchase(purchaseId: string, actor?: string) {
  return transaction(async session => {
    const purchase = await Purchase.findById(id(purchaseId)).session(session);
    if (!purchase) fail('Purchase not found', 404);
    if (purchase.purchaseStatus === 'Received' || purchase.stockReceivedAt || purchase.stockReceiptVersion !== 1) fail('Received or unverified legacy purchases cannot be deleted; preserve their stock history.', 409);
    await audit(purchase, 'DELETE', purchase.toObject(), session, actor);
    await Purchase.deleteOne({ _id: purchase._id }, { session });
  });
}
