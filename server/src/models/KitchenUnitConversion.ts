import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IKitchenUnitConversion extends Document {
  fromUnitId: Types.ObjectId;
  toUnitId: Types.ObjectId;
  /** multiply fromUnit qty by this factor to get toUnit qty (e.g. 1kg -> 1000g, factor=1000) */
  factor: number;
  createdAt: Date;
  updatedAt: Date;
}

const kitchenUnitConversionSchema = new Schema<IKitchenUnitConversion>(
  {
    fromUnitId: {
      type: Schema.Types.ObjectId,
      ref: 'Unit',
      required: true
    },
    toUnitId: {
      type: Schema.Types.ObjectId,
      ref: 'Unit',
      required: true
    },
    factor: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => typeof v === 'number' && v > 0,
        message: 'Conversion factor must be greater than 0'
      }
    }
  },
  { timestamps: true }
);

kitchenUnitConversionSchema.index({ fromUnitId: 1, toUnitId: 1 }, { unique: true });

export default mongoose.model<IKitchenUnitConversion>(
  'KitchenUnitConversion',
  kitchenUnitConversionSchema
);
