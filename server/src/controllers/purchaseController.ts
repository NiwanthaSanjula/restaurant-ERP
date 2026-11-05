import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Purchase from '../models/Purchase';
import Warehouse from '../models/Warehouse';
import Unit from '../models/Unit';
import { createStockPurchase, receiveStockPurchase, editStockPurchase, deleteUnreceivedPurchase, PurchaseStockError } from '../services/purchaseStock';
import { buildZonedDateRange, parseDateInputAsZonedStart } from '../utils/timezone';
import { purchaseReadResponse } from '../utils/purchaseRead';

function stockError(res: Response, error: any): void {
  const status = error instanceof PurchaseStockError ? error.status : error.name === 'ValidationError' ? 400 : error.code === 11000 ? 409 : 503;
  res.status(status).json({ status: 'error', message: error instanceof PurchaseStockError ? error.message : error.name === 'ValidationError' ? 'Invalid purchase data' : error.code === 11000 ? 'Purchase reference already exists; refresh before retrying' : 'Could not confirm the stock operation. Refresh the saved order before retrying; its receipt ID prevents duplicate stock.' });
}

export const createPurchase = async (req: Request, res: Response): Promise<void> => {
  try {
    const purchase = await createStockPurchase(req.body, String((req as any).user?._id || ''));
    res.status(201).json({ status: 'success', message: purchase.purchaseStatus === 'Received' ? 'Purchase created and stock received' : 'Purchase saved. No stock received yet.', data: purchaseReadResponse(purchase) });
  } catch (error) { stockError(res, error); }
};

export const receivePurchase = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await receiveStockPurchase(String(req.params.id), String((req as any).user?._id || ''));
    res.json({ status: 'success', message: result.replayed ? 'Purchase was already received; stock was not added again.' : 'Stock received in the purchase warehouse.', data: purchaseReadResponse(result.purchase), replayed: result.replayed });
  } catch (error) { stockError(res, error); }
};

/**
 * Minimal product creation for the Create Purchase screen only.
 * Keeps product routes/controllers untouched; uses the same Product model rules (pre-save).
 */
export const createQuickProductForPurchase = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const code = String(body.code || '').trim();
    const category = String(body.category || '').trim();
    const unit = String(body.unit || '').trim();
    const ptype = String(body.ptype || 'Single').trim() === 'Variation' ? 'Variation' : 'Single';
    const variationType = String(body.variationType || 'Size').trim();
    const variations = Array.isArray(body.variations) ? body.variations : [];
    if (typeof body.isSellable !== 'boolean' || !unit) {
      res.status(400).json({ status: 'error', message: 'Choose Sellable or Inventory only and a stock unit before creating the item.' }); return;
    }
    const stockUnit = await Unit.findOne({ $or: [{ unitName: unit }, { shortName: unit }] }).lean();
    if (!stockUnit) { res.status(400).json({ status: 'error', message: 'Select an existing stock unit.' }); return; }
    if (variations.some((variation: any) => Number(variation.productQty || 0) !== 0)) {
      res.status(400).json({ status: 'error', message: 'Create Item starts with zero stock. Receive Stock through a purchase.' }); return;
    }
    const warehouseId = String(body.warehouseId || '').trim();
    const warehouseNameFromClient = String(body.warehouseName || '').trim();
    const productCost = Number(body.productCost);
    const productPriceRaw = body.productPrice;
    const productPrice =
      productPriceRaw !== undefined && productPriceRaw !== null && productPriceRaw !== ''
        ? Number(productPriceRaw)
        : productCost;

    if (!name || !code || !category) {
      res.status(400).json({
        status: 'error',
        message: 'Product name, code, and category are required',
      });
      return;
    }

    if (!warehouseId) {
      res.status(400).json({
        status: 'error',
        message: 'warehouseId is required',
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(warehouseId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid warehouse ID format',
      });
      return;
    }

    if (ptype === 'Single') {
      if (!Number.isFinite(productCost) || productCost < 0) {
        res.status(400).json({
          status: 'error',
          message: 'Valid product cost (≥ 0) is required',
        });
        return;
      }

      if (!Number.isFinite(productPrice) || productPrice < 0) {
        res.status(400).json({
          status: 'error',
          message: 'Valid sale price (≥ 0) is required',
        });
        return;
      }
    } else {
      const validVariations = variations
        .map((v: any) => ({
          name: String(v?.name || '').trim(),
          productCost: Number(v?.productCost),
          productPrice:
            v?.productPrice !== undefined && v?.productPrice !== null && v?.productPrice !== ''
              ? Number(v.productPrice)
              : Number(v?.productCost),
          stockAlert:
            v?.stockAlert !== undefined && v?.stockAlert !== null && v?.stockAlert !== ''
              ? Number(v.stockAlert)
              : 0,
          productQty:
            v?.productQty !== undefined && v?.productQty !== null && v?.productQty !== ''
              ? Number(v.productQty)
              : 0,
        }))
        .filter((v: any) => v.name);

      if (!variationType) {
        res.status(400).json({
          status: 'error',
          message: 'variationType is required for variation products',
        });
        return;
      }

      if (validVariations.length === 0) {
        res.status(400).json({
          status: 'error',
          message: 'At least one variation is required',
        });
        return;
      }

      const names = validVariations.map((v: any) => v.name.toLowerCase());
      if (new Set(names).size !== names.length) {
        res.status(400).json({
          status: 'error',
          message: 'Variation names must be unique',
        });
        return;
      }

      if (validVariations.some((v: any) => !Number.isFinite(v.productCost) || v.productCost < 0 || !Number.isFinite(v.productPrice) || v.productPrice < 0 || !Number.isFinite(v.stockAlert) || v.stockAlert < 0 || !Number.isFinite(v.productQty) || v.productQty < 0)) {
        res.status(400).json({
          status: 'error',
          message: 'Variation values must be valid numbers (cost/price/stockAlert/qty ≥ 0)',
        });
        return;
      }
    }

    const whDoc = await Warehouse.findById(warehouseId).lean();
    const resolvedWarehouseName = warehouseNameFromClient || (whDoc as any)?.name || '';
    if (!resolvedWarehouseName) {
      res.status(400).json({
        status: 'error',
        message: 'Could not resolve warehouse name; select a valid warehouse.',
      });
      return;
    }

    const whKey = warehouseId.toString();
    let warehousePayload: Record<string, unknown>;
    if (ptype === 'Variation') {
      const variationValues: Record<string, any> = {};
      for (const v of variations) {
        const vName = String(v?.name || '').trim();
        if (!vName) continue;
        const vCost = Number(v?.productCost);
        const vPrice = v?.productPrice !== undefined && v?.productPrice !== null && v?.productPrice !== ''
          ? Number(v.productPrice)
          : vCost;
        const vStockAlert = v?.stockAlert !== undefined && v?.stockAlert !== null && v?.stockAlert !== ''
          ? Number(v.stockAlert)
          : 0;
        const vQty = v?.productQty !== undefined && v?.productQty !== null && v?.productQty !== ''
          ? Number(v.productQty)
          : 0;
        const vDiscount = v?.discount !== undefined && v?.discount !== null && v?.discount !== ''
          ? Number(v.discount)
          : 0;
        const vCode = String(v?.code || '').trim();
        const vProfit = v?.productProfit !== undefined && v?.productProfit !== null && v?.productProfit !== ''
          ? Number(v.productProfit)
          : undefined;
        const vMargin = v?.profitMargin !== undefined && v?.profitMargin !== null && v?.profitMargin !== ''
          ? Number(v.profitMargin)
          : undefined;

        variationValues[vName] = {
          productQty: Number.isFinite(vQty) ? vQty : 0,
          productCost: Number.isFinite(vCost) ? vCost : 0,
          productPrice: Number.isFinite(vPrice) ? vPrice : (Number.isFinite(vCost) ? vCost : 0),
          stockAlert: Number.isFinite(vStockAlert) ? vStockAlert : 0,
          discount: Number.isFinite(vDiscount) ? vDiscount : 0,
          code: vCode || undefined,
          productProfit: Number.isFinite(vProfit as number) ? vProfit : undefined,
          profitMargin: Number.isFinite(vMargin as number) ? vMargin : undefined,
        };
      }

      warehousePayload = {
        [whKey]: {
          warehouseName: resolvedWarehouseName,
          variationType,
          variationValues,
        },
      };
    } else {
      warehousePayload = {
        [whKey]: {
          warehouseName: resolvedWarehouseName,
          productQty: 0,
          productCost,
          productPrice,
          stockAlert: 0,
        },
      };
    }

    const product = await Product.create({
      name,
      code,
      category,
      unit,
      ptype,
      status: 'Active',
      isInventory: true,
      isSellable: body.isSellable,
      warehouse: warehousePayload,
    });

    res.status(201).json({
      status: 'success',
      message: 'Product created for this warehouse',
      data: product.toObject(),
    });
  } catch (error: any) {
    console.error('[createQuickProductForPurchase]', error);

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message);
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: validationErrors,
      });
      return;
    }

    if (error.code === 11000) {
      res.status(409).json({
        status: 'error',
        message: 'A product with this code already exists',
      });
      return;
    }

    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create product',
    });
  }
};

export const getPurchases = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      q, 
      startDate, 
      endDate, 
      supplierId, 
      warehouseId,
      purchaseStatus,
      paymentStatus,
      page = '1',
      limit = '10'
    } = req.query as {
      q?: string;
      startDate?: string;
      endDate?: string;
      supplierId?: string;
      warehouseId?: string;
      purchaseStatus?: string;
      paymentStatus?: string;
      page?: string;
      limit?: string;
    };

    const filter: any = {};

    if (q) {
      filter.$or = [
        { purchaseId: { $regex: q, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      const { start, end } = buildZonedDateRange(startDate, endDate);
      filter.purchaseDate = { $gte: start, $lte: end };
    }

    for (const [field, value] of Object.entries({ supplierId, warehouseId })) {
      if (!value) continue;
      if (!mongoose.isValidObjectId(value)) {
        res.status(400).json({ status: 'error', message: `Invalid ${field}.` });
        return;
      }
      // Aggregation does not perform the query casting done by find().
      filter[field] = new mongoose.Types.ObjectId(value);
    }
    if (purchaseStatus) filter.purchaseStatus = purchaseStatus;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    if (!Number.isSafeInteger(pageNum) || pageNum < 1 || !Number.isSafeInteger(limitNum) || limitNum < 1) {
      res.status(400).json({ status: 'error', message: 'Page and limit must be positive integers.' });
      return;
    }
    const skip = (pageNum - 1) * limitNum;

    const [purchases, total] = await Promise.all([
      Purchase.find(filter)
        .populate('supplierId', 'name')
        .populate('warehouseId', 'name')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Purchase.countDocuments(filter)
    ]);

    const totalGrandTotal = (await Purchase.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: { $toDouble: "$grandTotal" } } } }
    ]))[0]?.total || 0;

    res.status(200).json({
      status: 'success',
      data: purchases.map(purchaseReadResponse),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      },
      summary: { totalPurchases: totalGrandTotal },
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch purchases',
      error: error.message,
    });
  }
};

export const getPurchaseById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const purchase = await Purchase.findById(id)
      .populate('supplierId', 'name')
      .populate('warehouseId', 'name')
      .populate('createdBy', 'name')
      .lean();
    
    if (!purchase) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Purchase not found' 
      });
      return;
    }
    
    // Populate product information for each item
    if (purchase.items && Array.isArray(purchase.items)) {
      const warehouseIdStr = purchase.warehouseId?._id?.toString() || purchase.warehouseId?.toString();
      
      const populatedItems = await Promise.all(
        purchase.items.map(async (item: any) => {
          const product = await Product.findById(item.productId).select('name code warehouse ptype isWeight').lean();
          
          let currentStock = 0;
          if (product && product.warehouse) {
            const whId = warehouseIdStr;
            const whData = (product.warehouse as any)[whId];
            
            if (whData) {
              if (product.ptype === 'Variation' && item.variation && whData.variationValues) {
                const varData = whData.variationValues instanceof Map 
                  ? whData.variationValues.get(item.variation)
                  : whData.variationValues[item.variation];
                
                if (varData) {
                  currentStock = (product as any).isWeight 
                    ? (varData.totalProductWeight || 0)
                    : (varData.productQty || 0);
                }
              } else {
                currentStock = (product as any).isWeight
                  ? (whData.totalProductWeight || 0)
                  : (whData.productQty || 0);
              }
            }
          }

          return {
            ...item,
            productId: item.productId,
            productName: product?.name || 'Unknown Product',
            productCode: product?.code || '',
            currentStock: currentStock || 0
          };
        })
      );
      purchase.items = populatedItems;
    }
    
    res.status(200).json({ 
      status: 'success', 
      data: purchaseReadResponse(purchase)
    });
  } catch (error: any) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch purchase', 
      error: error.message 
    });
  }
};

export const updatePurchase = async (req: Request, res: Response): Promise<void> => {
  try {
    const purchase = await editStockPurchase(String(req.params.id), req.body, String((req as any).user?._id || ''));
    res.json({ status: 'success', message: 'Purchase updated without replaying received stock', data: purchaseReadResponse(purchase) });
  } catch (error) { stockError(res, error); }
};

export const deletePurchase = async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteUnreceivedPurchase(String(req.params.id), String((req as any).user?._id || ''));
    res.json({ status: 'success', message: 'Unreceived purchase deleted. No stock changed.' });
  } catch (error) { stockError(res, error); }
};
