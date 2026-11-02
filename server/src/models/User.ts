import bcrypt from 'bcryptjs';
import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  password?: string;
  role: 'admin' | 'manager' | 'staff';
  roleId?: mongoose.Types.ObjectId;
  mobileNumber?: string; 
  image?: string;        
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  passwordHash: {
    type: String,
    required: [true, 'Password hash is required'],
    select: false
  },
  password: {
    type: String,
    required: false,
    select: false
  },
  role: {
    type: String,
    enum: ['admin', 'manager', 'staff'],
    default: 'staff'
  },
  roleId: {
    type: Schema.Types.ObjectId,
    ref: 'Role',
    required: false
  },
  
  mobileNumber: {
    type: String,
    required: false,
    trim: true
  },
  image: {
    type: String,
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  const hash = this.passwordHash || this.password;
  if (!hash) {
    return false;
  }
  return bcrypt.compare(candidatePassword, hash);
};

export default mongoose.model<IUser>('User', UserSchema);