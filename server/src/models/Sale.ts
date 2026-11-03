import mongoose, { Document, Schema, Types } from 'mongoose';
import { formatDateOnlyParts, getZonedParts } from '../utils/timezone';

// Product item schema (stored inside sale document)
interface ISaleProduct {
  productId: string;
  productName: string;
  variation: string | null;
  batch: string | null;
  stockQtyAtSale: number;
  qty: number;
  price: number;
  discount: number;
  discountType: 'fixed' | 'percentage';
  tax: number;
  subtotal: number;
  cost: number;
}

// Payment record (for payment history / Create Payment)
export interface ISalePayment {
  date: Date;
  reference?: string;
  paymentType: 'cash' | 'card' | 'bankTransfer';
  amount: number;
}

const salePaymentSchema = new Schema<ISalePayment>({
  date: { type: Date, required: true, default: Date.now },
  reference: { type: String, default: '' },
  paymentType: { type: String, enum: ['cash', 'card', 'bankTransfer'], required: true },
  amount: { type: Number, required: true, min: 0 }
}, { _id: false });

const saleProductSchema = new Schema<ISaleProduct>({
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  variation: { type: String, default: null },
  batch: { type: String, default: null },
  stockQtyAtSale: { type: Number, required: true },
  qty: { type: Number, required: true, min: 0 },
  price: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  discountType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  tax: { type: Number, default: 0, min: 0 },
  subtotal: { type: Number, required: true, min: 0 },
  cost: { type: Number, required: true, min: 0 }
}, { _id: false });

// Main Sale schema (restaurant-only)
export interface ISale extends Document {
  invoiceId?: string;
  serviceType?: 'dine-in' | 'takeaway' | 'delivery';
  tableId?: string;
  warehouseId: string;
  customerId: string;
  referenceQuotationId?: Types.ObjectId | string | null;
  date: Date;
  businessType: 'restaurant';
  status: 'ordered' | 'pending' | 'completed' | 'draft' | 'cancelled' | 'returned';
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  saleType: 'pos' | 'non-pos';
  products: ISaleProduct[];
  saleDiscountValue: number;
  saleDiscountType: 'fixed' | 'percentage';
  saleTaxValue: number;
  shippingCost: number;
  total: number;
  balance: number;
  profit: number;
  cashAmount: number;
  cardAmount: number;
  bankTransferAmount: number;
  cashTendered?: number;
  changeAmount?: number;
  specialOfferDiscount?: number;
  checkoutRequestId?: string;
  checkoutFingerprint?: string;
  specialOfferId?: Types.ObjectId;
  posSessionId?: Types.ObjectId;
  payments?: ISalePayment[];
  createdBy: Types.ObjectId; // User ID who created the sale
  cancelledBy?: Types.ObjectId; // User ID who cancelled the sale
  cancelledAt?: Date; // When the sale was cancelled
  /** Set when kitchen ingredient deduction has been applied for this sale */
  kitchenDeductionAppliedAt?: Date;
  /** Set when inventory product warehouse stock deduction has been applied for this sale */
  mainStockDeductionAppliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const saleSchema = new Schema<ISale>({
  invoiceId: { type: String, unique: true, sparse: true },
  serviceType: { type: String, enum: ['dine-in', 'takeaway', 'delivery'], default: 'takeaway' },
  tableId: { type: String, default: '' },
  warehouseId: { type: String, required: true },
  customerId: { type: String, required: true },
  date: { type: Date, required: true, default: Date.now },
  businessType: { type: String, enum: ['restaurant'], required: true, default: 'restaurant' },
  status: { type: String, enum: ['ordered', 'pending', 'completed', 'draft', 'cancelled', 'returned'], required: true, default: 'ordered' },
  paymentStatus: { type: String, enum: ['paid', 'partial', 'unpaid'], required: true, default: 'unpaid' },
  saleType: { type: String, enum: ['pos', 'non-pos'], default: 'non-pos' },
  products: { type: [saleProductSchema], required: true, default: [] },
  saleDiscountValue: { type: Number, default: 0, min: 0 },
  saleDiscountType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  saleTaxValue: { type: Number, default: 0, min: 0 },
  shippingCost: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  balance: { type: Number, required: true, min: 0 },
  profit: { type: Number, required: true, default: 0 },
  cashAmount: { type: Number, default: 0, min: 0 },
  cardAmount: { type: Number, default: 0, min: 0 },
  bankTransferAmount: { type: Number, default: 0, min: 0 },
  cashTendered: { type: Number, min: 0 },
  changeAmount: { type: Number, min: 0 },
  specialOfferDiscount: { type: Number, min: 0 },
  checkoutRequestId: { type: String },
  checkoutFingerprint: { type: String },
  specialOfferId: { type: Schema.Types.ObjectId, ref: 'SpecialOffer' },
  posSessionId: { type: Schema.Types.ObjectId, ref: 'PosSession' },
  referenceQuotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', default: null },
  payments: { type: [salePaymentSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  cancelledAt: { type: Date },
  kitchenDeductionAppliedAt: { type: Date },
  mainStockDeductionAppliedAt: { type: Date }
}, {
  timestamps: true
});

// Pre-save middleware to generate invoice ID
saleSchema.pre('save', async function(this: ISale, next) {
  if (this.isNew && !this.invoiceId && (this.status === 'completed' || (this.saleType === 'pos' && this.status === 'ordered'))) {
    // Generate invoice ID: SAL-YYYYMMDD-XXXXX
    const dateStr = formatDateOnlyParts(getZonedParts()).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
    this.invoiceId = `SAL-${dateStr}-${randomStr}`;
  }
  next();
});

// Indexes for better query performance
saleSchema.index({ warehouseId: 1 });
saleSchema.index({ customerId: 1 });
saleSchema.index({ date: -1 });
saleSchema.index({ businessType: 1 });
saleSchema.index({ status: 1 });
saleSchema.index({ paymentStatus: 1 });
saleSchema.index({ createdBy: 1 });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ posSessionId: 1 });

export default mongoose.model<ISale>('Sale', saleSchema);
