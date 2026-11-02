import express from 'express';
import { body, param, validationResult } from 'express-validator';
import Warehouse from '../../models/Warehouse';
import { authenticate, authorize } from '../../middleware/auth';

// Get all warehouses
export const getWarehouses = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const q = (req.query.q as string) || '';
    const filter: any = {};
    
    // Search functionality - search by name or location
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { location: { $regex: q, $options: 'i' } }
      ];
    }
    
    const warehouses = await Warehouse.find(filter).select('_id name country location isActive createdAt updatedAt');
    res.json({ status: 'success', data: warehouses });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch warehouses' });
  }
}];

// Get warehouse by ID
export const getWarehouseById = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const warehouse = await Warehouse.findById(id).select('_id name country location isActive createdAt updatedAt');
    if (!warehouse) {
      res.status(404).json({ status: 'error', message: 'Warehouse not found' });
      return;
    }
    res.json({ status: 'success', data: warehouse });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch warehouse' });
  }
}];

// Create warehouse validators
export const createWarehouseValidators = [
  authenticate,
  authorize('admin'),
  body('name').notEmpty().withMessage('Name is required').trim(),
  body('country').optional().isString().trim(),
  body('location').optional().isString().trim(),
  body('isActive').optional().isBoolean()
];

// Create warehouse
export const createWarehouse = async (req: express.Request, res: express.Response): Promise<void> => {
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
            const warehouseData = req.body;
            // Normalize name input
            if (warehouseData?.name) {
              warehouseData.name = String(warehouseData.name).replace(/\s+/g, ' ').trim();
            }
            const name: string | undefined = warehouseData?.name;

            // Prevent false duplicate errors: proactively check for existing name (case-insensitive)
            if (name && name.trim()) {
              const existing = await Warehouse.findOne({ name }).collation({ locale: 'en', strength: 2 });
              if (existing) {
                // If a warehouse exists but inactive, treat as restore/update instead of duplicate
                if (existing.isActive === false) {
                  existing.name = warehouseData.name;
                  if (warehouseData.country !== undefined) existing.country = warehouseData.country;
                  if (warehouseData.location !== undefined) existing.location = warehouseData.location;
                  existing.isActive = warehouseData.isActive !== undefined ? warehouseData.isActive : true;
                  await existing.save();
                  res.status(201).json({ 
                    status: 'success', 
                    message: 'Warehouse restored successfully',
                    data: { id: existing._id, name: existing.name }
                  });
                  return;
                } else {
                  res.status(409).json({ 
                    status: 'error', 
                    message: 'Warehouse with this name already exists' 
                  });
                  return;
                }
              }
            }
    console.log('Creating warehouse with data:', warehouseData);
    
    const warehouse = await Warehouse.create(warehouseData);
    console.log('Warehouse created successfully:', warehouse._id);
    
    res.status(201).json({ 
      status: 'success', 
      message: 'Warehouse created successfully',
      data: { id: warehouse._id, name: warehouse.name } 
    });
          } catch (e: any) {
    console.error('Error creating warehouse:', e);
    
            if (e.name === 'ValidationError') {
      const validationErrors = Object.values(e.errors).map((err: any) => err.message);
      res.status(400).json({ 
        status: 'error', 
        message: 'Validation failed',
        errors: validationErrors 
      });
            } else if (e.code === 11000) {
              // Handle legacy unique index on 'code' (now removed from schema) causing dup on null
              const isLegacyCodeDup = (e as any)?.keyPattern?.code === 1 || String((e as any)?.errmsg || '').includes('code_1');
              if (isLegacyCodeDup) {
                try {
                  // Attempt to drop the obsolete unique index and retry creation once
                  await Warehouse.collection.dropIndex('code_1');
                } catch (_) {
                  // ignore if index doesn't exist
                }
                try {
                  const dataToCreate: any = {
                    name: (req.body?.name || '').replace(/\s+/g, ' ').trim(),
                  };
                  if (req.body?.country !== undefined) dataToCreate.country = req.body.country;
                  if (req.body?.location !== undefined) dataToCreate.location = req.body.location;
                  if (req.body?.isActive !== undefined) dataToCreate.isActive = req.body.isActive;
                  const retry = await Warehouse.create(dataToCreate);
                  res.status(201).json({ 
                    status: 'success', 
                    message: 'Warehouse created successfully',
                    data: { id: retry._id, name: retry.name } 
                  });
                  return;
                } catch (retryErr: any) {
                  // fallthrough to name duplicate handling if still 11000
                  if (retryErr.code !== 11000) {
                    res.status(500).json({ status: 'error', message: `Failed to create warehouse: ${retryErr.message}` });
                    return;
                  }
                  e = retryErr;
                }
              }

              // Duplicate key error: check if existing is inactive and restore, else report duplicate on name
              try {
                const dupe = await Warehouse.findOne({ name: (req.body?.name || '').replace(/\s+/g, ' ').trim() }).collation({ locale: 'en', strength: 2 });
                if (dupe && dupe.isActive === false) {
                  dupe.name = (req.body?.name || '').replace(/\s+/g, ' ').trim();
                  if (req.body?.country !== undefined) dupe.country = req.body.country;
                  if (req.body?.location !== undefined) dupe.location = req.body.location;
                  dupe.isActive = req.body?.isActive !== undefined ? req.body.isActive : true;
                  await dupe.save();
                  res.status(201).json({ status: 'success', message: 'Warehouse restored successfully', data: { id: dupe._id, name: dupe.name } });
                } else {
                  res.status(409).json({ status: 'error', message: 'Warehouse with this name already exists' });
                }
              } catch (inner) {
                res.status(409).json({ status: 'error', message: 'Warehouse with this name already exists' });
              }
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: `Failed to create warehouse: ${e.message}` 
      });
    }
  }
};

// Update warehouse validators
export const updateWarehouseValidators = [
  authenticate,
  authorize('admin'),
  param('id').isMongoId().withMessage('Invalid warehouse ID'),
  body('name').optional().notEmpty().withMessage('Name cannot be empty').trim(),
  body('country').optional().isString().trim(),
  body('location').optional().isString().trim(),
  body('isActive').optional().isBoolean()
];

// Update warehouse
export const updateWarehouse = async (req: express.Request, res: express.Response): Promise<void> => {
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

    console.log('Updating warehouse:', id, 'with data:', updateData);

    // Check if warehouse exists
    const existingWarehouse = await Warehouse.findById(id);
    if (!existingWarehouse) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Warehouse not found' 
      });
      return;
    }

            // If renaming, ensure name is unique (case-insensitive)
            if (updateData?.name && updateData.name.trim() && updateData.name.trim() !== existingWarehouse.name) {
              const dup = await Warehouse.findOne({
                _id: { $ne: id },
                name: { $regex: `^${updateData.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
              });
              if (dup) {
                res.status(409).json({ status: 'error', message: 'Warehouse with this name already exists' });
                return;
              }
            }

    const updatedWarehouse = await Warehouse.findByIdAndUpdate(id, updateData, { new: true });
    console.log('Warehouse updated successfully:', updatedWarehouse!._id);
    
    res.json({ 
      status: 'success', 
      message: 'Warehouse updated successfully',
      data: { id: updatedWarehouse!._id, name: updatedWarehouse!.name } 
    });
  } catch (e: any) {
    console.error('Error updating warehouse:', e);
    
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
        message: `Failed to update warehouse: ${e.message}` 
      });
    }
  }
};

// Delete warehouse validators
export const deleteWarehouseValidators = [authenticate, authorize('admin')];

// Delete warehouse
export const deleteWarehouse = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    console.log('Deleting warehouse:', id);
    
    const warehouse = await Warehouse.findById(id);
    if (!warehouse) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Warehouse not found' 
      });
      return;
    }

    await Warehouse.findByIdAndDelete(id);
    console.log('Warehouse deleted successfully:', id);
    
    res.json({ 
      status: 'success', 
      message: 'Warehouse deleted successfully' 
    });
  } catch (e: any) {
    console.error('Error deleting warehouse:', e);
    
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to delete warehouse: ${e.message}` 
    });
  }
};
