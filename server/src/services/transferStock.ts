import mongoose from 'mongoose';
import Product from '../models/Product';
import Transfer from '../models/Transfer';
import Warehouse from '../models/Warehouse';

export type TransferBalanceReview = { productId: string; sku: string; locationId: string; locationName: string; side: 'source' | 'destination'; keys: string[]; ambiguous: boolean };
export class TransferStockError extends Error {
  constructor(public status: number, message: string, public code?: string, public review?: TransferBalanceReview[]) { super(message); }
}
const fail = (status: number, message: string): never => { throw new TransferStockError(status, message); };
const transitions: Record<string, string[]> = { Pending: ['Approved', 'Cancelled'], Approved: ['Completed', 'Cancelled'], Completed: [], Cancelled: [] };
const entries = (value: any): Array<[string, any]> => value instanceof Map ? [...value.entries()] : Object.entries(value || {});
const get = (value: any, key: string) => value instanceof Map ? value.get(key) : value?.[key];
const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

/** Name-keyed balances are review cases, never candidates to copy, merge or rekey. */
export function transferBalanceReview(product: any, location: { _id: unknown; name: string }, side: 'source' | 'destination', historicName?: string): TransferBalanceReview | null {
  const id = String(location._id), names = [location.name, historicName].map(normalize).filter(Boolean);
  const balances = entries(product.warehouse);
  const legacy = balances.filter(([key, stock]) => key !== id && (names.includes(normalize(key)) || names.includes(normalize(stock?.warehouseName))));
  if (!legacy.length) return null;
  const keys = [...(get(product.warehouse, id) ? [id] : []), ...legacy.map(([key]) => key)];
  return { productId: String(product._id), sku: product.code || '', locationId: id, locationName: location.name, side, keys, ambiguous: keys.length > 1 };
}

async function transaction<T>(work: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => { result = await work(session); }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
    return result!;
  } finally { await session.endSession(); }
}

/** Product balances and the saved transfer's completion commit together. */
async function moveStock(transfer: any, session: mongoose.ClientSession) {
  const fromId = String(transfer.fromWarehouse), toId = String(transfer.toWarehouse);
  if (fromId === toId) fail(400, 'Source and destination warehouses must be different');
  const source = await Warehouse.findById(fromId).session(session).lean();
  const destination = await Warehouse.findById(toId).session(session).lean();
  if (!source || !destination) fail(400, 'A transfer location is unavailable');
  if (!Array.isArray(transfer.items) || !transfer.items.length) fail(400, 'At least one transfer item is required');
  const review: TransferBalanceReview[] = [], products = new Map<string, any>();
  // Resolve every line before posting, including legacy conflicts on either side.
  for (const item of transfer.items) {
    const id = String(item.productId);
    if (!products.has(id)) {
      const product = await Product.findById(id).session(session);
      if (!product) fail(400, 'Product not found.');
      products.set(id, product);
      const outgoing = transferBalanceReview(product, source, 'source', transfer.fromWarehouseName);
      const incoming = transferBalanceReview(product, destination, 'destination', transfer.toWarehouseName);
      if (outgoing) review.push(outgoing);
      if (incoming) review.push(incoming);
    }
  }
  if (review.length) throw new TransferStockError(409, 'Legacy warehouse balances require review. No stock moved; no balances were merged or migrated.', 'legacy_warehouse_balance', review);
  for (const item of transfer.items) {
    const product = products.get(String(item.productId)), warehouseMap = product.warehouse;
    const sourceData = get(warehouseMap, fromId);
    const sourceVariation = item.variation ? get(sourceData?.variationValues, item.variation) : null;
    const sourceBalance = sourceVariation || sourceData;
    const quantity = Number(item.qty), stock = Number(sourceBalance?.productQty ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(stock) || stock < quantity) fail(400, `Transfer quantity cannot exceed available stock. ${product.name} has only ${stock} unit(s) available in ${source.name}. Please choose a lower quantity.`);
    if (!sourceData || (item.variation && !sourceVariation)) fail(400, 'The source item or variation is unavailable');
    sourceBalance.productQty = stock - quantity;
    warehouseMap.set(fromId, sourceData);

    let destData = get(warehouseMap, toId);
    if (destData) {
      const destVariation = item.variation ? get(destData.variationValues, item.variation) : null;
      if (destVariation) destVariation.productQty = Number(destVariation.productQty || 0) + quantity;
      else if (item.variation) {
        destData.variationValues ||= new Map();
        const value = { ...(sourceVariation?.toObject?.() || sourceVariation), productQty: quantity, stockAlert: sourceVariation?.stockAlert ?? 0 };
        if (destData.variationValues instanceof Map) destData.variationValues.set(item.variation, value);
        else destData.variationValues[item.variation] = value;
      } else destData.productQty = Number(destData.productQty || 0) + quantity;
    } else {
      // Preserve the existing destination cost, price and alert defaults.
      destData = {
        warehouseName: destination.name,
        productQty: item.variation ? 0 : quantity,
        productCost: sourceData.productCost || item.cost,
        productPrice: sourceData.productPrice || (sourceData.productCost || item.cost) * 1.2,
        stockAlert: sourceData.stockAlert ?? 0,
        variationValues: item.variation ? { [item.variation]: { ...(sourceVariation?.toObject?.() || sourceVariation), productQty: quantity, stockAlert: sourceVariation?.stockAlert ?? 0 } } : {}
      };
    }
    warehouseMap.set(toId, destData);
  }
  for (const product of products.values()) await product.save({ session });
}

export async function createStockTransfer(body: any) {
  const data = Object.fromEntries(['fromWarehouse', 'toWarehouse', 'fromWarehouseName', 'toWarehouseName', 'items', 'notes', 'date', 'subtotal', 'tax', 'discount', 'shipping', 'grandTotal'].map(key => [key, body[key]]));
  Object.assign(data, { reference: `TR-${Date.now()}`, status: body.status || 'Pending' });
  if (data.status !== 'Completed') return Transfer.create(data);
  return transaction(async session => {
    await moveStock(data, session);
    const [transfer] = await Transfer.create([data], { session });
    return transfer;
  });
}

export async function updateStockTransfer(id: string, body: any) {
  return transaction(async session => {
    const old = await Transfer.findById(id).session(session);
    if (!old) fail(404, 'Transfer not found');
    const oldStatus = String(old.status), newStatus = body.status;
    if (oldStatus === 'Completed' || oldStatus === 'Cancelled') fail(403, 'This transfer cannot be edited. Completed and Cancelled transfers are read-only.');
    if (newStatus && newStatus !== oldStatus && !transitions[oldStatus]?.includes(newStatus)) fail(400, `Status change from ${oldStatus} to ${newStatus} is not allowed. Allowed: ${(transitions[oldStatus] || []).join(', ')}.`);
    let update: any = { ...body };
    if (oldStatus === 'Approved') {
      update = { status: body.status ?? oldStatus, notes: body.notes !== undefined ? body.notes : old.notes };
      for (const key of ['fromWarehouse', 'toWarehouse', 'fromWarehouseName', 'toWarehouseName', 'date', 'items', 'subtotal', 'tax', 'discount', 'shipping', 'grandTotal']) update[key] = old[key];
    }
    if (update.status === 'Completed') await moveStock(update, session);
    return Transfer.findByIdAndUpdate(id, update, { new: true, session });
  });
}
