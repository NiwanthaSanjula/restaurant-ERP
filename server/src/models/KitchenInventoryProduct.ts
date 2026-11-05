import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IKitchenInventoryProduct extends Document {
  name: string;
  isSellable: boolean;
  unitId: Types.ObjectId;
  /** Optional link to POS Product (isInventory SKU) — stock alert is read from its warehouse */
  inventoryProductId?: Types.ObjectId | null;
  currentStock: number;
  lastPurchasePrice?: number;
  averageCost?: number;
  minStockLevel?: number;
  description?: string;
  warehouseIssueConversion?: {
    productId: Types.ObjectId; sourceUnitId: Types.ObjectId; stockUnit: string; sourceShort: string;
    kitchenUnitId: Types.ObjectId; kitchenShort: string; warehouseQuantity: number; kitchenQuantity: number;
    factor: number; revision: number; confirmedBy: Types.ObjectId; confirmedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const kitchenInventoryProductSchema = new Schema<IKitchenInventoryProduct>(
  {
    isSellable: { type: Boolean, default: false, validate: (value: boolean) => value === false },
    warehouseIssueConversion: {
      type: new Schema({
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        sourceUnitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
        stockUnit: { type: String, required: true }, sourceShort: { type: String, required: true },
        kitchenUnitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true }, kitchenShort: { type: String, required: true },
        warehouseQuantity: { type: Number, required: true }, kitchenQuantity: { type: Number, required: true },
        factor: { type: Number, required: true }, revision: { type: Number, required: true },
        confirmedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, confirmedAt: { type: Date, required: true }
      }, { _id: false }), default: undefined
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters']
    },
    unitId: {
      type: Schema.Types.ObjectId,
      ref: 'Unit',
      required: [true, 'Unit is required']
    },
    inventoryProductId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      default: null
    },
    currentStock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Stock cannot be negative']
    },
    lastPurchasePrice: {
      type: Number,
      min: [0, 'Price cannot be negative']
    },
    averageCost: {
      type: Number,
      min: [0, 'Cost cannot be negative']
    },
    minStockLevel: {
      type: Number,
      min: [0, 'Minimum stock cannot be negative']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters']
    }
  },
  { timestamps: true }
);

kitchenInventoryProductSchema.index({ name: 1 });
kitchenInventoryProductSchema.index({ unitId: 1 });
kitchenInventoryProductSchema.index({ inventoryProductId: 1 });

export default mongoose.model<IKitchenInventoryProduct>(
  'KitchenInventoryProduct',
  kitchenInventoryProductSchema
);
