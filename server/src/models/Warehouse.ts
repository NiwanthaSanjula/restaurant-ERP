import mongoose, { Document, Schema } from 'mongoose';

export interface IWarehouse extends Document {
  name: string;
  country?: string;
  location?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WarehouseSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  country: {
    type: String,
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better query performance
WarehouseSchema.index({ isActive: 1 });

export default mongoose.model<IWarehouse>('Warehouse', WarehouseSchema);
