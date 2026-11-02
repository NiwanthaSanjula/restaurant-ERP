import mongoose, { Document, Schema } from 'mongoose';

export interface ICurrency extends Document {
  name: string;
  code: string;
  symbol: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CurrencySchema = new Schema<ICurrency>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    symbol: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model<ICurrency>('Currency', CurrencySchema);
