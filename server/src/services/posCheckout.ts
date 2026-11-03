import { createHash } from 'crypto';
import mongoose from 'mongoose';
import Customer from '../models/Customer';
import DailyOrderCounter from '../models/DailyOrderCounter';
import PosSession from '../models/PosSession';
import Product from '../models/Product';
import Sale, { ISale } from '../models/Sale';
import SpecialOffer from '../models/SpecialOffer';
import Warehouse from '../models/Warehouse';
import { applyMainStockDeductionForSale } from '../controllers/sale';
import { processRecipeInventoryDeduction } from '../controllers/kitchen/deduction';
import { formatDateOnlyParts, getZonedParts, getZonedTodayRange } from '../utils/timezone';

export class CheckoutError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const reject = (message: string): never => { throw new CheckoutError(400, message); };
const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
function amount(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9) reject(`Invalid ${label}`);
  return value as number;
}
function objectId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) reject(`Invalid ${label}`);
  return value as string;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reject('Invalid sale payload');
  return value as Record<string, unknown>;
}
function mapValue(value: unknown, key: string): unknown {
  return value instanceof Map ? value.get(key) : value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}
function entries(value: unknown): Array<[string, unknown]> {
  return value instanceof Map ? [...value.entries()] : value && typeof value === 'object' ? Object.entries(value) : [];
}
function parseCheckout(raw: unknown) {
  const body = record(raw);
  if (typeof body.checkoutRequestId !== 'string' || !/^[a-z0-9_-]{16,100}$/i.test(body.checkoutRequestId)) reject('A stable checkoutRequestId is required');
  const warehouseId = objectId(body.warehouseId, 'warehouseId'), sessionId = objectId(body.sessionId, 'sessionId');
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 500) reject('Invalid sale items');
  const items = (body.items as unknown[]).map(rawLine => {
    const line = record(rawLine), qty = amount(line.qty ?? line.quantity, 'item quantity');
    if (qty <= 0) reject('Item quantity must be greater than zero');
    return { productId: objectId(line.productId ?? line.id, 'productId'), qty,
      variation: typeof line.variation === 'string' && line.variation.trim() ? line.variation.trim() : null,
      batch: typeof line.batch === 'string' && line.batch.trim() ? line.batch.trim() : null };
  });
  const tender = { cash: 0, card: 0, bankTransfer: 0 };
  if (!Array.isArray(body.payments)) reject('Invalid payments');
  for (const rawPayment of body.payments as unknown[]) {
    const payment = record(rawPayment), type = payment.type ?? payment.paymentType;
    if (type !== 'cash' && type !== 'card' && type !== 'bankTransfer') reject('Unsupported payment method');
    const key = type as keyof typeof tender;
    tender[key] = money(tender[key] + amount(payment.amount, 'payment amount'));
  }
  const discount = amount(body.discount ?? 0, 'discount'), tax = amount(body.tax ?? 0, 'tax'), shipping = amount(body.shipping ?? 0, 'shipping');
  const discountType = body.discountType ?? 'fixed';
  if ((discountType !== 'fixed' && discountType !== 'percentage') || (discountType === 'percentage' && discount > 100) || tax > 100) reject('Invalid discount or tax');
  return { checkoutRequestId: body.checkoutRequestId as string, warehouseId, sessionId, items, tender, discount, discountType: discountType as 'fixed' | 'percentage', tax, shipping,
    customerId: body.customerId ? objectId(body.customerId, 'customerId') : null,
    specialOfferId: body.specialOfferId ? objectId(body.specialOfferId, 'specialOfferId') : null,
    serviceType: body.serviceType === 'dine-in' || body.serviceType === 'delivery' ? body.serviceType : 'takeaway' as const,
    tableId: typeof body.tableId === 'string' ? body.tableId.trim() : '' };
}

export function checkoutReceipt(sale: ISale) {
  const subtotal = money(sale.products.reduce((sum, line) => sum + line.subtotal, 0));
  const specialOfferDiscount = sale.specialOfferDiscount ?? 0;
  const discountAmount = money(sale.saleDiscountType === 'percentage' ? (subtotal - specialOfferDiscount) * sale.saleDiscountValue / 100 : sale.saleDiscountValue);
  const paid = money((sale.cashTendered ?? sale.cashAmount) + sale.cardAmount + sale.bankTransferAmount);
  return { orderId: sale.invoiceId || String(sale._id), saleId: String(sale._id), warehouseId: sale.warehouseId, posSessionId: String(sale.posSessionId),
    items: sale.products.map(line => ({ name: line.productName, quantity: line.qty, price: line.price })),
    subtotal, specialOfferDiscount, discountAmount, shipping: sale.shippingCost,
    taxAmount: money(Math.max(0, subtotal - specialOfferDiscount - discountAmount + sale.shippingCost) * sale.saleTaxValue / 100),
    total: sale.total, paid, change: sale.changeAmount ?? 0, due: sale.balance,
    payments: sale.payments?.map(payment => ({ type: payment.paymentType, amount: payment.amount })) ?? [] };
}

/** All writes, including both stock stores and the invoice counter, commit together.
 * The actor-scoped deterministic _id uses MongoDB's existing unique primary index.
 * No index migration or unsafe nontransactional fallback is needed for retries.
 */
export async function checkoutCashSale(raw: unknown, actorId: string): Promise<{ sale: ISale; replayed: boolean }> {
  objectId(actorId, 'cashier');
  const input = parseCheckout(raw);
  const id = new mongoose.Types.ObjectId(createHash('sha256').update(`pos:${actorId}:${input.checkoutRequestId}`).digest('hex').slice(0, 24));
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  function replay(sale: ISale) {
    if (sale.checkoutRequestId !== input.checkoutRequestId || sale.checkoutFingerprint !== fingerprint || String(sale.createdBy) !== actorId) {
      throw new CheckoutError(409, 'This checkout ID was already used with different details. Do not retry it as a new sale.');
    }
    return { sale, replayed: true };
  }
  const existing = await Sale.findById(id);
  if (existing) return replay(existing);
  const session = await mongoose.startSession();
  let result: { sale: ISale; replayed: boolean } | undefined;
  try {
    await session.withTransaction(async () => {
      const prior = await Sale.findById(id).session(session);
      if (prior) { result = replay(prior); return; }
      const register = await PosSession.findOneAndUpdate(
        { _id: input.sessionId, userId: actorId, status: 'OPEN' }, { $inc: { checkoutRevision: 1 } }, { new: true, session }
      );
      if (!register) reject('No active POS session found');
      const warehouse = await Warehouse.findOne({ _id: input.warehouseId, isActive: true }).session(session).lean();
      if (!warehouse) reject('Selected warehouse is unavailable');
      const customer = input.customerId
        ? await Customer.findById(input.customerId).session(session).lean()
        : await Customer.findOne({ name: { $regex: 'walk', $options: 'i' } }).session(session).lean()
          || await Customer.findOne({}).session(session).lean();
      if (!customer) reject('Selected customer is unavailable');
      const products: ISale['products'] = [];
      for (const line of input.items) {
        const product = await Product.findById(line.productId).session(session).lean();
        if (!product || product.status !== 'Active') reject('Selected product is unavailable');
        const wh = record(mapValue(product.warehouse, input.warehouseId) ?? reject('Product is unavailable in selected warehouse'));
        const batches = Array.isArray(wh.batches) ? wh.batches : [];
        // Match catalog precedence: direct warehouse price/variations, then first legacy batch.
        const usesBatch = wh.productPrice == null && entries(wh.variationValues).length === 0;
        const batch = line.batch ? batches.find(rawBatch => record(rawBatch).batchNumber === line.batch) : usesBatch ? batches[0] ?? null : null;
        if (line.batch && !batch) reject('Selected product batch is unavailable');
        const values = batch ? record(batch) : wh;
        const variations = entries(values.variationValues);
        if (variations.length && !line.variation) reject('Select a product variation');
        if (line.variation && !mapValue(values.variationValues, line.variation)) reject('Selected product variation is unavailable');
        const priceSource = line.variation ? record(mapValue(values.variationValues, line.variation)) : values;
        const price = money(amount(priceSource.productPrice, 'server product price'));
        const cost = priceSource.productCost == null ? 0 : amount(priceSource.productCost, 'server product cost');
        const batchNumber = batch ? record(batch).batchNumber : null;
        if (batch && (typeof batchNumber !== 'string' || !batchNumber)) reject('Product batch has no stock identity');
        products.push({ ...line, batch: typeof batchNumber === 'string' ? batchNumber : null,
          productName: product.name, price, cost, stockQtyAtSale: Number(priceSource.productQty ?? 0),
          discount: 0, discountType: 'fixed', tax: 0, subtotal: money(price * line.qty) });
      }
      const subtotal = money(products.reduce((sum, line) => sum + line.subtotal, 0));
      let specialOfferDiscount = 0;
      if (input.specialOfferId) {
        const offer = await SpecialOffer.findById(input.specialOfferId).session(session).lean();
        if (!offer || offer.status !== 'Active' || (offer.endDate && offer.endDate < getZonedTodayRange().start)) reject('Selected special offer is unavailable');
        specialOfferDiscount = money(subtotal * amount(offer.percentage, 'offer percentage') / 100);
      }
      const discountAmount = money(input.discountType === 'percentage' ? (subtotal - specialOfferDiscount) * input.discount / 100 : input.discount);
      const taxableBase = subtotal - specialOfferDiscount - discountAmount + input.shipping;
      const total = money(Math.max(0, taxableBase + Math.max(0, taxableBase) * input.tax / 100));
      const tendered = money(input.tender.cash + input.tender.card + input.tender.bankTransfer);
      if (tendered < total) reject('Paid amount is less than the server total. Review current prices.');
      const changeAmount = money(tendered - total);
      if (changeAmount > input.tender.cash) reject('Non-cash payments exceed the sale total; only cash can be returned as change');
      const cashAmount = money(input.tender.cash - changeAmount);
      const date = new Date(), day = formatDateOnlyParts(getZonedParts(date)).replace(/-/g, '');
      const prefix = input.serviceType === 'delivery' ? 'D' : input.serviceType === 'dine-in' ? 'DI' : 'T';
      const counter = await DailyOrderCounter.findOneAndUpdate({ prefix, date: day }, { $inc: { seq: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true, session });
      const payments = ([['cash', cashAmount], ['card', input.tender.card], ['bankTransfer', input.tender.bankTransfer]] as const)
        .filter(([, value]) => value > 0).map(([paymentType, value]) => ({ date, paymentType, amount: value }));
      const [sale] = await Sale.create([{
        _id: id, checkoutRequestId: input.checkoutRequestId, checkoutFingerprint: fingerprint,
        invoiceId: `${prefix}-${day}-${String(counter.seq).padStart(3, '0')}`,
        serviceType: input.serviceType, tableId: input.tableId, warehouseId: input.warehouseId, customerId: String(customer._id),
        date, businessType: 'restaurant', status: 'completed', paymentStatus: 'paid', saleType: 'pos', products,
        saleDiscountValue: input.discount, saleDiscountType: input.discountType, saleTaxValue: input.tax, shippingCost: input.shipping,
        specialOfferDiscount, ...(input.specialOfferId && { specialOfferId: input.specialOfferId }), total, balance: 0, profit: 0,
        cashAmount, cashTendered: input.tender.cash, changeAmount, cardAmount: input.tender.card, bankTransferAmount: input.tender.bankTransfer,
        payments, createdBy: actorId, posSessionId: register._id
      }], { session });
      await applyMainStockDeductionForSale(sale, session);
      await processRecipeInventoryDeduction(sale, new mongoose.Types.ObjectId(actorId), session);
      result = { sale, replayed: false };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
    if (!result) throw new Error('Checkout transaction did not complete');
    return result;
  } catch (error) {
    // A duplicate or lost commit acknowledgement may already represent a success.
    const saved = await Sale.findById(id);
    if (saved) return replay(saved);
    if (error instanceof CheckoutError) throw error;
    const failure = error as { code?: number; message?: string };
    if (failure.code === 20 || failure.code === 303 || /transaction.*replica set/i.test(failure.message ?? '')) {
      throw new CheckoutError(503, 'POS checkout requires database transaction support. No sale was completed.');
    }
    if (/Insufficient stock|No recipe configured|Unit conversion missing|ingredient|no valid ingredient|not available|Variation .*not found|Batch .*not found/i.test(failure.message ?? '')) {
      throw new CheckoutError(400, failure.message!);
    }
    if (failure.code === 11000) throw new CheckoutError(409, 'Checkout is being processed. Retry with the same checkout ID.');
    throw error;
  } finally {
    await session.endSession();
  }
}
