import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IRecipeIngredient {
  /** Kitchen inventory product _id (same as API ingredientProductId) */
  kitchenProductId: Types.ObjectId;
  /** Snapshot name from kitchen inventory (spec field) */
  ingredientName?: string;
  quantity: number;
  unit: string;
}

export interface IKitchenRecipe extends Document {
  productId: Types.ObjectId;
  variationName?: string; // For portion control (Small/Large) - matches Sale product variation string
  ingredients: IRecipeIngredient[];
  createdAt: Date;
  updatedAt: Date;
}

const ingredientSchema = new Schema<IRecipeIngredient>(
  {
    kitchenProductId: {
      type: Schema.Types.ObjectId,
      ref: 'KitchenInventoryProduct',
      required: true
    },
    ingredientName: {
      type: String,
      trim: true,
      maxlength: 200
    },
    quantity: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === 'number' && v > 0,
        message: 'Ingredient quantity must be > 0'
      }
    },
    unit: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32
    }
  },
  { _id: false }
);

const kitchenRecipeSchema = new Schema<IKitchenRecipe>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variationName: {
      type: String,
      trim: true,
      default: null
    },
    ingredients: {
      type: [ingredientSchema],
      validate: {
        validator: (v: IRecipeIngredient[]) => Array.isArray(v) && v.length > 0,
        message: 'Recipe must have at least one ingredient'
      }
    }
  },
  { timestamps: true }
);

kitchenRecipeSchema.index({ productId: 1, variationName: 1 }, { unique: true });

export default mongoose.model<IKitchenRecipe>('KitchenRecipe', kitchenRecipeSchema);
