import mongoose, { Schema, Document } from 'mongoose';

export interface IPurchaseReturnItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  productCode: string;
  returnQuantity: number;
  productCost: number;
  subTotal: number;
  currentStock: number;
  newStock: number;
}

export interface IPurchaseReturn extends Document {
  returnId: string;
  purchaseId?: mongoose.Types.ObjectId;
  supplierId: mongoose.Types.ObjectId;
  supplierName: string;
  warehouseId: mongoose.Types.ObjectId;
  warehouseName: string;
  returnDate: Date;
  items: IPurchaseReturnItem[];
  reason: 'damaged' | 'expired' | 'wrong_item' | 'excess_stock' | 'other';
  reasonDetails?: string;
  referenceNumber?: string;
  notes?: string;
  totalReturnAmount: number;
  status: 'Pending' | 'Completed' | 'Cancelled' | 'Ordered';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseReturnItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    productCode: { type: String, required: true },
    returnQuantity: { type: Number, required: true, min: 0 },
    productCost: { type: Number, required: true, min: 0 },
    subTotal: { type: Number, required: true, min: 0 },
    currentStock: { type: Number, required: true },
    newStock: { type: Number, required: true, min: 0 }
  },
  { _id: true }
);

const PurchaseReturnSchema = new Schema(
  {
    returnId: { type: String, required: true, unique: true },
    purchaseId: { type: Schema.Types.ObjectId, ref: 'Purchase' },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, required: true, trim: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    warehouseName: { type: String, required: true, trim: true },
    returnDate: { type: Date, required: true, default: Date.now },
    items: {
      type: [PurchaseReturnItemSchema],
      required: true,
      validate: {
        validator: (v: IPurchaseReturnItem[]) => v.length > 0,
        message: 'Return must have at least one item'
      }
    },
    reason: {
      type: String,
      enum: ['damaged', 'expired', 'wrong_item', 'excess_stock', 'other'],
      required: true
    },
    reasonDetails: { type: String, trim: true },
    referenceNumber: { type: String, trim: true, sparse: true },
    notes: { type: String, trim: true },
    totalReturnAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Cancelled', 'Ordered'],
      default: 'Completed'
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true, minimize: false }
);

PurchaseReturnSchema.index({ supplierId: 1 });
PurchaseReturnSchema.index({ warehouseId: 1 });
PurchaseReturnSchema.index({ returnDate: -1 });
PurchaseReturnSchema.index({ purchaseId: 1 });

export default mongoose.model<IPurchaseReturn>('PurchaseReturn', PurchaseReturnSchema);
