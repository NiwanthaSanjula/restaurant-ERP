import mongoose, { Document, Schema } from 'mongoose';

export interface IVariation extends Document {
  variationName: string;
  normalizedName: string;
  variationType: string[];
  createdAt: Date;
  updatedAt: Date;
}

const VariationSchema = new Schema({
  variationName: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  normalizedName: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  variationType: {
    type: [String],
    required: true,
    lowercase: true,
    validate: {
      validator: function(arr: string[]) {
        return Array.isArray(arr) && arr.length > 0 && arr.every(v => typeof v === 'string' && v.trim().length > 0);
      },
      message: 'variationType must be a non-empty array of strings'
    }
  }
}, { timestamps: true });

VariationSchema.pre('validate', function(next) {
  if (this.variationName) {
    this.normalizedName = this.variationName.replace(/\s+/g, '').toLowerCase();
  }
  next();
});

// Index is automatically created by unique: true in variationName field

export default mongoose.model<IVariation>('Variation', VariationSchema);
