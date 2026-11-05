import mongoose, { Schema, Document } from 'mongoose';

export interface IPurchase extends Document {
  purchaseId: string;
  supplierId: mongoose.Types.ObjectId;
  warehouseId: mongoose.Types.ObjectId;
  purchaseDate: Date;
  items: {
    productId: mongoose.Types.ObjectId;
    quantity: number; 
    cost: number;    
    subTotal: number;
    stockUnit?: string;
  }[];
  subtotal: number;
  discount: number;
  discountType: 'fixed' | 'percentage';
  tax: number;
  taxType: 'fixed' | 'percentage';
  grandTotal: number;
  paymentStatus: 'Paid' | 'Partial' | 'Unpaid';
  paymentMethod?: string;
  purchaseStatus: 'Received' | 'Pending' | 'Ordered';
  createdBy: mongoose.Types.ObjectId;
  stockReceiptVersion?: number;
  stockReceivedAt?: Date;
  createPayloadHash?: string;
}

const PurchaseSchema: Schema = new Schema({
  purchaseId: { type: String, required: true, unique: true },
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  purchaseDate: { type: Date, default: Date.now },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    cost: { type: Number, required: true },
    subTotal: { type: Number, required: true },
    stockUnit: { type: String }
  }],
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  discountType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  tax: { type: Number, default: 0 },
  taxType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  grandTotal: { type: Number, required: true },
  paymentStatus: { type: String, enum: ['Paid', 'Partial', 'Unpaid'], default: 'Unpaid' },
  paymentMethod: { type: String },
  purchaseStatus: { type: String, enum: ['Received', 'Pending', 'Ordered'], default: 'Received' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  stockReceiptVersion: { type: Number },
  stockReceivedAt: { type: Date },
  createPayloadHash: { type: String }
}, { timestamps: true });

export default mongoose.model<IPurchase>('Purchase', PurchaseSchema);
