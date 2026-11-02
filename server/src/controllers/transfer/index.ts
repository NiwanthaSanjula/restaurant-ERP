//./POS_Backend/src/controllers/transfer/index.ts
import express from 'express';
import { body, validationResult } from 'express-validator';
import Transfer from '../../models/Transfer';
import Product from '../../models/Product';
import { authenticate, authorize } from '../../middleware/auth';

/** Get warehouse data from product by name (case-insensitive, supports Map or plain object) */
function getWarehouseData(warehouse: any, warehouseName: string): any {
  if (!warehouse || !warehouseName) return null;
  const isMap = warehouse instanceof Map;
  const keys = isMap ? Array.from(warehouse.keys()) : Object.keys(warehouse || {});
  const exact = isMap ? warehouse.get(warehouseName) : warehouse[warehouseName];
  if (exact) return exact;
  const nameLower = warehouseName.toLowerCase().trim();
  for (const key of keys) {
    const k = String(key);
    if (k.toLowerCase().trim() === nameLower) {
      return isMap ? warehouse.get(key) : warehouse[k];
    }
  }
  for (const key of keys) {
    const data = isMap ? warehouse.get(key) : warehouse[key];
    if (data && data.warehouseName && String(data.warehouseName).toLowerCase().trim() === nameLower) {
      return data;
    }
  }
  return null;
}

/** Get warehouse key that matches name (for Map.set) */
function getWarehouseKey(warehouse: any, warehouseName: string): string | null {
  if (!warehouse || !warehouseName) return null;
  const isMap = warehouse instanceof Map;
  const keys = isMap ? Array.from(warehouse.keys()) : Object.keys(warehouse || {});
  if (keys.includes(warehouseName)) return warehouseName;
  const nameLower = warehouseName.toLowerCase().trim();
  for (const key of keys) {
    if (String(key).toLowerCase().trim() === nameLower) return isMap ? key : key;
  }
  for (const key of keys) {
    const data = isMap ? warehouse.get(key) : warehouse[key];
    if (data && data.warehouseName && String(data.warehouseName).toLowerCase().trim() === nameLower) {
      return key;
    }
  }
  return null;
}

/** Allowed status transitions: fromStatus -> [toStatus, ...] */
const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  Pending: ['Approved', 'Cancelled'],
  Approved: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: []
};

function isStatusTransitionAllowed(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// Get transfer by ID
export const getTransferById = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const transfer = await Transfer.findById(req.params.id)
      .populate('fromWarehouse', 'name')
      .populate('toWarehouse', 'name');
    if (!transfer) {
      res.status(404).json({ status: 'error', message: 'Transfer not found' });
      return;
    }
    res.json({ status: 'success', data: transfer });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}];

// Get all transfers
export const getTransfers = [authenticate, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { q, fromWarehouse, toWarehouse, status } = req.query;
    const filter: any = {};

    if (q) filter.reference = { $regex: q, $options: 'i' };
    if (fromWarehouse) filter.fromWarehouse = fromWarehouse;
    if (toWarehouse) filter.toWarehouse = toWarehouse;
    if (status && status !== 'All Status') filter.status = status;

    const transfers = await Transfer.find(filter)
      .populate('fromWarehouse', 'name')
      .populate('toWarehouse', 'name')
      .sort({ createdAt: -1 });

    res.json({ 
      status: 'success', 
      data: transfers 
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}];

// Create transfer validators
export const createTransferValidators = [
  authenticate,
  authorize('admin'),
  body('fromWarehouse').isMongoId(),
  body('toWarehouse').isMongoId(),
  body('fromWarehouseName').notEmpty(),
  body('toWarehouseName').notEmpty(),
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isMongoId(),
  body('items.*.qty').isNumeric().custom(v => v > 0),
  body('items.*.cost').isNumeric(),
  body('items.*.subtotal').isNumeric()
];

// Create transfer
export const createTransfer = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const { 
      fromWarehouse, 
      toWarehouse, 
      fromWarehouseName, 
      toWarehouseName, 
      items, 
      notes, 
      date,
      subtotal,
      tax,
      discount,
      shipping,
      grandTotal,
      status 
    } = req.body;
    
    // Only update inventory if status is 'Completed'
    if (status === 'Completed') {
      // Validate ALL items first (transfer quantity cannot exceed available stock)
      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          res.status(400).json({ status: 'error', message: `Product not found.` });
          return;
        }
        const warehouseMap = product.warehouse as any;
        let sourceStock = 0;
        const sourceData = (warehouseMap?.get?.(fromWarehouseName) ?? warehouseMap?.[fromWarehouseName]);
        
        if (sourceData) {
          if (item.variation && sourceData.variationValues && sourceData.variationValues[item.variation]) {
            sourceStock = sourceData.variationValues[item.variation].productQty || 0;
          } else {
            sourceStock = sourceData.productQty || 0;
          }
        }

        if (sourceStock < item.qty) {
          res.status(400).json({
            status: 'error',
            message: `Transfer quantity cannot exceed available stock. ${product.name} has only ${sourceStock} unit(s) available in ${fromWarehouseName}. Please choose a lower quantity.`
          });
          return;
        }
      }
      // Then apply stock updates: deduct from source, add to destination
      for (const item of items) {
        // Use findById and save to trigger pre-save middleware and ensure Map updates correctly
        const product = await Product.findById(item.productId);
        if (product) {
          const warehouseMap = product.warehouse as any;
          
          // Deduct from source
          const sourceData = warehouseMap.get(fromWarehouseName);
          if (sourceData) {
            if (item.variation && sourceData.variationValues && sourceData.variationValues[item.variation]) {
              sourceData.variationValues[item.variation].productQty = (sourceData.variationValues[item.variation].productQty || 0) - item.qty;
            } else {
              sourceData.productQty = (sourceData.productQty || 0) - item.qty;
            }
            warehouseMap.set(fromWarehouseName, sourceData);
          }
          
          // Add to destination
          let destData = warehouseMap.get(toWarehouseName);
          if (destData) {
            if (item.variation && destData.variationValues && destData.variationValues[item.variation]) {
              destData.variationValues[item.variation].productQty = (destData.variationValues[item.variation].productQty || 0) + item.qty;
            } else if (item.variation) {
              // If variation doesn't exist in destination, create it (Product model requires stockAlert)
              if (!destData.variationValues) destData.variationValues = {};
              const sourceVar = sourceData?.variationValues?.[item.variation] || {};
              destData.variationValues[item.variation] = {
                ...sourceVar,
                productQty: item.qty,
                stockAlert: sourceVar.stockAlert ?? 0
              };
            } else {
              destData.productQty = (destData.productQty || 0) + item.qty;
            }
          } else {
            // If warehouse doesn't exist for this product, create it (Product model requires stockAlert for inventory)
            const sourceVar = sourceData?.variationValues?.[item.variation];
            destData = {
              warehouseName: toWarehouseName,
              productQty: item.variation ? 0 : item.qty,
              productCost: sourceData?.productCost || item.cost,
              productPrice: sourceData?.productPrice || (sourceData?.productCost || item.cost) * 1.2,
              stockAlert: sourceData?.stockAlert ?? 0,
              variationValues: item.variation ? {
                [item.variation]: {
                  ...(sourceData?.variationValues?.[item.variation] || {}),
                  productQty: item.qty,
                  stockAlert: sourceVar?.stockAlert ?? 0
                }
              } : {}
            };
          }
          warehouseMap.set(toWarehouseName, destData);
          
          await product.save();
        }
      }
    }

    const reference = `TR-${Date.now()}`;
    const transfer = await Transfer.create({
      fromWarehouse,
      toWarehouse,
      fromWarehouseName,
      toWarehouseName,
      items,
      notes,
      date,
      reference,
      subtotal,
      tax,
      discount,
      shipping,
      grandTotal,
      status: status || 'Pending'
    });

    res.status(201).json({ status: 'success', data: transfer });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
};

// Update transfer validators
export const updateTransferValidators = createTransferValidators;

// Update transfer
export const updateTransfer = async (req: express.Request, res: express.Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ status: 'error', errors: errors.array() });
    return;
  }

  try {
    const { id } = req.params;
    const oldTransfer = await Transfer.findById(id);
    if (!oldTransfer) {
      res.status(404).json({ status: 'error', message: 'Transfer not found' });
      return;
    }

    const oldStatus = String(oldTransfer.status);
    const newStatus = req.body.status;

    // Read-only: Completed and Cancelled cannot be edited (inventory already updated or final)
    if (oldStatus === 'Completed' || oldStatus === 'Cancelled') {
      res.status(403).json({
        status: 'error',
        message: 'This transfer cannot be edited. Completed and Cancelled transfers are read-only.'
      });
      return;
    }

    // Status transition: only allowed workflow (Pending->Approved/Cancelled, Approved->Completed/Cancelled)
    if (newStatus && !isStatusTransitionAllowed(oldStatus, newStatus)) {
      res.status(400).json({
        status: 'error',
        message: `Status change from ${oldStatus} to ${newStatus} is not allowed. Allowed: ${(ALLOWED_STATUS_TRANSITIONS[oldStatus] || []).join(', ')}.`
      });
      return;
    }

    // Approved: limited editing – only status and notes; items/warehouses/date must stay unchanged
    let updatePayload: any = { ...req.body };
    if (oldStatus === 'Approved') {
      updatePayload = {
        status: req.body.status ?? oldStatus,
        notes: req.body.notes !== undefined ? req.body.notes : oldTransfer.notes
      };
      // Keep existing fields for the document (no items/warehouses/date change)
      updatePayload.fromWarehouse = oldTransfer.fromWarehouse;
      updatePayload.toWarehouse = oldTransfer.toWarehouse;
      updatePayload.fromWarehouseName = oldTransfer.fromWarehouseName;
      updatePayload.toWarehouseName = oldTransfer.toWarehouseName;
      updatePayload.date = oldTransfer.date;
      updatePayload.items = oldTransfer.items;
      updatePayload.subtotal = oldTransfer.subtotal;
      updatePayload.tax = oldTransfer.tax;
      updatePayload.discount = oldTransfer.discount;
      updatePayload.shipping = oldTransfer.shipping;
      updatePayload.grandTotal = oldTransfer.grandTotal;
    }

    const { status, items, fromWarehouseName, toWarehouseName } = updatePayload;

    // Edit Transfer: same validations – when status is 'Completed', validate qty <= available stock then update stock
    if (status === 'Completed' && oldTransfer.status !== 'Completed') {
      // Validate ALL items first (transfer quantity cannot exceed available stock)
      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          res.status(400).json({ status: 'error', message: `Product not found.` });
          return;
        }
        const sourceData = getWarehouseData(product.warehouse, fromWarehouseName);
        let sourceStock = 0;
        if (sourceData) {
          if (item.variation && sourceData.variationValues && sourceData.variationValues[item.variation]) {
            sourceStock = sourceData.variationValues[item.variation].productQty || 0;
          } else {
            sourceStock = sourceData.productQty || 0;
          }
        }

        if (sourceStock < item.qty) {
          res.status(400).json({
            status: 'error',
            message: `Transfer quantity cannot exceed available stock. ${product.name} has only ${sourceStock} unit(s) available in ${fromWarehouseName}. Please choose a lower quantity.`
          });
          return;
        }
      }
      // Then apply stock updates: deduct from source, add to destination
      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (product) {
          const warehouseMap = product.warehouse as any;
          const fromKey = getWarehouseKey(warehouseMap, fromWarehouseName);
          const toKey = getWarehouseKey(warehouseMap, toWarehouseName);
          const sourceData = getWarehouseData(warehouseMap, fromWarehouseName);

          // Deduct from source (use resolved key for Map)
          if (fromKey && sourceData) {
            if (item.variation && sourceData.variationValues && sourceData.variationValues[item.variation]) {
              sourceData.variationValues[item.variation].productQty = (sourceData.variationValues[item.variation].productQty || 0) - item.qty;
            } else {
              sourceData.productQty = (sourceData.productQty || 0) - item.qty;
            }
            warehouseMap.set(fromKey, sourceData);
          }

          // Add to destination
          let destData = toKey ? (warehouseMap.get?.(toKey) ?? warehouseMap[toKey]) : null;
          if (destData) {
            if (item.variation && destData.variationValues && destData.variationValues[item.variation]) {
              destData.variationValues[item.variation].productQty = (destData.variationValues[item.variation].productQty || 0) + item.qty;
            } else if (item.variation) {
              if (!destData.variationValues) destData.variationValues = {};
              const sourceVar = sourceData?.variationValues?.[item.variation] || {};
              destData.variationValues[item.variation] = {
                ...sourceVar,
                productQty: item.qty,
                stockAlert: sourceVar.stockAlert ?? 0
              };
            } else {
              destData.productQty = (destData.productQty || 0) + item.qty;
            }
          } else {
            // New destination warehouse (Product model requires stockAlert for inventory)
            const sourceVar = sourceData?.variationValues?.[item.variation];
            destData = {
              warehouseName: toWarehouseName,
              productQty: item.variation ? 0 : item.qty,
              productCost: sourceData?.productCost || item.cost,
              productPrice: sourceData?.productPrice || (sourceData?.productCost || item.cost) * 1.2,
              stockAlert: sourceData?.stockAlert ?? 0,
              variationValues: item.variation ? {
                [item.variation]: {
                  ...(sourceData?.variationValues?.[item.variation] || {}),
                  productQty: item.qty,
                  stockAlert: sourceVar?.stockAlert ?? 0
                }
              } : {}
            };
          }
          const destKey = toKey || toWarehouseName;
          warehouseMap.set(destKey, destData);

          await product.save();
        }
      }
    }

    const transfer = await Transfer.findByIdAndUpdate(id, updatePayload, { new: true });
    res.json({ status: 'success', data: transfer });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
};

// Delete transfer
export const deleteTransfer = [authenticate, authorize('admin'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const transfer = await Transfer.findById(id);
    if (!transfer) {
      res.status(404).json({ status: 'error', message: 'Transfer not found' });
      return;
    }

    // Optional: Revert inventory if status was 'Completed'
    // For now, just delete as requested for simplicity
    
    await Transfer.findByIdAndDelete(id);
    res.json({ status: 'success', message: 'Transfer deleted successfully' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
}];
