import mongoose, { Document, Schema } from 'mongoose';
import { PREFIX_MAX_LENGTH } from '../constants/prefix';
const mobileRegex = /^(?:0\d{9}|\+94\d{9})$/;

// --- Interfaces for Type Safety ---

interface ISystemSettings {
  companyLogo: string;
  defaultEmail: string;
  currency: string;
  companyName: string;
  companyMobile: string;
  whatsappNumber?: string;
  developedBy: string;
  country?: string;
  city?: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY';
  postalCode?: string;
  address: string;
  defaultPosWarehouseId?: string | null;
}

interface IMailSettings {
  mailMailer: string;
  mailHost: string;
  mailPort: number;
  mailSenderName: string;
  mailUsername: string;
  mailEncryption?: string; 
}

interface IPrefixSettings {
  salePrefix: string;
  saleReturnPrefix: string;
  purchasePrefix: string;
  purchaseReturnPrefix: string;
  expensePrefix: string;
}

interface IReceiptSettings {
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
  note?: string;
}

export interface ISetting extends Document {
  system: ISystemSettings;
  mail: IMailSettings;
  prefix: IPrefixSettings;
  receipt: IReceiptSettings;
  createdAt: Date;
  updatedAt: Date;
}

// --- Schema Definition ---

const prefixField = (defaultValue: string) => ({
  type: String,
  required: true,
  default: defaultValue,
  trim: true,
  maxlength: [PREFIX_MAX_LENGTH, `Prefix cannot exceed ${PREFIX_MAX_LENGTH} characters`] as [number, string]
});

const SettingSchema = new Schema<ISetting>({
  system: {
    defaultPosWarehouseId: { type: String, default: undefined },
    companyLogo: { type: String, required: true },
    defaultEmail: { 
      type: String, 
      required: [true, 'Default email is required'],
      match: [/^\w+([\.-]?\w+)*@gmail\.com$/, 'Email must be a valid Gmail address'] 
    },
    currency: { type: String, default: 'LKR' },
    companyName: { type: String, required: true },
    companyMobile: { 
      type: String, 
      required: true,
      validate: {
        validator: function(v: string) {
          return mobileRegex.test(v);
        },
        message: 'Mobile number must be 10 digits starting with 0 or +94 followed by 9 digits.'
      }
    },
    whatsappNumber: { 
      type: String,
      validate: {
        validator: function(v: string) {
          if (!v) return true;
          return mobileRegex.test(v);
        },
        message: 'WhatsApp number must start with +94 or 0'
      }
    },
    developedBy: { type: String, default: 'Qdesk AI Pvt Ltd', immutable: true },
    country: String,
    city: String,
    dateFormat: { type: String, required: true, enum: ['MM/DD/YYYY', 'DD/MM/YYYY'] },
    postalCode: String,
    address: { type: String, required: true }
  },
  mail: {
    mailMailer: { type: String, required: true },
    mailHost: { type: String, required: true },
    mailPort: { type: Number, required: true },
    mailSenderName: { type: String, required: true },
    mailUsername: { type: String, required: true }
  },
  prefix: {
    salePrefix: prefixField('SL'),
    saleReturnPrefix: prefixField('SLR'),
    purchasePrefix: prefixField('PR'),
    purchaseReturnPrefix: prefixField('PRR'),
    expensePrefix: prefixField('EX')
  },
  receipt: {
    showNote: { type: Boolean, default: true },
    showAddress: { type: Boolean, default: true },
    showBarcode: { type: Boolean, default: false },
    showTax: { type: Boolean, default: true },
    showPhone: { type: Boolean, default: true },
    showEmail: { type: Boolean, default: true },
    showLogo: { type: Boolean, default: true },
    showCustomer: { type: Boolean, default: true },
    showDiscountShipping: { type: Boolean, default: true },
    showProductCode: { type: Boolean, default: true },
    note: { type: String }
  }
}, { timestamps: true });

// Custom validation for Receipt Note based on Toggle
SettingSchema.path('receipt.note').validate(function(value: string) {
  // @ts-ignore
  if (this.receipt?.showNote && (!value || value.trim().length === 0)) {
    return false;
  }
  return true;
}, 'Receipt Note is required when "Show Note" is enabled.');

export default mongoose.model<ISetting>('Setting', SettingSchema);
