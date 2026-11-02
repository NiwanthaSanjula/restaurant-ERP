import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
  category: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema({
  category: {
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

// Index is automatically created by unique: true in category field

export default mongoose.model<ICategory>('Category', categorySchema);
