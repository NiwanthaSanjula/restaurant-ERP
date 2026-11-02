import { Request, Response } from 'express';
import InventoryAdjustment, { IAdjustmentItem } from '../../models/InventoryAdjustment';
import Product from '../../models/Product';
import Warehouse from '../../models/Warehouse';
import mongoose from 'mongoose';
import { AuthRequest } from '../../middleware/auth';
import { buildZonedDateRange, parseDateInputAsZonedStart } from '../../utils/timezone';

interface IAdjustmentItemRequest {
  productId: string;
  adjustmentQuantity: number;
  variationName?: string;
  batchNumber?: string;
}

/** Get current stock and cost for a product in a warehouse, optionally for a specific variation/batch */
function getStockAndCost(
  product: any,
  warehouseId: string,
  warehouseName: string
): { currentStock: number; productCost: number; variationName?: string; batchNumber?: string } | null;
function getStockAndCost(
  product: any,
  warehouseId: string,
  warehouseName: string,
  variationName: string | undefined,
  batchNumber: string | undefined
): { currentStock: number; productCost: number; variationName?: string; batchNumber?: string } | { error: string };
function getStockAndCost(
  product: any,
  warehouseId: string,
  warehouseName: string,
  variationName?: string,
  batchNumber?: string
): { currentStock: number; productCost: number; variationName?: string; batchNumber?: string } | { error: string } | null {
  const whMap = product.warehouse;
  const getWh = (key: string) => {
    if (!whMap) return undefined;
    if (typeof (whMap as any).get === 'function') return (whMap as Map<string, any>).get(key);
    return (whMap as Record<string, any>)[key];
  };
  const warehouseInventory = getWh(warehouseId) || getWh(warehouseName);
  if (!warehouseInventory) return null;

  const ptype = product.ptype === 'Variation' ? 'Variation' : 'Single';
  const hasBatches = product.hasBatches === true && Array.isArray(warehouseInventory.batches) && warehouseInventory.batches.length > 0;
  const isWeight = product.isWeight === true;

  const getQty = (v: any) => (isWeight && typeof v?.totalProductWeight === 'number' ? v.totalProductWeight : (v?.productQty ?? 0));
  const getCost = (v: any) => (v?.productCost ?? 0);

  if (ptype === 'Variation') {
    if (hasBatches && batchNumber) {
      const batch = (warehouseInventory.batches || []).find((b: any) => b.batchNumber === batchNumber);
      if (!batch) return { error: `Batch "${batchNumber}" not found for product "${product.name}" in this warehouse.` };
      if (!variationName) return { error: `Variation product "${product.name}" requires a variation to be selected.` };
      const varValues = batch.variationValues && (typeof batch.variationValues.get === 'function' ? batch.variationValues.get(variationName) : batch.variationValues[variationName]);
      if (!varValues) return { error: `Variation "${variationName}" not found in batch "${batchNumber}" for product "${product.name}".` };
      const cost = getCost(varValues);
      if (cost === 0) return { error: `Product "${product.name}" variation "${variationName}" does not have a cost defined.` };
      return { currentStock: getQty(varValues), productCost: cost, variationName, batchNumber };
    }
    if (hasBatches) return { error: `Variation product "${product.name}" has batches; please select a batch and variation.` };
    if (!variationName) return { error: `Variation product "${product.name}" requires a variation to be selected (e.g. size, color).` };
    const varValues = warehouseInventory.variationValues && (typeof warehouseInventory.variationValues.get === 'function' ? warehouseInventory.variationValues.get(variationName) : warehouseInventory.variationValues[variationName]);
    if (!varValues) return { error: `Variation "${variationName}" not found for product "${product.name}" in this warehouse.` };
    const cost = getCost(varValues);
    if (cost === 0) return { error: `Product "${product.name}" variation "${variationName}" does not have a cost defined.` };
    return { currentStock: getQty(varValues), productCost: cost, variationName };
  }

  // Single product
  if (hasBatches && batchNumber) {
    const batch = (warehouseInventory.batches || []).find((b: any) => b.batchNumber === batchNumber);
    if (!batch) return { error: `Batch "${batchNumber}" not found for product "${product.name}" in this warehouse.` };
    const cost = getCost(batch);
    if (cost === 0) return { error: `Product "${product.name}" batch "${batchNumber}" does not have a cost defined.` };
    return { currentStock: getQty(batch), productCost: cost, batchNumber };
  }
  const currentStock = getQty(warehouseInventory);
  const productCost = getCost(warehouseInventory);
  if (productCost === 0) return { error: `Product "${product.name}" does not have a product cost defined in this warehouse.` };
  return { currentStock, productCost };
}

/**
 * Update product stock in warehouse using atomic operations (supports Single, Variation, and batch)
 * Uses $inc for atomic increments/decrements to prevent race conditions
 * Implements optimistic locking with retry logic
 */
async function setProductStock(
  productId: string,
  whKey: string,
  adjustmentQty: number, // Change from newStock to adjustmentQty for atomic operations
  variationName?: string,
  batchNumber?: string,
  isWeight?: boolean,
  maxRetries: number = 3
): Promise<void> {
  const product = await Product.findById(productId);
  if (!product) return;
  const useWeight = isWeight === true;
  const qtyPath = useWeight ? 'totalProductWeight' : 'productQty';

  let retries = 0;
  while (retries < maxRetries) {
    try {
      // Fetch current product with version for optimistic locking
      const currentProduct = await Product.findById(productId);
      if (!currentProduct) return;

      // Build update operation using atomic $inc instead of $set
      const updateOp: any = {};
      
      if (variationName !== undefined && variationName !== null && variationName !== '') {
        if (batchNumber !== undefined && batchNumber !== null && batchNumber !== '') {
          // Variation with batch
          updateOp[`warehouse.${whKey}.batches.$[batch].variationValues.${variationName}.${qtyPath}`] = adjustmentQty;
          const result = await Product.findOneAndUpdate(
            { 
              _id: productId,
              [`warehouse.${whKey}.batches.batchNumber`]: batchNumber,
              __v: currentProduct.__v // Optimistic locking: check version
            },
            { $inc: updateOp },
            { 
              arrayFilters: [{ 'batch.batchNumber': batchNumber }],
              new: true
            }
          );
          if (!result) {
            // Version conflict - retry
            retries++;
            await new Promise(resolve => setTimeout(resolve, 50 * retries)); // Exponential backoff
            continue;
          }
          return;
        } else {
          // Variation without batch
          updateOp[`warehouse.${whKey}.variationValues.${variationName}.${qtyPath}`] = adjustmentQty;
          const result = await Product.findOneAndUpdate(
            { _id: productId, __v: currentProduct.__v },
            { $inc: updateOp },
            { new: true }
          );
          if (!result) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 50 * retries));
            continue;
          }
          return;
        }
      } else if (batchNumber !== undefined && batchNumber !== null && batchNumber !== '') {
        // Single product with batch
        updateOp[`warehouse.${whKey}.batches.$[batch].${qtyPath}`] = adjustmentQty;
        const result = await Product.findOneAndUpdate(
          { 
            _id: productId,
            [`warehouse.${whKey}.batches.batchNumber`]: batchNumber,
            __v: currentProduct.__v
          },
          { $inc: updateOp },
          { 
            arrayFilters: [{ 'batch.batchNumber': batchNumber }],
            new: true
          }
        );
        if (!result) {
          retries++;
          await new Promise(resolve => setTimeout(resolve, 50 * retries));
          continue;
        }
        return;
      } else {
        // Simple product
        updateOp[`warehouse.${whKey}.${qtyPath}`] = adjustmentQty;
        const result = await Product.findOneAndUpdate(
          { _id: productId, __v: currentProduct.__v },
          { $inc: updateOp },
          { new: true }
        );
        if (!result) {
          retries++;
          await new Promise(resolve => setTimeout(resolve, 50 * retries));
          continue;
        }
        return;
      }
    } catch (error: any) {
      if (retries >= maxRetries - 1) {
        throw new Error(`Failed to update stock after ${maxRetries} retries: ${error.message}`);
      }
      retries++;
      await new Promise(resolve => setTimeout(resolve, 50 * retries));
    }
  }
  
  throw new Error(`Failed to update stock after ${maxRetries} retries due to concurrent modifications`);
}

/**
 * Create a new inventory adjustment
 * Validates products, warehouse, and stock levels before creating adjustment.
 * Runs without MongoDB transactions so it works on standalone MongoDB (no replica set).
 */
export const createAdjustment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const {
      warehouseId,
      warehouseName,
      adjustmentType,
      adjustmentDate,
      items,
      reason,
      reasonDetails,
      referenceNumber,
      notes,
      status: bodyStatus,
      createdBy: bodyCreatedBy
    } = req.body;

    // Use authenticated user's ID; only accept valid MongoDB ObjectId (never string like 'admin')
    const createdByRaw = bodyCreatedBy || req.user?._id;
    const isValidObjectId = createdByRaw && mongoose.Types.ObjectId.isValid(createdByRaw) && String(createdByRaw).length === 24;
    const createdBy = isValidObjectId ? createdByRaw : req.user?._id;

    if (!createdBy || !mongoose.Types.ObjectId.isValid(createdBy)) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated or invalid user ID'
      });
      return;
    }

    // Validate required fields
    if (!warehouseId || !adjustmentType || !items || items.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'Missing required fields: warehouseId, adjustmentType, and items'
      });
      return;
    }

    if (!['Increase', 'Decrease'].includes(adjustmentType)) {
      res.status(400).json({
        status: 'error',
        message: 'Adjustment type must be either "Increase" or "Decrease"'
      });
      return;
    }

    if (!['damage', 'loss', 'stock_count', 'expired', 'other'].includes(reason)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid reason provided'
      });
      return;
    }

    // Validate warehouse exists and is active
    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
      res.status(404).json({
        status: 'error',
        message: 'Warehouse not found'
      });
      return;
    }

    if (!warehouse.isActive) {
      res.status(400).json({
        status: 'error',
        message: 'Warehouse is not active'
      });
      return;
    }

    // Duplicate prevention: reject if referenceNumber already exists
    if (referenceNumber && String(referenceNumber).trim()) {
      const existing = await InventoryAdjustment.findOne({
        referenceNumber: String(referenceNumber).trim()
      });
      if (existing) {
        res.status(400).json({
          status: 'error',
          message: `An adjustment with reference number "${referenceNumber}" already exists`
        });
        return;
      }
    }

    // Process and validate items
    const processedItems: IAdjustmentItem[] = [];
    let totalAdjustmentValue = 0;

    const whIdStr = String(warehouseId);
    
    // Check for duplicate products/variations/batches in the items
    const seenItems = new Set<string>();
    for (const item of items) {
      const { productId, variationName: itemVariation, batchNumber: itemBatch } = item;
      // Create a unique key for this product combination
      const itemKey = `${productId}_${itemVariation || ''}_${itemBatch || ''}`;
      if (seenItems.has(itemKey)) {
        const product = await Product.findById(productId);
        const productName = product?.name || 'Unknown';
        const variationLabel = itemVariation ? ` (variation: ${itemVariation})` : '';
        const batchLabel = itemBatch ? ` (batch: ${itemBatch})` : '';
        res.status(400).json({
          status: 'error',
          message: `Duplicate product entry: "${productName}"${variationLabel}${batchLabel} is already in the adjustment items.`
        });
        return;
      }
      seenItems.add(itemKey);
    }

    for (const item of items) {
      const { productId, adjustmentQuantity, variationName: itemVariation, batchNumber: itemBatch } = item;

      if (!adjustmentQuantity || adjustmentQuantity <= 0) {
        res.status(400).json({
          status: 'error',
          message: 'Adjustment quantity must be greater than zero for each item.'
        });
        return;
      }

      const product = await Product.findById(productId);
      if (!product) {
        res.status(404).json({
          status: 'error',
          message: `Product not found. Please ensure the product exists and try again.`
        });
        return;
      }

      // Only block if isInventory is explicitly false
      // Allow products with isInventory === true or undefined (for backward compatibility)
      if (product.isInventory === false) {
        res.status(400).json({
          status: 'error',
          message: `"${product.name}" is not an inventory product. Only inventory products can be adjusted.`
        });
        return;
      }

      const stockAndCost = getStockAndCost(product, whIdStr, warehouseName, itemVariation, itemBatch);
      if (!stockAndCost) {
        res.status(400).json({
          status: 'error',
          message: `"${product.name}" does not have inventory in warehouse "${warehouseName}". Add the product to this warehouse first.`
        });
        return;
      }
      if ('error' in stockAndCost) {
        res.status(400).json({
          status: 'error',
          message: stockAndCost.error
        });
        return;
      }

      const { currentStock, productCost } = stockAndCost;
      let newStock: number;
      if (adjustmentType === 'Increase') {
        newStock = currentStock + adjustmentQuantity;
      } else {
        newStock = currentStock - adjustmentQuantity;
        if (newStock < 0) {
          const variationLabel = stockAndCost.variationName ? ` (variation: ${stockAndCost.variationName})` : '';
          res.status(400).json({
            status: 'error',
            message: `Insufficient stock for "${product.name}"${variationLabel}. Current stock: ${currentStock}, requested decrease: ${adjustmentQuantity}.`
          });
          return;
        }
      }

      const subTotal = adjustmentQuantity * productCost;
      totalAdjustmentValue += subTotal;

      const processedItem: IAdjustmentItem = {
        productId: new mongoose.Types.ObjectId(productId),
        productName: product.name,
        productCode: product.code,
        adjustmentQuantity,
        productCost,
        subTotal,
        currentStock,
        newStock
      };
      if (stockAndCost.variationName) processedItem.variationName = stockAndCost.variationName;
      if (stockAndCost.batchNumber) processedItem.batchNumber = stockAndCost.batchNumber;
      processedItems.push(processedItem);
    }

    // Create adjustment record
    const adjustmentId = `ADJ-${Date.now()}`;
    const refNum = referenceNumber && String(referenceNumber).trim() ? String(referenceNumber).trim() : undefined;
    const validStatuses = ['Pending', 'Approved', 'Completed', 'Cancelled'];
    const status = bodyStatus && validStatuses.includes(bodyStatus) ? bodyStatus : 'Pending';
    const newAdjustment = new InventoryAdjustment({
      adjustmentId,
      warehouseId: new mongoose.Types.ObjectId(warehouseId),
      warehouseName,
      adjustmentType,
      adjustmentDate: parseDateInputAsZonedStart(adjustmentDate),
      items: processedItems,
      reason,
      reasonDetails,
      ...(refNum ? { referenceNumber: refNum } : {}),
      notes,
      totalAdjustmentValue,
      status,
      createdBy: new mongoose.Types.ObjectId(createdBy)
    });

    await newAdjustment.save();

    /**
     * IMPORTANT:
     * Do not touch product inventory while the adjustment is in "Pending" or "Approved" status.
     * Stock should only change once the adjustment status is "Completed".
     */
    if (status === 'Completed') {
      // Update product inventory using atomic operations with optimistic locking
      // If any update fails, remove the adjustment and return error
      try {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const processedItem = processedItems[i];
          const product = await Product.findById(item.productId);
          if (!product) continue;
          
          // Calculate adjustment quantity (positive for increase, negative for decrease)
          const adjustmentQty = adjustmentType === 'Increase' 
            ? processedItem.adjustmentQuantity 
            : -processedItem.adjustmentQuantity;
          
          await setProductStock(
            item.productId,
            whIdStr,
            adjustmentQty, // Pass adjustment quantity for atomic $inc operation
            processedItem.variationName,
            processedItem.batchNumber,
            (product as any).isWeight === true
          );
        }
      } catch (updateErr: any) {
        await InventoryAdjustment.findByIdAndDelete(newAdjustment._id);
        console.error('[createAdjustment] inventory update failed', updateErr?.message);
        res.status(500).json({
          status: 'error',
          message: 'Failed to update product inventory. Another adjustment may be processing the same products. Please try again.',
          error: updateErr?.message || String(updateErr)
        });
        return;
      }
    }

    res.status(201).json({
      status: 'success',
      message: 'Adjustment created successfully',
      data: newAdjustment
    });
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.error('[createAdjustment]', errMsg, error?.stack);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create adjustment',
      error: errMsg
    });
  }
};

/**
 * Approve an inventory adjustment (authorization)
 */
export const approveAdjustment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { approvedBy } = req.body;

    if (!approvedBy) {
      res.status(400).json({
        status: 'error',
        message: 'approvedBy field is required'
      });
      return;
    }

    const adjustment = await InventoryAdjustment.findById(id);
    if (!adjustment) {
      res.status(404).json({
        status: 'error',
        message: 'Adjustment not found'
      });
      return;
    }

    if (adjustment.status !== 'Pending') {
      res.status(400).json({
        status: 'error',
        message: `Cannot approve adjustment with status "${adjustment.status}". Only "Pending" adjustments can be approved.`
      });
      return;
    }

    // Update adjustment status
    adjustment.status = 'Approved';
    adjustment.approvedBy = new mongoose.Types.ObjectId(approvedBy);
    adjustment.approvalDate = new Date();

    await adjustment.save();

    res.status(200).json({
      status: 'success',
      message: 'Adjustment approved successfully',
      data: adjustment
    });

  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to approve adjustment',
      error: error.message
    });
  }
};

/**
 * Refresh currentStock/newStock for a Pending adjustment so it reflects
 * the latest product inventory (does NOT write to the database).
 */
const refreshPendingAdjustmentStocks = async (
  adjustment: any
): Promise<void> => {
  if (!adjustment || adjustment.status !== 'Pending') return;
  const whKey = adjustment.warehouseId?.toString?.() || adjustment.warehouseId;
  const warehouseName = adjustment.warehouseName;
  if (!whKey || !Array.isArray(adjustment.items) || adjustment.items.length === 0) {
    return;
  }

  for (const item of adjustment.items) {
    try {
      const product = await Product.findById(item.productId);
      if (!product) continue;

      const stockAndCost = getStockAndCost(
        product,
        String(whKey),
        warehouseName,
        item.variationName,
        item.batchNumber
      );
      if (!stockAndCost || 'error' in stockAndCost) {
        continue;
      }

      const { currentStock } = stockAndCost;
      const qty = item.adjustmentQuantity;
      if (typeof qty !== 'number') continue;

      item.currentStock = currentStock;
      item.newStock =
        adjustment.adjustmentType === 'Increase'
          ? currentStock + qty
          : currentStock - qty;
    } catch {
      // Ignore per-item errors; keep existing values
    }
  }
};

/**
 * Get all adjustments with optional filtering
 */
export const getAdjustments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      warehouseId,
      adjustmentType,
      status,
      reason,
      referenceNumber,
      q,
      startDate,
      endDate,
      page = 1,
      limit = 10
    } = req.query;

    const filter: any = {};

    if (warehouseId) {
      filter.warehouseId = new mongoose.Types.ObjectId(warehouseId as string);
    }

    if (adjustmentType) {
      filter.adjustmentType = adjustmentType;
    }

    if (status) {
      filter.status = status;
    }

    if (reason) {
      filter.reason = reason;
    }

    if (referenceNumber && String(referenceNumber).trim()) {
      filter.referenceNumber = String(referenceNumber).trim();
    }

    if (q && String(q).trim()) {
      filter['items.productName'] = { $regex: String(q).trim(), $options: 'i' };
    }

    if (startDate || endDate) {
      const { start, end } = buildZonedDateRange(startDate as string | undefined, endDate as string | undefined);
      filter.adjustmentDate = { $gte: start, $lte: end };
    }

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    const skip = (pageNum - 1) * limitNum;

    const adjustments = await InventoryAdjustment.find(filter)
      .populate('warehouseId', 'name')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('items.productId', 'name code')
      .sort({ adjustmentDate: -1 })
      .skip(skip)
      .limit(limitNum);

    // For Pending adjustments, recompute currentStock/newStock so they always
    // reflect the latest inventory when listing.
    await Promise.all(
      adjustments.map(adj => refreshPendingAdjustmentStocks(adj))
    );

    const total = await InventoryAdjustment.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      data: adjustments,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch adjustments',
      error: error.message
    });
  }
};

/**
 * Get single adjustment by ID
 */
export const getAdjustmentById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const adjustment = await InventoryAdjustment.findById(id)
      .populate('warehouseId', 'name location')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('items.productId', 'name code category');

    if (!adjustment) {
      res.status(404).json({
        status: 'error',
        message: 'Adjustment not found'
      });
      return;
    }

    // Keep Pending adjustment item stocks fresh when viewing details.
    await refreshPendingAdjustmentStocks(adjustment);

    res.status(200).json({
      status: 'success',
      data: adjustment
    });

  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch adjustment',
      error: error.message
    });
  }
};

/** Revert inventory for adjustment items (used by update, cancel, delete). Supports variation and batch. */
/**
 * Revert adjustment stock changes using atomic operations with optimistic locking
 * Reverses the effect of an adjustment (increase becomes decrease, decrease becomes increase)
 */
const revertAdjustmentStock = async (
  adjustment: { warehouseId?: any; warehouseName?: string; adjustmentType: string; items: IAdjustmentItem[] },
  maxRetries: number = 3
): Promise<void> => {
  const whKey = adjustment.warehouseId?.toString?.() || adjustment.warehouseId;
  if (!whKey) return;
  const stockChange =
    adjustment.adjustmentType === 'Increase'
      ? -1
      : 1; // multiplier for quantity (reverses the adjustment)
  
  for (const item of adjustment.items) {
    const product = await Product.findById(item.productId);
    if (!product) continue;
    const isWeight = (product as any).isWeight === true;
    const qtyPath = isWeight ? 'totalProductWeight' : 'productQty';
    const delta = stockChange * item.adjustmentQuantity;
    
    let retries = 0;
    while (retries < maxRetries) {
      try {
        const currentProduct = await Product.findById(item.productId);
        if (!currentProduct) break;
        
        if (item.variationName) {
          if (item.batchNumber) {
            const result = await Product.findOneAndUpdate(
              { 
                _id: item.productId,
                [`warehouse.${whKey}.batches.batchNumber`]: item.batchNumber,
                __v: currentProduct.__v
              },
              { $inc: { [`warehouse.${whKey}.batches.$[batch].variationValues.${item.variationName}.${qtyPath}`]: delta } },
              { 
                arrayFilters: [{ 'batch.batchNumber': item.batchNumber }],
                new: true
              }
            );
            if (!result) {
              retries++;
              await new Promise(resolve => setTimeout(resolve, 50 * retries));
              continue;
            }
            break;
          } else {
            const result = await Product.findOneAndUpdate(
              { _id: item.productId, __v: currentProduct.__v },
              { $inc: { [`warehouse.${whKey}.variationValues.${item.variationName}.${qtyPath}`]: delta } },
              { new: true }
            );
            if (!result) {
              retries++;
              await new Promise(resolve => setTimeout(resolve, 50 * retries));
              continue;
            }
            break;
          }
        } else if (item.batchNumber) {
          const result = await Product.findOneAndUpdate(
            { 
              _id: item.productId,
              [`warehouse.${whKey}.batches.batchNumber`]: item.batchNumber,
              __v: currentProduct.__v
            },
            { $inc: { [`warehouse.${whKey}.batches.$[batch].${qtyPath}`]: delta } },
            { 
              arrayFilters: [{ 'batch.batchNumber': item.batchNumber }],
              new: true
            }
          );
          if (!result) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 50 * retries));
            continue;
          }
          break;
        } else {
          const result = await Product.findOneAndUpdate(
            { _id: item.productId, __v: currentProduct.__v },
            { $inc: { [`warehouse.${whKey}.${qtyPath}`]: delta } },
            { new: true }
          );
          if (!result) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 50 * retries));
            continue;
          }
          break;
        }
      } catch (error: any) {
        if (retries >= maxRetries - 1) {
          console.error(`[revertAdjustmentStock] Failed to revert stock for product ${item.productId} after ${maxRetries} retries:`, error.message);
          throw error;
        }
        retries++;
        await new Promise(resolve => setTimeout(resolve, 50 * retries));
      }
    }
  }
};

/**
 * Update an adjustment (only when status is Pending)
 * Reverts old stock, then applies new items like create.
 */
export const updateAdjustment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      warehouseId,
      warehouseName,
      adjustmentType,
      adjustmentDate,
      items,
      reason,
      reasonDetails,
      referenceNumber,
      notes,
      status: bodyStatus
    } = req.body;

    const adjustment = await InventoryAdjustment.findById(id);
    if (!adjustment) {
      res.status(404).json({
        status: 'error',
        message: 'Adjustment not found'
      });
      return;
    }
    // Validate status if provided
    const validStatuses = ['Pending', 'Approved', 'Completed', 'Cancelled'];
    const newStatus = bodyStatus && validStatuses.includes(bodyStatus) ? bodyStatus : adjustment.status;
    
    // Only block updates to non-Pending adjustments if trying to change items/quantities
    // Allow status-only updates for any status
    const isStatusOnlyUpdate = bodyStatus && !items && !warehouseId && !adjustmentType;
    if (adjustment.status !== 'Pending' && !isStatusOnlyUpdate) {
      res.status(400).json({
        status: 'error',
        message: `Only Pending adjustments can be updated. Current status: ${adjustment.status}. You can update the status only.`
      });
      return;
    }

    if (!warehouseId || !adjustmentType || !items || items.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'Missing required fields: warehouseId, adjustmentType, and items'
      });
      return;
    }
    if (!['Increase', 'Decrease'].includes(adjustmentType)) {
      res.status(400).json({
        status: 'error',
        message: 'Adjustment type must be either "Increase" or "Decrease"'
      });
      return;
    }
    if (!['damage', 'loss', 'stock_count', 'expired', 'other'].includes(reason)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid reason provided'
      });
      return;
    }

    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
      res.status(404).json({
        status: 'error',
        message: 'Warehouse not found'
      });
      return;
    }
    if (!warehouse.isActive) {
      res.status(400).json({
        status: 'error',
        message: 'Warehouse is not active'
      });
      return;
    }

    const oldStatus = adjustment.status;

    // Revert existing stock first ONLY if this adjustment had already affected inventory
    // (i.e. when it was previously Completed).
    if (oldStatus === 'Completed') {
      await revertAdjustmentStock(adjustment);
    }

    const processedItems: IAdjustmentItem[] = [];
    let totalAdjustmentValue = 0;
    const whIdStr = String(warehouseId);

    // Check for duplicate products/variations/batches in the new items
    const seenItems = new Set<string>();
    for (const item of items) {
      const { productId, variationName: itemVariation, batchNumber: itemBatch } = item;
      // Create a unique key for this product combination
      const itemKey = `${productId}_${itemVariation || ''}_${itemBatch || ''}`;
      if (seenItems.has(itemKey)) {
        const product = await Product.findById(productId);
        const productName = product?.name || 'Unknown';
        const variationLabel = itemVariation ? ` (variation: ${itemVariation})` : '';
        const batchLabel = itemBatch ? ` (batch: ${itemBatch})` : '';
        res.status(400).json({
          status: 'error',
          message: `Duplicate product entry: "${productName}"${variationLabel}${batchLabel} is already in the adjustment items.`
        });
        return;
      }
      seenItems.add(itemKey);
    }

    for (const item of items) {
      const { productId, adjustmentQuantity, variationName: itemVariation, batchNumber: itemBatch } = item;
      if (!adjustmentQuantity || adjustmentQuantity <= 0) {
        res.status(400).json({
          status: 'error',
          message: 'Adjustment quantity must be greater than zero for each item.'
        });
        return;
      }

      const product = await Product.findById(productId);
      if (!product) {
        res.status(404).json({
          status: 'error',
          message: 'Product not found. Please ensure the product exists and try again.'
        });
        return;
      }
      // Only block if isInventory is explicitly false
      // Allow products with isInventory === true or undefined (for backward compatibility)
      if (product.isInventory === false) {
        res.status(400).json({
          status: 'error',
          message: `"${product.name}" is not an inventory product. Only inventory products can be adjusted.`
        });
        return;
      }

      const stockAndCost = getStockAndCost(product, whIdStr, warehouseName, itemVariation, itemBatch);
      if (!stockAndCost) {
        res.status(400).json({
          status: 'error',
          message: `"${product.name}" does not have inventory in warehouse "${warehouseName}". Add the product to this warehouse first.`
        });
        return;
      }
      if ('error' in stockAndCost) {
        res.status(400).json({
          status: 'error',
          message: stockAndCost.error
        });
        return;
      }

      const { currentStock, productCost } = stockAndCost;
      let newStock: number;
      if (adjustmentType === 'Increase') {
        newStock = currentStock + adjustmentQuantity;
      } else {
        newStock = currentStock - adjustmentQuantity;
        if (newStock < 0) {
          const variationLabel = stockAndCost.variationName ? ` (variation: ${stockAndCost.variationName})` : '';
          res.status(400).json({
            status: 'error',
            message: `Insufficient stock for "${product.name}"${variationLabel}. Current stock: ${currentStock}, requested decrease: ${adjustmentQuantity}.`
          });
          return;
        }
      }

      const subTotal = adjustmentQuantity * productCost;
      totalAdjustmentValue += subTotal;
      const processedItem: IAdjustmentItem = {
        productId: new mongoose.Types.ObjectId(productId),
        productName: product.name,
        productCode: product.code,
        adjustmentQuantity,
        productCost,
        subTotal,
        currentStock,
        newStock
      };
      if (stockAndCost.variationName) processedItem.variationName = stockAndCost.variationName;
      if (stockAndCost.batchNumber) processedItem.batchNumber = stockAndCost.batchNumber;
      processedItems.push(processedItem);
    }

    // Apply new adjustment using atomic operations
    // NOTE: Do not update inventory while status is Pending or Approved.
    // Only apply stock changes when the new status is Completed.
    if (newStatus === 'Completed') {
      const whKey = whIdStr;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const processedItem = processedItems[i];
        const product = await Product.findById(item.productId);
        if (!product) continue;
        
        // Calculate adjustment quantity (positive for increase, negative for decrease)
        const adjustmentQty = adjustmentType === 'Increase' 
          ? processedItem.adjustmentQuantity 
          : -processedItem.adjustmentQuantity;
        
        await setProductStock(
          item.productId,
          whKey,
          adjustmentQty, // Pass adjustment quantity for atomic $inc operation
          processedItem.variationName,
          processedItem.batchNumber,
          (product as any).isWeight === true
        );
      }
    }

    adjustment.warehouseId = new mongoose.Types.ObjectId(warehouseId);
    adjustment.warehouseName = warehouseName;
    adjustment.adjustmentType = adjustmentType;
    adjustment.adjustmentDate = adjustmentDate ? parseDateInputAsZonedStart(adjustmentDate) : adjustment.adjustmentDate;
    adjustment.items = processedItems;
    adjustment.reason = reason;
    adjustment.reasonDetails = reasonDetails;
    adjustment.referenceNumber = referenceNumber;
    adjustment.notes = notes;
    adjustment.status = newStatus; // Save the status
    adjustment.totalAdjustmentValue = totalAdjustmentValue;
    await adjustment.save();

    res.status(200).json({
      status: 'success',
      message: 'Adjustment updated successfully',
      data: adjustment
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to update adjustment',
      error: error.message
    });
  }
};

/**
 * Delete an adjustment (reverts stock then removes the record)
 */
export const deleteAdjustment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const adjustment = await InventoryAdjustment.findById(id);
    if (!adjustment) {
      res.status(404).json({
        status: 'error',
        message: 'Adjustment not found'
      });
      return;
    }
    
    // Only revert stock for adjustments that have already affected inventory (Completed)
    if (adjustment.status === 'Completed') {
      await revertAdjustmentStock(adjustment);
    }
    
    await InventoryAdjustment.findByIdAndDelete(id);

    res.status(200).json({
      status: 'success',
      message: 'Adjustment deleted successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete adjustment',
      error: error.message
    });
  }
};

/**
 * Cancel an adjustment (only if status is Pending)
 * Runs without MongoDB transactions for standalone MongoDB compatibility.
 */
export const cancelAdjustment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const adjustment = await InventoryAdjustment.findById(id);
    if (!adjustment) {
      res.status(404).json({
        status: 'error',
        message: 'Adjustment not found'
      });
      return;
    }

    if (adjustment.status !== 'Pending') {
      res.status(400).json({
        status: 'error',
        message: `Cannot cancel adjustment with status "${adjustment.status}". Only "Pending" adjustments can be cancelled.`
      });
      return;
    }

    // Cancellation is only allowed for Pending adjustments so there is no stock to revert here.
    adjustment.status = 'Cancelled';
    adjustment.notes = (adjustment.notes || '') + (reason ? `\nCancellation reason: ${reason}` : '');
    await adjustment.save();

    res.status(200).json({
      status: 'success',
      message: 'Adjustment cancelled successfully',
      data: adjustment
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel adjustment',
      error: error.message
    });
  }
};

/**
 * Get adjustment history/summary for warehouse
 */
export const getAdjustmentSummary = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { warehouseId, startDate, endDate } = req.query;

    if (!warehouseId) {
      res.status(400).json({
        status: 'error',
        message: 'warehouseId is required'
      });
      return;
    }

    const filter: any = {
      warehouseId: new mongoose.Types.ObjectId(warehouseId as string),
      status: 'Completed'
    };

    if (startDate || endDate) {
      const { start, end } = buildZonedDateRange(startDate as string | undefined, endDate as string | undefined);
      filter.adjustmentDate = { $gte: start, $lte: end };
    }

    const adjustments = await InventoryAdjustment.find(filter).populate(
      'createdBy',
      'name'
    );

    // Calculate summary statistics
    let totalIncreases = 0;
    let totalDecreases = 0;
    let totalIncreaseValue = 0;
    let totalDecreaseValue = 0;
    const adjustmentsByReason: any = {};

    for (const adj of adjustments) {
      if (adj.adjustmentType === 'Increase') {
        totalIncreases += adj.items.reduce((sum: number, item: any) => sum + item.adjustmentQuantity, 0);
        totalIncreaseValue += adj.totalAdjustmentValue;
      } else {
        totalDecreases += adj.items.reduce((sum: number, item: any) => sum + item.adjustmentQuantity, 0);
        totalDecreaseValue += adj.totalAdjustmentValue;
      }

      if (!adjustmentsByReason[adj.reason]) {
        adjustmentsByReason[adj.reason] = 0;
      }
      adjustmentsByReason[adj.reason] += 1;
    }

    res.status(200).json({
      status: 'success',
      data: {
        warehouse: warehouseId,
        totalAdjustments: adjustments.length,
        increases: {
          count: totalIncreases,
          value: totalIncreaseValue
        },
        decreases: {
          count: totalDecreases,
          value: totalDecreaseValue
        },
        byReason: adjustmentsByReason,
        adjustments
      }
    });

  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch adjustment summary',
      error: error.message
    });
  }
};
