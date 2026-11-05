import { createHash } from 'crypto';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Warehouse from '../models/Warehouse';
import Unit from '../models/Unit';
import KitchenProduct from '../models/KitchenInventoryProduct';
import Movement from '../models/KitchenStockMovement';
import ActivityLog from '../models/ActivityLog';

export class KitchenIssueError extends Error {
  constructor(public status: number, message: string, public code = 'validation') { super(message); }
}
const fail = (message: string, status = 400, code = 'validation'): never => { throw new KitchenIssueError(status, message, code); };
const ref = (value: any): string => {
  const result = String(value?._id ?? value ?? '');
  return /^[a-f\d]{24}$/i.test(result) ? result : fail('Invalid item, ingredient, unit or warehouse reference');
};
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fail('Quantities must be positive finite numbers');
const revision = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fail('A valid conversion revision is required');
function fields(body: any, allowed: string[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail('Unsupported kitchen issue fields');
}
const norm = (value: unknown) => String(value || '').trim().toLowerCase();
const unitMatches = (stockUnit: string, unit: any) => [ref(unit._id), unit.unitName, unit.shortName].some(value => norm(value) === norm(stockUnit));
const scoped = (query: any, session?: mongoose.ClientSession) => session ? query.session(session) : query;
async function transaction<T>(work: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => { result = await work(session); }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
    return result!;
  } finally { await session.endSession(); }
}

function compatible(source: any, target: any, factor: number) {
  const measures: Record<string, [string, number]> = { kg: ['mass', 1000], g: ['mass', 1], mg: ['mass', 0.001], l: ['volume', 1000], ml: ['volume', 1], cl: ['volume', 10] };
  const from = measures[norm(source.shortName)], to = measures[norm(target.shortName)];
  if (from && to && from[0] !== to[0]) fail('Mass and volume units are incompatible for this issue; no density conversion is supported');
  const expected = ref(source._id) === ref(target._id) ? 1 : from && to ? from[1] / to[1] : undefined;
  if (expected !== undefined && Math.abs(factor - expected) > Math.max(1, expected) * 1e-9) fail('The declared conversion is incompatible with these units');
}
async function source(warehouseId: string, productId: string, session?: mongoose.ClientSession) {
  const warehouse = await scoped(Warehouse.findById(ref(warehouseId)), session).lean();
  const product = await scoped(Product.findById(ref(productId)), session).lean();
  if (!warehouse || warehouse.isActive === false) fail('Select an active source warehouse');
  if (!product || product.isInventory !== true || product.ptype !== 'Single' || product.hasBatches || product.isWeight) fail('Kitchen issues support single stock-tracked items without variations or batches');
  const wh = product.warehouse instanceof Map ? product.warehouse.get(ref(warehouseId)) : product.warehouse?.[ref(warehouseId)];
  if (!wh) fail('No canonical stock balance exists in this warehouse. Legacy warehouse keys need review.', 409, 'conflict');
  if (wh.batches?.length || Object.keys(wh.variationValues || {}).length) fail('Variation and batch stock cannot be issued by this action');
  if (typeof wh.productQty !== 'number' || !Number.isFinite(wh.productQty) || wh.productQty < 0) fail('The source stock balance needs review', 409, 'conflict');
  if (!product.unit) fail('The item needs a stock unit');
  return { warehouse, product, wh };
}
function publicRule(rule: any) {
  if (!rule) return null;
  return { sourceUnitId: ref(rule.sourceUnitId), stockUnit: rule.stockUnit, sourceShort: rule.sourceShort, kitchenUnitId: ref(rule.kitchenUnitId), kitchenShort: rule.kitchenShort,
    warehouseQuantity: rule.warehouseQuantity, kitchenQuantity: rule.kitchenQuantity, factor: rule.factor, revision: rule.revision };
}
function publicIssue(movement: any) {
  const { requestHash: _privateHash, ...legs } = movement.warehouseIssue;
  return { id: ref(movement._id), ingredientId: ref(movement.kitchenProductId), quantity: movement.quantity, postedAt: movement.createdAt, ...legs };
}
export async function kitchenIssueOptions(warehouseId: string, productId: string, actorId: string) {
  const { warehouse, product, wh } = await source(warehouseId, productId);
  const units = await Unit.find({}).select('_id unitName shortName').sort({ unitName: 1 }).lean();
  const unitById = new Map(units.map(unit => [ref(unit._id), unit]));
  const matchingUnits = units.filter(unit => unitMatches(product.unit, unit));
  const ingredients = await KitchenProduct.find({ $or: [{ inventoryProductId: ref(productId) }, { inventoryProductId: null }] })
    .select('_id name unitId inventoryProductId currentStock warehouseIssueConversion').sort({ name: 1 }).lean();
  const history = await Movement.find({ source: 'warehouse_issue', 'warehouseIssue.warehouseId': ref(warehouseId), 'warehouseIssue.productId': ref(productId) }).sort({ createdAt: -1 }).limit(20).lean();
  return {
    actorId: ref(actorId), warehouse: { id: ref(warehouse._id), name: warehouse.name }, item: { id: ref(product._id), name: product.name, code: product.code, stockUnit: matchingUnits.length === 1 ? matchingUnits[0].shortName : product.unit, onHand: wh.productQty },
    sourceUnits: matchingUnits.map(unit => ({ id: ref(unit._id), name: unit.unitName, shortName: unit.shortName })),
    ingredients: ingredients.map(ingredient => {
      const unit = unitById.get(ref(ingredient.unitId));
      return { id: ref(ingredient._id), name: ingredient.name, unitId: ref(ingredient.unitId), unit: unit?.shortName || '', onHand: ingredient.currentStock,
        linked: ingredient.inventoryProductId ? ref(ingredient.inventoryProductId) === ref(productId) : false, conversion: publicRule(ingredient.warehouseIssueConversion) };
    }), history: history.map(publicIssue)
  };
}

export async function saveKitchenIssueConversion(productId: string, body: any, actorId: string) {
  fields(body, ['warehouseId', 'kitchenProductId', 'sourceUnitId', 'warehouseQuantity', 'kitchenQuantity', 'expectedRevision', 'linkIngredient']);
  const fromQty = positive(body.warehouseQuantity), toQty = positive(body.kitchenQuantity), expected = revision(body.expectedRevision), factor = positive(toQty / fromQty);
  return transaction(async session => {
    const { product } = await source(ref(body.warehouseId), ref(productId), session);
    const ingredient = await KitchenProduct.findById(ref(body.kitchenProductId)).session(session).lean();
    if (!ingredient) fail('Kitchen ingredient not found');
    const linked = ingredient.inventoryProductId ? ref(ingredient.inventoryProductId) : null;
    if (linked && linked !== ref(productId)) fail('This ingredient is linked to another item', 409, 'conflict');
    if (!linked && body.linkIngredient !== true) fail('Explicitly confirm linking this existing ingredient to the item');
    const from = await Unit.findById(ref(body.sourceUnitId)).session(session).lean();
    const to = await Unit.findById(ref(ingredient.unitId)).session(session).lean();
    if (!from || !to || !unitMatches(product.unit, from)) fail('The selected units do not match the item and ingredient');
    compatible(from, to, factor);
    const current = ingredient.warehouseIssueConversion;
    if ((current?.revision || 0) !== expected) fail('The conversion changed. Reload it before saving.', 409, 'conflict');
    const rule = { productId: ref(productId), sourceUnitId: ref(from._id), stockUnit: product.unit, sourceShort: from.shortName,
      kitchenUnitId: ref(to._id), kitchenShort: to.shortName, warehouseQuantity: fromQty, kitchenQuantity: toQty, factor,
      revision: expected + 1, confirmedBy: ref(actorId), confirmedAt: new Date() };
    const filter: any = { _id: ingredient._id, unitId: ingredient.unitId, inventoryProductId: linked };
    if (current) filter['warehouseIssueConversion.revision'] = expected;
    else filter.warehouseIssueConversion = { $exists: false };
    const update = await KitchenProduct.updateOne(filter, { $set: { inventoryProductId: ref(productId), warehouseIssueConversion: rule } }, { session });
    if (update.matchedCount !== 1) fail('The ingredient or conversion changed. Reload before saving.', 409, 'conflict');
    await ActivityLog.create([{ action: 'CONFIGURE_KITCHEN_ISSUE', entityType: 'KitchenInventoryProduct', entityId: ref(ingredient._id), userId: ref(actorId), before: { inventoryProductId: linked, conversion: current }, after: { inventoryProductId: ref(productId), conversion: rule } }], { session });
    return publicRule(rule);
  });
}

async function preview(warehouseId: string, body: any, session?: mongoose.ClientSession) {
  const quantity = positive(body.quantity), expected = revision(body.conversionRevision);
  const { warehouse, product, wh } = await source(warehouseId, ref(body.productId), session);
  const ingredient = await scoped(KitchenProduct.findById(ref(body.kitchenProductId)), session).lean();
  if (!ingredient || !ingredient.inventoryProductId || ref(ingredient.inventoryProductId) !== ref(product._id)) fail('Select an ingredient linked to this item');
  const rule = ingredient.warehouseIssueConversion;
  if (!rule) fail('Save an explicit per-item conversion before issuing stock');
  if (rule.revision !== expected) fail('The conversion changed. Reload and review it before posting.', 409, 'conflict');
  const from = await scoped(Unit.findById(ref(rule.sourceUnitId)), session).lean();
  const to = await scoped(Unit.findById(ref(ingredient.unitId)), session).lean();
  if (!from || !to || ref(rule.productId) !== ref(product._id) || rule.stockUnit !== product.unit || ref(rule.kitchenUnitId) !== ref(ingredient.unitId) || rule.sourceShort !== from.shortName || rule.kitchenShort !== to.shortName || !unitMatches(product.unit, from)) fail('The stored conversion no longer matches these units. Review it before issuing.', 409, 'conflict');
  const factor = positive(rule.factor);
  if (Math.abs(factor - positive(rule.kitchenQuantity) / positive(rule.warehouseQuantity)) > Math.max(1, factor) * 1e-9) fail('The stored conversion is invalid');
  compatible(from, to, factor);
  if (typeof ingredient.currentStock !== 'number' || !Number.isFinite(ingredient.currentStock) || ingredient.currentStock < 0) fail('Kitchen stock needs review', 409, 'conflict');
  if (wh.productQty < quantity) fail('Insufficient warehouse stock for this issue', 409, 'conflict');
  const converted = positive(quantity * factor);
  if (!Number.isFinite(ingredient.currentStock + converted)) fail('The converted quantity is too large');
  if (wh.productQty - quantity >= wh.productQty || ingredient.currentStock + converted <= ingredient.currentStock) fail('The quantity is below the precision supported by these balances');
  return { productId: ref(product._id), ingredientId: ref(ingredient._id), warehouseId: ref(warehouse._id), warehouseName: warehouse.name, productName: product.name, kitchenName: ingredient.name,
    sourceQuantity: quantity, sourceUnit: from.shortName, kitchenUnit: to.shortName, quantity: converted, factor, conversionRevision: rule.revision,
    warehouseQuantity: rule.warehouseQuantity, kitchenQuantity: rule.kitchenQuantity, sourceBefore: wh.productQty, sourceAfter: wh.productQty - quantity,
    kitchenBefore: ingredient.currentStock, kitchenAfter: ingredient.currentStock + converted, kitchenUnitId: ref(to._id) };
}
export async function previewKitchenIssue(warehouseId: string, body: any) {
  fields(body, ['productId', 'kitchenProductId', 'quantity', 'conversionRevision']);
  return preview(ref(warehouseId), body);
}
export async function postKitchenIssue(warehouseId: string, body: any, actorId: string) {
  fields(body, ['productId', 'kitchenProductId', 'quantity', 'conversionRevision', 'requestId']);
  if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId)) fail('A stable issue request ID is required');
  const wid = ref(warehouseId), pid = ref(body.productId), kid = ref(body.kitchenProductId), actor = ref(actorId), qty = positive(body.quantity), rev = revision(body.conversionRevision);
  const movementId = createHash('sha256').update(`warehouse-issue:${actor}:${body.requestId}`).digest('hex').slice(0, 24);
  const requestHash = createHash('sha256').update(JSON.stringify([wid, pid, kid, qty, rev])).digest('hex');
  const replay = (existing: any) => {
    if (existing.source !== 'warehouse_issue' || ref(existing.createdBy) !== actor || existing.warehouseIssue?.requestHash !== requestHash) fail('This request ID was already used for a different issue. Review history before starting another.', 409, 'request_reused');
    return { issue: publicIssue(existing), replayed: true };
  };
  try { return await transaction(async session => {
    const existing = await Movement.findById(movementId).session(session).lean();
    if (existing) return replay(existing);
    const result = await preview(wid, body, session);
    const outgoing = await Product.updateOne({ _id: pid, [`warehouse.${wid}.productQty`]: { $gte: qty } }, { $inc: { [`warehouse.${wid}.productQty`]: -qty } }, { session });
    if (outgoing.matchedCount !== 1) fail('Source stock changed; refresh before issuing', 409, 'conflict');
    const incoming = await KitchenProduct.updateOne({ _id: kid, unitId: result.kitchenUnitId, inventoryProductId: pid, 'warehouseIssueConversion.revision': rev, currentStock: { $gte: 0 } }, { $inc: { currentStock: result.quantity } }, { session });
    if (incoming.matchedCount !== 1) fail('The ingredient or conversion changed; refresh before issuing', 409, 'conflict');
    const { ingredientId: _ingredient, quantity: _quantity, kitchenUnitId: _unit, ...legs } = result;
    const [movement] = await Movement.create([{ _id: movementId, kitchenProductId: kid, source: 'warehouse_issue', type: 'in', quantity: result.quantity,
      createdBy: actor, note: `Issue from ${result.warehouseName}: ${qty} ${result.sourceUnit} out / ${result.quantity} ${result.kitchenUnit} in.`, warehouseIssue: { ...legs, requestHash } }], { session });
    await ActivityLog.create([{ action: 'ISSUE_TO_KITCHEN', entityType: 'KitchenStockMovement', entityId: movementId, userId: actor, after: result }], { session });
    return { issue: publicIssue(movement.toObject()), replayed: false };
  }); } catch (error: any) {
    if (error.code === 11000) { const existing = await Movement.findById(movementId).lean(); if (existing) return replay(existing); }
    throw error;
  }
}
