import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product';
import Purchase from '../models/Purchase';
import Supplier from '../models/Supplier';
import Warehouse from '../models/Warehouse';
import logActivity from '../services/logActivity';
import { buildZonedDateRange, parseDateInputAsZonedStart } from '../utils/timezone';

interface IPurchaseItem {
  productId: string;
  quantity: number;
  cost: number;
  subTotal: number;
  warehouseName: string; 
}

export const createPurchase = async (req: Request, res: Response): Promise<void> => {
  // Try to start a session, but handle cases where transactions aren't supported
  let session: mongoose.ClientSession | null = null;
  let useTransactions = false;
  
  // Don't use transactions for standalone MongoDB - they're not supported
  // Transactions only work with replica sets or sharded clusters
  // We'll proceed without transactions for better compatibility
  useTransactions = false;
  session = null;
  console.log('[createPurchase] Running without transactions (standalone MongoDB compatibility mode)');

  try {
    const { 
      supplierId, 
      warehouseId, 
      items, 
      subtotal,
      discount = 0,
      discountType = 'fixed',
      tax = 0,
      taxType = 'fixed',
      grandTotal, 
      createdBy, 
      warehouseName,
      purchaseDate,
      paymentStatus = 'Unpaid',
      paymentMethod,
      purchaseStatus = 'Received'
    } = req.body;

    // Normalize status and decide whether we should touch inventory.
    // Business rule: inventory should be updated only for PAID purchases that are not in DRAFT status.
    const normalizedPaymentStatus = String(paymentStatus || '').toLowerCase();
    const normalizedPurchaseStatus = String(purchaseStatus || '').toLowerCase();
    const shouldAffectInventory = normalizedPaymentStatus === 'paid' && normalizedPurchaseStatus !== 'draft';

    // Helper function to clean up session (not needed since transactions are disabled)
    const cleanupSession = async () => {
      // No-op: transactions are disabled
    };

    // Validation
    if (!supplierId || !warehouseId || !items || items.length === 0) {
      await cleanupSession();
      res.status(400).json({ 
        status: 'error', 
        message: 'Supplier, warehouse, and at least one item are required' 
      });
      return;
    }

    if (!createdBy) {
      await cleanupSession();
      res.status(400).json({ 
        status: 'error', 
        message: 'User information is required. Please ensure you are logged in.' 
      });
      return;
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(supplierId)) {
      await cleanupSession();
      res.status(400).json({ 
        status: 'error', 
        message: 'Invalid supplier ID format' 
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(warehouseId)) {
      await cleanupSession();
      res.status(400).json({ 
        status: 'error', 
        message: 'Invalid warehouse ID format' 
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(createdBy)) {
      await cleanupSession();
      res.status(400).json({ 
        status: 'error', 
        message: 'Invalid user ID format' 
      });
      return;
    }

    const [supplier, warehouse] = await Promise.all([
      Supplier.findById(supplierId),
      Warehouse.findById(warehouseId)
    ]);

    if (!supplier) {
      await cleanupSession();
      res.status(404).json({
        status: 'error',
        message: 'Supplier not found'
      });
      return;
    }

    if (!warehouse) {
      await cleanupSession();
      res.status(404).json({
        status: 'error',
        message: 'Warehouse not found'
      });
      return;
    }

    const failedProducts: string[] = [];
    const whKey = warehouseId.toString();

    // Validate all products and prepare inventory updates.
    // NOTE: We always validate basic item data, but we only update Product
    // stock when shouldAffectInventory === true.
    for (const item of items) {
      // Validate item
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        await cleanupSession();
        res.status(400).json({ 
          status: 'error', 
          message: `Invalid item: quantity must be greater than zero` 
        });
        return;
      }

      if (!item.cost || item.cost <= 0) {
        await cleanupSession();
        res.status(400).json({ 
          status: 'error', 
          message: `Invalid item: cost must be greater than zero` 
        });
        return;
      }

      // Try to fetch product with session, but catch transaction errors
      let product;
      try {
        product = await Product.findById(item.productId).session(useTransactions && session ? session : null);
      } catch (queryError: any) {
        // If transaction error occurs during query, disable transactions and retry
        if (queryError.message && (queryError.message.includes('replica set') || queryError.message.includes('mongos') || queryError.message.includes('Transaction numbers'))) {
          console.warn('[createPurchase] Transaction error during product query, disabling transactions:', queryError.message);
          useTransactions = false;
          // Retry without session
          product = await Product.findById(item.productId);
        } else {
          throw queryError;
        }
      }

      if (!product) {
        failedProducts.push(`Product ID ${item.productId} not found`);
        continue;
      }

      // If this purchase does not affect inventory (e.g. Unpaid),
      // skip all stock quantity updates for this item.
      if (!shouldAffectInventory) {
        continue;
      }

      // Check if product is inventory-based (restaurant-only system)
      // Only block products that are explicitly marked as non-inventory.
      // Products with isInventory === true or undefined are treated as inventory items.
      if (product.isInventory === false) {
        failedProducts.push(`"${product.name}" is not an inventory product. Only inventory products can be purchased.`);
        continue;
      }

      // Get warehouse inventory data
      const whMap = product.warehouse;
      const getWh = (key: string) => {
        if (!whMap) return undefined;
        if (typeof (whMap as any).get === 'function')
          return (whMap as Map<string, any>).get(key);
        return (whMap as Record<string, any>)[key];
      };
      
      let warehouseInventory = getWh(whKey) || getWh(warehouseName);
      
      // Check if product has inventory in this warehouse (initialize if needed)
      if (!warehouseInventory) {
        // Initialize warehouse entry if it doesn't exist
        warehouseInventory = {
          warehouseName: warehouseName,
          productQty: 0,
          totalProductWeight: 0,
          productCost: item.cost
        };
      }

      // Handle weight-based products
      const isWeight = (product as any).isWeight === true;
      
      try {
      if (isWeight) {
        // For weight products, use totalProductWeight (in base unit)
        // The quantity purchased is already in base unit
        const currentWeight = Math.max(0, warehouseInventory.totalProductWeight || 0);
        const newWeight = Math.max(0, currentWeight + item.quantity); // Ensure non-negative
        
        await Product.findByIdAndUpdate(
          item.productId,
          {
            $set: {
              [`warehouse.${whKey}.totalProductWeight`]: newWeight,
              [`warehouse.${whKey}.productCost`]: item.cost,
              [`warehouse.${whKey}.warehouseName`]: warehouseName
            }
          },
          useTransactions && session ? { session } : {}
        );
      } else {
        // For non-weight products, use productQty
        const currentQty = Math.max(0, warehouseInventory.productQty || 0);
        const newQty = Math.max(0, currentQty + item.quantity); // Ensure non-negative
        
        await Product.findByIdAndUpdate(
          item.productId,
          {
            $set: {
              [`warehouse.${whKey}.productQty`]: newQty,
              [`warehouse.${whKey}.productCost`]: item.cost,
              [`warehouse.${whKey}.warehouseName`]: warehouseName
            }
          },
          useTransactions && session ? { session } : {}
        );
      }
      } catch (updateError: any) {
        // If transaction error occurs during update, disable transactions and retry
        if (updateError.message && (updateError.message.includes('replica set') || updateError.message.includes('mongos') || updateError.message.includes('Transaction numbers'))) {
          console.warn('[createPurchase] Transaction error during update, disabling transactions and retrying:', updateError.message);
          useTransactions = false;
          // Retry without transaction
          if (isWeight) {
            const currentWeight = Math.max(0, warehouseInventory.totalProductWeight || 0);
            const newWeight = Math.max(0, currentWeight + item.quantity); // Ensure non-negative
            await Product.findByIdAndUpdate(item.productId, {
              $set: {
                [`warehouse.${whKey}.totalProductWeight`]: newWeight,
                [`warehouse.${whKey}.productCost`]: item.cost,
                [`warehouse.${whKey}.warehouseName`]: warehouseName
              }
            });
          } else {
            const currentQty = Math.max(0, warehouseInventory.productQty || 0);
            const newQty = Math.max(0, currentQty + item.quantity); // Ensure non-negative
            await Product.findByIdAndUpdate(item.productId, {
              $set: {
                [`warehouse.${whKey}.productQty`]: newQty,
                [`warehouse.${whKey}.productCost`]: item.cost,
                [`warehouse.${whKey}.warehouseName`]: warehouseName
              }
            });
          }
        } else {
          // Other error, rethrow
          throw updateError;
        }
      }
    }

    // If any products failed validation, abort transaction
    if (failedProducts.length > 0) {
      await cleanupSession();
      res.status(400).json({ 
        status: 'error', 
        message: 'Some products failed validation',
        failedProducts: failedProducts
      });
      return;
    }

    // Generate unique purchase ID
    let purchaseId = `PUR-${Date.now()}`;
    let attempts = 0;
    const maxAttempts = 5;
    
    // Check for duplicate purchase ID (very unlikely but possible)
    while (attempts < maxAttempts) {
      try {
        const existing = await Purchase.findOne({ purchaseId }).session(useTransactions && session ? session : null);
        if (!existing) break;
      } catch (queryError: any) {
        // If transaction error occurs, disable transactions and retry
        if (queryError.message && (queryError.message.includes('replica set') || queryError.message.includes('mongos') || queryError.message.includes('Transaction numbers'))) {
          console.warn('[createPurchase] Transaction error during duplicate check, disabling transactions');
          useTransactions = false;
          // Retry without session
          const existing = await Purchase.findOne({ purchaseId });
          if (!existing) break;
        } else {
          throw queryError;
        }
      }
      purchaseId = `PUR-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      attempts++;
    }

    // Create purchase record
    const newPurchase = new Purchase({
      purchaseId,
      supplierId: new mongoose.Types.ObjectId(supplierId),
      warehouseId: new mongoose.Types.ObjectId(warehouseId),
      purchaseDate: parseDateInputAsZonedStart(purchaseDate),
      items: items.map((item: any) => ({
        productId: new mongoose.Types.ObjectId(item.productId),
        quantity: item.quantity,
        cost: item.cost,
        subTotal: item.subTotal
      })),
      subtotal: subtotal || grandTotal, // Fallback to grandTotal if subtotal not provided
      discount: discount || 0,
      discountType: discountType || 'fixed',
      tax: tax || 0,
      taxType: taxType || 'fixed',
      grandTotal,
      paymentStatus,
      paymentMethod,
      purchaseStatus,
      createdBy: new mongoose.Types.ObjectId(createdBy)
    });

    try {
      await newPurchase.save(useTransactions && session ? { session } : {});
    } catch (saveError: any) {
      // If transaction error occurs during save, disable transactions and retry
      if (saveError.message && (saveError.message.includes('replica set') || saveError.message.includes('mongos') || saveError.message.includes('Transaction numbers'))) {
        console.warn('[createPurchase] Transaction error during save, disabling transactions and retrying:', saveError.message);
        useTransactions = false;
        // Retry without transaction
        await newPurchase.save({});
      } else {
        throw saveError;
      }
    }

    // Transactions disabled for standalone MongoDB compatibility
    // No commit needed

    const populatedPurchase = await Purchase.findById(newPurchase._id)
      .populate('supplierId', 'name')
      .populate('warehouseId', 'name')
      .populate('createdBy', 'name');

    res.status(201).json({ 
      status: 'success', 
      message: 'Purchase created successfully',
      data: populatedPurchase 
    });

  } catch (error: any) {
    // No session cleanup needed - transactions are disabled
    
    console.error('[createPurchase] Error:', error);
    console.error('[createPurchase] Error stack:', error.stack);
    console.error('[createPurchase] Request body:', req.body);
    
    // Provide more detailed error information
    let errorMessage = error.message || 'Failed to create purchase';
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message);
      errorMessage = `Validation Error: ${validationErrors.join(', ')}`;
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      errorMessage = `Duplicate entry: Purchase ID already exists`;
    }
    
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to create purchase',
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
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
    const unit = String(body.unit || 'pcs').trim();
    const ptype = String(body.ptype || 'Single').trim() === 'Variation' ? 'Variation' : 'Single';
    const variationType = String(body.variationType || 'Size').trim();
    const variations = Array.isArray(body.variations) ? body.variations : [];
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

    if (supplierId) filter.supplierId = supplierId;
    if (warehouseId) filter.warehouseId = warehouseId;
    if (purchaseStatus) filter.purchaseStatus = purchaseStatus;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [purchases, total] = await Promise.all([
      Purchase.find(filter)
        .populate('supplierId', 'name')
        .populate('warehouseId', 'name')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Purchase.countDocuments(filter)
    ]);

    const totalGrandTotal = (await Purchase.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: { $toDouble: "$grandTotal" } } } }
    ]))[0]?.total || 0;

    res.status(200).json({
      status: 'success',
      data: purchases,
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
      data: purchase 
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
  const useTransactions = false;
  console.log('[updatePurchase] Running without transactions (standalone MongoDB compatibility mode)');

  try {
    const { id } = req.params;
    const {
      supplierId,
      warehouseId,
      items,
      subtotal,
      discount = 0,
      discountType = 'fixed',
      tax = 0,
      taxType = 'fixed',
      grandTotal,
      warehouseName,
      purchaseDate,
      paymentStatus = 'Unpaid',
      paymentMethod,
      purchaseStatus = 'Received'
    } = req.body;

    // Find existing purchase
    const existingPurchase = await Purchase.findById(id);
    if (!existingPurchase) {
      res.status(404).json({ status: 'error', message: 'Purchase not found' });
      return;
    }

    const beforeSnapshot = existingPurchase.toObject();

    // Validation
    if (!supplierId || !warehouseId || !items || items.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'Supplier, warehouse, and at least one item are required'
      });
      return;
    }

    const whKey = warehouseId.toString();
    const failedProducts: string[] = [];

    // Revert old inventory first
    const oldWarehouse = await Warehouse.findById(existingPurchase.warehouseId);
    const oldWarehouseName = oldWarehouse?.name ?? (existingPurchase as any).warehouseName;
    const oldWhKey = existingPurchase.warehouseId.toString();

    for (const oldItem of existingPurchase.items) {
      const product = await Product.findById(oldItem.productId);
      if (!product) continue;

      const isWeight = (product as any).isWeight === true;
      const quantity = oldItem.quantity || 0;

      const whMap = product.warehouse;
      const getWh = (key: string) => {
        if (!whMap) return undefined;
        if (typeof (whMap as any).get === 'function')
          return (whMap as Map<string, any>).get(key);
        return (whMap as Record<string, any>)[key];
      };

      const warehouseInventory = getWh(oldWhKey);
      if (warehouseInventory) {
        if (isWeight) {
          const currentWeight = Math.max(0, warehouseInventory.totalProductWeight || 0);
          const newWeight = Math.max(0, currentWeight - quantity);
          await Product.findByIdAndUpdate(oldItem.productId, {
            $set: { [`warehouse.${oldWhKey}.totalProductWeight`]: newWeight }
          });
        } else {
          const currentQty = Math.max(0, warehouseInventory.productQty || 0);
          const newQty = Math.max(0, currentQty - quantity);
          await Product.findByIdAndUpdate(oldItem.productId, {
            $set: { [`warehouse.${oldWhKey}.productQty`]: newQty }
          });
        }
      }
    }

    // Apply new inventory
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        failedProducts.push(`Product ID ${item.productId} not found`);
        continue;
      }

      const isWeight = (product as any).isWeight === true;
      const quantity = item.quantity || 0;

      const whMap = product.warehouse;
      const getWh = (key: string) => {
        if (!whMap) return undefined;
        if (typeof (whMap as any).get === 'function')
          return (whMap as Map<string, any>).get(key);
        return (whMap as Record<string, any>)[key];
      };

      let warehouseInventory = getWh(whKey);
      if (!warehouseInventory) {
        failedProducts.push(`Product ${product.name} not found in warehouse`);
        continue;
      }

      if (isWeight) {
        const currentWeight = Math.max(0, warehouseInventory.totalProductWeight || 0);
        const newWeight = currentWeight + quantity;
        await Product.findByIdAndUpdate(item.productId, {
          $set: { [`warehouse.${whKey}.totalProductWeight`]: newWeight }
        });
      } else {
        const currentQty = Math.max(0, warehouseInventory.productQty || 0);
        const newQty = currentQty + quantity;
        await Product.findByIdAndUpdate(item.productId, {
          $set: { [`warehouse.${whKey}.productQty`]: newQty }
        });
      }
    }

    if (failedProducts.length > 0) {
      res.status(400).json({
        status: 'error',
        message: 'Some products could not be updated',
        failedProducts
      });
      return;
    }

    // Update purchase
    const updatedPurchase = await Purchase.findByIdAndUpdate(
      id,
      {
        supplierId,
        warehouseId,
        items: items.map((i: any) => ({
          productId: i.productId,
          quantity: i.quantity || 0,
          cost: i.cost || 0,
          subTotal: (i.quantity || 0) * (i.cost || 0)
        })),
        subtotal,
        discount,
        discountType,
        tax,
        taxType,
        grandTotal,
        warehouseName,
        purchaseDate: purchaseDate ? parseDateInputAsZonedStart(purchaseDate) : existingPurchase.purchaseDate,
        paymentStatus,
        paymentMethod,
        purchaseStatus
      },
      { new: true }
    ).populate('supplierId', 'name').populate('warehouseId', 'name');

    const currentUser = (req as any).user as any;
    await logActivity({
      req: req as any,
      user: currentUser
        ? {
            userId: String(currentUser._id),
            username: currentUser.name,
            role: currentUser.role
          }
        : undefined,
      action: 'EDIT',
      entityType: 'Purchase',
      entityId: String(updatedPurchase?._id || id),
      before: beforeSnapshot,
      after: updatedPurchase?.toObject ? updatedPurchase.toObject() : updatedPurchase
    });

    res.status(200).json({
      status: 'success',
      message: 'Purchase updated successfully',
      data: updatedPurchase
    });
  } catch (error: any) {
    console.error('[updatePurchase] Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update purchase'
    });
  }
};

export const deletePurchase = async (req: Request, res: Response): Promise<void> => {
  // Don't use transactions for standalone MongoDB - they're not supported
  const useTransactions = false;
  console.log('[deletePurchase] Running without transactions (standalone MongoDB compatibility mode)');

  try {
    const { id } = req.params;
    const purchase = await Purchase.findById(id);
    
    if (!purchase) {
      res.status(404).json({ status: 'error', message: 'Purchase not found' });
      return;
    }

    const warehouse = await Warehouse.findById(purchase.warehouseId);
    const warehouseName = warehouse?.name ?? (purchase as any).warehouseName;
    
    if (!warehouseName) {
      res.status(400).json({ status: 'error', message: 'Could not determine warehouse for inventory revert' });
      return;
    }

    const currentUser = (req as any).user as any;

    const whKey = purchase.warehouseId.toString();
    const failedProducts: string[] = [];

    // Revert inventory for each item
    for (const item of purchase.items) {
      const product = await Product.findById(item.productId);
      
      if (!product) {
        failedProducts.push(`Product ID ${item.productId} not found`);
        continue;
      }

      const isWeight = (product as any).isWeight === true;
      const quantity = item.quantity || 0;

      // Get warehouse inventory data
      const whMap = product.warehouse;
      const getWh = (key: string) => {
        if (!whMap) return undefined;
        if (typeof (whMap as any).get === 'function')
          return (whMap as Map<string, any>).get(key);
        return (whMap as Record<string, any>)[key];
      };
      
      const warehouseInventory = getWh(whKey) || getWh(warehouseName);
      
      if (isWeight) {
        // For weight products, revert totalProductWeight
        const currentWeight = Math.max(0, warehouseInventory?.totalProductWeight || 0);
        const newWeight = Math.max(0, currentWeight - quantity); // Prevent negative

        await Product.findByIdAndUpdate(
          item.productId,
          {
            $set: {
              [`warehouse.${whKey}.totalProductWeight`]: newWeight
            }
          }
        );
      } else {
        // For non-weight products, revert productQty
        const currentQty = Math.max(0, warehouseInventory?.productQty || 0);
        const newQty = Math.max(0, currentQty - quantity); // Prevent negative
        
        await Product.findByIdAndUpdate(
          item.productId,
          {
            $set: { [`warehouse.${whKey}.productQty`]: newQty }
          }
        );
      }
    }

    if (failedProducts.length > 0) {
      res.status(400).json({
        status: 'error',
        message: 'Some products could not be reverted',
        failedProducts
      });
      return;
    }

    await logActivity({
      req: req as any,
      user: currentUser
        ? {
            userId: String(currentUser._id),
            username: currentUser.name,
            role: currentUser.role
          }
        : undefined,
      action: 'DELETE',
      entityType: 'Purchase',
      entityId: String(purchase._id),
      before: purchase.toObject()
    });

    await Purchase.findByIdAndDelete(id);
    
    res.status(200).json({ status: 'success', message: 'Purchase deleted successfully' });
  } catch (error: any) {
    // No session cleanup needed - transactions are disabled
    console.error('[deletePurchase] Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete purchase'
    });
  }
};
