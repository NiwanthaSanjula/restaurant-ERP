import mongoose, { Document, Schema } from 'mongoose';

export interface ITable extends Document {
  _id: string;
  tableNumber: number;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
  currentOrder?: mongoose.Types.ObjectId;
  location: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TableSchema = new Schema<ITable>({
  tableNumber: {
    type: Number,
    required: [true, 'Table number is required'],
    unique: true,
    min: 1
  },
  capacity: {
    type: Number,
    required: [true, 'Table capacity is required'],
    min: 1,
    max: 20
  },
  status: {
    type: String,
    enum: ['available', 'occupied', 'reserved', 'cleaning'],
    default: 'available'
  },
  currentOrder: {
    type: Schema.Types.ObjectId,
    ref: 'Order'
  },
  location: {
    type: String,
    required: [true, 'Table location is required'],
    trim: true,
    maxlength: [50, 'Location cannot be more than 50 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model<ITable>('Table', TableSchema);
