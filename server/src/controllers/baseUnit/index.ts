import express from 'express';
import { body, param, validationResult } from 'express-validator';
import BaseUnit from '../../models/BaseUnit';
import { authenticate } from '../../middleware/auth';
import { checkPermission } from '../../middleware/permissions';

// Get all base units
export const getBaseUnits = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const filter: any = q ? { BaseUnitName: { $regex: q, $options: 'i' } } : {};
    const baseUnits = await BaseUnit.find(filter)
      .select('BaseUnitName description createdAt')
      .sort({ createdAt: -1 });

    res.json({ 
      status: 'success', 
      data: baseUnits 
    });
  } catch (e: any) {
    console.error('Error fetching base units:', e);
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to fetch base units: ${e.message}` 
    });
  }
};

// Get base unit by ID
export const getBaseUnitById = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const baseUnit = await BaseUnit.findById(id);
    
    if (!baseUnit) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Base unit not found' 
      });
      return;
    }

    res.json({ 
      status: 'success', 
      data: baseUnit 
    });
  } catch (e: any) {
    console.error('Error fetching base unit:', e);
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to fetch base unit: ${e.message}` 
    });
  }
};

// Create base unit validators
export const createBaseUnitValidators = [
  authenticate,
  checkPermission('manageBaseUnits', 'create'),
  body('BaseUnitName').notEmpty().withMessage('Base unit name is required').trim(),
  body('description').notEmpty().withMessage('Description is required').trim()
];

// Create base unit
export const createBaseUnit = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ 
      status: 'error', 
      message: 'Validation failed',
      errors: errors.array() 
    });
    return;
  }

  try {
    const baseUnitData = req.body;
    console.log('Creating base unit with data:', baseUnitData);
    
    const baseUnit = await BaseUnit.create(baseUnitData);
    console.log('Base unit created successfully:', baseUnit._id);
    
    res.status(201).json({ 
      status: 'success', 
      message: 'Base unit created successfully',
      data: { id: baseUnit._id, BaseUnitName: baseUnit.BaseUnitName } 
    });
  } catch (e: any) {
    console.error('Error creating base unit:', e);
    
    if (e.name === 'ValidationError') {
      const validationErrors = Object.values(e.errors).map((err: any) => err.message);
      res.status(400).json({ 
        status: 'error', 
        message: 'Validation failed',
        errors: validationErrors 
      });
    } else if (e.code === 11000) {
      res.status(409).json({ 
        status: 'error', 
        message: 'Base unit with this name already exists' 
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: `Failed to create base unit: ${e.message}` 
      });
    }
  }
};

// Update base unit validators
export const updateBaseUnitValidators = [
  authenticate,
  checkPermission('manageBaseUnits', 'update'),
  param('id').isMongoId().withMessage('Invalid base unit ID'),
  body('BaseUnitName').optional().notEmpty().withMessage('Base unit name cannot be empty').trim(),
  body('description').optional().notEmpty().withMessage('Description cannot be empty').trim()
];

// Update base unit
export const updateBaseUnit = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ 
      status: 'error', 
      message: 'Validation failed',
      errors: errors.array() 
    });
    return;
  }

  try {
    const { id } = req.params as { id: string };
    const updateData = req.body;

    console.log('Updating base unit:', id, 'with data:', updateData);

    // Check if base unit exists
    const existingBaseUnit = await BaseUnit.findById(id);
    if (!existingBaseUnit) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Base unit not found' 
      });
      return;
    }

    const updatedBaseUnit = await BaseUnit.findByIdAndUpdate(id, updateData, { new: true });
    console.log('Base unit updated successfully:', updatedBaseUnit!._id);
    
    res.json({ 
      status: 'success', 
      message: 'Base unit updated successfully',
      data: { id: updatedBaseUnit!._id, BaseUnitName: updatedBaseUnit!.BaseUnitName } 
    });
  } catch (e: any) {
    console.error('Error updating base unit:', e);
    
    if (e.name === 'ValidationError') {
      const validationErrors = Object.values(e.errors).map((err: any) => err.message);
      res.status(400).json({ 
        status: 'error', 
        message: 'Validation failed',
        errors: validationErrors 
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: `Failed to update base unit: ${e.message}` 
      });
    }
  }
};

// Delete base unit validators
export const deleteBaseUnitValidators = [authenticate, checkPermission('manageBaseUnits', 'delete')];

// Delete base unit
export const deleteBaseUnit = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    console.log('Deleting base unit:', id);
    
    const baseUnit = await BaseUnit.findById(id);
    if (!baseUnit) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Base unit not found' 
      });
      return;
    }

    await BaseUnit.findByIdAndDelete(id);
    console.log('Base unit deleted successfully:', id);
    
    res.json({ 
      status: 'success', 
      message: 'Base unit deleted successfully' 
    });
  } catch (e: any) {
    console.error('Error deleting base unit:', e);
    
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to delete base unit: ${e.message}` 
    });
  }
};
