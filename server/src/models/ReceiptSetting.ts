import mongoose, { Document, Schema } from 'mongoose';

export interface IReceiptSetting extends Document {
  showNote: boolean;
  showAddress: boolean;
  showBarcode: boolean;
  showTax: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showLogo: boolean;
  showCustomer: boolean;
  showDiscountShipping: boolean;
  showProductCode: boolean;
  logoUrl?: string;
  note: string;
}

const receiptSettingSchema = new Schema({
  showNote: { type: Boolean },
  showAddress: { type: Boolean }, 
  showBarcode: { type: Boolean },
  showTax: { type: Boolean },
  showPhone: { type: Boolean },
  showEmail: { type: Boolean },
  showLogo: { type: Boolean },
  showCustomer: { type: Boolean },
  showDiscountShipping: { type: Boolean },
  showProductCode: { type: Boolean },
  logoUrl: { type: String, default: '' },
  note: { type: String } 
}, { timestamps: true });

export default mongoose.model<IReceiptSetting>('ReceiptSetting', receiptSettingSchema);