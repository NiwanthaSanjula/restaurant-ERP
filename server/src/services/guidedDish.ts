import { createHash } from 'crypto';
import Product from '../models/Product';
import Warehouse from '../models/Warehouse';
import Category from '../models/Category';
import Unit from '../models/Unit';
import KitchenRecipe from '../models/KitchenRecipe';
import KitchenIngredient from '../models/KitchenInventoryProduct';

export class GuidedDishError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (message: string, status = 400): never => { throw new GuidedDishError(status, message); };
const objectId = (value: unknown) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? value.toLowerCase() : fail('A valid selling location is required');
const text = (value: unknown, label: string) => typeof value === 'string' && value.trim() ? value.trim() : fail(`${label} is required`);
const amount = (value: unknown, label: string) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fail(`${label} must be an explicit non-negative number`);

function identity(body: any, actor: string) {
  if (typeof body.dishDraftRequestId !== 'string' || !/^[a-z\d-]{16,100}$/i.test(body.dishDraftRequestId)) fail('A stable dish draft request ID is required');
  if (!/^[a-f\d]{24}$/i.test(actor)) fail('An authenticated author is required', 401);
  if (body.ptype !== 'Single' || body.isInventory !== false || body.isSellable !== true || body.status !== 'Pending') fail('New Dish creates a Pending, Sellable prepared dish with one serving size');
  const locations = body.warehouse && typeof body.warehouse === 'object' && !Array.isArray(body.warehouse) ? Object.entries(body.warehouse) : [];
  if (locations.length !== 1) fail('Choose one selling location for this dish');
  const [location, raw] = locations[0] as [string, any];
  const data = { name: text(body.name, 'Dish name'), code: text(body.code, 'SKU'), category: text(body.category, 'Category'), unit: text(body.unit, 'Serving unit'), location: objectId(location), price: amount(raw?.productPrice, 'Selling price'), cost: amount(raw?.productCost, 'Recorded cost per serving') };
  const id = createHash('sha256').update(`guided-dish:${actor}:${body.dishDraftRequestId}`).digest('hex').slice(0, 24);
  const fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return { id, data, marker: { ownerId: actor, requestId: body.dishDraftRequestId, fingerprint } };
}
export async function replayGuidedDish(body: any, actor: string) {
  const { id, marker } = identity(body, actor), existing = await Product.findById(id).lean();
  if (!existing) return null;
  if (String(existing.guidedDishDraft?.ownerId) !== actor || existing.guidedDishDraft?.requestId !== marker.requestId || existing.guidedDishDraft?.fingerprint !== marker.fingerprint) fail('This draft request was used for different dish details. Resume the saved dish.', 409);
  return existing;
}
export async function prepareGuidedDish(body: any, actor: string) {
  const { id, data, marker } = identity(body, actor);
  const warehouse = await Warehouse.findById(data.location).lean();
  if (!warehouse || warehouse.isActive !== true) fail('Choose an active selling location');
  if (!await Unit.findOne({ unitName: data.unit }).lean()) fail('Create or choose an existing serving unit');
  if (!await Category.findOne({ category: data.category }).lean()) fail('Create or choose an existing category');
  return { _id: id, name: data.name, code: data.code, category: data.category, unit: data.unit, ptype: 'Single', isInventory: false, isSellable: true, status: 'Pending',
    warehouse: { [data.location]: { warehouseName: warehouse.name, productPrice: data.price, productCost: data.cost } }, guidedDishDraft: marker };
}

/** Only guided drafts gain this readiness gate; established product workflows are unchanged. */
export async function assertGuidedDishReady(product: any) {
  if (!product.guidedDishDraft || product.status !== 'Active') return;
  if (product.ptype !== 'Single' || product.isInventory !== false || product.isSellable !== true) fail('This guided dish supports one Sellable prepared serving size');
  text(product.name, 'Dish name'); text(product.code, 'SKU'); text(product.category, 'Category'); text(product.unit, 'Serving unit');
  if (!await Unit.findOne({ unitName: product.unit }).lean() || !await Category.findOne({ category: product.category }).lean()) fail('The serving unit or category is unavailable. Correct dish details before activation.');
  const entries: Array<[string, any]> = product.warehouse instanceof Map ? [...product.warehouse.entries()] : Object.entries(product.warehouse || {});
  if (!entries.length) fail('Save a selling location and price before activating this dish');
  for (const [location, values] of entries) {
    amount(values.productPrice, 'Selling price'); amount(values.productCost, 'Recorded cost per serving');
    const warehouse = await Warehouse.findById(objectId(location)).lean();
    if (!warehouse || warehouse.isActive !== true) fail('The selling location is unavailable. Keep this dish Pending until it is corrected.');
  }
  const recipe = await KitchenRecipe.findOne({ productId: product._id, variationName: null }).lean();
  if (!recipe?.ingredients?.length) fail('Save a recipe before activating this dish');
  const seen = new Set<string>();
  for (const row of recipe.ingredients) {
    const id = String(row.kitchenProductId?._id || row.kitchenProductId);
    if (seen.has(id)) fail('The recipe has duplicate ingredients'); seen.add(id);
    if (typeof row.quantity !== 'number' || !Number.isFinite(row.quantity) || row.quantity <= 0) fail('Every ingredient needs a positive quantity per serving');
    const ingredient = await KitchenIngredient.findById(id).populate('unitId', 'shortName').lean();
    const unit = (ingredient?.unitId as unknown as { shortName?: string })?.shortName;
    if (!ingredient || !unit || String(row.unit).trim().toLowerCase() !== unit.trim().toLowerCase()) fail('A recipe ingredient or its kitchen unit changed. Review the recipe before activating.');
  }
}
