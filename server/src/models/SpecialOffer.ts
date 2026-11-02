import mongoose, { Schema, Document } from 'mongoose';

export interface ISpecialOffer extends Document {
  offerName: string;
  percentage: number;
  endDate?: Date;
  createdBy: string;
  status: 'Active' | 'Expired' | 'Disabled';
  createdAt: Date;
  updatedAt: Date;
}

const specialOfferSchema = new Schema({
  offerName: { 
    type: String, 
    required: true,
    trim: true,
    unique: true 
  },
  percentage: { 
    type: Number, 
    required: true, 
    min: 0,  
    max: 100,  
  },
  endDate: { 
    type: Date,
    required: false 
  },
  createdBy: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['Active', 'Expired', 'Disabled'], 
    default: 'Active' 
  }
}, { 
  timestamps: true 
});

export default mongoose.model<ISpecialOffer>('SpecialOffer', specialOfferSchema);