import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IKitchenInventoryProduct extends Document {
  name: string;
  unitId: Types.ObjectId;
  /** Optional link to POS Product (isInventory SKU) — stock alert is read from its warehouse */
  inventoryProductId?: Types.ObjectId | null;
  currentStock: number;
  lastPurchasePrice?: number;
  averageCost?: number;
  minStockLevel?: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const kitchenInventoryProductSchema = new Schema<IKitchenInventoryProduct>(
  {
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
