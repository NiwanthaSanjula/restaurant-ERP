import mongoose, { Document, Schema } from 'mongoose';

export interface IBaseUnit extends Document {
  BaseUnitName: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const baseUnitSchema = new Schema({
  BaseUnitName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

// Index is automatically created by unique: true in BaseUnitName field

export default mongoose.model<IBaseUnit>('BaseUnit', baseUnitSchema);
