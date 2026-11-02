import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomer extends Document {
  name: string;
  mobile: string;
  NIC?: string;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>({
  name: { type: String, required: true, trim: true },
  mobile: { type: String, required: true, trim: true },
  NIC: { type: String, trim: true },
  address: { type: String, trim: true }
}, { timestamps: true });

customerSchema.index({ name: 1 });
customerSchema.index({ mobile: 1 });
customerSchema.index({ NIC: 1 });

export default mongoose.model<ICustomer>('Customer', customerSchema);

