import { Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import KitchenInventoryProduct from '../../models/KitchenInventoryProduct';
import KitchenStockMovement from '../../models/KitchenStockMovement';
import Unit from '../../models/Unit';
import Product from '../../models/Product';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { enrichKitchenProductDoc } from './stockAlertFromProduct';

const populateUnit = { path: 'unitId', select: 'unitName shortName' };
const populateInventoryProduct = {
  path: 'inventoryProductId',
  select: 'name code warehouse ptype isInventory'
};
const populateKitchen = [populateUnit, populateInventoryProduct];

export const getKitchenProducts = [
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { q, warehouseId } = req.query as { q?: string; warehouseId?: string };
      const filter: Record<string, unknown> = {};
      if (q?.trim()) {
        filter.name = { $regex: q.trim(), $options: 'i' };
      }
      const products = await KitchenInventoryProduct.find(filter)
        .populate(populateKitchen)
        .sort({ name: 1 })
        .lean();
      const wid = warehouseId && String(warehouseId).trim() ? String(warehouseId).trim() : undefined;
      const data = (products as any[]).map((p) => enrichKitchenProductDoc(p, wid));
      res.json({ status: 'success', data });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch kitchen products' });
    }
  }
];

export const getKitchenProductById = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid product id'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }
      const { warehouseId } = req.query as { warehouseId?: string };
      const wid = warehouseId && String(warehouseId).trim() ? String(warehouseId).trim() : undefined;
      const doc = await KitchenInventoryProduct.findById(req.params.id).populate(populateKitchen).lean();
      if (!doc) {
        res.status(404).json({ status: 'error', message: 'Kitchen product not found' });
        return;
      }
      res.json({ status: 'success', data: enrichKitchenProductDoc(doc, wid) });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch kitchen product' });
    }
  }
];

export const getKitchenProductMovements = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid product id'),
  query('limit').optional().isInt({ min: 1, max: 500 }).toInt(),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }
      const limit = (req.query.limit as unknown as number) || 100;
      const product = await KitchenInventoryProduct.findById(req.params.id).select('_id').lean();
      if (!product) {
        res.status(404).json({ status: 'error', message: 'Kitchen product not found' });
        return;
      }
      const movements = await KitchenStockMovement.find({ kitchenProductId: req.params.id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('createdBy', 'name email')
        .lean();
      res.json({ status: 'success', data: movements });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch movements' });
    }
  }
];

export const createKitchenProductValidators = [
  authenticate,
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('unitId').isMongoId().withMessage('Valid unit id is required'),
  body('minStockLevel').optional().isFloat({ min: 0 }).withMessage('Minimum stock must be >= 0'),
  body('initialStock').optional().isFloat({ min: 0 }).withMessage('Opening stock must be >= 0'),
  body('inventoryProductId').optional({ nullable: true }).isMongoId().withMessage('Invalid inventory product id'),
  body('description').optional().trim()
];

export const createKitchenProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ status: 'error', message: errors.array()[0].msg });
      return;
    }
    const { name, unitId, minStockLevel, description, inventoryProductId, initialStock } = req.body;
    const openingQty =
      initialStock !== undefined && initialStock !== null && initialStock !== ''
        ? Math.max(0, Number(initialStock))
        : 0;
    const unit = await Unit.findById(unitId);
    if (!unit) {
      res.status(400).json({ status: 'error', message: 'Unit not found' });
      return;
    }
    if (inventoryProductId) {
      const ip = await Product.findById(inventoryProductId).select('isInventory name').lean();
      if (!ip) {
        res.status(400).json({ status: 'error', message: 'Linked product not found' });
        return;
      }
      if (ip.isInventory !== true) {
        res.status(400).json({
          status: 'error',
          message: 'Link only products with isInventory: true (countable SKUs with stock alert). Prepared meals cannot be linked.'
        });
        return;
      }
    }
    const dup = await KitchenInventoryProduct.findOne({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    });
    if (dup) {
      res.status(400).json({ status: 'error', message: 'A kitchen product with this name already exists' });
      return;
    }
    const doc = await KitchenInventoryProduct.create({
      name: String(name).trim(),
      unitId,
      currentStock: openingQty,
      ...(inventoryProductId ? { inventoryProductId: new mongoose.Types.ObjectId(inventoryProductId) } : {}),
      ...(minStockLevel !== undefined && minStockLevel !== null && { minStockLevel: Number(minStockLevel) }),
      ...(description && { description: String(description).trim() })
    });
    if (openingQty > 0) {
      const userId = req.user?._id;
      await KitchenStockMovement.create({
        kitchenProductId: doc._id,
        type: 'in',
        quantity: openingQty,
        source: 'manual',
        note: 'Opening balance',
        ...(userId && { createdBy: userId })
      });
    }
    const populated = await KitchenInventoryProduct.findById(doc._id).populate(populateKitchen).lean();
    res.status(201).json({
      status: 'success',
      message: 'Kitchen product created',
      data: enrichKitchenProductDoc(populated, undefined)
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Failed to create kitchen product' });
  }
};

export const updateKitchenProductValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid product id'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('unitId').optional().isMongoId().withMessage('Valid unit id is required'),
  body('minStockLevel')
    .optional({ nullable: true })
    .custom((val) => val === null || val === undefined || (typeof val === 'number' && val >= 0))
    .withMessage('Minimum stock must be >= 0'),
  body('inventoryProductId')
    .optional({ nullable: true })
    .custom((val) => val === null || val === '' || mongoose.Types.ObjectId.isValid(String(val)))
    .withMessage('Invalid inventory product id'),
  body('description').optional().trim()
];

export const updateKitchenProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ status: 'error', message: errors.array()[0].msg });
      return;
    }
    const doc = await KitchenInventoryProduct.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ status: 'error', message: 'Kitchen product not found' });
      return;
    }
    const { name, unitId, minStockLevel, description, inventoryProductId } = req.body;
    if ('inventoryProductId' in req.body) {
      if (inventoryProductId === null || inventoryProductId === '') {
        doc.inventoryProductId = null;
      } else if (mongoose.Types.ObjectId.isValid(String(inventoryProductId))) {
        const ip = await Product.findById(inventoryProductId).select('isInventory').lean();
        if (!ip) {
          res.status(400).json({ status: 'error', message: 'Linked product not found' });
          return;
        }
        if (ip.isInventory !== true) {
          res.status(400).json({
            status: 'error',
            message: 'Link only products with isInventory: true. Prepared meals cannot be linked.'
          });
          return;
        }
        doc.inventoryProductId = new mongoose.Types.ObjectId(String(inventoryProductId));
      }
    }
    if (unitId) {
      const unit = await Unit.findById(unitId);
      if (!unit) {
        res.status(400).json({ status: 'error', message: 'Unit not found' });
        return;
      }
      doc.unitId = new mongoose.Types.ObjectId(unitId);
    }
    if (name !== undefined) doc.name = String(name).trim();
    if (minStockLevel !== undefined) {
      doc.minStockLevel =
        minStockLevel === null || minStockLevel === ''
          ? undefined
          : Number(minStockLevel);
    }
    if (description !== undefined) {
      doc.description = description ? String(description).trim() : undefined;
    }
    if (name !== undefined) {
      const dup = await KitchenInventoryProduct.findOne({
        _id: { $ne: doc._id },
        name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      });
      if (dup) {
        res.status(400).json({ status: 'error', message: 'A kitchen product with this name already exists' });
        return;
      }
    }
    await doc.save();
    const populated = await KitchenInventoryProduct.findById(doc._id).populate(populateKitchen).lean();
    res.json({
      status: 'success',
      message: 'Kitchen product updated',
      data: enrichKitchenProductDoc(populated, undefined)
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Failed to update kitchen product' });
  }
};

export const deleteKitchenProductValidators = [authenticate, param('id').isMongoId().withMessage('Invalid product id')];

export const deleteKitchenProduct = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ status: 'error', message: errors.array()[0].msg });
      return;
    }
    const doc = await KitchenInventoryProduct.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ status: 'error', message: 'Kitchen product not found' });
      return;
    }
    if (doc.currentStock > 0) {
      res.status(400).json({
        status: 'error',
        message: 'Cannot delete: stock must be zero (use stock out to adjust first)'
      });
      return;
    }
    // BUG-021 FIX: Do NOT delete KitchenStockMovement records.
    // Movement history must be preserved as an audit trail even after the product is deleted.
    await doc.deleteOne();
    res.json({ status: 'success', message: 'Kitchen product deleted' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Failed to delete kitchen product' });
  }
};

export const stockInValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid product id'),
  body('quantity')
    .isFloat({ min: 0.0001 })
    .withMessage('Quantity must be greater than 0')
    .custom((v) => Number.isFinite(Number(v)))
    .withMessage('Quantity must be a finite number'),
  body('purchasePrice').optional().isFloat({ min: 0 }).withMessage('Purchase price must be >= 0'),
  body('note').optional().trim()
];

export const stockIn = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ status: 'error', message: errors.array()[0].msg });
      return;
    }
    const quantity = Number(req.body.quantity);
    const purchasePrice = req.body.purchasePrice !== undefined ? Number(req.body.purchasePrice) : undefined;
    const note = req.body.note ? String(req.body.note).trim() : undefined;
    const userId = req.user?._id;

    const kp = await KitchenInventoryProduct.findById(req.params.id);
    if (!kp) {
      res.status(404).json({ status: 'error', message: 'Kitchen product not found' });
      return;
    }

    const oldTotalCost = (kp.averageCost || 0) * kp.currentStock;
    const newTotalStock = kp.currentStock + quantity;

    if (purchasePrice !== undefined) {
      const addedCost = purchasePrice * quantity;
      kp.averageCost = (oldTotalCost + addedCost) / newTotalStock;
      kp.lastPurchasePrice = purchasePrice;
    }

    kp.currentStock = newTotalStock;
    await kp.save();

    const populated = await KitchenInventoryProduct.findById(kp._id).populate(populateKitchen).lean();

    await KitchenStockMovement.create({
      kitchenProductId: kp._id,
      type: 'in',
      quantity,
      source: 'manual',
      note: purchasePrice !== undefined ? `Stock In (LKR ${purchasePrice}/unit) ${note || ''}` : note,
      ...(userId && { createdBy: userId })
    });

    res.json({
      status: 'success',
      message: 'Stock in recorded',
      data: enrichKitchenProductDoc(populated, undefined)
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Stock in failed' });
  }
};

export const stockOutValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid product id'),
  body('quantity')
    .isFloat({ min: 0.0001 })
    .withMessage('Quantity must be greater than 0')
    .custom((v) => Number.isFinite(Number(v)))
    .withMessage('Quantity must be a finite number'),
  body('reason').optional().trim().isLength({ max: 120 }).withMessage('Reason is too long'),
  body('note').optional().trim()
];

/** Builds movement note from preset reason + optional detail (backwards compatible if only `note` is sent). */
function buildStockOutNote(reasonRaw: unknown, noteRaw: unknown): string | undefined {
  const reason = reasonRaw ? String(reasonRaw).trim() : '';
  const detail = noteRaw ? String(noteRaw).trim() : '';
  if (reason && detail) return `${reason} — ${detail}`;
  if (reason) return reason;
  if (detail) return detail;
  return undefined;
}

export const stockOut = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ status: 'error', message: errors.array()[0].msg });
      return;
    }
    const quantity = Number(req.body.quantity);
    const note = buildStockOutNote(req.body.reason, req.body.note);
    const userId = req.user?._id;

    // BUG-019 FIX: Use aggregation pipeline update to reset averageCost when stock reaches zero
    const updated = await KitchenInventoryProduct.findOneAndUpdate(
      { _id: req.params.id, currentStock: { $gte: quantity } },
      [
        { $set: { currentStock: { $subtract: ['$currentStock', quantity] } } },
        {
          $set: {
            averageCost: {
              $cond: {
                if: { $lte: ['$currentStock', 0] },
                then: 0,
                else: '$averageCost'
              }
            }
          }
        }
      ],
      { new: true }
    ).populate(populateKitchen);

    if (!updated) {
      const exists = await KitchenInventoryProduct.findById(req.params.id).select('currentStock name').lean();
      if (!exists) {
        res.status(404).json({ status: 'error', message: 'Kitchen product not found' });
        return;
      }
      res.status(400).json({
        status: 'error',
        message: `Insufficient stock for ingredient: ${exists.name}`
      });
      return;
    }

    const updatedLean = updated.toObject ? updated.toObject() : updated;
    await KitchenStockMovement.create({
      kitchenProductId: updated._id,
      type: 'out',
      quantity,
      source: 'manual',
      note,
      ...(userId && { createdBy: userId })
    });

    res.json({
      status: 'success',
      message: 'Stock out recorded',
      data: enrichKitchenProductDoc(updatedLean, undefined)
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Stock out failed' });
  }
};