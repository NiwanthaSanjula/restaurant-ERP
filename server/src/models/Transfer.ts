import mongoose, { Document, Schema } from 'mongoose';

export interface ITransfer extends Document {
  fromWarehouse: mongoose.Types.ObjectId;
  toWarehouse: mongoose.Types.ObjectId;
  fromWarehouseName: string;
  toWarehouseName: string;
  date: Date;
  reference: string;
  items: Array<{
    productId: mongoose.Types.ObjectId;
    productName: string;
    qty: number;
    cost: number;
    subtotal: number;
  }>;
  subtotal: number;
  tax: number;
  discount: number;
  shipping: number;
  grandTotal: number;
  status: 'Pending' | 'Completed' | 'Cancelled' | 'Approved';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const transferSchema = new Schema({
  fromWarehouse: {
    type: Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  toWarehouse: {
    type: Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  fromWarehouseName: { type: String, required: true },
  toWarehouseName: { type: String, required: true },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  reference: {
    type: String,
    required: true,
    unique: true
  },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    qty: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, default: 0 },
    subtotal: { type: Number, required: true, default: 0 }
  }],
  subtotal: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  shipping: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Cancelled', 'Approved'],
    default: 'Pending'
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

export default mongoose.model<ITransfer>('Transfer', transferSchema);
