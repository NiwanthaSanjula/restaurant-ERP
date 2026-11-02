import { NextFunction, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import KitchenRecipe from '../../models/KitchenRecipe';
import Product from '../../models/Product';
import KitchenInventoryProduct from '../../models/KitchenInventoryProduct';
import { authenticate, AuthRequest } from '../../middleware/auth';

/** Maps spec field `ingredientProductId` → `kitchenProductId` before validators run. */
export function normalizeRecipeBody(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (req.body && Array.isArray(req.body.ingredients)) {
    req.body.ingredients = req.body.ingredients.map((row: Record<string, unknown>) => {
      const kid = row.kitchenProductId ?? row.ingredientProductId;
      return {
        quantity: row.quantity,
        unit: row.unit,
        kitchenProductId: kid
      };
    });
  }
  next();
}

function calculateRecipeCost(recipe: any): number {
  if (!recipe || !recipe.ingredients) return 0;
  return recipe.ingredients.reduce((acc: number, ing: any) => {
    const cost = ing.kitchenProductId?.averageCost || 0;
    return acc + (cost * ing.quantity);
  }, 0);
}

/**
 * Public API shape (spec): ingredients use ingredientProductId + ingredientName.
 * DB still stores kitchenProductId (+ optional ingredientName snapshot).
 */
export function toPublicRecipe(recipe: any, recipeCost?: number): Record<string, unknown> | null {
  if (!recipe) return null;
  const ingredients = (recipe.ingredients || []).map((ing: any) => {
    const kp = ing.kitchenProductId;
    const id =
      typeof kp === 'object' && kp != null && kp._id != null
        ? String(kp._id)
        : String(ing.kitchenProductId ?? '');
    const ingredientName =
      (ing.ingredientName && String(ing.ingredientName).trim()) ||
      (typeof kp === 'object' && kp != null && kp.name ? String(kp.name) : '');
    return {
      ingredientProductId: id,
      ingredientName,
      quantity: ing.quantity,
      unit: ing.unit
    };
  });
  const out: Record<string, unknown> = {
    _id: recipe._id,
    productId: recipe.productId,
    ingredients,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt
  };
  if (recipe.variationName != null && recipe.variationName !== '') {
    out.variationName = recipe.variationName;
  }
  if (recipeCost != null && Number.isFinite(recipeCost)) {
    out.recipeCost = recipeCost;
  }
  return out;
}

/** List row: public recipe + dish name/code for tables */
function toListRecipe(recipe: any): Record<string, unknown> | null {
  const pub = toPublicRecipe(recipe, calculateRecipeCost(recipe));
  if (!pub) return null;
  const p = recipe.productId;
  if (p && typeof p === 'object' && p._id != null) {
    return {
      ...pub,
      productId: String(p._id),
      dishName: p.name ?? '',
      dishCode: p.code ?? ''
    };
  }
  return { ...pub, productId: String(recipe.productId ?? '') };
}

export const getRecipesList = [
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const q = (req.query.q as string | undefined)?.trim();
      let match: Record<string, unknown> = {};
      if (q) {
        const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(esc, 'i');
        const prods = await Product.find({
          isInventory: false,
          $or: [{ name: rx }, { code: rx }]
        })
          .select('_id')
          .lean();
        const ids = prods.map((p) => p._id);
        if (ids.length === 0) {
          res.json({ status: 'success', data: [] });
          return;
        }
        match = { productId: { $in: ids } };
      }

      const recipes = await KitchenRecipe.find(match)
        .populate({ path: 'productId', select: 'name code isInventory' })
        .populate({
          path: 'ingredients.kitchenProductId',
          select: 'name averageCost unitId',
          populate: { path: 'unitId', select: 'shortName unitName' }
        })
        .sort({ updatedAt: -1 })
        .lean();

      const data = recipes
        .map((r) => toListRecipe(r))
        .filter((x): x is Record<string, unknown> => x != null)
        .filter((row) => {
          const p = row.productId;
          return typeof p === 'string' && p.length > 0;
        });

      res.json({ status: 'success', data });
    } catch (e: any) {
      res.status(500).json({
        status: 'error',
        message: e.message || 'Failed to list recipes'
      });
    }
  }
];

export const getRecipeByProductId = [
  authenticate,
  param('productId').isMongoId().withMessage('Invalid product id'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }
      const { variationName } = req.query as { variationName?: string };
      const prod = await Product.findById(req.params.productId).select('isInventory').lean();
      if (!prod) {
        res.status(404).json({ status: 'error', message: 'Product not found' });
        return;
      }
      if (prod.isInventory !== false) {
        res.status(400).json({
          status: 'error',
          message: 'Recipes apply only to prepared products (isInventory: false)'
        });
        return;
      }
      const query: any = { productId: req.params.productId };
      if (variationName) {
        query.variationName = variationName;
      } else {
        query.variationName = null;
      }

      const recipe = await KitchenRecipe.findOne(query)
        .populate({ path: 'ingredients.kitchenProductId', select: 'name averageCost unitId', populate: { path: 'unitId', select: 'shortName unitName' } })
        .lean();
      
      const cost = calculateRecipeCost(recipe);
      res.json({
        status: 'success',
        data: recipe ? toPublicRecipe(recipe, cost) : null
      });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch recipe' });
    }
  }
];

export const upsertRecipeValidators = [
  authenticate,
  body('productId').isMongoId().withMessage('Valid product id is required'),
  body('variationName').optional({ nullable: true }).isString().trim(),
  body('ingredients').isArray({ min: 1 }).withMessage('At least one ingredient is required'),
  // After normalizeRecipeBody: each row has kitchenProductId (from ingredientProductId or kitchenProductId)
  body('ingredients.*.kitchenProductId').isMongoId().withMessage('Invalid ingredientProductId / kitchen product id'),
  body('ingredients.*.quantity')
    .isFloat({ min: 0.0001 })
    .withMessage('Ingredient quantity must be > 0')
    .custom((v) => Number.isFinite(Number(v)))
    .withMessage('Ingredient quantity must be a finite number'),
  body('ingredients.*.unit').trim().notEmpty().withMessage('Ingredient unit is required')
];

export const deleteRecipeById = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid recipe id'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }
      const doc = await KitchenRecipe.findByIdAndDelete(req.params.id);
      if (!doc) {
        res.status(404).json({ status: 'error', message: 'Recipe not found' });
        return;
      }
      res.json({ status: 'success', message: 'Recipe deleted' });
    } catch (e: any) {
      res.status(500).json({
        status: 'error',
        message: e.message || 'Failed to delete recipe'
      });
    }
  }
];

export const upsertRecipe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ status: 'error', message: errors.array()[0].msg });
      return;
    }
    const { productId, variationName, ingredients } = req.body as {
      productId: string;
      variationName?: string | null;
      ingredients: Array<{ kitchenProductId: string; quantity: number; unit: string }>;
    };

    const prod = await Product.findById(productId).select('isInventory name').lean();
    if (!prod) {
      res.status(404).json({ status: 'error', message: 'Product not found' });
      return;
    }
    if (prod.isInventory !== false) {
      res.status(400).json({
        status: 'error',
        message: 'Recipes can only be attached to prepared products (isInventory: false)'
      });
      return;
    }

    const seen = new Set<string>();
    for (const ing of ingredients) {
      const k = String(ing.kitchenProductId);
      if (seen.has(k)) {
        res.status(400).json({ status: 'error', message: 'Duplicate ingredient in recipe' });
        return;
      }
      seen.add(k);
      const kp = await KitchenInventoryProduct.findById(ing.kitchenProductId).populate('unitId', 'shortName').lean();
      if (!kp) {
        res.status(400).json({ status: 'error', message: `Kitchen ingredient not found: ${ing.kitchenProductId}` });
        return;
      }
      const short = (kp as any).unitId?.shortName || '';
      if (String(ing.unit).trim().toLowerCase() !== String(short).trim().toLowerCase()) {
        res.status(400).json({
          status: 'error',
          message: `Unit for ${(kp as any).name} must match kitchen unit "${short}"`
        });
        return;
      }
    }

    const pid = new mongoose.Types.ObjectId(productId);
    const vname = variationName ? String(variationName).trim() : null;
    const ing = [];
    for (const i of ingredients) {
      const qNum = Number(i.quantity);
      if (!Number.isFinite(qNum) || qNum <= 0) {
        res.status(400).json({
          status: 'error',
          message: 'Each ingredient must have a finite quantity greater than 0'
        });
        return;
      }
      const kp = await KitchenInventoryProduct.findById(i.kitchenProductId).select('name').lean();
      ing.push({
        kitchenProductId: new mongoose.Types.ObjectId(i.kitchenProductId),
        ingredientName: kp?.name || '',
        quantity: qNum,
        unit: String(i.unit).trim().toLowerCase()
      });
    }

    await KitchenRecipe.findOneAndUpdate(
      { productId: pid, variationName: vname },
      { $set: { ingredients: ing }, $setOnInsert: { productId: pid, variationName: vname } },
      { upsert: true, new: true, runValidators: true }
    );
    const doc = await KitchenRecipe.findOne({ productId: pid, variationName: vname })
      .populate({
        path: 'ingredients.kitchenProductId',
        select: 'name averageCost unitId',
        populate: { path: 'unitId', select: 'shortName unitName' }
      })
      .lean();

    const cost = calculateRecipeCost(doc);
    res.json({
      status: 'success',
      message: 'Recipe saved',
      data: doc ? toPublicRecipe(doc, cost) : null
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Failed to save recipe' });
  }
};
