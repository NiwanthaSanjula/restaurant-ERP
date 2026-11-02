import { Request, Response } from 'express';
import PurchaseReturn, { IPurchaseReturnItem } from '../models/PurchaseReturn';
import Purchase from '../models/Purchase';
import Product from '../models/Product';
import Warehouse from '../models/Warehouse';
import Supplier from '../models/Supplier';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { buildZonedDateRange, parseDateInputAsZonedStart } from '../utils/timezone';

/**
 * Create a purchase return.
 * Deducts returned quantities from warehouse inventory (no transactions for standalone MongoDB).
 * Return quantities must not exceed current stock.
 */
export const createPurchaseReturn = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const {
      purchaseId,
      supplierId,
      supplierName,
      warehouseId,
      warehouseName,
      returnDate,
      items,
      reason,
      reasonDetails,
      referenceNumber,
      notes,
      status: bodyStatus,
      createdBy: bodyCreatedBy
    } = req.body;

    const createdByRaw = bodyCreatedBy || req.user?._id || (req.user as any)?.id;
    const isValidObjectId =
      createdByRaw &&
      mongoose.Types.ObjectId.isValid(createdByRaw) &&
      String(createdByRaw).length === 24;
    const createdBy = isValidObjectId ? createdByRaw : req.user?._id;

    if (!createdBy || !mongoose.Types.ObjectId.isValid(createdBy)) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated or invalid user ID'
      });
      return;
    }

    if (!supplierId || !warehouseId || !warehouseName || !items || items.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'Missing required fields: supplierId, warehouseId, warehouseName, and items'
      });
      return;
    }

    if (
      !['damaged', 'expired', 'wrong_item', 'excess_stock', 'other'].includes(reason)
    ) {
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

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      res.status(404).json({
        status: 'error',
        message: 'Supplier not found'
      });
      return;
    }

    if (referenceNumber && String(referenceNumber).trim()) {
      const existing = await PurchaseReturn.findOne({
        referenceNumber: String(referenceNumber).trim()
      });
      if (existing) {
        res.status(400).json({
          status: 'error',
          message: `A purchase return with reference number "${referenceNumber}" already exists`
        });
        return;
      }
    }

    const processedItems: IPurchaseReturnItem[] = [];
    let totalReturnAmount = 0;

    for (const item of items) {
      const { productId, returnQuantity } = item;

      if (!returnQuantity || returnQuantity <= 0) {
        res.status(400).json({
          status: 'error',
          message: `Return quantity must be greater than zero for product ${productId}`
        });
        return;
      }
      if (!Number.isInteger(returnQuantity)) {
        res.status(400).json({
          status: 'error',
          message: `Return quantity must be a whole number for product ${productId}`
        });
        return;
      }

      const product = await Product.findById(productId);
      if (!product) {
        res.status(404).json({
          status: 'error',
          message: `Product ${productId} not found`
        });
        return;
      }
      // Check if product is inventory-based (restaurant-only system)
      // Only block products explicitly marked as non-inventory.
      // Products with isInventory === true or undefined are treated as inventory items.
      if (product.isInventory === false) {
        res.status(400).json({
          status: 'error',
          message: `Product "${product.name}" is not an inventory-based product. Only inventory products can be returned.`
        });
        return;
      }

      const whMap = product.warehouse;
      const getWh = (key: string) => {
        if (!whMap) return undefined;
        if (typeof (whMap as any).get === 'function')
          return (whMap as Map<string, any>).get(key);
        return (whMap as Record<string, any>)[key];
      };
      let warehouseInventory =
        getWh(warehouseId.toString()) || getWh(warehouseName);
      if (!warehouseInventory) {
        res.status(404).json({
          status: 'error',
          message: `Product "${product.name}" does not have inventory in warehouse "${warehouseName}"`
        });
        return;
      }

      const isWeight = (product as any).isWeight === true;
      let currentStock: number;
      if (
        isWeight &&
        typeof (warehouseInventory as any).totalProductWeight === 'number'
      ) {
        currentStock = (warehouseInventory as any).totalProductWeight;
      } else {
        currentStock = warehouseInventory.productQty || 0;
      }
      const productCost = warehouseInventory.productCost || 0;

      if (productCost === 0) {
        res.status(400).json({
          status: 'error',
          message: `Product "${product.name}" does not have a product cost defined`
        });
        return;
      }

      if (returnQuantity > currentStock) {
        res.status(400).json({
          status: 'error',
          message: `Cannot return ${returnQuantity} units of "${product.name}". Current stock is ${currentStock}`
        });
        return;
      }

      const newStock = currentStock - returnQuantity;
      const subTotal = returnQuantity * productCost;
      totalReturnAmount += subTotal;

      processedItems.push({
        productId: new mongoose.Types.ObjectId(productId),
        productName: product.name,
        productCode: product.code,
        returnQuantity,
        productCost,
        subTotal,
        currentStock,
        newStock
      });
    }

    const returnId = `PR-${Date.now()}`;
    const newReturn = new PurchaseReturn({
      returnId,
      purchaseId: purchaseId ? new mongoose.Types.ObjectId(purchaseId) : undefined,
      supplierId: new mongoose.Types.ObjectId(supplierId),
      supplierName: supplierName || supplier.name,
      warehouseId: new mongoose.Types.ObjectId(warehouseId),
      warehouseName,
      returnDate: parseDateInputAsZonedStart(returnDate),
      items: processedItems,
      reason,
      reasonDetails,
      referenceNumber,
      notes,
      totalReturnAmount,
      status: bodyStatus === 'Received' ? 'Completed' : (bodyStatus || 'Completed'),
      createdBy: new mongoose.Types.ObjectId(createdBy)
    });

    await newReturn.save();

    try {
      const whKey = warehouseId.toString();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const processedItem = processedItems[i];
        const product = await Product.findById(item.productId);
        if (!product) continue;
        const isWeight = (product as any).isWeight === true;
        if (isWeight) {
          await Product.findByIdAndUpdate(item.productId, {
            $set: {
              [`warehouse.${whKey}.totalProductWeight`]: processedItem.newStock
            }
          });
        } else {
          await Product.findByIdAndUpdate(item.productId, {
            $set: { [`warehouse.${whKey}.productQty`]: processedItem.newStock }
          });
        }
      }
    } catch (updateErr: any) {
      await PurchaseReturn.findByIdAndDelete(newReturn._id);
      console.error('[createPurchaseReturn] inventory update failed', updateErr?.message);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update product inventory',
        error: updateErr?.message || String(updateErr)
      });
      return;
    }

    res.status(201).json({
      status: 'success',
      message: 'Purchase return created successfully',
      data: newReturn
    });
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.error('[createPurchaseReturn]', errMsg, error?.stack);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create purchase return',
      error: errMsg
    });
  }
};

export const getPurchaseReturns = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { supplierId, supplierName, warehouseId, warehouseName, status, startDate, endDate, page = 1, limit = 10, q, sortBy = 'createdAt', sortOrder = 'desc' } =
      req.query;

    const filter: any = {};
    const andParts: any[] = [];

    if (supplierId || (supplierName && String(supplierName).trim())) {
      const sid = supplierId && mongoose.Types.ObjectId.isValid(supplierId as string)
        ? new mongoose.Types.ObjectId(supplierId as string)
        : null;
      const name = supplierName && String(supplierName).trim();
      const escapedName = name ? name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      if (sid && !name) {
        filter.supplierId = sid;
      } else if (sid && name) {
        andParts.push({
          $or: [
            { supplierId: sid },
            { supplierName: new RegExp(`^${escapedName}$`, 'i') }
          ]
        });
      } else if (name) {
        filter.supplierName = new RegExp(`^${escapedName}$`, 'i');
      }
    }
    if (warehouseId || (warehouseName && String(warehouseName).trim())) {
      const wid = warehouseId && mongoose.Types.ObjectId.isValid(warehouseId as string)
        ? new mongoose.Types.ObjectId(warehouseId as string)
        : null;
      const wName = warehouseName && String(warehouseName).trim();
      const escapedWName = wName ? wName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      if (wid && !wName) {
        filter.warehouseId = wid;
      } else if (wid && wName) {
        andParts.push({
          $or: [
            { warehouseId: wid },
            { warehouseName: new RegExp(`^${escapedWName}$`, 'i') }
          ]
        });
      } else if (wName) {
        filter.warehouseName = new RegExp(`^${escapedWName}$`, 'i');
      }
    }
    if (status) filter.status = status;
    if (startDate || endDate) {
      const { start, end } = buildZonedDateRange(startDate as string | undefined, endDate as string | undefined);
      filter.createdAt = { $gte: start, $lte: end };
    }
    if (q && String(q).trim()) {
      const searchRegex = new RegExp(String(q).trim(), 'i');
      const searchCondition = {
        $or: [
          { returnId: searchRegex },
          { supplierName: searchRegex },
          { warehouseName: searchRegex }
        ]
      };
      andParts.push(searchCondition);
    }
    if (andParts.length > 0) {
      filter.$and = [...(filter.$and || []), ...andParts];
    }

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Determine sort field and order
    const validSortFields: Record<string, string> = {
      'grandTotal': 'totalReturnAmount',
      'createdAt': 'createdAt',
      'returnDate': 'returnDate',
      'supplier': 'supplierName',
      'warehouse': 'warehouseName'
    };
    const sortField = validSortFields[sortBy as string] || 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortObj: any = {};
    sortObj[sortField] = sortDirection;
    sortObj._id = sortDirection;

    const returns = await PurchaseReturn.find(filter)
      .populate('supplierId', 'name')
      .populate('warehouseId', 'name')
      .populate('purchaseId', 'purchaseId')
      .populate('createdBy', 'name email')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum);

    const total = await PurchaseReturn.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      data: returns,
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
      message: 'Failed to fetch purchase returns',
      error: error.message
    });
  }
};

export const getPurchaseReturnById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const purchaseReturn = await PurchaseReturn.findById(id)
      .populate('supplierId', 'name')
      .populate('warehouseId', 'name location')
      .populate('purchaseId', 'purchaseId purchaseDate')
      .populate('createdBy', 'name email');

    if (!purchaseReturn) {
      res.status(404).json({
        status: 'error',
        message: 'Purchase return not found'
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      data: purchaseReturn
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch purchase return',
      error: error.message
    });
  }
};

/**
 * Update a purchase return. Can update returnDate, status, notes, and items.
 * Reverses old inventory and applies new quantities when items change.
 */
export const updatePurchaseReturn = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { returnDate, status, notes, items: bodyItems } = req.body;

    const existing = await PurchaseReturn.findById(id);
    if (!existing) {
      res.status(404).json({ status: 'error', message: 'Purchase return not found' });
      return;
    }

    const warehouseId = existing.warehouseId?.toString?.() || (existing.warehouseId as any)?.toString?.();
    if (!warehouseId) {
      res.status(400).json({ status: 'error', message: 'Purchase return has no warehouse' });
      return;
    }

    const warehouseName = existing.warehouseName || (existing.warehouseId as any)?.name;

    if (status !== undefined) {
      const allowed = ['Pending', 'Completed', 'Cancelled', 'Received', 'Ordered'];
      let mapped = status;
      if (status === 'Received') {
        mapped = 'Completed';
      }
      // "Ordered" is now a valid status, no mapping needed
      if (!['Pending', 'Completed', 'Cancelled', 'Ordered'].includes(mapped)) {
        res.status(400).json({ status: 'error', message: 'Invalid status' });
        return;
      }
      existing.status = mapped;
    }
    if (returnDate !== undefined) existing.returnDate = parseDateInputAsZonedStart(returnDate);
    if (notes !== undefined) existing.notes = notes;

    if (bodyItems && Array.isArray(bodyItems) && bodyItems.length > 0) {
      const oldItems = existing.items || [];
      for (const item of oldItems) {
        const product = await Product.findById(item.productId);
        if (!product) continue;
        const whMap = (product as any).warehouse;
        const getWh = (key: string) => {
          if (!whMap) return undefined;
          if (typeof (whMap as any).get === 'function') return (whMap as Map<string, any>).get(key);
          return (whMap as Record<string, any>)[key];
        };
        const whInv = getWh(warehouseId) || getWh(warehouseName);
        if (!whInv) continue;
        const isWeight = (product as any).isWeight === true;
        if (isWeight && typeof (whInv as any).totalProductWeight === 'number') {
          const newWeight = ((whInv as any).totalProductWeight || 0) + item.returnQuantity;
          await Product.findByIdAndUpdate(item.productId, { $set: { [`warehouse.${warehouseId}.totalProductWeight`]: newWeight } });
        } else {
          const currentQty = (whInv as any).productQty || 0;
          await Product.findByIdAndUpdate(item.productId, { $set: { [`warehouse.${warehouseId}.productQty`]: currentQty + item.returnQuantity } });
        }
      }

      const processedItems: IPurchaseReturnItem[] = [];
      let totalReturnAmount = 0;
      for (const item of bodyItems) {
        const { productId, returnQuantity } = item;
        if (!returnQuantity || returnQuantity <= 0) {
          res.status(400).json({ status: 'error', message: `Return quantity must be greater than zero for product ${productId}` });
          return;
        }
        if (!Number.isInteger(returnQuantity)) {
          res.status(400).json({ status: 'error', message: `Return quantity must be a whole number for product ${productId}` });
          return;
        }
        const product = await Product.findById(productId);
        if (!product) {
          res.status(404).json({ status: 'error', message: `Product ${productId} not found` });
          return;
        }
        const whMap = (product as any).warehouse;
        const getWh = (key: string) => {
          if (!whMap) return undefined;
          if (typeof (whMap as any).get === 'function') return (whMap as Map<string, any>).get(key);
          return (whMap as Record<string, any>)[key];
        };
        let whInv = getWh(warehouseId) || getWh(warehouseName);
        if (!whInv) {
          res.status(404).json({ status: 'error', message: `Product "${product.name}" does not have inventory in this warehouse` });
          return;
        }
        const isWeight = (product as any).isWeight === true;
        let currentStock: number;
        if (isWeight && typeof (whInv as any).totalProductWeight === 'number') {
          currentStock = (whInv as any).totalProductWeight;
        } else {
          currentStock = (whInv as any).productQty || 0;
        }
        const productCost = (whInv as any).productCost || 0;
        if (returnQuantity > currentStock) {
          res.status(400).json({ status: 'error', message: `Cannot return ${returnQuantity} units of "${product.name}". Current stock is ${currentStock}` });
          return;
        }
        const newStock = currentStock - returnQuantity;
        const subTotal = returnQuantity * productCost;
        totalReturnAmount += subTotal;
        processedItems.push({
          productId: new mongoose.Types.ObjectId(productId),
          productName: product.name,
          productCode: product.code || '',
          returnQuantity,
          productCost,
          subTotal,
          currentStock,
          newStock
        });
      }

      for (const item of processedItems) {
        const product = await Product.findById(item.productId);
        if (!product) continue;
        const isWeight = (product as any).isWeight === true;
        if (isWeight) {
          await Product.findByIdAndUpdate(item.productId, { $set: { [`warehouse.${warehouseId}.totalProductWeight`]: item.newStock } });
        } else {
          await Product.findByIdAndUpdate(item.productId, { $set: { [`warehouse.${warehouseId}.productQty`]: item.newStock } });
        }
      }

      existing.items = processedItems;
      existing.totalReturnAmount = totalReturnAmount;
    }

    await existing.save();
    res.status(200).json({
      status: 'success',
      message: 'Purchase return updated successfully',
      data: existing
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to update purchase return',
      error: error.message
    });
  }
};

/**
 * Delete a single purchase return and restore inventory (add back returned quantities).
 */
export const deletePurchaseReturn = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const purchaseReturn = await PurchaseReturn.findById(id);
    if (!purchaseReturn) {
      res.status(404).json({
        status: 'error',
        message: 'Purchase return not found'
      });
      return;
    }

    const warehouseId = purchaseReturn.warehouseId?.toString?.() || (purchaseReturn.warehouseId as any)?.toString?.();
    if (!warehouseId) {
      res.status(400).json({
        status: 'error',
        message: 'Purchase return has no warehouse'
      });
      return;
    }

    const items = purchaseReturn.items || [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const product = await Product.findById(item.productId);
      if (!product) continue;
      const whMap = (product as any).warehouse;
      const getWh = (key: string) => {
        if (!whMap) return undefined;
        if (typeof (whMap as any).get === 'function')
          return (whMap as Map<string, any>).get(key);
        return (whMap as Record<string, any>)[key];
      };
      const warehouseInventory = getWh(warehouseId) || getWh((purchaseReturn as any).warehouseName);
      if (!warehouseInventory) continue;

      const isWeight = (product as any).isWeight === true;
      if (isWeight && typeof (warehouseInventory as any).totalProductWeight === 'number') {
        const newWeight = ((warehouseInventory as any).totalProductWeight || 0) + item.returnQuantity;
        await Product.findByIdAndUpdate(item.productId, {
          $set: { [`warehouse.${warehouseId}.totalProductWeight`]: newWeight }
        });
      } else {
        const currentQty = (warehouseInventory as any).productQty || 0;
        const newQty = currentQty + item.returnQuantity;
        await Product.findByIdAndUpdate(item.productId, {
          $set: { [`warehouse.${warehouseId}.productQty`]: newQty }
        });
      }
    }

    await PurchaseReturn.findByIdAndDelete(id);
    res.status(200).json({
      status: 'success',
      message: 'Purchase return deleted successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete purchase return',
      error: error.message
    });
  }
};

/**
 * Bulk delete purchase returns by ids. Restores inventory for each, then deletes.
 */
export const bulkDeletePurchaseReturns = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'Request body must contain an array of ids'
      });
      return;
    }

    const results = { deleted: 0, failed: [] as string[] };
    for (const id of ids) {
      try {
        const purchaseReturn = await PurchaseReturn.findById(id);
        if (!purchaseReturn) {
          results.failed.push(id);
          continue;
        }
        const warehouseId = purchaseReturn.warehouseId?.toString?.() || (purchaseReturn.warehouseId as any)?.toString?.();
        if (!warehouseId) {
          results.failed.push(id);
          continue;
        }
        const items = purchaseReturn.items || [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const product = await Product.findById(item.productId);
          if (!product) continue;
          const whMap = (product as any).warehouse;
          const getWh = (key: string) => {
            if (!whMap) return undefined;
            if (typeof (whMap as any).get === 'function')
              return (whMap as Map<string, any>).get(key);
            return (whMap as Record<string, any>)[key];
          };
          const warehouseInventory = getWh(warehouseId) || getWh((purchaseReturn as any).warehouseName);
          if (!warehouseInventory) continue;
          const isWeight = (product as any).isWeight === true;
          if (isWeight && typeof (warehouseInventory as any).totalProductWeight === 'number') {
            const newWeight = ((warehouseInventory as any).totalProductWeight || 0) + item.returnQuantity;
            await Product.findByIdAndUpdate(item.productId, {
              $set: { [`warehouse.${warehouseId}.totalProductWeight`]: newWeight }
            });
          } else {
            const currentQty = (warehouseInventory as any).productQty || 0;
            const newQty = currentQty + item.returnQuantity;
            await Product.findByIdAndUpdate(item.productId, {
              $set: { [`warehouse.${warehouseId}.productQty`]: newQty }
            });
          }
        }
        await PurchaseReturn.findByIdAndDelete(id);
        results.deleted += 1;
      } catch {
        results.failed.push(id);
      }
    }

    res.status(200).json({
      status: 'success',
      message: `Deleted ${results.deleted} purchase return(s)`,
      data: results
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to bulk delete purchase returns',
      error: error.message
    });
  }
};
