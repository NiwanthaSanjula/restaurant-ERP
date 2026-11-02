import mongoose, { Document, Schema } from 'mongoose';

export interface IBrand extends Document {
  brandName: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const brandSchema = new Schema({
  brandName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index is automatically created by unique: true in brandName field

export default mongoose.model<IBrand>('Brand', brandSchema);
