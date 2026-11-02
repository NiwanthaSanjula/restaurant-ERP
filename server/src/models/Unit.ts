import mongoose, { Document, Schema } from 'mongoose';

export interface IUnit extends Document {
  unitName: string;
  shortName: string;
  businessType?: string;
  createdAt: Date;
  updatedAt: Date;
}

const unitSchema = new Schema({
  unitName: {
    type: String,
    required: true,
    trim: true
  },
  shortName: {
    type: String,
    required: true,
    trim: true
  },
  businessType: {
    type: String,
    required: false,
    default: 'restaurant'
  }
}, {
  timestamps: true
});

// Indexes for better query performance
unitSchema.index({ unitName: 1 });

export default mongoose.model<IUnit>('Unit', unitSchema);