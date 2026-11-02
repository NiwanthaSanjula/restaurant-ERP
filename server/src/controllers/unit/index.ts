import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate } from '../../middleware/auth';
import { checkPermission } from '../../middleware/permissions';
import Unit from '../../models/Unit';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isDuplicateKeyError = (err: any): boolean => {
  return Boolean(err && (err.code === 11000 || err?.message?.includes('E11000')));
};

const duplicateFieldFromError = (err: any): 'unitName' | 'shortName' | null => {
  const keyValue = err?.keyValue || {};
  if (typeof keyValue.unitName === 'string') return 'unitName';
  if (typeof keyValue.shortName === 'string') return 'shortName';
  const msg = String(err?.message || '');
  if (/unitName/i.test(msg)) return 'unitName';
  if (/shortName/i.test(msg)) return 'shortName';
  return null;
};

// Get all units
export const getUnits = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { q, page = '1', limit: pageLimit = '10' } = req.query as any;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(pageLimit, 10) || 10);
    const skip = (pageNum - 1) * pageSize;

    // BUG-066 FIX: removed businessType filter — fetch all units
    const filter: any = {};

    if (q) {
      const safeQ = escapeRegex(String(q));
      filter.$or = [
        { unitName:  { $regex: safeQ, $options: 'i' } },
        { shortName: { $regex: safeQ, $options: 'i' } },
        { unitType:  { $regex: safeQ, $options: 'i' } },
      ];
    }

    const [units, total] = await Promise.all([
      Unit.find(filter)
        .select('unitName shortName businessType createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
      Unit.countDocuments(filter)
    ]);

    res.json({ status: 'success', data: units });
  } catch (e: any) {
    console.error('Error fetching units:', e);
    res.status(500).json({ status: 'error', message: `Failed to fetch units: ${e.message}` });
  }
};

// Get unit by ID
export const getUnitById = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const unit = await Unit.findById(id);

    if (!unit) {
      res.status(404).json({ status: 'error', message: 'Unit not found' });
      return;
    }

    res.json({ status: 'success', data: unit });
  } catch (e: any) {
    console.error('Error fetching unit:', e);
    res.status(500).json({ status: 'error', message: `Failed to fetch unit: ${e.message}` });
  }
};

// Create unit validators
export const createUnitValidators = [
  authenticate,
  checkPermission('manageUnits', 'create'),
  body('unitName').notEmpty().withMessage('Unit name is required').trim(),
  body('shortName').notEmpty().withMessage('Short name is required').trim(),
  body('businessType').optional().isIn(['restaurant']).withMessage('Business type must be restaurant'),
];

// Create unit
export const createUnit = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
    return;
  }

  try {
    const unitData = req.body;
    unitData.businessType = 'restaurant';

    const unitName  = String(unitData.unitName  ?? '').trim();
    const shortName = String(unitData.shortName ?? '').trim();

    const unitNameExists = await Unit.findOne({
      unitName: { $regex: `^${escapeRegex(unitName)}$`, $options: 'i' },
    }).select('_id');

    if (unitNameExists) {
      res.status(409).json({ status: 'error', message: 'Unit name already exists.' });
      return;
    }

    const shortNameExists = await Unit.findOne({
      shortName: { $regex: `^${escapeRegex(shortName)}$`, $options: 'i' },
    }).select('_id');

    if (shortNameExists) {
      res.status(409).json({ status: 'error', message: 'Short name already exists.' });
      return;
    }

    const unit = await Unit.create(unitData);

    res.status(201).json({
      status: 'success',
      message: 'Unit created successfully',
      data: { id: unit._id, unitName: unit.unitName },
    });
  } catch (e: any) {
    console.error('Error creating unit:', e);

    if (isDuplicateKeyError(e)) {
      const field = duplicateFieldFromError(e);
      res.status(409).json({
        status: 'error',
        message: field === 'shortName' ? 'Short name already exists.' : 'Unit name already exists.',
      });
      return;
    }

    if (e.name === 'ValidationError') {
      const validationErrors = Object.values(e.errors).map((err: any) => err.message);
      res.status(400).json({ status: 'error', message: 'Validation failed', errors: validationErrors });
      return;
    }

    res.status(500).json({ status: 'error', message: `Failed to create unit: ${e.message}` });
  }
};
// Update unit validators
export const updateUnitValidators = [
  authenticate,
  checkPermission('manageUnits', 'update'),
  param('id').isMongoId().withMessage('Invalid unit ID'),
  body('unitName').optional().notEmpty().withMessage('Unit name cannot be empty').trim(),
  body('shortName').optional().notEmpty().withMessage('Short name cannot be empty').trim(),
  body('businessType').optional().isIn(['restaurant']).withMessage('Business type must be restaurant'),
];

// Update unit
export const updateUnit = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
    return;
  }

  try {
    const { id } = req.params as { id: string };
    const { unitName, shortName } = req.body as { unitName?: string; shortName?: string };

    const existingUnit = await Unit.findById(id);
    if (!existingUnit) {
      res.status(404).json({ status: 'error', message: 'Unit not found' });
      return;
    }

    const updateData: any = {};
    if (typeof unitName === 'string') {
      updateData.unitName = unitName.trim();
    }
    if (typeof shortName === 'string') {
      updateData.shortName = shortName.trim();
    }

    if (unitName) {
      const unitNameExists = await Unit.findOne({
        _id: { $ne: id },
        unitName: { $regex: `^${escapeRegex(unitName)}$`, $options: 'i' },
      }).select('_id');

      if (unitNameExists) {
        res.status(409).json({ status: 'error', message: 'Unit name already exists.' });
        return;
      }
    }

    if (shortName) {
      const shortNameExists = await Unit.findOne({
        _id: { $ne: id },
        shortName: { $regex: `^${escapeRegex(shortName)}$`, $options: 'i' },
      }).select('_id');

      if (shortNameExists) {
        res.status(409).json({ status: 'error', message: 'Short name already exists.' });
        return;
      }
    }

    const updatedUnit = await Unit.findByIdAndUpdate(id, updateData, { new: true });

    res.json({
      status: 'success',
      message: 'Unit updated successfully',
      data: { id: updatedUnit!._id, unitName: updatedUnit!.unitName },
    });
  } catch (e: any) {
    console.error('Error updating unit:', e);

    if (isDuplicateKeyError(e)) {
      const field = duplicateFieldFromError(e);
      res.status(409).json({
        status: 'error',
        message: field === 'shortName' ? 'Short name already exists.' : 'Unit name already exists.',
      });
      return;
    }

    if (e.name === 'ValidationError') {
      const validationErrors = Object.values(e.errors).map((err: any) => err.message);
      res.status(400).json({ status: 'error', message: 'Validation failed', errors: validationErrors });
      return;
    }

    res.status(500).json({ status: 'error', message: `Failed to update unit: ${e.message}` });
  }
};

// Delete unit validators
export const deleteUnitValidators = [authenticate, checkPermission('manageUnits', 'delete')];

// Delete unit
export const deleteUnit = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };

    const unit = await Unit.findById(id);
    if (!unit) {
      res.status(404).json({ status: 'error', message: 'Unit not found' });
      return;
    }

    await Unit.findByIdAndDelete(id);

    res.json({ status: 'success', message: 'Unit deleted successfully' });
  } catch (e: any) {
    console.error('Error deleting unit:', e);
    res.status(500).json({ status: 'error', message: `Failed to delete unit: ${e.message}` });
  }
};