import mongoose, { Document, Schema, Types } from 'mongoose';

export type KitchenMovementType = 'in' | 'out';
export type KitchenMovementSource = 'manual' | 'sale';

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
      default: 0
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
    source: {
      type: String,
      enum: ['manual', 'sale'],
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
