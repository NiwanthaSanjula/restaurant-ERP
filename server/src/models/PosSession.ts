import mongoose, { Document, Schema, Types } from 'mongoose';

export type PosStatus = 'OPEN' | 'CLOSED';

export interface IDenominations {
  '20': number;
  '50': number;
  '100': number;
  '500': number;
  '1000': number;
  '5000': number;
  '1': number;
  '2': number;
  '5': number;
  '10': number;
}

export interface IPosSession extends Document {
  userId: Types.ObjectId;
  username: string;
  openTime: Date;
  closeTime?: Date;
  openingCash: number;
  closingCash?: number;
  cashVariance?: number;
  denominations: IDenominations;
  closingDenominations?: IDenominations;
  status: PosStatus;
  createdAt: Date;
  updatedAt: Date;
}

const denominationDefaults: IDenominations = {
  '20': 0,
  '50': 0,
  '100': 0,
  '500': 0,
  '1000': 0,
  '5000': 0,
  '1': 0,
  '2': 0,
  '5': 0,
  '10': 0
};

const denominationSchema = new Schema<IDenominations>({
  '20': { type: Number, default: 0, min: 0 },
  '50': { type: Number, default: 0, min: 0 },
  '100': { type: Number, default: 0, min: 0 },
  '500': { type: Number, default: 0, min: 0 },
  '1000': { type: Number, default: 0, min: 0 },
  '5000': { type: Number, default: 0, min: 0 },
  '1': { type: Number, default: 0, min: 0 },
  '2': { type: Number, default: 0, min: 0 },
  '5': { type: Number, default: 0, min: 0 },
  '10': { type: Number, default: 0, min: 0 }
}, { _id: false });

const posSessionSchema = new Schema<IPosSession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  username: { type: String, required: true, trim: true },
  openTime: { type: Date, default: Date.now, required: true },
  closeTime: { type: Date },
  openingCash: { type: Number, required: true, min: 0 },
  closingCash: { type: Number, min: 0 },
  cashVariance: { type: Number },
  denominations: { type: denominationSchema, default: denominationDefaults, required: true },
  closingDenominations: { type: denominationSchema },
  status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN', required: true }
}, {
  timestamps: true,
  collection: 'pos_sessions'
});

posSessionSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'OPEN' }
  }
);

posSessionSchema.index({ openTime: -1 });
posSessionSchema.index({ status: 1 });

export default mongoose.model<IPosSession>('PosSession', posSessionSchema);
