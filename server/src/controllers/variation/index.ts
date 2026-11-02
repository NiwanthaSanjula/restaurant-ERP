import express from 'express';
import { body, param, validationResult } from 'express-validator';

import { authenticate, authorize } from '../../middleware/auth';
import { checkPermission } from '../../middleware/permissions';

import Product from '../../models/Product';
import Variation from '../../models/Variation';

// Helpers
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isDuplicateKeyError = (err: any): boolean => {
  return Boolean(err && (err.code === 11000 || err?.code === 11000 || String(err?.message || '').includes('E11000')));
};

const parseVariationTypes = (raw: any): string[] => {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
  return [];
};

// Get all variations
export const getVariations = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const filter: any = q ? { variationName: { $regex: q, $options: 'i' } } : {};
    
    const [variations, total] = await Promise.all([
      Variation.find(filter)
        .select('variationName variationType createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Variation.countDocuments(filter)
    ]);

    res.json({ 
      status: 'success', 
      data: variations,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: `Failed to fetch variations: ${e.message}` });
  }
}];

// Get by id
export const getVariationById = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const variation = await Variation.findById(id).select('-__v');
    if (!variation) {
      res.status(404).json({ status: 'error', message: 'Variation not found' });
      return;
    }
    res.json({ status: 'success', data: variation });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: `Failed to fetch variation: ${e.message}` });
  }
}];

// Create
export const createVariationValidators = [
  authenticate,
  checkPermission('manageVariations', 'create'),
  body('variationName').notEmpty().withMessage('Variation name is required').trim(),
  body('variationType').customSanitizer((value) => parseVariationTypes(value)).custom((arr) => Array.isArray(arr) && arr.length > 0).withMessage('At least one variation type is required')
];

export const createVariation = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
    return;
  }
  try {
    const { variationName, variationType } = req.body as { variationName: string; variationType: string[] };
    const trimmedName = String(variationName ?? '').trim();

    // Prevent case-insensitive duplicates (e.g. "Flavor" vs "flavor")
    const exists = await Variation.findOne({
      variationName: { $regex: `^${escapeRegex(trimmedName)}$`, $options: 'i' }
    }).select('_id');

    if (exists) {
      res.status(409).json({ status: 'error', message: 'Variation with this name already exists.' });
      return;
    }

    const created = await Variation.create({ variationName: trimmedName, variationType });
    res.status(201).json({ status: 'success', message: 'Variation created successfully', data: { id: created._id } });
  } catch (e: any) {
    if (isDuplicateKeyError(e)) {
      res.status(409).json({ status: 'error', message: 'Variation with this name already exists.' });
      return;
    }
    res.status(500).json({ status: 'error', message: `Failed to create variation: ${e.message}` });
  }
};

// Update
export const updateVariationValidators = [
  authenticate,
  checkPermission('manageVariations', 'update'),
  param('id').isMongoId().withMessage('Invalid variation ID'),
  body('variationName').optional().notEmpty().withMessage('Variation name cannot be empty').trim(),
  body('variationType').optional().customSanitizer((value) => parseVariationTypes(value)).custom((arr) => !arr || (Array.isArray(arr) && arr.length > 0)).withMessage('At least one variation type is required')
];

export const updateVariation = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
    return;
  }
  try {
    const { id } = req.params as { id: string };
    const existing = await Variation.findById(id);
    if (!existing) {
      res.status(404).json({ status: 'error', message: 'Variation not found' });
      return;
    }

    const nextName = typeof (req.body as any).variationName === 'string' ? (req.body as any).variationName.trim() : undefined;

    // Case-insensitive uniqueness check on update
    if (nextName) {
      const exists = await Variation.findOne({
        _id: { $ne: id },
        variationName: { $regex: `^${escapeRegex(nextName)}$`, $options: 'i' }
      }).select('_id');

      if (exists) {
        res.status(409).json({ status: 'error', message: 'Variation with this name already exists.' });
        return;
      }
    }

    const updated = await Variation.findByIdAndUpdate(
      id,
      { ...req.body, ...(nextName ? { variationName: nextName } : {}) },
      { new: true, runValidators: true }
    );
    res.json({ status: 'success', message: 'Variation updated successfully', data: { id: updated!._id } });
  } catch (e: any) {
    if (isDuplicateKeyError(e)) {
      res.status(409).json({ status: 'error', message: 'Variation with this name already exists.' });
      return;
    }
    res.status(500).json({ status: 'error', message: `Failed to update variation: ${e.message}` });
  }
};

// Delete
export const deleteVariationValidators = [authenticate, checkPermission('manageVariations', 'delete')];
export const deleteVariation = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const variation = await Variation.findById(id);
    if (!variation) {
      res.status(404).json({ status: 'error', message: 'Variation not found' });
      return;
    }

    // Check if any products are assigned to this variation
    // Note: in Product model, it's 'variation' field which stores variationName
    const productsUsingVariation = await Product.findOne({ variation: variation.variationName });
    if (productsUsingVariation) {
      res.status(400).json({
        status: 'error',
        message: 'Cannot delete variation because it is assigned to one or more products. Please reassign the products to another variation first.'
      });
      return;
    }

    await Variation.findByIdAndDelete(id);
    res.json({ status: 'success', message: 'Variation deleted successfully' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: `Failed to delete variation: ${e.message}` });
  }
};

// Check if variation is in use
export const checkVariationInUse = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const variation = await Variation.findById(id);
    if (!variation) {
      res.status(404).json({ status: 'error', message: 'Variation not found' });
      return;
    }

    const productsUsingVariation = await Product.findOne({ variation: variation.variationName });
    res.json({
      status: 'success',
      isInUse: !!productsUsingVariation,
      productName: productsUsingVariation ? (productsUsingVariation as any).name : null
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: `Failed to check variation: ${e.message}` });
  }
};
