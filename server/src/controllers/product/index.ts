import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { checkPermission } from '../../middleware/permissions';
import Product from '../../models/Product';
import logActivity from '../../services/logActivity';
import { productSellabilityFilter } from '../../utils/productEligibility';
import { GuidedDishError, replayGuidedDish, prepareGuidedDish, assertGuidedDishReady } from '../../services/guidedDish';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildProductNameDuplicateRegex = (name: string): RegExp | null => {
  const compactName = name.replace(/\s+/g, '');
  if (!compactName) return null;

  const pattern = Array.from(compactName).map(escapeRegex).join('\\s*');
  return new RegExp(`^\\s*${pattern}\\s*$`, 'i');
};

// Utility: remove fields that are empty/zero/false/unset where appropriate
const removeIfEmpty = (obj: any, key: string) => {
  if (!(key in obj)) return;
  const v = obj[key];
  if (v === undefined || v === null) { delete obj[key]; return; }
  if (typeof v === 'string' && v.trim() === '') { delete obj[key]; return; }
  if (Array.isArray(v) && v.length === 0) { delete obj[key]; return; }
};

// Remove zero/false/empty values from object
const cleanZeroDefaults = (obj: any, fieldsToCheck: string[]) => {
  fieldsToCheck.forEach(k => {
    if (!(k in obj)) return;
    const v = obj[k];
    if (v === 0 || v === false || v === '' || v === undefined || v === null) {
      delete obj[k];
    }
  });
};

// Normalize variation value entry - only keep fields with meaningful values (restaurant only)
const normalizeVariationValue = (v: any, isInventory: boolean): any => {
  if (!v || typeof v !== 'object') return null;
  const entry: any = {};
  
  // Required fields - always include if present
  if (typeof v.productCost === 'number') entry.productCost = v.productCost;
  if (typeof v.productPrice === 'number') entry.productPrice = v.productPrice;
  
  // Stock alert only for inventory products
  if (isInventory && typeof v.stockAlert === 'number') {
    entry.stockAlert = v.stockAlert;
  }
  
  // Optional fields - only if they have meaningful values
  if (isInventory && typeof v.productQty === 'number') {
    entry.productQty = v.productQty;
  }
  if (typeof v.discount === 'number' && v.discount !== 0) entry.discount = v.discount;
  if (typeof v.orderTax === 'number' && v.orderTax !== 0) entry.orderTax = v.orderTax;
  if (v.code && typeof v.code === 'string' && v.code.trim() !== '') entry.code = v.code.trim();
  if (typeof v.totalProductWeight === 'number' && v.totalProductWeight !== 0) entry.totalProductWeight = v.totalProductWeight;
  if (v.taxType && typeof v.taxType === 'string' && v.taxType.trim() !== '') entry.taxType = v.taxType.trim();
  if (v.expiryDate) entry.expiryDate = v.expiryDate;
  
  // Calculated fields - only keep if non-zero (will be recalculated in pre-save hook)
  if (typeof v.productProfit === 'number' && v.productProfit !== 0) entry.productProfit = v.productProfit;
  if (typeof v.profitMargin === 'number' && v.profitMargin !== 0) entry.profitMargin = v.profitMargin;
  
  return Object.keys(entry).length > 0 ? entry : null;
};

// Normalize payload: save only necessary fields per product type/structure
export const normalizeAndCleanProductData = (productData: any) => {
  const ptype = productData.ptype;
  const isInventory = productData.isInventory === true;
  
  // Product-level cleanup
  ['barcode', 'image', 'saleUnit', 'purchase', 'note', 'expiryDate'].forEach(k => removeIfEmpty(productData, k));
  
  // Cleanup of legacy/unused fields
  delete productData.barcodeType;
  delete productData.isWholesale;
  delete productData.wholesalePrice;
  delete productData.wholesaleQuantity;
  delete productData.warranty;
  delete productData.hasBatches;
  delete productData.isWeight;
  delete productData.baseUnit;

  if (!productData.warehouse) return;

  // Per-warehouse cleanup
  for (const wid in productData.warehouse) {
    const wh = productData.warehouse[wid];
    if (!wh || !wh.warehouseName) { 
      delete productData.warehouse[wid]; 
      continue; 
    }

    // Always remove empty optional fields
    ['totalProductWeight', 'code', 'variationType'].forEach(k => removeIfEmpty(wh, k));

    // If not inventory, drop quantity and stock controls
    if (!isInventory) {
      if ('productQty' in wh) delete wh.productQty;
      if ('stockAlert' in wh) delete wh.stockAlert;
    }
    // Remove default zero/empty values for optional fields
    if (wh.orderTax === 0) delete wh.orderTax;
    if (wh.discount === 0) delete wh.discount;
    if (wh.productProfit === 0) delete wh.productProfit;
    if (wh.profitMargin === 0) delete wh.profitMargin;
    if (wh.taxType === 'Exclusive') delete wh.taxType;
    if (wh.totalProductWeight === 0) delete wh.totalProductWeight;
    if (!wh.code || wh.code.trim() === '') delete wh.code;

    // Scenario 1: Single product (no batches)
    if (ptype === 'Single') {
      // Single products should NEVER have variationValues
      if (wh.variationValues) delete wh.variationValues;
      // Pricing is always at warehouse level now (no batches)
      if (wh.batches) delete wh.batches;
      
      // Clean up warehouse-level zero defaults (but keep required fields; productQty kept only when inventory)
      cleanZeroDefaults(wh, ['orderTax', 'productProfit', 'profitMargin']);
      if (wh.discount === 0) delete wh.discount;
      if (wh.orderTax === 0) delete wh.orderTax;
      if (wh.productProfit === 0) delete wh.productProfit;
      if (wh.profitMargin === 0) delete wh.profitMargin;
      if (!isInventory) {
        if ('productQty' in wh) delete wh.productQty;
        if ('stockAlert' in wh) delete wh.stockAlert;
      }
    } 
    // Scenario 2: Variation product (no batches)
    else if (ptype === 'Variation') {
      // Variation products should NEVER have warehouse-level price fields
      ['productCost', 'productPrice', 'stockAlert', 'productProfit', 'profitMargin'].forEach(k => {
        if (k in wh) delete wh[k];
      });

      // Variation values are always at warehouse level now (no batches)
      if (wh.batches) delete wh.batches;

      if (wh.variationValues && typeof wh.variationValues === 'object' && !(wh.variationValues instanceof Map)) {
        const nv: any = {};
        for (const [key, val] of Object.entries(wh.variationValues)) {
          const normalized = normalizeVariationValue(val, isInventory);
          if (normalized) nv[key] = normalized;
        }
        wh.variationValues = Object.keys(nv).length > 0 ? nv : undefined;
        if (!wh.variationValues || Object.keys(wh.variationValues).length === 0) {
          delete wh.variationValues;
        }
      } else if (!wh.variationValues || (typeof wh.variationValues === 'object' && Object.keys(wh.variationValues).length === 0)) {
        delete wh.variationValues;
      }
    }

    // Final cleanup: remove warehouse-level calculated/optional fields that are 0 or empty
    // But preserve discount if it's non-zero (it's a valid business field)
    if (wh.discount === 0 || wh.discount === undefined) delete wh.discount;
    if (wh.orderTax === 0 || wh.orderTax === undefined) delete wh.orderTax;
    if (wh.productProfit === 0 || wh.productProfit === undefined) delete wh.productProfit;
    if (wh.profitMargin === 0 || wh.profitMargin === undefined) delete wh.profitMargin;
    if (wh.taxType === 'Exclusive' || !wh.taxType) delete wh.taxType;
    if (wh.totalProductWeight === 0 || wh.totalProductWeight === undefined) delete wh.totalProductWeight;
    if (!wh.code || wh.code.trim() === '') delete wh.code;
    // Remove empty warehouse records (only if essential fields are missing)
    const requireStockAlert = isInventory;
    
    const hasValidData = 
      wh.warehouseName && (
        (ptype === 'Single' && wh.productCost !== undefined && wh.productPrice !== undefined && (!requireStockAlert || wh.stockAlert !== undefined) && (!isInventory || wh.productQty !== undefined)) ||
        (ptype === 'Variation' && wh.variationValues && Object.keys(wh.variationValues).length > 0)
      );
    
    if (!hasValidData) {
      console.log(`Deleting warehouse ${wid} - validation failed. Warehouse data:`, JSON.stringify(wh, null, 2));
      console.log(`ptype: ${ptype}, requireStockAlert: ${requireStockAlert}`);
      delete productData.warehouse[wid];
    }
  }
};

const validateInventoryQuantityRequired = (productData: any, enforcePositive: boolean = false): string[] => {
  const errors: string[] = [];
  if (productData?.isInventory !== true) return errors;

  const ptype = productData?.ptype;
  const warehouse = productData?.warehouse;
  if (!warehouse || typeof warehouse !== 'object') return ['Warehouse data is required'];

  for (const [warehouseId, wh] of Object.entries(warehouse as Record<string, any>)) {
    if (!wh || typeof wh !== 'object') continue;

    if (ptype === 'Single') {
      if (typeof wh.productQty !== 'number' || Number.isNaN(wh.productQty)) {
        errors.push(`${warehouseId} productQty is required`);
      } else if (enforcePositive && wh.productQty <= 0) {
        errors.push(`${warehouseId} productQty must be greater than 0`);
      } else if (wh.productQty < 0) {
        errors.push(`${warehouseId} productQty cannot be negative`);
      }
      continue;
    }

    if (ptype === 'Variation') {
      const variationValues = wh.variationValues;
      if (!variationValues || typeof variationValues !== 'object') continue;

      for (const [variationKey, variation] of Object.entries(variationValues as Record<string, any>)) {
        if (!variation || typeof variation !== 'object') {
          errors.push(`${warehouseId} variation ${variationKey} productQty is required`);
          continue;
        }
        if (typeof variation.productQty !== 'number' || Number.isNaN(variation.productQty)) {
          errors.push(`${warehouseId} variation ${variationKey} productQty is required`);
        } else if (enforcePositive && variation.productQty <= 0) {
          errors.push(`${warehouseId} variation ${variationKey} productQty must be greater than 0`);
        } else if (variation.productQty < 0) {
          errors.push(`${warehouseId} variation ${variationKey} productQty cannot be negative`);
        }
      }
    }
  }

  return errors;
};

// Get all products (restaurant-only)
export const getProducts = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { category, status, q, isInventory, isSellable } = req.query;
    /** Use $and when combining isInventory + text search so both apply (and treat missing isInventory as non-inventory). */
    const andConditions: Record<string, unknown>[] = [];

    if (category) andConditions.push({ category });
    if (status) andConditions.push({ status });
    if (isSellable !== undefined && isSellable !== '') {
      if (isSellable !== 'true' && isSellable !== 'false' && isSellable !== 'unclassified') {
        res.status(400).json({ status: 'error', message: 'isSellable must be true, false or unclassified' });
        return;
      }
      andConditions.push(isSellable === 'unclassified' ? { isSellable: { $nin: [true, false] } } : productSellabilityFilter(isSellable === 'true'));
    }

    if (isInventory !== undefined && isInventory !== '') {
      const inv = String(isInventory).toLowerCase();
      if (inv === 'false') {
        // Prepared POS products: only explicitly set to false (BUG-016 fix - no ambiguous null/missing)
        andConditions.push({ isInventory: false });
      } else if (inv === 'true') {
        andConditions.push({ isInventory: true });
      }
    }

    const qq = q != null ? String(q).trim() : '';
    if (qq) {
      andConditions.push({
        $or: [
          { name: { $regex: qq, $options: 'i' } },
          { code: { $regex: qq, $options: 'i' } },
          { brand: { $regex: qq, $options: 'i' } }
        ]
      });
    }

    let filter: Record<string, unknown> = {};
    if (andConditions.length === 0) {
      filter = {};
    } else if (andConditions.length === 1) {
      filter = { ...andConditions[0] };
    } else {
      filter = { $and: andConditions };
    }

    console.log(`[Products API] Filter:`, JSON.stringify(filter, null, 2));
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select('name code brand category image unit saleUnit ptype status isInventory isSellable createdAt warehouse')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter)
    ]);

    // Transform Maps to plain objects for proper JSON serialization
    const transformedProducts = products.map((p: any) => {
      if (p.warehouse) {
        // Convert warehouse Map to plain object if needed
        let warehouseObj = p.warehouse;
        if (p.warehouse instanceof Map) {
          warehouseObj = Object.fromEntries(p.warehouse);
        } else if (typeof p.warehouse === 'object' && p.warehouse !== null) {
          // When using .lean(), MongoDB Maps are already converted to plain objects
          // But we need to ensure the structure is correct
          warehouseObj = { ...p.warehouse };
        }
        
        // Convert variationValues Maps to plain objects
        if (warehouseObj && typeof warehouseObj === 'object') {
          Object.keys(warehouseObj).forEach((whKey) => {
            const whData = warehouseObj[whKey];
            if (whData && typeof whData === 'object') {
              if (whData.variationValues) {
                if (whData.variationValues instanceof Map) {
                  whData.variationValues = Object.fromEntries(whData.variationValues);
                } else if (typeof whData.variationValues === 'object') {
                  // Already an object, but ensure it's a plain object
                  whData.variationValues = { ...whData.variationValues };
                }
              }
              // Also check batches
              if (Array.isArray(whData.batches)) {
                whData.batches = whData.batches.map((batch: any) => {
                  if (batch && typeof batch === 'object') {
                    if (batch.variationValues instanceof Map) {
                      batch.variationValues = Object.fromEntries(batch.variationValues);
                    } else if (batch.variationValues && typeof batch.variationValues === 'object') {
                      batch.variationValues = { ...batch.variationValues };
                    }
                  }
                  return batch;
                });
              }
            }
          });
        }
        
        return { ...p, warehouse: warehouseObj };
      }
      return p;
    });

    console.log(`[Products API] Found ${transformedProducts.length} products`);
    if (transformedProducts.length > 0) {
      console.log(`[Products API] First product: ${transformedProducts[0].name}, status: ${transformedProducts[0].status}`);
      console.log(`[Products API] All product names:`, transformedProducts.map((p: any) => `${p.name} (${p.status}, ${p.ptype})`).join(', '));
    } else {
      console.log(`[Products API] DEBUG - No products found`);
    }

    res.json({ 
      status: 'success', 
      data: transformedProducts,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (e: any) {
    console.error('Error fetching products:', e);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Get product by ID
export const getProductById = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const product = await Product.findById(id);
    
    if (!product) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Product not found' 
      });
      return;
    }

    res.json({ 
      status: 'success', 
      data: product 
    });
  } catch (e: any) {
    console.error('Error fetching product:', e);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

// Create product validators
export const createProductValidators = [
  authenticate,
  checkPermission('manageProducts', 'create'),
  body('name').notEmpty().withMessage('Product name is required').trim(),
  body('code').notEmpty().withMessage('Product code is required').trim(),
  body('category').notEmpty().withMessage('Category is required').trim(),
  body('unit').notEmpty().withMessage('Unit is required').trim(),
  body('saleUnit').optional().isString().trim(),
  body('purchase').optional().isString().trim(),
  body('ptype').isIn(['Single', 'Variation']).withMessage('Product type must be Single or Variation'),
  body('brand').optional().isString().trim(),
  body('supplier').optional().isString().trim(),
  body('barcode').optional().isString().trim(),
  body('image').optional().isString().trim(),
  body('variation').optional().isString().trim(),
  body('note').optional().isString().trim(),
  body('quantityLimit').optional().isNumeric(),
  body('weightLimitation').optional().isNumeric(),
  body('expiryDate').optional().isISO8601(),
  body('isInventory').optional().custom(value => {
    if (value === undefined || value === null) return true;
    if (typeof value === 'boolean') return true;
    if (typeof value === 'string' && /^(true|false)$/i.test(value)) return true;
    throw new Error('isInventory must be a boolean');
  }),
  body('isSellable').custom(value => {
    if (typeof value !== 'boolean') throw new Error('Choose Sellable or Inventory only');
    return true;
  }),
  body('warehouse').optional().custom(value => {
    if (value === undefined || value === null) return true;
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) return true;
    throw new Error('Warehouse must be an object');
  }),
  // Conditional: restaurant + isInventory true => brand & supplier may be provided or omitted
  body('*').custom((_, { req }) => {
    const systemType = req.body?.systemType;
    const inv = req.body?.isInventory;

    // For restaurant products with inventory tracking, allow brand/supplier to be optional,
    // but if provided they cannot be an empty string.
    if (systemType === 'restaurant' && (inv === undefined || inv === true)) {
      if (req.body?.brand !== undefined && String(req.body.brand).trim() === '') {
        throw new Error('Brand cannot be empty when provided');
      }
      if (req.body?.supplier !== undefined && String(req.body.supplier).trim() === '') {
        throw new Error('Supplier cannot be empty when provided');
      }
    }
    return true;
  })
];

// Create product
export const createProduct = async (req: express.Request, res: express.Response): Promise<void> => {
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
    if ('guidedDishDraft' in req.body) throw new GuidedDishError(400, 'Draft metadata is managed by New Dish');
    const actor = String((req as AuthRequest).user?._id || '');
    if (req.body.dishDraftRequestId !== undefined) {
      const existing = await replayGuidedDish(req.body, actor);
      if (existing) { res.json({ status: 'success', replayed: true, data: { id: existing._id, name: existing.name } }); return; }
    }
    const productData = req.body.dishDraftRequestId !== undefined ? await prepareGuidedDish(req.body, actor) : req.body;
    console.log('Creating product with data:', JSON.stringify(productData, null, 2));

    // Enforce unique product name, ignoring case and whitespace.
    // This prevents confusing duplicates in UI and reporting.
    if (typeof productData?.name === 'string') {
      const nameRegex = buildProductNameDuplicateRegex(productData.name);
      if (!nameRegex) {
        res.status(400).json({
          status: 'error',
          message: 'Product name is required'
        });
        return;
      }

      const existingByName = await Product.findOne({
        name: nameRegex
      })
        .select('_id name')
        .lean();

      if (existingByName) {
        if (req.body.dishDraftRequestId !== undefined) {
          const saved = await replayGuidedDish(req.body, actor);
          if (saved) { res.json({ status: 'success', replayed: true, data: { id: saved._id, name: saved.name } }); return; }
        }
        res.status(409).json({
          status: 'error',
          ...(req.body.dishDraftRequestId !== undefined ? { code: 'dish_details_conflict' } : {}),
          message: 'A product with this name already exists'
        });
        return;
      }
    }

    // Normalize and clean product payload to save only necessary fields
    normalizeAndCleanProductData(productData);
    // Creating an item can start at zero; purchase receiving is a separate stock operation.
    const inventoryQtyErrors = validateInventoryQuantityRequired(productData);
    if (inventoryQtyErrors.length > 0) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: inventoryQtyErrors
      });
      return;
    }
    console.log('After normalization:', JSON.stringify(productData, null, 2));
    
    const product = await Product.create(productData);
    console.log('Product created successfully:', product._id);
    
    res.status(201).json({ 
      status: 'success', 
      message: 'Product created successfully',
      data: { id: product._id, name: product.name } 
    });
  } catch (e: any) {
    if (e instanceof GuidedDishError) { res.status(e.status).json({ status: 'error', code: 'dish_draft_invalid', message: e.message }); return; }
    if (e.code === 11000 && req.body.dishDraftRequestId !== undefined) {
      try {
        const saved = await replayGuidedDish(req.body, String((req as AuthRequest).user?._id || ''));
        if (saved) { res.json({ status: 'success', replayed: true, data: { id: saved._id, name: saved.name } }); return; }
      } catch { res.status(409).json({ status: 'error', message: 'Draft creation could not be confirmed. Resume the saved dish before creating another.' }); return; }
    }
    console.error('Error creating product:', e);
    
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
        ...(req.body.dishDraftRequestId !== undefined ? { code: 'dish_details_conflict' } : {}),
        message: 'Product with this code already exists' 
      });
    } else {
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  }
};

// Update product validators
export const updateProductValidators = [
  authenticate,
  checkPermission('manageProducts', 'update'),
  param('id').isMongoId().withMessage('Invalid product ID'),
  body('name').optional().notEmpty().withMessage('Product name cannot be empty').trim(),
  body('code').optional().notEmpty().withMessage('Product code cannot be empty').trim(),
  body('category').optional().notEmpty().withMessage('Category cannot be empty').trim(),
  body('unit').optional().notEmpty().withMessage('Unit cannot be empty').trim(),
  body('saleUnit').optional().isString().trim(),
  body('purchase').optional().isString().trim(),
  body('ptype').optional().isIn(['Single', 'Variation']).withMessage('Product type must be Single or Variation'),
  body('status').optional().isIn(['Pending', 'Active', 'Inactive']).withMessage('Invalid status'),
  body('isSellable').optional().custom(value => {
    if (typeof value !== 'boolean') throw new Error('Choose Sellable or Inventory only');
    return true;
  }),
  body('brand').optional().isString().trim(),
  body('supplier').optional().isString().trim(),
  body('barcode').optional().isString().trim(),
  body('image').optional().isString().trim(),
  body('variation').optional().isString().trim(),
  body('note').optional().isString().trim(),
  body('quantityLimit').optional().isNumeric(),
  body('weightLimitation').optional().isNumeric(),
  body('expiryDate').optional().isISO8601(),
  body('isInventory').optional().custom(value => {
    if (value === undefined || value === null) return true;
    if (typeof value === 'boolean') return true;
    if (typeof value === 'string' && /^(true|false)$/i.test(value)) return true;
    throw new Error('isInventory must be a boolean');
  }),
  body('warehouse').optional().custom(value => {
    if (value === undefined || value === null) return true;
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) return true;
    throw new Error('Warehouse must be an object');
  }),
  // Conditional on update when payload indicates restaurant inventory true
  body('*').custom((_, { req }) => {
    const systemType = req.body?.systemType;
    const inv = req.body?.isInventory;

    if (systemType === 'restaurant' && (inv === undefined || inv === true)) {
      if (req.body.brand !== undefined && String(req.body.brand).trim() === '') {
        throw new Error('Brand cannot be empty when provided');
      }
      if (req.body.supplier !== undefined && String(req.body.supplier).trim() === '') {
        throw new Error('Supplier cannot be empty when provided');
      }
    }
    return true;
  })
];

// Update product
export const updateProduct = async (req: AuthRequest, res: express.Response): Promise<void> => {
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
    const updateData = { ...req.body };
    if ('guidedDishDraft' in updateData || 'dishDraftRequestId' in updateData) throw new GuidedDishError(400, 'Draft metadata is managed by New Dish');

    // Check if product exists
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Product not found' 
      });
      return;
    }

    const beforeSnapshot = existingProduct.toObject();
    if (beforeSnapshot.guidedDishDraft && Object.keys(updateData).some(key => key.startsWith('$') || key.includes('.'))) throw new GuidedDishError(400, 'Use ordinary product fields when editing a guided dish');

    // Classification-only saves must never rebuild warehouse stock or recipe references.
    const sellingTypeOnly = Object.keys(updateData).length === 1 && typeof updateData.isSellable === 'boolean';
    if (!sellingTypeOnly) {
      if (updateData.ptype === undefined) updateData.ptype = existingProduct.ptype;
      if (updateData.isInventory === undefined) updateData.isInventory = existingProduct.isInventory;
      normalizeAndCleanProductData(updateData);
    }
    const inventoryQtyErrors = sellingTypeOnly ? [] : validateInventoryQuantityRequired(updateData);
    if (inventoryQtyErrors.length > 0) {
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: inventoryQtyErrors
      });
      return;
    }

    console.log('Updating product:', id, 'with data:', updateData);

    // Enforce unique product name on updates as well (exclude current product).
    if (typeof updateData?.name === 'string') {
      const nameRegex = buildProductNameDuplicateRegex(updateData.name);
      if (!nameRegex) {
        res.status(400).json({
          status: 'error',
          message: 'Product name is required'
        });
        return;
      }

      const existingByName = await Product.findOne({
        _id: { $ne: id as any },
        name: nameRegex
      })
        .select('_id name')
        .lean();

      if (existingByName) {
        res.status(409).json({
          status: 'error',
          message: 'A product with this name already exists'
        });
        return;
      }
    }

    await assertGuidedDishReady({ ...beforeSnapshot, ...updateData });
    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { new: true });
    if (!updatedProduct) {
      res.status(500).json({
        status: 'error',
        message: 'Failed to update product'
      });
      return;
    }

    const currentUser = req.user as any;
    await logActivity({
      req: req as AuthRequest,
      user: currentUser
        ? {
            userId: String(currentUser._id),
            username: currentUser.name,
            role: currentUser.role
          }
        : undefined,
      action: 'EDIT',
      entityType: 'Product',
      entityId: String(updatedProduct._id),
      before: beforeSnapshot,
      after: updatedProduct.toObject()
    });

    console.log('Product updated successfully:', updatedProduct!._id);
    
    res.json({ 
      status: 'success', 
      message: 'Product updated successfully',
      data: { id: updatedProduct!._id, name: updatedProduct!.name } 
    });
  } catch (e: any) {
    console.error('Error updating product:', e);
    if (e instanceof GuidedDishError) { res.status(e.status).json({ status: 'error', message: e.message }); return; }
    
    if (e.name === 'ValidationError') {
      const validationErrors = Object.values(e.errors).map((err: any) => err.message);
      res.status(400).json({ 
        status: 'error', 
        message: 'Validation failed',
        errors: validationErrors 
      });
    } else {
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  }
};

// Delete product validators
export const deleteProductValidators = [
  authenticate,
  checkPermission('manageProducts', 'delete'),
  param('id').isMongoId().withMessage('Invalid product ID')
];

// Delete product
export const deleteProduct = async (req: AuthRequest, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    console.log('Deleting product:', id);
    
    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({ 
        status: 'error', 
        message: 'Product not found' 
      });
      return;
    }

    const currentUser = req.user as any;
    await logActivity({
      req: req as AuthRequest,
      user: currentUser
        ? {
            userId: String(currentUser._id),
            username: currentUser.name,
            role: currentUser.role
          }
        : undefined,
      action: 'DELETE',
      entityType: 'Product',
      entityId: String(product._id),
      before: product.toObject()
    });

    await Product.findByIdAndDelete(id);
    console.log('Product deleted successfully:', id);
    
    res.json({ 
      status: 'success', 
      message: 'Product deleted successfully' 
    });
  } catch (e: any) {
    console.error('Error deleting product:', e);
    
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};
