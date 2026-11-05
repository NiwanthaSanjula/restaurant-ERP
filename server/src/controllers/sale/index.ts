import { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../../middleware/auth';
import Customer from '../../models/Customer';
import PosSession from '../../models/PosSession';
import Product from '../../models/Product';
import { isPosEligibleProduct, isProductSellable } from '../../utils/productEligibility';
import Sale from '../../models/Sale';
import { kitchenTicketForSale } from '../../utils/kitchenTicket';
import SpecialOffer from '../../models/SpecialOffer';
import User from '../../models/User';
import Warehouse from '../../models/Warehouse';
import {
    buildZonedDateRange, parseDateInputAsZonedStart
} from '../../utils/timezone';

import logActivity from '../../services/logActivity';
import {
    processRecipeInventoryDeduction,
    reverseKitchenDeductionForSale,
    validateKitchenStockForCompletedSale
} from '../kitchen/deduction';

// Type definitions for product structures
interface IVariation {
  productQty?: number;
  productPrice?: number;
  productCost?: number;
  orderTax?: number;
  [key: string]: any;
}

interface IBatch {
  batchNumber?: string;
  productQty?: number;
  productPrice?: number;
  productCost?: number;
  variationValues?: Map<string, IVariation> | Record<string, IVariation>;
  [key: string]: any;
}

interface IWarehouse {
  productQty?: number;
  productPrice?: number;
  productCost?: number;
  batches?: IBatch[];
  variationValues?: Map<string, IVariation> | Record<string, IVariation>;
  [key: string]: any;
}

// Helper function to calculate product subtotal
const calculateProductSubtotal = (qty: number, price: number, discount: number, discountType: 'fixed' | 'percentage', tax: number): number => {
  let initialPrice = qty * price;
  
  // Apply discount
  if (discountType === 'fixed') {
    initialPrice -= (discount * qty);
  } else {
    initialPrice -= (initialPrice * discount / 100);
  }
  
  // Apply tax
  initialPrice += (initialPrice * tax / 100);
  
  return Math.max(0, initialPrice);
};

// Helper function to calculate sale totals
const calculateSaleTotals = (
  products: any[],
  saleDiscountValue: number,
  saleDiscountType: 'fixed' | 'percentage',
  saleTaxValue: number,
  shippingCost: number
): { total: number; profit: number } => {
  // Calculate total of products
  let totalOfProducts = products.reduce((sum, p) => sum + p.subtotal, 0);
  const totalProductQty = products.reduce((sum, p) => sum + Number(p.qty || 0), 0);
  
  // Apply sale-level discount
  if (saleDiscountType === 'fixed') {
    // Fixed sale discount is per sold unit across all line items.
    totalOfProducts -= saleDiscountValue * totalProductQty;
  } else {
    totalOfProducts -= (totalOfProducts * saleDiscountValue / 100);
  }
  
  // Apply sale tax
  totalOfProducts += (totalOfProducts * saleTaxValue / 100);
  
  // Add shipping
  const total = Math.max(0, totalOfProducts + shippingCost);
  
  // Calculate profit
  const profit = products.reduce((sum, p) => {
    const sellingPriceAfterTaxDiscount = p.subtotal;
    const profitPerProduct = (sellingPriceAfterTaxDiscount - (p.cost * p.qty));
    return sum + profitPerProduct;
  }, 0);
  
  return { total, profit };
};

const isSaleReferenceFormat = (value: string): boolean => /^SALE-\d{4}$/i.test(value);

const formatSaleReference = (value: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return 'SALE-0000';
  if (isSaleReferenceFormat(raw)) return raw.toUpperCase();

  const digits = raw.replace(/\D/g, '');
  if (digits.length > 0) {
    return `SALE-${digits.slice(-4).padStart(4, '0')}`;
  }

  const compact = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `SALE-${compact.slice(-4).padStart(4, '0')}`;
};

const generateRandomSuffix = (): string => Math.floor(Math.random() * 10000).toString().padStart(4, '0');

const generateUniqueSaleReference = async (seed?: string, excludeId?: string): Promise<string> => {
  const seen = new Set<string>();
  const base = formatSaleReference(seed || Date.now().toString());
  let candidate = base;

  for (let i = 0; i < 20; i++) {
    if (seen.has(candidate)) {
      candidate = `SALE-${generateRandomSuffix()}`;
      continue;
    }
    seen.add(candidate);

    const exists = await Sale.exists({
      invoiceId: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {})
    });

    if (!exists) return candidate;
    candidate = `SALE-${generateRandomSuffix()}`;
  }

  return `SALE-${Date.now().toString().slice(-4).padStart(4, '0')}`;
};

type SaleLineForStock = {
  productId: string;
  variation?: string | null;
  batch?: string | null;
  qty: number;
};

function toVariationMap(
  v?: Map<string, IVariation> | Record<string, IVariation>
): Map<string, IVariation> {
  if (!v) return new Map<string, IVariation>();
  return v instanceof Map ? v : new Map<string, IVariation>(Object.entries(v));
}

function validateMainStockLineShape(line: SaleLineForStock): void {
  const q = Number(line.qty);
  if (!Number.isFinite(q) || q <= 0) {
    throw new Error('Each inventory product must have a finite quantity greater than 0');
  }
}

async function availableMainStockForLine(
  productDoc: any,
  warehouseId: string,
  line: SaleLineForStock
): Promise<number> {
  const whRaw = productDoc.warehouse?.get?.(warehouseId) ?? productDoc.warehouse?.[warehouseId];
  if (!whRaw) {
    throw new Error(`Product ${productDoc.name || line.productId} not available in selected warehouse`);
  }
  const wh = whRaw as IWarehouse;
  const batch = line.batch ? String(line.batch) : '';
  const variation = line.variation ? String(line.variation) : '';

  if (batch && Array.isArray(wh.batches)) {
    const b = wh.batches.find((x) => String(x.batchNumber || '') === batch) as IBatch | undefined;
    if (!b) {
      throw new Error(`Batch ${batch} not found for product ${productDoc.name || line.productId}`);
    }
    if (variation) {
      const vm = toVariationMap(b.variationValues);
      const vv = vm.get(variation);
      if (!vv) {
        throw new Error(
          `Variation ${variation} not found in batch ${batch} for product ${productDoc.name || line.productId}`
        );
      }
      return Number(vv.productQty || 0);
    }
    return Number(b.productQty || 0);
  }

  if (variation) {
    const vm = toVariationMap(wh.variationValues);
    const vv = vm.get(variation);
    if (!vv) {
      throw new Error(`Variation ${variation} not found for product ${productDoc.name || line.productId}`);
    }
    return Number(vv.productQty || 0);
  }

  return Number(wh.productQty || 0);
}

export async function validateMainStockForCompletedSale(
  warehouseId: string,
  lines: SaleLineForStock[],
  session?: mongoose.ClientSession
): Promise<void> {
  for (const line of lines) {
    validateMainStockLineShape(line);
    const query = Product.findById(line.productId).select('name isInventory warehouse');
    const product = await (session ? query.session(session) : query).lean();
    if (!product) continue;
    if (product.isInventory !== true) continue;
    const available = await availableMainStockForLine(product, warehouseId, line);
    if (available < Number(line.qty)) {
      throw new Error(`Insufficient stock for product: ${product.name || line.productId}`);
    }
  }
}

async function decrementMainStockLine(
  warehouseId: string,
  line: SaleLineForStock,
  session?: mongoose.ClientSession
): Promise<void> {
  const qty = Number(line.qty);
  const batch = line.batch ? String(line.batch) : '';
  const variation = line.variation ? String(line.variation) : '';
  const pid = String(line.productId);

  let updated: any = null;
  if (batch && variation) {
    updated = await Product.findOneAndUpdate(
      {
        _id: pid,
        [`warehouse.${warehouseId}.batches`]: {
          $elemMatch: {
            batchNumber: batch,
            [`variationValues.${variation}.productQty`]: { $gte: qty }
          }
        }
      },
      {
        $inc: {
          [`warehouse.${warehouseId}.batches.$[batch].variationValues.${variation}.productQty`]: -qty
        }
      },
      { new: true, arrayFilters: [{ 'batch.batchNumber': batch }], ...(session && { session }) }
    );
  } else if (batch) {
    updated = await Product.findOneAndUpdate(
      {
        _id: pid,
        [`warehouse.${warehouseId}.batches`]: {
          $elemMatch: { batchNumber: batch, productQty: { $gte: qty } }
        }
      },
      { $inc: { [`warehouse.${warehouseId}.batches.$[batch].productQty`]: -qty } },
      { new: true, arrayFilters: [{ 'batch.batchNumber': batch }], ...(session && { session }) }
    );
  } else if (variation) {
    updated = await Product.findOneAndUpdate(
      {
        _id: pid,
        [`warehouse.${warehouseId}.variationValues.${variation}.productQty`]: { $gte: qty }
      },
      { $inc: { [`warehouse.${warehouseId}.variationValues.${variation}.productQty`]: -qty } },
      { new: true, ...(session && { session }) }
    );
  } else {
    updated = await Product.findOneAndUpdate(
      {
        _id: pid,
        [`warehouse.${warehouseId}.productQty`]: { $gte: qty }
      },
      { $inc: { [`warehouse.${warehouseId}.productQty`]: -qty } },
      { new: true, ...(session && { session }) }
    );
  }

  if (!updated) {
    const p = await Product.findById(pid).select('name').lean();
    throw new Error(`Insufficient stock for product: ${p?.name || pid}`);
  }
}

async function incrementMainStockLine(
  warehouseId: string,
  line: SaleLineForStock
): Promise<void> {
  const qty = Number(line.qty);
  const batch = line.batch ? String(line.batch) : '';
  const variation = line.variation ? String(line.variation) : '';
  const pid = String(line.productId);

  if (batch && variation) {
    await Product.updateOne(
      { _id: pid },
      {
        $inc: {
          [`warehouse.${warehouseId}.batches.$[batch].variationValues.${variation}.productQty`]: qty
        }
      },
      { arrayFilters: [{ 'batch.batchNumber': batch }] }
    );
    return;
  }
  if (batch) {
    await Product.updateOne(
      { _id: pid },
      { $inc: { [`warehouse.${warehouseId}.batches.$[batch].productQty`]: qty } },
      { arrayFilters: [{ 'batch.batchNumber': batch }] }
    );
    return;
  }
  if (variation) {
    await Product.updateOne(
      { _id: pid },
      { $inc: { [`warehouse.${warehouseId}.variationValues.${variation}.productQty`]: qty } }
    );
    return;
  }
  await Product.updateOne(
    { _id: pid },
    { $inc: { [`warehouse.${warehouseId}.productQty`]: qty } }
  );
}

export async function applyMainStockDeductionForSale(
  saleRef: string | mongoose.Types.ObjectId | { _id: unknown },
  session?: mongoose.ClientSession
): Promise<void> {
  const sid =
    typeof saleRef === 'object' && saleRef !== null && '_id' in saleRef
      ? String(saleRef._id)
      : String(saleRef);
  const query = Sale.findById(sid);
  const sale = await (session ? query.session(session) : query).lean();
  if (!sale || sale.status !== 'completed') return;
  if ((sale as any).mainStockDeductionAppliedAt) return;

  const warehouseId = String((sale as any).warehouseId || '');
  const lines = ((sale as any).products || []).map((x: any) => ({
    productId: String(x.productId),
    variation: x.variation || null,
    batch: x.batch || null,
    qty: Number(x.qty)
  })) as SaleLineForStock[];

  await validateMainStockForCompletedSale(warehouseId, lines, session);

  const rolled: SaleLineForStock[] = [];
  try {
    for (const line of lines) {
      const productQuery = Product.findById(line.productId).select('isInventory');
      const product = await (session ? productQuery.session(session) : productQuery).lean();
      if (!product || product.isInventory !== true) continue;
      await decrementMainStockLine(warehouseId, line, session);
      rolled.push(line);
    }
    await Sale.findByIdAndUpdate(sid, { mainStockDeductionAppliedAt: new Date() }, session ? { session } : {});
  } catch (e) {
    // The checkout transaction rolls back all writes together.
    if (session) throw e;
    for (const line of rolled.reverse()) {
      await incrementMainStockLine(warehouseId, line);
    }
    throw e;
  }
}

export async function reverseMainStockDeductionForSale(
  saleRef: string | mongoose.Types.ObjectId | { _id: unknown }
): Promise<void> {
  const sid =
    typeof saleRef === 'object' && saleRef !== null && '_id' in saleRef
      ? String(saleRef._id)
      : String(saleRef);
  // Validate sale id and existence
  const sale = await Sale.findById(sid).lean();
  if (!sale) throw new Error('Sale not found');
  if (!(sale as any).mainStockDeductionAppliedAt) {
    throw new Error('Main stock deduction not applied for this sale');
  }

  const warehouseId = String((sale as any).warehouseId || '');
  if (!warehouseId) throw new Error('Warehouse ID missing on sale');

  const lines = ((sale as any).products || []).map((x: any) => ({
    productId: String(x.productId),
    variation: x.variation || null,
    batch: x.batch || null,
    qty: Number(x.qty)
  })) as SaleLineForStock[];

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('No sale lines available to reverse stock');
  }

  const rolled: SaleLineForStock[] = [];
  try {
    for (const line of lines) {
      validateMainStockLineShape(line);
      const product = await Product.findById(line.productId).select('isInventory').lean();
      if (!product || product.isInventory !== true) continue;

      // Attempt to increment. On success, record to rolled for potential rollback.
      await incrementMainStockLine(warehouseId, line);
      rolled.push(line);
    }

    const upd = await Sale.findByIdAndUpdate(sid, { $unset: { mainStockDeductionAppliedAt: 1 } });
    if (!upd) {
      // Try to rollback increments if we couldn't update the sale record
      for (const r of rolled.reverse()) {
        await decrementMainStockLine(warehouseId, r);
      }
      throw new Error('Failed to update sale deduction flag after reversing stock');
    }
  } catch (err) {
    // Rollback any increments we already applied
    try {
      for (const r of rolled.reverse()) {
        await decrementMainStockLine(warehouseId, r);
      }
    } catch (rollbackErr) {
      // If rollback fails, surface combined error
      throw new Error(
        `Failed reversing stock: ${String((err as Error).message || err)}; rollback error: ${String((rollbackErr as Error).message || rollbackErr)}`
      );
    }
    throw err;
  }
}

// Get all sales (restaurant-only)
export const getSales = [
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        q,
        date,
        dateEnd,
        customerId,
        warehouseId,
        paymentStatus,
        businessType,
        status,
        search,
        page = '1',
        limit = '50'
      } = req.query as {
        q?: string;
        date?: string;
        dateEnd?: string;
        customerId?: string;
        warehouseId?: string;
        paymentStatus?: string;
        businessType?: string;
        status?: string;
        search?: string;
        page?: string;
        limit?: string;
      };
      
      // Always scope to restaurant sales
      const filter: any = { businessType: 'restaurant' };

      if (q) {
        filter.$or = [
          { invoiceId: { $regex: q, $options: 'i' } },
          { _id: mongoose.Types.ObjectId.isValid(q) ? new mongoose.Types.ObjectId(q) : undefined }
        ].filter(cond => cond._id !== undefined || cond.invoiceId !== undefined);
      }
      
      // Support single-day and range filters (date + optional dateEnd)
      if (date || dateEnd) {
        const { start, end } = buildZonedDateRange(date, dateEnd);
        
        if (date && dateEnd && start > end) {
          res.status(400).json({ status: 'error', message: 'From date cannot be greater than to date' });
          return;
        }

        filter.date = { $gte: start, $lte: end };
      }
      
      if (customerId) filter.customerId = customerId;
      if (warehouseId) filter.warehouseId = warehouseId;
      if (paymentStatus) filter.paymentStatus = paymentStatus;
      if (status) filter.status = status;
      
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;
      
      let salesQuery: any = Sale.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limitNum);
      
      // If search is provided, we need to populate related data first for searching
      if (search && search.trim()) {
        salesQuery = salesQuery.populate('customerId', 'name mobile')
          .populate('warehouseId', 'name')
          .populate('createdBy', 'name email');
      }
      
      const sales = await salesQuery.lean();
      
      let total = await Sale.countDocuments(filter);
      
      // Apply search filter if provided
      if (search && search.trim()) {
        const searchLower = search.toLowerCase().trim();
        
        // Filter the populated results
        const filteredSales = (sales as any[]).filter((sale: any) => {
          const normalizedRef = formatSaleReference(String(sale.invoiceId || sale._id || ''));
          const ref = normalizedRef.toLowerCase();
          const user = (sale.createdBy?.name || sale.createdBy?.email || '').toLowerCase();
          const customer = (sale.customerId?.name || '').toLowerCase();
          const customerMobile = (sale.customerId?.mobile || '').toLowerCase();
          const warehouse = (sale.warehouseId?.name || '').toLowerCase();
          const statusMatch = (sale.status || '').toLowerCase();
          const paymentStatusMatch = (sale.paymentStatus || '').toLowerCase();
          
          // Payment types
          const paymentTypes: string[] = [];
          if (sale.cashAmount > 0) paymentTypes.push('cash');
          if (sale.cardAmount > 0) paymentTypes.push('card');
          if (sale.bankTransferAmount > 0) paymentTypes.push('bank transfer');
          const paymentTypeStr = paymentTypes.join(' ').toLowerCase();
          
          return ref.includes(searchLower) ||
            user.includes(searchLower) ||
            customer.includes(searchLower) ||
            customerMobile.includes(searchLower) ||
            warehouse.includes(searchLower) ||
            statusMatch.includes(searchLower) ||
            paymentStatusMatch.includes(searchLower) ||
            paymentTypeStr.includes(searchLower);
        });
        
        // Update total count for pagination
        total = filteredSales.length;
        
        // Apply pagination to filtered results
        const paginatedSales = filteredSales.slice(skip, skip + limitNum);
        
        res.json({
          status: 'success',
          data: paginatedSales,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        });
        return;
      }
      
      // If no search, proceed with normal population
      const toObjectId = (id: any) => (id && mongoose.Types.ObjectId.isValid(id) && String(id).length === 24 ? new mongoose.Types.ObjectId(id) : null);
      
      // Resolve customer, warehouse, and createdBy (user) names
      const customerIds = [...new Set((sales as any[]).map(s => s.customerId).filter(Boolean))];
      const warehouseIds = [...new Set((sales as any[]).map(s => s.warehouseId).filter(Boolean))];
      const createdByIds = [...new Set((sales as any[]).map(s => s.createdBy).filter(Boolean))];
      const validCustomerIds = customerIds.map(toObjectId).filter(Boolean) as mongoose.Types.ObjectId[];
      const validWarehouseIds = warehouseIds.map(toObjectId).filter(Boolean) as mongoose.Types.ObjectId[];
      const validCreatedByIds = createdByIds.map((id: any) => toObjectId(id)).filter(Boolean) as mongoose.Types.ObjectId[];
      
      const [customers, warehouses, users] = await Promise.all([
        validCustomerIds.length ? Customer.find({ _id: { $in: validCustomerIds } }).select('name mobile').lean() : [],
        validWarehouseIds.length ? Warehouse.find({ _id: { $in: validWarehouseIds } }).select('name').lean() : [],
        validCreatedByIds.length ? User.find({ _id: { $in: validCreatedByIds } }).select('name email').lean() : []
      ]);
      
      const customerMap: Record<string, { name?: string; mobile?: string }> = {};
      (customers as any[]).forEach((c: any) => { customerMap[String(c._id)] = { name: c.name, mobile: c.mobile }; });
      const warehouseMap: Record<string, { name?: string }> = {};
      (warehouses as any[]).forEach((w: any) => { warehouseMap[String(w._id)] = { name: w.name }; });
      const userMap: Record<string, { name?: string; email?: string }> = {};
      (users as any[]).forEach((u: any) => { userMap[String(u._id)] = { name: u.name, email: u.email }; });
      
      (sales as any[]).forEach((sale: any) => {
        sale.invoiceId = formatSaleReference(String(sale.invoiceId || sale._id || ''));
        sale.customerId = customerMap[String(sale.customerId)] || { name: sale.saleType === 'pos' && !sale.customerId ? 'Walk-in' : null, mobile: null };
        sale.warehouseId = warehouseMap[String(sale.warehouseId)] || { name: null };
        sale.createdBy = sale.createdBy ? (userMap[String(sale.createdBy)] || { name: null, email: null }) : { name: null, email: null };
      });
      
      res.json({
        status: 'success',
        data: sales,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch sales' });
      return;
    }
  }
];

// Get sale by ID (customerId/warehouseId are Strings in schema, so we resolve them manually)
export const getSaleById = [
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sale = await Sale.findById(req.params.id)
        .populate('createdBy', 'name email')
        .populate('specialOfferId')
        .lean();
      
      if (!sale) {
        res.status(404).json({ status: 'error', message: 'Sale not found' });
        return;
      }
      
      const saleObj = sale as any;
      saleObj.kitchenTicket = kitchenTicketForSale(saleObj);
      saleObj.invoiceId = formatSaleReference(String(saleObj.invoiceId || saleObj._id || ''));
      const customerId = saleObj.customerId;
      const warehouseId = saleObj.warehouseId;
      const toObjectId = (id: any) => (id && mongoose.Types.ObjectId.isValid(id) && String(id).length === 24 ? new mongoose.Types.ObjectId(id) : null);
      
      const [customer, warehouse] = await Promise.all([
        toObjectId(customerId) ? Customer.findById(customerId).select('name mobile address email NIC').lean() : null,
        toObjectId(warehouseId) ? Warehouse.findById(warehouseId).select('name location').lean() : null
      ]);
      
      saleObj.customerId = customer ? { _id: (customer as any)._id, name: (customer as any).name, mobile: (customer as any).mobile, address: (customer as any).address, email: (customer as any).email, NIC: (customer as any).NIC } : { name: saleObj.saleType === 'pos' && !customerId ? 'Walk-in' : null, mobile: null, address: null, email: null };
      saleObj.warehouseId = warehouse ? { _id: (warehouse as any)._id, name: (warehouse as any).name, location: (warehouse as any).location } : { name: null, location: null };
      
      res.json({ status: 'success', data: saleObj });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch sale' });
      return;
    }
  }
];

// Create sale validators
export const createSaleValidators = [
  authenticate,
  body('warehouseId').trim().notEmpty().withMessage('Warehouse ID is required'),
  body('customerId').trim().notEmpty().withMessage('Customer ID is required'),
  body('date').optional().isISO8601().withMessage('Invalid date format'),
  // Restaurant-only business type (clients may omit this; it will default to restaurant)
  body('businessType').optional().isIn(['restaurant']).withMessage('Business type must be restaurant'),
  body('status').optional().isIn(['ordered', 'pending', 'completed']).withMessage('Status must be ordered, pending, or completed'),
  body('paymentStatus').optional().isIn(['paid', 'partial', 'unpaid']).withMessage('Payment status must be paid, partial, or unpaid'),
  body('products').isArray({ min: 1 }).withMessage('At least one product is required'),
  body('products.*.productId').trim().notEmpty().withMessage('Product ID is required'),
  body('products.*.qty')
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be greater than 0')
    .custom((v) => Number.isFinite(Number(v)))
    .withMessage('Quantity must be a finite number'),
  body('saleDiscountValue').optional().isFloat({ min: 0 }).withMessage('Sale discount must be >= 0'),
  body('saleTaxValue').optional().isFloat({ min: 0 }).withMessage('Sale tax must be >= 0'),
  body('shippingCost').optional().isFloat({ min: 0 }).withMessage('Shipping cost must be >= 0'),
  body('cashAmount').optional().isFloat({ min: 0 }).withMessage('Cash amount must be >= 0'),
  body('cardAmount').optional().isFloat({ min: 0 }).withMessage('Card amount must be >= 0'),
  body('bankTransferAmount').optional().isFloat({ min: 0 }).withMessage('Bank transfer amount must be >= 0'),
  body('saleType').optional().isIn(['pos', 'non-pos']).withMessage('Sale type must be pos or non-pos')
];

// Create sale
export const createSale = [
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }
      
      const {
        warehouseId,
        customerId,
        date,
        businessType = 'restaurant',
        status = 'ordered',
        products,
        saleDiscountValue = 0,
        saleDiscountType = 'fixed',
        saleTaxValue = 0,
        shippingCost = 0,
        cashAmount = 0,
        cardAmount = 0,
        bankTransferAmount = 0,
        saleType = 'non-pos',
        referenceQuotationId,
        specialOfferId
      } = req.body;
      
      // Validate warehouse exists
      const warehouse = await Warehouse.findById(warehouseId);
      if (!warehouse) {
        res.status(404).json({ status: 'error', message: 'Warehouse not found' });
        return;
      }
      
      // Validate customer exists
      const customer = await Customer.findById(customerId);
      if (!customer) {
        res.status(404).json({ status: 'error', message: 'Customer not found' });
        return;
      }
      
      // Validate special offer if provided
      let specialOfferPercentage = 0;
      let specialOfferObjectId: mongoose.Types.ObjectId | undefined;
      if (specialOfferId) {
        try {
          const offer = await SpecialOffer.findById(specialOfferId);
          if (!offer) {
            res.status(404).json({ status: 'error', message: 'Special offer not found' });
            return;
          }
          if (offer.status !== 'Active') {
            res.status(400).json({ status: 'error', message: 'Special offer is not active' });
            return;
          }
          specialOfferPercentage = offer.percentage || 0;
          specialOfferObjectId = offer._id;
        } catch (offerErr: any) {
          res.status(400).json({ status: 'error', message: 'Invalid special offer ID' });
          return;
        }
      }
      
      // Process products and calculate subtotals (restaurant-only system)
      const processedProducts = [];
      for (const p of products) {
        const lineQty = Number(p.qty);
        if (!Number.isFinite(lineQty) || lineQty <= 0) {
          res.status(400).json({
            status: 'error',
            message: 'Each line item must have a valid quantity greater than 0'
          });
          return;
        }
        const product = await Product.findById(p.productId);
        if (!product) {
          res.status(404).json({ status: 'error', message: `Product ${p.productId} not found` });
          return;
        }
        if (!isProductSellable(product) || (saleType === 'pos' && !isPosEligibleProduct(product))) {
          res.status(400).json({ status: 'error', message: 'Sales require explicitly Sellable items, and POS also requires Active status. Inventory-only or unclassified items cannot be checked out.' });
          return;
        }
        
        // Get warehouse stock info
        const warehouseDataRaw = product.warehouse?.get?.(warehouseId);
        if (!warehouseDataRaw) {
          res.status(400).json({ status: 'error', message: `Product ${product.name} not available in selected warehouse` });
          return;
        }
        
        const warehouseData = warehouseDataRaw as unknown as IWarehouse;
        
        // Get stock quantity, price, cost based on batch/variation
        let stockQty = 0;
        let price = 0;
        let cost = 0;
        
        if (p.batch && warehouseData.batches) {
          const batch = warehouseData.batches.find((b: IBatch) => b.batchNumber === p.batch) as IBatch | undefined;
          if (!batch) {
            res.status(400).json({ status: 'error', message: `Batch ${p.batch} not found for product ${product.name}` });
            return;
          }
          
          if (p.variation && batch.variationValues) {
            const variationValues = batch.variationValues instanceof Map
              ? batch.variationValues
              : new Map<string, IVariation>(Object.entries(batch.variationValues || {}));
            const variation = variationValues.get(p.variation) as IVariation | undefined;
            if (!variation) {
              res.status(400).json({ status: 'error', message: `Variation ${p.variation} not found in batch ${p.batch}` });
              return;
            }
            stockQty = variation.productQty || 0;
            price = variation.productPrice || 0;
            cost = variation.productCost || 0;
          } else {
            stockQty = batch.productQty || 0;
            price = batch.productPrice || 0;
            cost = batch.productCost || 0;
          }
        } else {
          if (p.variation && warehouseData.variationValues) {
            const variationValues = warehouseData.variationValues instanceof Map
              ? warehouseData.variationValues
              : new Map<string, IVariation>(Object.entries(warehouseData.variationValues || {}));
            const variation = variationValues.get(p.variation) as IVariation | undefined;
            if (!variation) {
              res.status(400).json({ status: 'error', message: `Variation ${p.variation} not found for product ${product.name}` });
              return;
            }
            stockQty = variation.productQty || 0;
            price = variation.productPrice || 0;
            cost = variation.productCost || 0;
          } else {
            stockQty = warehouseData.productQty || 0;
            price = warehouseData.productPrice || 0;
            cost = warehouseData.productCost || 0;
          }
        }
        
        // Calculate subtotal
        const subtotal = calculateProductSubtotal(
          lineQty,
          price,
          p.discount || 0,
          p.discountType || 'fixed',
          p.tax || 0
        );
        
        processedProducts.push({
          productId: p.productId,
          productName: product.name,
          variation: p.variation || null,
          batch: p.batch || null,
          stockQtyAtSale: stockQty,
          qty: lineQty,
          price,
          discount: p.discount || 0,
          discountType: p.discountType || 'fixed',
          tax: p.tax || 0,
          subtotal,
          cost
        });
      }
      
      // Calculate totals
      const { total: totalBeforeOffer, profit } = calculateSaleTotals(
        processedProducts,
        saleDiscountValue,
        saleDiscountType,
        saleTaxValue,
        shippingCost
      );
      
      // Apply special offer discount
      const specialOfferDiscount = (totalBeforeOffer * specialOfferPercentage) / 100;
      const total = Math.max(0, totalBeforeOffer - specialOfferDiscount);
      
      // Calculate payment total and balance
      const paymentTotal = cashAmount + cardAmount + bankTransferAmount;
      const balance = Math.max(0, paymentTotal - total);
      
      // Determine payment status
      let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
      if (paymentTotal === 0) {
        paymentStatus = 'unpaid';
      } else if (paymentTotal >= total) {
        paymentStatus = 'paid';
      } else {
        paymentStatus = 'partial';
      }
      
const authUser = (req as any).user;
const createdBy =
  authUser?._id && mongoose.Types.ObjectId.isValid(authUser._id)
    ? authUser._id
    : undefined;

let posSessionId: mongoose.Types.ObjectId | undefined;

// POS session validation
if (saleType === 'pos') {
  if (!createdBy) {
    res
      .status(401)
      .json({ status: 'error', message: 'Authenticated user is required for POS sales' });
    return;
  }

  const activeSession = await PosSession.findOne({
    userId: createdBy,
    status: 'OPEN'
  })
    .select('_id')
    .lean();

  if (!activeSession?._id) {
    res
      .status(400)
      .json({ status: 'error', message: 'No active POS session found for this user' });
    return;
  }

  posSessionId = activeSession._id as mongoose.Types.ObjectId;
}

// Stock validation (from main branch)
if (status === 'completed') {
  try {
    await validateMainStockForCompletedSale(
      warehouseId,
      processedProducts.map((x) => ({
        productId: x.productId,
        variation: x.variation || undefined,
        batch: x.batch || undefined,
        qty: x.qty
      }))
    );

    await validateKitchenStockForCompletedSale(
      processedProducts.map((x) => ({
        productId: x.productId,
        variation: x.variation || undefined,
        qty: x.qty
      }))
    );
  } catch (kitchenErr: any) {
    res.status(400).json({
      status: 'error',
      message: kitchenErr.message || 'Kitchen stock validation failed'
    });
    return;
  }
}
      const invoiceId = await generateUniqueSaleReference(Date.now().toString());

      // Create sale
      const sale = await Sale.create({
        invoiceId,
        warehouseId,
        customerId,
        referenceQuotationId: referenceQuotationId || undefined,
        date: date ? parseDateInputAsZonedStart(date) : new Date(),
        businessType: 'restaurant',
        status,
        paymentStatus,
        saleType: saleType === 'pos' ? 'pos' : 'non-pos',
        products: processedProducts,
        saleDiscountValue,
        saleDiscountType,
        saleTaxValue,
        shippingCost,
        total,
        balance,
        profit,
        cashAmount,
        cardAmount,
        bankTransferAmount,
        ...(posSessionId && { posSessionId }),
        ...(specialOfferObjectId && { specialOfferId: specialOfferObjectId }),
        ...(createdBy && { createdBy })
      });

      if (status === 'completed') {
        try {
          await applyMainStockDeductionForSale(sale);
          await processRecipeInventoryDeduction(sale, createdBy as mongoose.Types.ObjectId | undefined);
        } catch (deductErr: any) {
          await reverseMainStockDeductionForSale(sale);
          await Sale.deleteOne({ _id: sale._id });
          res.status(400).json({
            status: 'error',
            message: deductErr.message || 'Kitchen deduction failed'
          });
          return;
        }
      }
      
      const populatedSale = await Sale.findById(sale._id)
        .populate('customerId', 'name mobile')
        .populate('warehouseId', 'name');

      if (populatedSale) {
        (populatedSale as any).invoiceId = formatSaleReference(String((populatedSale as any).invoiceId || populatedSale._id || ''));
      }
      
      res.status(201).json({
        status: 'success',
        message: 'Sale created successfully',
        data: populatedSale
      });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to create sale' });
      return;
    }
  }
];

// Update sale validators
export const updateSaleValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid sale ID'),
  body('warehouseId').optional().trim().notEmpty().withMessage('Warehouse ID cannot be empty'),
  body('customerId').optional().trim().notEmpty().withMessage('Customer ID cannot be empty'),
  body('date').optional().isISO8601().withMessage('Invalid date format'),
  body('status').optional().isIn(['ordered', 'pending', 'completed']).withMessage('Status must be ordered, pending, or completed'),
  body('products').optional().isArray({ min: 1 }).withMessage('At least one product is required'),
  body('products.*.productId').optional().isMongoId().withMessage('Invalid product id'),
  body('products.*.qty')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be greater than 0')
    .custom((v) => v === undefined || v === null || Number.isFinite(Number(v)))
    .withMessage('Quantity must be a finite number'),
  body('saleDiscountValue').optional().isFloat({ min: 0 }).withMessage('Sale discount must be >= 0'),
  body('saleTaxValue').optional().isFloat({ min: 0 }).withMessage('Sale tax must be >= 0'),
  body('shippingCost').optional().isFloat({ min: 0 }).withMessage('Shipping cost must be >= 0'),
  body('cashAmount').optional().isFloat({ min: 0 }).withMessage('Cash amount must be >= 0'),
  body('cardAmount').optional().isFloat({ min: 0 }).withMessage('Card amount must be >= 0'),
  body('bankTransferAmount').optional().isFloat({ min: 0 }).withMessage('Bank transfer amount must be >= 0')
];

// Update sale
export const updateSale = [
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }
      
      const sale = await Sale.findById(req.params.id);
      if (!sale) {
        res.status(404).json({ status: 'error', message: 'Sale not found' });
        return;
      }

      const beforeSnapshot = sale.toObject();

      const previousStatus = sale.status;
      
      // Process update similar to create (no inventory adjustments in restaurant-only mode)
      const {
        warehouseId = sale.warehouseId.toString(),
        customerId = sale.customerId?.toString() ?? null,
        date,
        status,
        products,
        referenceQuotationId = (sale as any).referenceQuotationId,
        saleDiscountValue = sale.saleDiscountValue,
        saleDiscountType = sale.saleDiscountType,
        saleTaxValue = sale.saleTaxValue,
        shippingCost = sale.shippingCost,
        cashAmount = sale.cashAmount,
        cardAmount = sale.cardAmount,
        bankTransferAmount = sale.bankTransferAmount
      } = req.body;
      
      // Validate warehouse exists
      const warehouse = await Warehouse.findById(warehouseId);
      if (!warehouse) {
        res.status(404).json({ status: 'error', message: 'Warehouse not found' });
        return;
      }
      
      // Validate customer exists
      const customer = customerId ? await Customer.findById(customerId) : null;
      if (!customer && (customerId || sale.saleType !== 'pos')) {
        res.status(404).json({ status: 'error', message: 'Customer not found' });
        return;
      }
      
      // Process products if provided
      let processedProducts = sale.products;
      if (products) {
        processedProducts = [];
        for (const p of products) {
          const lineQty = Number(p.qty);
          if (!Number.isFinite(lineQty) || lineQty <= 0) {
            res.status(400).json({
              status: 'error',
              message: 'Each line item must have a valid quantity greater than 0'
            });
            return;
          }
          const product = await Product.findById(p.productId);
          if (!product) {
            res.status(404).json({ status: 'error', message: `Product ${p.productId} not found` });
            return;
          }
          
          const warehouseDataRaw = product.warehouse?.get?.(warehouseId);
          if (!warehouseDataRaw) {
            res.status(400).json({ status: 'error', message: `Product ${product.name} not available in selected warehouse` });
            return;
          }
          
          const warehouseData = warehouseDataRaw as unknown as IWarehouse;
          
          // Get stock quantity, price, cost
          let stockQty = 0;
          let price = 0;
          let cost = 0;
          
          if (p.batch && warehouseData.batches) {
            const batch = warehouseData.batches.find((b: IBatch) => b.batchNumber === p.batch) as IBatch | undefined;
            if (batch) {
              if (p.variation && batch.variationValues) {
                const variationValues = batch.variationValues instanceof Map
                  ? batch.variationValues
                  : new Map<string, IVariation>(Object.entries(batch.variationValues || {}));
                const variation = variationValues.get(p.variation) as IVariation | undefined;
                if (variation) {
                  stockQty = variation.productQty || 0;
                  price = variation.productPrice || 0;
                  cost = variation.productCost || 0;
                }
              } else {
                stockQty = batch.productQty || 0;
                price = batch.productPrice || 0;
                cost = batch.productCost || 0;
              }
            }
          } else {
            if (p.variation && warehouseData.variationValues) {
              const variationValues = warehouseData.variationValues instanceof Map
                ? warehouseData.variationValues
                : new Map<string, IVariation>(Object.entries(warehouseData.variationValues || {}));
              const variation = variationValues.get(p.variation) as IVariation | undefined;
              if (variation) {
                stockQty = variation.productQty || 0;
                price = variation.productPrice || 0;
                cost = variation.productCost || 0;
              }
            } else {
              stockQty = warehouseData.productQty || 0;
              price = warehouseData.productPrice || 0;
              cost = warehouseData.productCost || 0;
            }
          }
          
          const subtotal = calculateProductSubtotal(
            lineQty,
            price,
            p.discount || 0,
            p.discountType || 'fixed',
            p.tax || 0
          );
          
          processedProducts.push({
            productId: p.productId,
            productName: product.name,
            variation: p.variation || null,
            batch: p.batch || null,
            stockQtyAtSale: stockQty,
            qty: lineQty,
            price,
            discount: p.discount || 0,
            discountType: p.discountType || 'fixed',
            tax: p.tax || 0,
            subtotal,
            cost
          });
        }
      }
      
      // Calculate totals
      const { total, profit } = calculateSaleTotals(
        processedProducts,
        saleDiscountValue,
        saleDiscountType,
        saleTaxValue,
        shippingCost
      );
      
      // Calculate payment total and balance
      const paymentTotal = cashAmount + cardAmount + bankTransferAmount;
      const balance = Math.max(0, paymentTotal - total);
      
      // Determine payment status
      let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
      if (paymentTotal === 0) {
        paymentStatus = 'unpaid';
      } else if (paymentTotal >= total) {
        paymentStatus = 'paid';
      } else {
        paymentStatus = 'partial';
      }
      
      sale.warehouseId = warehouseId;
      sale.customerId = customerId;

      sale.referenceQuotationId = referenceQuotationId || sale.referenceQuotationId;

      if (date) sale.date = parseDateInputAsZonedStart(date);
      if (status) sale.status = status;
      sale.paymentStatus = paymentStatus;
      sale.products = processedProducts;
      sale.saleDiscountValue = saleDiscountValue;
      sale.saleDiscountType = saleDiscountType;
      sale.saleTaxValue = saleTaxValue;
      sale.shippingCost = shippingCost;
      sale.total = total;
      sale.balance = balance;
      sale.profit = profit;
      sale.cashAmount = cashAmount;
      sale.cardAmount = cardAmount;
      sale.bankTransferAmount = bankTransferAmount;

      const nextStatus = status !== undefined ? status : sale.status;
      const willComplete = nextStatus === 'completed' && previousStatus !== 'completed';

      if (willComplete) {
        try {
          await validateMainStockForCompletedSale(
            warehouseId,
            processedProducts.map((x) => ({
              productId: x.productId,
              variation: x.variation || undefined,
              batch: x.batch || undefined,
              qty: x.qty
            }))
          );
          await validateKitchenStockForCompletedSale(
            processedProducts.map((x) => ({ 
              productId: x.productId, 
              variation: x.variation || undefined,
              qty: x.qty 
            }))
          );
        } catch (kitchenErr: any) {
          res.status(400).json({
            status: 'error',
            message: kitchenErr.message || 'Kitchen stock validation failed'
          });
          return;
        }
      }
      
      await sale.save();

      const uid =
        (req as AuthRequest).user?._id && mongoose.Types.ObjectId.isValid((req as AuthRequest).user!._id)
          ? new mongoose.Types.ObjectId(String((req as AuthRequest).user!._id))
          : undefined;

      if (willComplete) {
        try {
          await applyMainStockDeductionForSale(sale);
          await processRecipeInventoryDeduction(sale, uid);
        } catch (deductErr: any) {
          await reverseMainStockDeductionForSale(sale);
          sale.status = previousStatus;
          await sale.save();
          res.status(400).json({
            status: 'error',
            message: deductErr.message || 'Kitchen deduction failed'
          });
          return;
        }
      }
      
      const populatedSale = await Sale.findById(sale._id)
        .populate('customerId', 'name mobile')
        .populate('warehouseId', 'name');

      const currentUser = (req as AuthRequest).user as any;
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
        entityType: 'Sale',
        entityId: String(sale._id),
        before: beforeSnapshot,
        after: populatedSale?.toObject ? populatedSale.toObject() : populatedSale
      });
      
      res.json({
        status: 'success',
        message: 'Sale updated successfully',
        data: populatedSale
      });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to update sale' });
      return;
    }
  }
];

// Complete sale (set status to completed, generate invoice if missing)
export const completeSale = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid sale ID'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }
      const sale = await Sale.findById(req.params.id);
      if (!sale) {
        res.status(404).json({ status: 'error', message: 'Sale not found' });
        return;
      }

      const uid =
        req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id)
          ? new mongoose.Types.ObjectId(req.user._id as string)
          : undefined;

      if (
        sale.status === 'completed' &&
        sale.kitchenDeductionAppliedAt &&
        (sale as any).mainStockDeductionAppliedAt
      ) {
        const populatedSale = await Sale.findById(sale._id)
          .populate('customerId', 'name mobile')
          .populate('warehouseId', 'name');
        res.json({ status: 'success', message: 'Sale already completed', data: populatedSale });
        return;
      }

      if (
        sale.status === 'completed' &&
        (!sale.kitchenDeductionAppliedAt || !(sale as any).mainStockDeductionAppliedAt)
      ) {
        try {
          await applyMainStockDeductionForSale(sale);
          await processRecipeInventoryDeduction(sale, uid);
        } catch (e: any) {
          await reverseMainStockDeductionForSale(sale);
          res.status(400).json({ status: 'error', message: e.message || 'Kitchen deduction failed' });
          return;
        }
        const populatedSale = await Sale.findById(sale._id)
          .populate('customerId', 'name mobile')
          .populate('warehouseId', 'name');
        res.json({ status: 'success', message: 'Kitchen deduction applied', data: populatedSale });
        return;
      }

      const prevStatus = sale.status;
      const prevInvoiceId = sale.invoiceId;
      try {
        await validateMainStockForCompletedSale(
          String(sale.warehouseId),
          sale.products.map((x) => ({
            productId: x.productId,
            variation: x.variation || undefined,
            batch: x.batch || undefined,
            qty: x.qty
          }))
        );
        await validateKitchenStockForCompletedSale(
          sale.products.map((x) => ({ 
            productId: x.productId, 
            variation: x.variation || undefined,
            qty: x.qty 
          }))
        );
      } catch (kitchenErr: any) {
        res.status(400).json({ status: 'error', message: kitchenErr.message || 'Kitchen stock validation failed' });
        return;
      }

      sale.status = 'completed';
      sale.invoiceId = await generateUniqueSaleReference(
        String(sale.invoiceId || sale._id || Date.now()),
        String(sale._id)
      );
      await sale.save();

      try {
        await applyMainStockDeductionForSale(sale);
        await processRecipeInventoryDeduction(sale, uid);
      } catch (deductErr: any) {
        await reverseMainStockDeductionForSale(sale);
        sale.status = prevStatus;
        sale.invoiceId = prevInvoiceId;
        await sale.save();
        res.status(400).json({ status: 'error', message: deductErr.message || 'Kitchen deduction failed' });
        return;
      }

      const populatedSale = await Sale.findById(sale._id)
        .populate('customerId', 'name mobile')
        .populate('warehouseId', 'name');
      if (populatedSale) {
        (populatedSale as any).invoiceId = formatSaleReference(String((populatedSale as any).invoiceId || populatedSale._id || ''));
      }
      res.json({ status: 'success', message: 'Sale completed successfully', data: populatedSale });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to complete sale' });
      return;
    }
  }
];

// Cancel sale
export const cancelSale = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid sale ID'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }
      const sale = await Sale.findById(req.params.id);
      if (!sale) {
        res.status(404).json({ status: 'error', message: 'Sale not found' });
        return;
      }
      if (sale.status === 'completed') {
        // Main stock reversal is critical — if it fails, report to caller
        try {
          await reverseMainStockDeductionForSale(String(sale._id));
        } catch (mainErr: any) {
          res.status(400).json({ status: 'error', message: mainErr.message || 'Failed to reverse main stock for sale' });
          return;
        }

        // Kitchen reversal is best-effort — log failures but do not block cancellation
        try {
          await reverseKitchenDeductionForSale(String(sale._id));
        } catch (kErr: any) {
          console.error('Failed to reverse kitchen deduction for sale', String(sale._id), kErr);
        }
      }
      const user = (req as any).user;
      if (user?._id) {
        sale.cancelledBy = user._id;
      }
      sale.cancelledAt = new Date();
      sale.status = 'cancelled';
      await sale.save();
      const populatedSale = await Sale.findById(sale._id)
        .populate('customerId', 'name mobile')
        .populate('warehouseId', 'name');
      res.json({ status: 'success', message: 'Sale cancelled successfully', data: populatedSale });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to cancel sale' });
      return;
    }
  }
];

// Update payment validators (PATCH /sales/:id/payments/:index)
export const updatePaymentValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid sale ID'),
  param('index').isInt({ min: 0 }).withMessage('Payment index must be a non-negative integer'),
  body('paymentType').optional().isIn(['cash', 'card', 'bankTransfer']).withMessage('Payment type must be cash, card, or bankTransfer'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be >= 0'),
  body('reference').optional().trim()
];

// Update payment at index
export const updatePayment = [
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }
      const sale = await Sale.findById(req.params.id);
      if (!sale) {
        res.status(404).json({ status: 'error', message: 'Sale not found' });
        return;
      }
      const index = parseInt(req.params.index, 10);
      const payments = sale.payments || [];
      if (index >= payments.length) {
        res.status(404).json({ status: 'error', message: 'Payment not found' });
        return;
      }
      const { paymentType, amount, reference } = req.body;
      if (paymentType !== undefined) payments[index].paymentType = paymentType;
      if (amount !== undefined) payments[index].amount = amount;
      if (reference !== undefined) payments[index].reference = reference;
      sale.payments = payments;
      sale.markModified('payments');
      // Recalculate totals from payments
      let cashAmount = 0, cardAmount = 0, bankTransferAmount = 0;
      for (const p of sale.payments) {
        if (p.paymentType === 'cash') cashAmount += p.amount;
        else if (p.paymentType === 'card') cardAmount += p.amount;
        else if (p.paymentType === 'bankTransfer') bankTransferAmount += p.amount;
      }
      sale.cashAmount = cashAmount;
      sale.cardAmount = cardAmount;
      sale.bankTransferAmount = bankTransferAmount;
      const paymentTotal = cashAmount + cardAmount + bankTransferAmount;
      sale.balance = Math.max(0, sale.total - paymentTotal);
      if (paymentTotal >= sale.total) sale.paymentStatus = 'paid';
      else if (paymentTotal > 0) sale.paymentStatus = 'partial';
      else sale.paymentStatus = 'unpaid';
      await sale.save();
      const populatedSale = await Sale.findById(sale._id)
        .populate('customerId', 'name mobile')
        .populate('warehouseId', 'name');
      res.json({ status: 'success', message: 'Payment updated successfully', data: populatedSale });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to update payment' });
      return;
    }
  }
];

// Delete payment validators (DELETE /sales/:id/payments/:index)
export const deletePaymentValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid sale ID'),
  param('index').isInt({ min: 0 }).withMessage('Payment index must be a non-negative integer')
];

// Delete payment at index
export const deletePayment = [
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }
      const sale = await Sale.findById(req.params.id);
      if (!sale) {
        res.status(404).json({ status: 'error', message: 'Sale not found' });
        return;
      }
      const index = parseInt(req.params.index, 10);
      const payments = sale.payments || [];
      if (index >= payments.length) {
        res.status(404).json({ status: 'error', message: 'Payment not found' });
        return;
      }
      payments.splice(index, 1);
      sale.payments = payments;
      sale.markModified('payments');
      // Recalculate totals from remaining payments
      let cashAmount = 0, cardAmount = 0, bankTransferAmount = 0;
      for (const p of sale.payments) {
        if (p.paymentType === 'cash') cashAmount += p.amount;
        else if (p.paymentType === 'card') cardAmount += p.amount;
        else if (p.paymentType === 'bankTransfer') bankTransferAmount += p.amount;
      }
      sale.cashAmount = cashAmount;
      sale.cardAmount = cardAmount;
      sale.bankTransferAmount = bankTransferAmount;
      const paymentTotal = cashAmount + cardAmount + bankTransferAmount;
      sale.balance = Math.max(0, sale.total - paymentTotal);
      if (paymentTotal >= sale.total) sale.paymentStatus = 'paid';
      else if (paymentTotal > 0) sale.paymentStatus = 'partial';
      else sale.paymentStatus = 'unpaid';
      await sale.save();
      const populatedSale = await Sale.findById(sale._id)
        .populate('customerId', 'name mobile')
        .populate('warehouseId', 'name');
      res.json({ status: 'success', message: 'Payment deleted successfully', data: populatedSale });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to delete payment' });
      return;
    }
  }
];

// Delete sale validators
export const deleteSaleValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid sale ID')
];

// Delete sale
export const deleteSale = [
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ status: 'error', message: errors.array()[0].msg });
        return;
      }

      const sale = await Sale.findById(req.params.id);
      if (!sale) {
        res.status(404).json({ status: 'error', message: 'Sale not found' });
        return;
      }

      if (sale.status === 'completed') {
        // Main stock reversal must succeed
        try {
          await reverseMainStockDeductionForSale(String(sale._id));
        } catch (mainErr: any) {
          res.status(400).json({ status: 'error', message: mainErr.message || 'Failed to reverse main stock for sale' });
          return;
        }

        // Kitchen reversal is best-effort — only log failures
        try {
          await reverseKitchenDeductionForSale(String(sale._id));
        } catch (kErr: any) {
          console.error('Failed to reverse kitchen deduction for sale', String(sale._id), kErr);
        }
      }

      const currentUser = (req as AuthRequest).user as any;
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
        entityType: 'Sale',
        entityId: String(sale._id),
        before: sale.toObject()
      });

      await Sale.findByIdAndDelete(req.params.id);
      
      res.json({ status: 'success', message: 'Sale deleted successfully' });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to delete sale' });
      return;
    }
  }
];
