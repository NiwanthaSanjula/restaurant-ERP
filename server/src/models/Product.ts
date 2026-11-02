import mongoose, { Document, Schema } from 'mongoose';

// Define interfaces for nested schemas (restaurant-only)
interface IVariation {
  productQty?: number;
  totalProductWeight?: number;
  code?: string;
  orderTax?: number;
  productCost: number;
  productPrice: number;
  stockAlert?: number;
  discount?: number;
  productProfit?: number;
  profitMargin?: number;
  taxType?: string;
  expiryDate?: Date;
}

interface IBatch {
  batchNumber?: string;
  expiryDate?: Date;
  productQty?: number;
  totalProductWeight?: number;
  orderTax?: number;
  productCost?: number;
  productPrice?: number;
  discount?: number;
  productProfit?: number;
  profitMargin?: number;
  stockAlert?: number;
  taxType?: string;
  variationValues?: Map<string, IVariation>;
}

interface IWarehouse {
  warehouseName: string;
  productQty?: number;
  totalProductWeight?: number;
  code?: string;
  orderTax?: number;
  productCost?: number;
  productPrice?: number;
  discount?: number;
  productProfit?: number;
  profitMargin?: number;
  stockAlert?: number;
  taxType?: string;
  variationType?: string;
  variationValues?: Map<string, IVariation>;
  batches?: IBatch[];
  wholesaleEnabled?: boolean;
  wholesaleMinQty?: number;
  wholesalePrice?: number;
}

// Variation schema for both restaurant and retail
const variationSchema = new Schema<IVariation>({
  productQty: { type: Number },
  totalProductWeight: { type: Number },
  code: { type: String },
  orderTax: { type: Number },
  productCost: { type: Number, required: true },
  productPrice: { type: Number, required: true },
  stockAlert: { type: Number },
  discount: { type: Number },
  // Calculated fields
  productProfit: { type: Number },
  profitMargin: { type: Number },
  taxType: { type: String },
  expiryDate: { type: Date }
}, { 
  _id: false,
  minimize: false 
});

// Batch schema for restaurant products
const batchSchema = new Schema<IBatch>({
  batchNumber: { type: String },
  expiryDate: { type: Date },
  productQty: { type: Number },
  totalProductWeight: { type: Number },
  orderTax: { type: Number },
  productCost: { type: Number },
  productPrice: { type: Number },
  discount: { type: Number },
  // Calculated fields
  productProfit: { type: Number },
  profitMargin: { type: Number },
  stockAlert: { type: Number },
  taxType: { type: String },
  variationValues: { type: Map, of: variationSchema }
}, { 
  _id: false,
  minimize: false 
});

// Warehouse schema for both restaurant and retail
const warehouseSchema = new Schema<IWarehouse>({
  warehouseName: { type: String, required: true },
  productQty: { type: Number },
  totalProductWeight: { type: Number },
  code: { type: String },
  orderTax: { type: Number },
  productCost: { type: Number },
  productPrice: { type: Number },
  discount: { type: Number },
  // Calculated fields
  productProfit: { type: Number },
  profitMargin: { type: Number },
  stockAlert: { type: Number },
  taxType: { type: String },
  variationType: { type: String },
  variationValues: { type: Map, of: variationSchema },
  batches: { type: [batchSchema], default: [] }
}, { 
  _id: false,
  minimize: false 
});

// Main Product schema
const productSchema = new Schema({
  // Common fields
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, trim: true },
  brand: { type: String, trim: true },
  category: { type: String, required: true, trim: true },
  barcode: { type: String, trim: true },
  image: { type: String },
  unit: { type: String, required: true, trim: true },
  saleUnit: { type: String, trim: true },
  purchase: { type: String, trim: true },
  ptype: { type: String, enum: ['Single', 'Variation'], required: true },
  quantityLimit: { type: Number },
  weightLimitation: { type: Number },
  supplier: { type: String, trim: true },
  warehouse: { type: Map, of: warehouseSchema },
  variation: { type: String, trim: true },
  status: { type: String, default: 'Pending', enum: ['Pending', 'Active', 'Inactive'] },
  note: { type: String, trim: true },
  expiryDate: { type: Date },
  
  // Restaurant-specific fields
  isInventory: { type: Boolean }
}, { 
  timestamps: true,
  minimize: false 
});

// Indexes for better query performance
productSchema.index({ name: 1 });
// code index is already created by unique: true in schema definition
productSchema.index({ category: 1 });
productSchema.index({ status: 1 });

// Enhanced cleanup function with proper typing (no batches/weight)
const cleanObject = (obj: any, ptype: string, isInventory: boolean): any => {
  if (!obj || typeof obj !== 'object') return obj;

  const cleaned = { ...obj };
  
  // Define fields to remove based on conditions
  const fieldsToRemove: string[] = [];

  // Remove retail-specific fields (legacy cleanup)
  fieldsToRemove.push('barcodeType', 'isWholesale', 'wholesalePrice', 'wholesaleQuantity', 'warranty');
  
  // Remove wholesale fields from warehouse
  if (cleaned.wholesaleEnabled !== undefined) fieldsToRemove.push('wholesaleEnabled', 'wholesaleMinQty', 'wholesalePrice');
  
  // Remove inventory-related fields if inventory is disabled
  if (!isInventory) {
    fieldsToRemove.push('productQty', 'stockAlert');
  }

  // Remove zero/empty optional fields
  if (cleaned.orderTax === 0 || cleaned.orderTax === undefined) fieldsToRemove.push('orderTax');
  if (cleaned.discount === 0 || cleaned.discount === undefined) fieldsToRemove.push('discount');
  if (cleaned.productProfit === 0 || cleaned.productProfit === undefined) fieldsToRemove.push('productProfit');
  if (cleaned.profitMargin === 0 || cleaned.profitMargin === undefined) fieldsToRemove.push('profitMargin');
  if (cleaned.taxType === 'Exclusive' || !cleaned.taxType) fieldsToRemove.push('taxType');
  if (cleaned.totalProductWeight === 0 || cleaned.totalProductWeight === undefined) fieldsToRemove.push('totalProductWeight');
  if (!cleaned.code || String(cleaned.code).trim() === '') fieldsToRemove.push('code');

  // Remove the identified fields
  fieldsToRemove.forEach(field => {
    if (field in cleaned) {
      delete cleaned[field];
    }
  });

  // Recursively clean nested objects
  if (cleaned.warehouse && typeof cleaned.warehouse === 'object') {
    if (cleaned.warehouse instanceof Map) {
      const cleanedWarehouse = new Map();
      for (const [key, value] of cleaned.warehouse) {
        cleanedWarehouse.set(key, cleanObject(value, ptype, isInventory));
      }
      cleaned.warehouse = cleanedWarehouse;
    } else {
      for (const [key, value] of Object.entries(cleaned.warehouse)) {
        cleaned.warehouse[key] = cleanObject(value, ptype, isInventory);
      }
    }
  }

  // Clean variationValues map
  if (cleaned.variationValues && cleaned.variationValues instanceof Map) {
    const cleanedVariationValues = new Map();
    for (const [key, value] of cleaned.variationValues) {
      cleanedVariationValues.set(key, cleanObject(value, ptype, isInventory));
    }
    cleaned.variationValues = cleanedVariationValues;
  }

  return cleaned;
};

// Enhanced pre-save middleware with better cleanup and proper typing
productSchema.pre('save', function(next) {
  const product = this as any;
  const errors: string[] = [];
  const isInventory = product.isInventory === true;
  const ptype = product.ptype;

  // Clean the entire product document
  const cleanedProduct = cleanObject(product.toObject(), ptype, isInventory);
  
  // Set the cleaned data back to the document
  product.set(cleanedProduct);

  // Validation logic
  const computeProfitMetrics = (price?: number | null, cost?: number | null, discount?: number | null) => {
    const safePrice = typeof price === 'number' ? price : 0;
    const safeCost = typeof cost === 'number' ? cost : 0;
    const safeDiscount = typeof discount === 'number' ? discount : 0;
    const netRevenue = Math.max(0, safePrice - safeDiscount);
    const profit = netRevenue - safeCost;
    const margin = netRevenue > 0 ? (profit / netRevenue) * 100 : 0;
    return { profit, margin };
  };

  if (product.warehouse) {
    for (const [warehouseName, warehouseData] of product.warehouse) {
      const warehouse = warehouseData as IWarehouse;
      
      // No batches: validate warehouse-level fields only
      if (ptype === 'Single') {
        const wm = computeProfitMetrics(warehouse.productPrice, warehouse.productCost, warehouse.discount);
        warehouse.productProfit = wm.profit;
        warehouse.profitMargin = wm.margin;
        
        if (isInventory && (warehouse.stockAlert === undefined || warehouse.stockAlert === null)) {
          errors.push(`${warehouseName} stockAlert is required`);
        }
        if (isInventory && (warehouse.productQty === undefined || warehouse.productQty === null)) {
          errors.push(`${warehouseName} productQty is required`);
        }
        if (warehouse.productCost === undefined || warehouse.productCost === null) {
          errors.push(`${warehouseName} productCost is required`);
        }
        if (warehouse.productPrice === undefined || warehouse.productPrice === null) {
          errors.push(`${warehouseName} productPrice is required`);
        }
      } else if (ptype === 'Variation') {
        if (warehouse.variationValues) {
          for (const [variationName, variation] of warehouse.variationValues) {
            const variationData = variation as IVariation;
            const vm = computeProfitMetrics(variationData.productPrice, variationData.productCost, variationData.discount);
            variationData.productProfit = vm.profit;
            variationData.profitMargin = vm.margin;
            
            if (isInventory && (variationData.stockAlert === undefined || variationData.stockAlert === null)) {
              errors.push(`${warehouseName} variation ${variationName} stockAlert is required`);
            }
            if (isInventory && (variationData.productQty === undefined || variationData.productQty === null)) {
              errors.push(`${warehouseName} variation ${variationName} productQty is required`);
            }
            if (variationData.productCost === undefined || variationData.productCost === null) {
              errors.push(`${warehouseName} variation ${variationName} productCost is required`);
            }
            if (variationData.productPrice === undefined || variationData.productPrice === null) {
              errors.push(`${warehouseName} variation ${variationName} productPrice is required`);
            }
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    const error = new Error(`Validation failed: ${errors.join(', ')}`);
    (error as any).name = 'ValidationError';
    return next(error);
  }

  next();
});

export interface IProduct extends Document {
  name: string;
  code: string;
  brand?: string;
  category: string;
  barcode?: string;
  image?: string;
  unit: string;
  saleUnit: string;
  purchase: string;
  ptype: 'Single' | 'Variation';
  quantityLimit?: number;
  weightLimitation?: number;
  supplier?: string;
  warehouse: Map<string, IWarehouse>;
  variation?: string;
  status: 'Pending' | 'Active' | 'Inactive';
  note?: string;
  expiryDate?: Date;
  
  // Restaurant-specific
  isInventory?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default mongoose.model<IProduct>('Product', productSchema);