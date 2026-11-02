import mongoose, { Document, Schema } from 'mongoose';

export interface IPermission extends Document {
  name: string;
  component: string;
  action: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PermissionSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  component: {
    type: String,
    required: true,
    enum: ['manageUsers', 'manageRoles', 'manageMenu', 'manageOrders', 'manageTables', 'manageWarehouses', 'manageProducts', 'manageBaseUnits', 'manageUnits', 'manageCategories', 'manageBrands', 'manageVariations', 'posOperations', 'reports']
  },
  action: {
    type: String,
    required: true,
    enum: ['create', 'read', 'update', 'delete']
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model<IPermission>('Permission', PermissionSchema);
