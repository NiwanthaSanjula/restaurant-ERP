/**
 * Kitchen ingredient deduction — automatic recipe consumption when a sale completes.
 */
import mongoose from 'mongoose';
import KitchenInventoryProduct from '../../models/KitchenInventoryProduct';
import KitchenRecipe from '../../models/KitchenRecipe';
import KitchenStockMovement from '../../models/KitchenStockMovement';
import KitchenUnitConversion from '../../models/KitchenUnitConversion';
import Product from '../../models/Product';
import Sale from '../../models/Sale';
import Unit from '../../models/Unit';

type SaleLine = { productId: string; variation?: string | null; qty: number };

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(String(id));
}

/** Normalize populated or raw ref to string id */
function kitchenIngredientId(ref: unknown): string {
  if (ref == null) return '';
  if (typeof ref === 'object' && ref !== null && '_id' in ref) {
    return String((ref as { _id: unknown })._id);
  }
  return String(ref);
}

async function getConversionFactor(recipeUnitShort: string, kitchenUnitShort: string, session?: mongoose.ClientSession): Promise<number> {
  const rUnit = recipeUnitShort.trim().toLowerCase();
  const kUnit = kitchenUnitShort.trim().toLowerCase();
  
  if (rUnit === kUnit) return 1;

  // Find units by short name
  // Operations sharing a MongoDB transaction must run sequentially.
  const uFrom = await inSession(Unit.findOne({ shortName: { $regex: new RegExp(`^${rUnit}$`, 'i') }, businessType: 'restaurant' }), session).lean();
  const uTo = await inSession(Unit.findOne({ shortName: { $regex: new RegExp(`^${kUnit}$`, 'i') }, businessType: 'restaurant' }), session).lean();

  if (!uFrom || !uTo) return 0; // Cannot convert if unit missing

  const conv = await inSession(KitchenUnitConversion.findOne({
    fromUnitId: uFrom._id, 
    toUnitId: uTo._id 
  }), session).lean();

  return conv ? conv.factor : 0;
}

async function findRecipeForLine(
  productId: string,
  variationRaw: string | null | undefined,
  session?: mongoose.ClientSession
): Promise<{ ingredients: Array<{ kitchenProductId: unknown; quantity: number; unit: string }> } | null> {
  const v = variationRaw != null ? String(variationRaw).trim() : '';
  if (v) {
    const specific = await inSession(KitchenRecipe.findOne({
      productId,
      variationName: v
    }), session).lean();
    if (specific) return specific;
  }
  const base = await inSession(KitchenRecipe.findOne({
    productId,
    $or: [{ variationName: null }, { variationName: '' }, { variationName: { $exists: false } }]
  }), session).lean();
  return base;
}

/** kitchen ingredient id -> total quantity needed (in kitchen inventory unit) */
function inSession<T extends { session(session: mongoose.ClientSession): T }>(query: T, session?: mongoose.ClientSession): T {
  return session ? query.session(session) : query;
}

async function aggregateKitchenNeeds(products: SaleLine[], session?: mongoose.ClientSession): Promise<Map<string, number>> {
  const needs = new Map<string, number>();
  for (const line of products) {
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const pid = String(line.productId);
    const prod = await inSession(Product.findById(pid).select('isInventory name'), session).lean();
    if (!prod) continue;

    if (prod.isInventory === true) continue;

    const recipe = await findRecipeForLine(pid, line.variation, session);
    if (!recipe?.ingredients?.length) {
      throw new Error(`No recipe configured for: ${prod.name || 'product'}`);
    }

    const kidToMeta = await loadKitchenMetaForRecipe(recipe, session);
    let lineContributed = false;
    for (const ing of recipe.ingredients) {
      const kid = kitchenIngredientId(ing.kitchenProductId);
      if (!kid) {
        throw new Error('Invalid kitchen ingredient reference in recipe');
      }
      const ingQty = Number(ing.quantity);
      if (!Number.isFinite(ingQty) || ingQty <= 0) continue;

      const meta = kidToMeta.get(kid);
      if (!meta) {
        throw new Error('Kitchen ingredient in recipe no longer exists');
      }
      
      const factor = await getConversionFactor(ing.unit, meta.unitShort, session);
      if (factor === 0) {
        throw new Error(
          `Unit conversion missing for ${meta.name}: cannot convert recipe unit "${ing.unit}" to kitchen unit "${meta.unitShort}"`
        );
      }

      const add = (ingQty * factor) * qty;
      if (!Number.isFinite(add) || add <= 0) continue;
      needs.set(kid, (needs.get(kid) || 0) + add);
      lineContributed = true;
    }
    if (!lineContributed) {
      throw new Error(
        `Recipe for "${prod.name || 'product'}" has no valid ingredient quantities`
      );
    }
  }
  return needs;
}

async function loadKitchenMetaForRecipe(recipe: {
  ingredients: Array<{ kitchenProductId: unknown }>;
}, session?: mongoose.ClientSession): Promise<Map<string, { name: string; unitShort: string }>> {
  const ids = recipe.ingredients.map((i) => kitchenIngredientId(i.kitchenProductId)).filter(Boolean);
  const oids = ids.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await inSession(KitchenInventoryProduct.find({ _id: { $in: oids } })
    .populate('unitId', 'shortName unitName'), session).lean();
  const m = new Map<string, { name: string; unitShort: string }>();
  for (const r of rows) {
    const row = r as unknown as {
      _id: mongoose.Types.ObjectId;
      name?: string;
      unitId?: { shortName?: string; unitName?: string };
    };
   const us = (row.unitId?.shortName || row.unitId?.unitName || '').trim().toLowerCase();    m.set(String(row._id), { name: row.name || 'Ingredient', unitShort: us });
  }
  return m;
}

/** Throws if kitchen stock cannot satisfy prepared items on the sale */
export async function validateKitchenStockForCompletedSale(products: SaleLine[]): Promise<void> {
  const needs = await aggregateKitchenNeeds(products);
  for (const [kid, needQty] of needs.entries()) {
    const k = await KitchenInventoryProduct.findById(kid).select('currentStock name').lean();
    if (!k) throw new Error(`Kitchen ingredient missing`);
    if ((k.currentStock ?? 0) < needQty) {
      throw new Error(`Insufficient stock for ingredient: ${k.name}`);
    }
  }
}

type RolledMovement = {
  movementId: mongoose.Types.ObjectId;
  kid: string;
  qty: number;
};

function isTransactionUnsupportedError(e: unknown): boolean {
  const err = e as { code?: number; codeName?: string; message?: string };
  if (err?.code === 20 || err?.codeName === 'IllegalOperation') return true;
  const m = String(err?.message || '');
  return /replica set member/i.test(m) && /transaction/i.test(m);
}

type ProcessRecipeSaleArg =
  | string
  | mongoose.Types.ObjectId
  | { _id: unknown };

export async function processRecipeInventoryDeduction(
  sale: ProcessRecipeSaleArg,
  userId?: mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<void> {
  const saleId =
    typeof sale === 'object' && sale !== null && '_id' in sale
      ? String(sale._id)
      : String(sale);
  await applyKitchenDeductionForSale(saleId, userId, session);
}

export async function applyKitchenDeductionForSale(
  saleId: string | mongoose.Types.ObjectId,
  userId?: mongoose.Types.ObjectId,
  checkoutSession?: mongoose.ClientSession
): Promise<void> {
  const sid = typeof saleId === 'string' ? saleId : String(saleId);
  let saleOid: mongoose.Types.ObjectId;
  try {
    saleOid = toObjectId(sid);
  } catch {
    throw new Error('Invalid sale id');
  }

  const existing = await inSession(KitchenStockMovement.findOne({
    saleId: saleOid,
    source: 'sale'
  }), checkoutSession)
    .select('_id')
    .lean();
  if (existing) return;

  const sale = await inSession(Sale.findById(sid), checkoutSession).lean();
  if (!sale || sale.status !== 'completed') return;

  const lines: SaleLine[] = (sale.products || []).map((x: any) => ({
    productId: String(x.productId),
    variation: x.variation,
    qty: Number(x.qty)
  }));

  const needs = await aggregateKitchenNeeds(lines, checkoutSession);
  const invoiceRef = (sale as { invoiceId?: string }).invoiceId || sid;
  const movementBase = {
    source: 'sale' as const,
    saleId: saleOid,
    note: `Sale ${invoiceRef}`,
    ...(userId && { createdBy: userId })
  };

  const applyWithoutSession = async (): Promise<void> => {
    const rolled: RolledMovement[] = [];
    try {
      if (needs.size === 0) {
        await Sale.findByIdAndUpdate(sid, { kitchenDeductionAppliedAt: new Date() });
        return;
      }
      for (const [kid, needQty] of needs.entries()) {
        const updated = await KitchenInventoryProduct.findOneAndUpdate(
          { _id: kid, currentStock: { $gte: needQty } },
          { $inc: { currentStock: -needQty } },
          { new: true }
        );
        if (!updated) {
          const k = await KitchenInventoryProduct.findById(kid).select('name').lean();
          throw new Error(`Insufficient stock for ingredient: ${k?.name || kid}`);
        }
        const mov = await KitchenStockMovement.create({
          kitchenProductId: kid,
          type: 'out',
          quantity: needQty,
          ...movementBase
        });
        rolled.push({
          movementId: mov._id as mongoose.Types.ObjectId,
          kid,
          qty: needQty
        });
      }
      await Sale.findByIdAndUpdate(sid, { kitchenDeductionAppliedAt: new Date() });
    } catch (e) {
      for (const r of rolled.reverse()) {
        await KitchenInventoryProduct.findByIdAndUpdate(r.kid, { $inc: { currentStock: r.qty } });
        await KitchenStockMovement.deleteOne({ _id: r.movementId });
      }
      throw e;
    }
  };

  const applyWithSession = async (session: mongoose.ClientSession): Promise<void> => {
    const dup = await KitchenStockMovement.findOne({
      saleId: saleOid,
      source: 'sale'
    })
      .session(session)
      .select('_id')
      .lean();
    if (dup) return;

    if (needs.size === 0) {
      await Sale.findByIdAndUpdate(
        sid,
        { kitchenDeductionAppliedAt: new Date() },
        { session }
      );
      return;
    }

    for (const [kid, needQty] of needs.entries()) {
      const updated = await KitchenInventoryProduct.findOneAndUpdate(
        { _id: kid, currentStock: { $gte: needQty } },
        { $inc: { currentStock: -needQty } },
        { new: true, session }
      );
      if (!updated) {
        const k = await KitchenInventoryProduct.findById(kid).session(session).select('name').lean();
        throw new Error(`Insufficient stock for ingredient: ${k?.name || kid}`);
      }
      await KitchenStockMovement.create(
        [
          {
            kitchenProductId: kid,
            type: 'out' as const,
            quantity: needQty,
            ...movementBase
          }
        ],
        { session }
      );
    }
    await Sale.findByIdAndUpdate(
      sid,
      { kitchenDeductionAppliedAt: new Date() },
      { session }
    );
  };

  if (checkoutSession) {
    await applyWithSession(checkoutSession);
    return;
  }

  const session = await mongoose.startSession();
  try {
    let usedTxn = false;
    try {
      await session.withTransaction(async () => {
        await applyWithSession(session);
      });
      usedTxn = true;
    } catch (e) {
      if (!isTransactionUnsupportedError(e)) throw e;
    }
    if (!usedTxn) {
      await applyWithoutSession();
    }
  } finally {
    await session.endSession();
  }
}

export async function reverseKitchenDeductionForSale(saleId: string | mongoose.Types.ObjectId): Promise<void> {
  const sid = typeof saleId === 'string' ? saleId : String(saleId);
  let saleOid: mongoose.Types.ObjectId;
  try {
    saleOid = toObjectId(sid);
  } catch {
    throw new Error('Invalid sale id');
  }

  // Ensure sale exists and kitchen deduction was applied
  const sale = await Sale.findById(sid).select('kitchenDeductionAppliedAt').lean();
  if (!sale) throw new Error('Sale not found');
  if (!sale.kitchenDeductionAppliedAt) {
    throw new Error('Kitchen deduction not applied for this sale');
  }

  const movs = await KitchenStockMovement.find({
    saleId: saleOid,
    source: 'sale',
    type: 'out'
  }).lean();

  if (!movs.length) {
    throw new Error('No kitchen stock movements found to reverse for this sale');
  }

  const outIds: mongoose.Types.ObjectId[] = [];
  const rolled: Array<{ kid: string; qty: number; movId?: mongoose.Types.ObjectId }> = [];

  try {
    for (const m of movs) {
      const kid = String(m.kitchenProductId);
      outIds.push(m._id as mongoose.Types.ObjectId);

      // Increment kitchen stock back
      const updated = await KitchenInventoryProduct.findByIdAndUpdate(kid, {
        $inc: { currentStock: m.quantity }
      }, { new: true });

      if (!updated) {
        throw new Error(`Failed to restore kitchen ingredient: ${kid}`);
      }

      // Record an 'in' movement for auditing
      const created = await KitchenStockMovement.create({
        kitchenProductId: kid,
        type: 'in',
        quantity: m.quantity,
        source: 'manual',
        note: `Reversal (sale cancelled) ${sid}`
      });

      rolled.push({ kid, qty: m.quantity, movId: created._id as mongoose.Types.ObjectId });
    }

    // Remove original out movements
    await KitchenStockMovement.deleteMany({ _id: { $in: outIds } });

    const upd = await Sale.findByIdAndUpdate(sid, { $unset: { kitchenDeductionAppliedAt: 1 } });
    if (!upd) {
      // attempt rollback of created in-movements and stock increments
      for (const r of rolled.reverse()) {
        // decrement the stock we incremented
        await KitchenInventoryProduct.findByIdAndUpdate(r.kid, { $inc: { currentStock: -r.qty } });
        if (r.movId) await KitchenStockMovement.deleteOne({ _id: r.movId });
      }
      throw new Error('Failed to update sale deduction flag after reversing kitchen stock');
    }
  } catch (e) {
    // On any failure, attempt to rollback partial progress
    try {
      for (const r of rolled.reverse()) {
        await KitchenInventoryProduct.findByIdAndUpdate(r.kid, { $inc: { currentStock: -r.qty } });
        if (r.movId) await KitchenStockMovement.deleteOne({ _id: r.movId });
      }
    } catch (rbErr) {
      throw new Error(
        `Reverse kitchen deduction failed: ${String((e as Error).message || e)}; rollback: ${String((rbErr as Error).message || rbErr)}`
      );
    }
    throw e;
  }
}
