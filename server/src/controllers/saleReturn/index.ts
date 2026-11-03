import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import Customer from '../../models/Customer';
import Product from '../../models/Product';
import Sale from '../../models/Sale';
import SaleReturn from '../../models/SaleReturn';
import Warehouse from '../../models/Warehouse';
import { buildZonedDateRange } from '../../utils/timezone';

// Type definitions for product structures (matching Sale controller)
interface IVariation {
  productQty?: number;
  productPrice?: number;
  productCost?: number;
  [key: string]: any;
}

interface IBatch {
  batchNumber?: string;
  productQty?: number;
  variationValues?: Map<string, IVariation> | Record<string, IVariation>;
  [key: string]: any;
}

interface IWarehouse {
  productQty?: number;
  batches?: IBatch[];
  variationValues?: Map<string, IVariation> | Record<string, IVariation>;
  [key: string]: any;
}

const updateInventory = async (
  products: any[],
  warehouseId: string,
  operation: 'add' | 'subtract'
): Promise<void> => {
  const multiplier = operation === 'subtract' ? -1 : 1;
  
  for (const item of products) {
    const product = await Product.findById(item.productId);
    if (!product) continue;
    
    const warehouseDataRaw = product.warehouse?.get?.(warehouseId);
    if (!warehouseDataRaw) continue;
    
    const warehouseData = warehouseDataRaw as unknown as IWarehouse;
    
    if (item.batch && warehouseData.batches) {
      const batch = warehouseData.batches.find((b: IBatch) => b.batchNumber === item.batch);
      if (batch) {
        if (item.variation && batch.variationValues) {
          const variationValues = batch.variationValues instanceof Map
            ? batch.variationValues
            : new Map<string, IVariation>(Object.entries(batch.variationValues));
          const variation = variationValues.get(item.variation);
          if (variation && typeof variation.productQty === 'number') {
            variation.productQty = Math.max(0, variation.productQty + (multiplier * item.returnQty));
            variationValues.set(item.variation, variation);
            (batch as any).variationValues = variationValues;
          }
        } else if (typeof batch.productQty === 'number') {
          batch.productQty = Math.max(0, batch.productQty + (multiplier * item.returnQty));
        }
      }
    } else if (item.variation && warehouseData.variationValues) {
      const variationValues = warehouseData.variationValues instanceof Map
        ? warehouseData.variationValues
        : new Map<string, IVariation>(Object.entries(warehouseData.variationValues));
      const variation = variationValues.get(item.variation);
      if (variation && typeof variation.productQty === 'number') {
        variation.productQty = Math.max(0, variation.productQty + (multiplier * item.returnQty));
        variationValues.set(item.variation, variation);
        (warehouseData as any).variationValues = variationValues;
      }
    } else if (typeof warehouseData.productQty === 'number') {
      warehouseData.productQty = Math.max(0, warehouseData.productQty + (multiplier * item.returnQty));
    }
    
    product.warehouse.set(warehouseId, warehouseData as any);
    await product.save();
  }
};

export const createSaleReturnValidators = [
  body('saleId').isMongoId().withMessage('Invalid sale ID'),
  body('items').isArray({ min: 1 }).withMessage('At least one product is required for return'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required'),
  body('items.*.returnQty').isInt({ min: 1 }).withMessage('Return quantity must be a whole number greater than 0')
];

export const createSaleReturn = [
  ...createSaleReturnValidators,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }

      const { saleId, items, reason, returnDate } = req.body;
      const sale = await Sale.findById(saleId);
      if (!sale) {
        res.status(404).json({ status: 'error', message: 'Original sale not found' });
        return;
      }

      const authUser = (req as any).user as { userId?: string; _id?: string } | undefined;
      const rawUserId = authUser?.userId ?? authUser?._id;
      if (!rawUserId || !mongoose.Types.ObjectId.isValid(String(rawUserId))) {
        res.status(401).json({ status: 'error', message: 'User not authenticated' });
        return;
      }
      const createdBy = new mongoose.Types.ObjectId(String(rawUserId));

      // Fetch customer and warehouse details
      const customer = await Customer.findById(sale.customerId);
      const warehouse = await Warehouse.findById(sale.warehouseId);

      // Enrich items with required fields from the original sale record
      const enrichedItems = await Promise.all(items.map(async (item: any) => {
        const originalSaleItem = (sale as any).products?.find(
          (saleItem: any) => saleItem.productId.toString() === String(item.productId)
        );
        const product = await Product.findById(item.productId);

        return {
          productId: item.productId,
          productName: item.productName || originalSaleItem?.productName || product?.name || 'Unknown',
          variation: item.variation || null,
          batch: item.batch || null,
          returnQty: item.returnQty,
          originalQty: originalSaleItem?.qty ?? item.returnQty,
          unitPrice: originalSaleItem?.price ?? item.unitPrice ?? 0,
          subtotal: (item.returnQty || 0) * (originalSaleItem?.price ?? item.unitPrice ?? 0),
          originalSubtotal: (originalSaleItem?.qty || 0) * (originalSaleItem?.price || 0)
        };
      }));

      const totalReturnAmount = enrichedItems.reduce((sum: number, item: any) => sum + (item.subtotal || 0), 0);
      const refundAmount = totalReturnAmount;

      // Generate return ID
      const returnId = `SR-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      const saleReturn = await SaleReturn.create({
        returnId,
        saleId,
        warehouseId: sale.warehouseId,
        warehouseName: warehouse?.name || 'Unknown',
        customerId: sale.customerId,
        customerName: customer?.name || 'Unknown',
        returnDate: returnDate || new Date(),
        items: enrichedItems,
        reason,
        totalReturnAmount,
        refundAmount,
        createdBy,
        status: 'Completed'
      });

      // Update original sale status to 'returned'
      sale.status = 'returned';
      await sale.save();

      // Restore inventory
      await updateInventory(enrichedItems, sale.warehouseId.toString(), 'add');

      res.status(201).json({
        status: 'success',
        message: 'Sale return created successfully',
        data: saleReturn
      });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to create sale return' });
    }
  }
];

export const getSaleReturns = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = '1', limit = '10', q, startDate, endDate, warehouseId } = req.query;
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const filter: any = {};
      if (startDate || endDate) {
        const { start, end } = buildZonedDateRange(startDate as string | undefined, endDate as string | undefined);
        if (startDate && endDate && start > end) { res.status(400).json({ status: 'error', message: 'From date cannot be greater than to date' }); return; }
        filter.returnDate = { ...(startDate ? { $gte: start } : {}), ...(endDate ? { $lte: end } : {}) };
      }
      if (warehouseId) {
        if (!mongoose.isValidObjectId(warehouseId)) { res.status(400).json({ status: 'error', message: 'Invalid warehouse ID' }); return; }
        filter.warehouseId = new mongoose.Types.ObjectId(String(warehouseId));
      }

      const saleReturns = await SaleReturn.find(filter)
        .populate('saleId', 'invoiceId')
        .populate('customerId', 'name')
        .populate('warehouseId', 'name')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      const total = await SaleReturn.countDocuments(filter);

      res.json({
        status: 'success',
        data: saleReturns,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch sale returns' });
    }
};

export const getSaleReturnById = async (req: Request, res: Response): Promise<void> => {
    try {
      const saleReturn = await SaleReturn.findById(req.params.id)
        .populate('saleId')
        .populate('customerId', 'name mobile address')
        .populate('warehouseId', 'name location')
        .populate('createdBy', 'name email');

      if (!saleReturn) {
        res.status(404).json({ status: 'error', message: 'Sale return not found' });
        return;
      }

      res.json({ status: 'success', data: saleReturn });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch sale return' });
    }
};

export const updateSaleReturn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: 'error', message: 'Invalid sale return ID' });
      return;
    }

    const saleReturn = await SaleReturn.findById(id);
    if (!saleReturn) {
      res.status(404).json({ status: 'error', message: 'Sale return not found' });
      return;
    }

    // Update allowed fields
    if (status) saleReturn.status = status;
    if (reason) saleReturn.reason = reason;

    await saleReturn.save();
    res.json({ status: 'success', message: 'Sale return updated successfully', data: saleReturn });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Failed to update sale return' });
  }
};

export const deleteSaleReturn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: 'error', message: 'Invalid sale return ID' });
      return;
    }

    const saleReturn = await SaleReturn.findById(id);
    if (!saleReturn) {
      res.status(404).json({ status: 'error', message: 'Sale return not found' });
      return;
    }

    // Restore inventory when deleting return
    const sale = await Sale.findById(saleReturn.saleId);
    if (sale) {
      await updateInventory((saleReturn as any).items as any[], sale.warehouseId.toString(), 'subtract');
      sale.status = 'completed';
      await sale.save();
    }

    await SaleReturn.findByIdAndDelete(id);
    res.json({ status: 'success', message: 'Sale return deleted successfully' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Failed to delete sale return' });
  }
};

export const bulkDeleteSaleReturns = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ status: 'error', message: 'Invalid ids array' });
      return;
    }

    for (const id of ids) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ status: 'error', message: `Invalid ID: ${id}` });
        return;
      }

      const saleReturn = await SaleReturn.findById(id);
      if (saleReturn) {
        const sale = await Sale.findById(saleReturn.saleId);
        if (sale) {
          await updateInventory((saleReturn as any).items as any[], sale.warehouseId.toString(), 'subtract');
          sale.status = 'completed';
          await sale.save();
        }
      }
    }

    await SaleReturn.deleteMany({ _id: { $in: ids } });
    res.json({ status: 'success', message: 'Sale returns deleted successfully' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message || 'Failed to delete sale returns' });
  }
};

