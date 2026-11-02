import mongoose, { Document, Schema } from 'mongoose';

export interface IOTP extends Document {
  _id: string;
  email: string;
  otp: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const OTPSchema = new Schema<IOTP>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  otp: {
    type: String,
    required: [true, 'OTP is required'],
    length: [6, 'OTP must be 6 digits']
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiration date is required'],
    default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
  },
  isUsed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for efficient queries
OTPSchema.index({ email: 1, isUsed: 1 });
OTPSchema.index({ email: 1, otp: 1, isUsed: 1, expiresAt: 1 });
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired OTPs

export default mongoose.model<IOTP>('OTP', OTPSchema);









