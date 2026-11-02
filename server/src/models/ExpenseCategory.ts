import mongoose, { Document, Schema } from 'mongoose';

export interface IExpenseCategory extends Document {
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const expenseCategorySchema = new Schema({
  name: {
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

export default mongoose.model<IExpenseCategory>('ExpenseCategory', expenseCategorySchema);
