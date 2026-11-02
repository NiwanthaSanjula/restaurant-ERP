import mongoose, { Document, Schema } from 'mongoose';

export interface ISaleReturnItem {
  productId: string;
  productName: string;
  variation: string | null;
  batch: string | null;
  returnQty: number;
  originalQty: number; // qty sold in original sale
  unitPrice: number;
  subtotal: number;
  originalSubtotal: number;
}

export interface ISaleReturn extends Document {
  returnId: string;
  saleId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  customerName: string;
  warehouseId: mongoose.Types.ObjectId;
  warehouseName: string;
  returnDate: Date;
  items: ISaleReturnItem[];
  reason: 'damaged' | 'expired' | 'wrong_item' | 'other' | 'customer_request';
  reasonDetails?: string;
  notes?: string;
  totalReturnAmount: number;
  refundAmount: number;
  status: 'Pending' | 'Completed' | 'Cancelled';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SaleReturnItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    variation: { type: String, default: null },
    batch: { type: String, default: null },
    returnQty: { type: Number, required: true, min: 1 },
    originalQty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    originalSubtotal: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const SaleReturnSchema = new Schema(
  {
    returnId: { type: String, required: true, unique: true },
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: { type: String, required: true, trim: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    warehouseName: { type: String, required: true, trim: true },
    returnDate: { type: Date, required: true, default: Date.now },
    items: {
      type: [SaleReturnItemSchema],
      required: true,
      validate: {
        validator: (v: ISaleReturnItem[]) => v.length > 0,
        message: 'Return must have at least one item'
      }
    },
    reason: {
      type: String,
      enum: ['damaged', 'expired', 'wrong_item', 'other', 'customer_request'],
      required: true
    },
    reasonDetails: { type: String, trim: true },
    notes: { type: String, trim: true },
    totalReturnAmount: { type: Number, required: true, min: 0 },
    refundAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Cancelled'],
      default: 'Completed'
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true, minimize: false }
);

// Indexes for better query performance
SaleReturnSchema.index({ customerId: 1 });
SaleReturnSchema.index({ warehouseId: 1 });
SaleReturnSchema.index({ saleId: 1 });
SaleReturnSchema.index({ returnDate: -1 });
SaleReturnSchema.index({ createdAt: -1 });

export default mongoose.model<ISaleReturn>('SaleReturn', SaleReturnSchema);
