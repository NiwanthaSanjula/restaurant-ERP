import mongoose, { Document, Schema } from 'mongoose';
import { PREFIX_MAX_LENGTH } from '../constants/prefix';

export interface IPrefixSetting extends Document {
  salePrefix: string;
  saleReturnPrefix: string;
  purchasePrefix: string;
  purchaseReturnPrefix: string;
  expensePrefix: string;
  invoicePrefix: string;
  orderPrefix: string;
  customerPrefix: string;
}

const prefixField = (defaultValue: string) => ({
  type: String,
  default: defaultValue,
  trim: true,
  maxlength: [PREFIX_MAX_LENGTH, `Prefix cannot exceed ${PREFIX_MAX_LENGTH} characters`] as [number, string]
});

const prefixSettingSchema = new Schema({
  salePrefix: { type: String, default: 'SL', match: /^[a-zA-Z0-9-_]*$/ },
  saleReturnPrefix: { type: String, default: 'SLR', match: /^[a-zA-Z0-9-_]*$/ },
  purchasePrefix: { type: String, default: 'PR', match: /^[a-zA-Z0-9-_]*$/ },
  purchaseReturnPrefix: { type: String, default: 'PRR', match: /^[a-zA-Z0-9-_]*$/ },
  expensePrefix: { type: String, default: 'EX', match: /^[a-zA-Z0-9-_]*$/ },
  invoicePrefix: { type: String, default: 'INV', match: /^[a-zA-Z0-9-_]*$/ },
  orderPrefix: { type: String, default: 'ORD', match: /^[a-zA-Z0-9-_]*$/ },
  customerPrefix: { type: String, default: 'CUST', match: /^[a-zA-Z0-9-_]*$/ }
}, {
  timestamps: true
});

export default mongoose.model<IPrefixSetting>('PrefixSetting', prefixSettingSchema);
