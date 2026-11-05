import mongoose, { Document, Schema, Types } from 'mongoose';

export type KitchenMovementType = 'in' | 'out';
export type KitchenMovementSource = 'manual' | 'sale' | 'warehouse_issue';

export interface IKitchenStockMovement extends Document {
  kitchenProductId: Types.ObjectId;
  type: KitchenMovementType;
  quantity: number;
  costAtTime?: number;
  reason?: string;
  note?: string;
  source: KitchenMovementSource;
  saleId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  warehouseIssue?: {
    warehouseId: Types.ObjectId; productId: Types.ObjectId; warehouseName: string; productName: string;
    kitchenName: string; sourceQuantity: number; sourceUnit: string; kitchenUnit: string;
    sourceBefore: number; sourceAfter: number; kitchenBefore: number; kitchenAfter: number;
    factor: number; conversionRevision: number; warehouseQuantity: number; kitchenQuantity: number; requestHash: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const kitchenStockMovementSchema = new Schema<IKitchenStockMovement>(
  {
    kitchenProductId: {
      type: Schema.Types.ObjectId,
      ref: 'KitchenInventoryProduct',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['in', 'out'],
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === 'number' && v > 0,
        message: 'Quantity must be greater than 0'
      }
    },
    costAtTime: {
      type: Number,
      default: function(this: IKitchenStockMovement) { return this.source === 'warehouse_issue' ? undefined : 0; }
    },
    reason: {
      type: String,
      trim: true
    },
    note: {
      type: String,
      trim: true,
      maxlength: [1000, 'Note cannot exceed 1000 characters']
    },
    warehouseIssue: {
      type: new Schema({
        warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        warehouseName: { type: String, required: true }, productName: { type: String, required: true }, kitchenName: { type: String, required: true },
        sourceQuantity: { type: Number, required: true }, sourceUnit: { type: String, required: true }, kitchenUnit: { type: String, required: true },
        sourceBefore: { type: Number, required: true }, sourceAfter: { type: Number, required: true }, kitchenBefore: { type: Number, required: true }, kitchenAfter: { type: Number, required: true },
        factor: { type: Number, required: true }, conversionRevision: { type: Number, required: true },
        warehouseQuantity: { type: Number, required: true }, kitchenQuantity: { type: Number, required: true }, requestHash: { type: String, required: true }
      }, { _id: false }), default: undefined
    },
    source: {
      type: String,
      enum: ['manual', 'sale', 'warehouse_issue'],
      default: 'manual'
    },
    saleId: {
      type: Schema.Types.ObjectId,
      ref: 'Sale',
      index: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

kitchenStockMovementSchema.index({ kitchenProductId: 1, createdAt: -1 });
kitchenStockMovementSchema.index({ saleId: 1, source: 1 });

export default mongoose.model<IKitchenStockMovement>(
  'KitchenStockMovement',
  kitchenStockMovementSchema
);
