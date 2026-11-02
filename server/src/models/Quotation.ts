import mongoose, { Document, Schema } from 'mongoose';

interface IQuotationProduct {
  productId: string;
  productName: string;
  variation: string | null;
  qty: number;
  price: number;
  discount: number;
  discountType: 'fixed' | 'percentage';
  tax: number;
  subtotal: number;
  image?: string;
}

const quotationProductSchema = new Schema<IQuotationProduct>({
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  variation: { type: String, default: null },
  qty: { type: Number, required: true, min: 0 },
  price: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  discountType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  tax: { type: Number, default: 0, min: 0 },
  subtotal: { type: Number, required: true, min: 0 },
  image: { type: String }
}, { _id: false });

export interface IQuotation extends Document {
  quotationId: string;
  warehouseId: string;
  warehouseName?: string;
  customerId: string;
  customerName?: string;
  date: Date;
  validUntil: Date;
  status: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Expired' | 'Converted';
  items: IQuotationProduct[];
  discountValue: number;
  discountType: 'fixed' | 'percentage';
  taxValue: number;
  shippingCost: number;
  total: number;
  notes?: string;
  referenceNumber?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const quotationSchema = new Schema<IQuotation>({
  quotationId: { type: String, required: true, unique: true },
  warehouseId: { type: String, required: true },
  warehouseName: { type: String },
  customerId: { type: String, required: true },
  customerName: { type: String },
  date: { type: Date, required: true, default: Date.now },
  validUntil: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['Draft', 'Sent', 'Approved', 'Rejected', 'Expired', 'Converted'], 
    default: 'Draft' 
  },
  items: { type: [quotationProductSchema], required: true, default: [] },
  discountValue: { type: Number, default: 0, min: 0 },
  discountType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  taxValue: { type: Number, default: 0, min: 0 },
  shippingCost: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  notes: { type: String },
  referenceNumber: { type: String },
  createdBy: { type: String, required: true }
}, {
  timestamps: true
});

// quotationId index is already created by unique: true in schema
quotationSchema.index({ warehouseId: 1 });
quotationSchema.index({ customerId: 1 });
quotationSchema.index({ status: 1 });
quotationSchema.index({ date: -1 });

export default mongoose.model<IQuotation>('Quotation', quotationSchema);
