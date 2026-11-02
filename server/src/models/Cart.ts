import mongoose, { Document, Schema } from 'mongoose';

// Cart item schema
interface ICartItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  image?: string;
  variation?: {
    id: string;
    name: string;
    price: number;
  };
  cartKey: string; // composite key: productId + variationId
}

const cartItemSchema = new Schema<ICartItem>({
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  image: { type: String },
  variation: {
    id: { type: String },
    name: { type: String },
    price: { type: Number }
  },
  cartKey: { type: String, required: true }
}, { _id: false });

// Main Cart schema
export interface ICart extends Document {
  userId: string; // User who owns the cart (from auth token)
  sessionId?: string; // Optional POS session ID
  items: ICartItem[];
  discountType: 'fixed' | 'percentage';
  discount: number;
  shipping: number;
  createdAt: Date;
  updatedAt: Date;
}

const cartSchema = new Schema<ICart>({
  userId: { type: String, required: true },
  sessionId: { type: String },
  items: { type: [cartItemSchema], default: [] },
  discountType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  discount: { type: Number, default: 0, min: 0 },
  shipping: { type: Number, default: 0, min: 0 }
}, {
  timestamps: true
});

// Indexes for better query performance
cartSchema.index({ userId: 1 });
cartSchema.index({ sessionId: 1 });
cartSchema.index({ userId: 1, sessionId: 1 });

// Auto-delete carts older than 7 days (cleanup)
cartSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 }); // 7 days

export default mongoose.model<ICart>('Cart', cartSchema);
