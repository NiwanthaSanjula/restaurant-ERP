import mongoose, { Document, Schema } from 'mongoose';

export interface IDailyOrderCounter extends Document {
  prefix: string;
  date: string;
  seq: number;
}

const dailyOrderCounterSchema = new Schema<IDailyOrderCounter>({
  prefix: { type: String, required: true },
  date: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 }
});

dailyOrderCounterSchema.index({ prefix: 1, date: 1 }, { unique: true });

export default mongoose.model<IDailyOrderCounter>('DailyOrderCounter', dailyOrderCounterSchema);
