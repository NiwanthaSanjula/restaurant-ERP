import mongoose, { Schema, Document } from 'mongoose';

export interface IAdjustmentItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  productCode: string;
  adjustmentQuantity: number;
  productCost: number;
  subTotal: number; // adjustmentQuantity * productCost
  currentStock: number;
  newStock: number;
  /** For Variation products: which variation (e.g. size, color) was adjusted */
  variationName?: string;
  /** For products with batches: which batch was adjusted */
  batchNumber?: string;
}

export interface IInventoryAdjustment extends Document {
  adjustmentId: string;
  warehouseId: mongoose.Types.ObjectId;
  warehouseName: string;
  adjustmentType: 'Increase' | 'Decrease';
  adjustmentDate: Date;
  items: IAdjustmentItem[];
  reason: 'damage' | 'loss' | 'stock_count' | 'expired' | 'other';
  reasonDetails?: string;
  referenceNumber?: string;
  notes?: string;
  totalAdjustmentValue: number; // sum of all subTotal values
  status: 'Pending' | 'Approved' | 'Completed' | 'Cancelled';
  createdBy: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  approvalDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AdjustmentItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    productName: {
      type: String,
      required: true
    },
    productCode: {
      type: String,
      required: true
    },
    adjustmentQuantity: {
      type: Number,
      required: true,
      min: 0
    },
    productCost: {
      type: Number,
      required: true,
      min: 0
    },
    subTotal: {
      type: Number,
      required: true,
      min: 0
    },
    currentStock: {
      type: Number,
      required: true
    },
    newStock: {
      type: Number,
      required: true,
      min: 0
    },
    variationName: { type: String, trim: true },
    batchNumber: { type: String, trim: true }
  },
  { _id: true }
);

const InventoryAdjustmentSchema = new Schema(
  {
    adjustmentId: {
      type: String,
      required: true,
      unique: true
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true
    },
    warehouseName: {
      type: String,
      required: true,
      trim: true
    },
    adjustmentType: {
      type: String,
      enum: ['Increase', 'Decrease'],
      required: true
    },
    adjustmentDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    items: {
      type: [AdjustmentItemSchema],
      required: true,
      validate: {
        validator: function (v: IAdjustmentItem[]) {
          return v.length > 0;
        },
        message: 'Adjustment must have at least one item'
      }
    },
    reason: {
      type: String,
      enum: ['damage', 'loss', 'stock_count', 'expired', 'other'],
      required: true
    },
    reasonDetails: {
      type: String,
      trim: true
    },
    referenceNumber: {
      type: String,
      trim: true,
      sparse: true,
      unique: true
    },
    notes: {
      type: String,
      trim: true
    },
    totalAdjustmentValue: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Completed', 'Cancelled'],
      default: 'Pending'
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    approvalDate: {
      type: Date
    }
  },
  {
    timestamps: true,
    minimize: false
  }
);

// Indexes for better query performance
InventoryAdjustmentSchema.index({ warehouseId: 1 });
InventoryAdjustmentSchema.index({ adjustmentType: 1 });
InventoryAdjustmentSchema.index({ status: 1 });
InventoryAdjustmentSchema.index({ adjustmentDate: 1 });
InventoryAdjustmentSchema.index({ 'items.productId': 1 });

export default mongoose.model<IInventoryAdjustment>(
  'InventoryAdjustment',
  InventoryAdjustmentSchema
);
