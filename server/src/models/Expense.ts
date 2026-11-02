import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';

export interface IExpense extends Document {
  date: Date;
  title: string;
  warehouse: mongoose.Types.ObjectId;
  category: mongoose.Types.ObjectId;
  amount: number;
  details?: string;
  reference: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema({
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  warehouse: {
    type: Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'ExpenseCategory',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  details: {
    type: String,
    trim: true
  },
  reference: {
    type: String,
    unique: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Pre-save middleware to generate reference
// Uses crypto.randomBytes for stronger uniqueness and retries up to 5 times
// to guard against collisions in high-concurrency environments (BUG-083 / POS-161).
expenseSchema.pre('save', async function(this: IExpense, next) {
  if (this.isNew && !this.reference) {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const MAX_ATTEMPTS = 5;
    let generated = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // 4 random bytes → 8 uppercase hex chars → ~4 billion combinations
      const randomStr = crypto.randomBytes(4).toString('hex').toUpperCase();
      const candidate = `EXP-${dateStr}-${randomStr}`;

      // Verify no existing document already holds this reference
      const conflict = await (this.constructor as typeof mongoose.Model)
        .findOne({ reference: candidate })
        .lean()
        .exec();

      if (!conflict) {
        this.reference = candidate;
        generated = true;
        break;
      }
    }

    if (!generated) {
      return next(new Error(
        `Unable to generate a unique expense reference after ${MAX_ATTEMPTS} attempts. Please retry the request.`
      ));
    }
  }
  next();
});

export default mongoose.model<IExpense>('Expense', expenseSchema);
