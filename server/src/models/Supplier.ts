import mongoose, { Schema, Document } from 'mongoose';

export interface ISupplier extends Document {
  name: string;
  companyName?: string;
  mobile?: string;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<ISupplier>({
  name: { type: String, required: true, trim: true },
  companyName: { type: String, trim: true },
  mobile: { type: String, trim: true }
}, { timestamps: true });

supplierSchema.index({ name: 1 }, { collation: { locale: 'en', strength: 2 } });

export default mongoose.model<ISupplier>('Supplier', supplierSchema);
