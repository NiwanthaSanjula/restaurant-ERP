import mongoose, { Document, Schema } from 'mongoose';
import { RBAC_COMPONENTS } from '../config/rbac';

export interface IPermission {
  component: string;
  actions: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
  };
}

export interface IRole extends Document {
  name: string;
  description?: string;
  permissions: IPermission[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PermissionSchema = new Schema({
  component: {
    type: String,
    required: true,
   
    enum: RBAC_COMPONENTS
  },
  actions: {
    create: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false }
  }
}, { _id: false });

const RoleSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  permissions: [PermissionSchema],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const hasAnyGrantedPermission = (permissions: IPermission[] = []): boolean =>
  Array.isArray(permissions) &&
  permissions.some((permission) =>
    Boolean(
      permission?.actions?.create ||
      permission?.actions?.read ||
      permission?.actions?.update ||
      permission?.actions?.delete
    )
  );

// Enforce at schema level so no API path can create/update a role with zero granted actions.
RoleSchema.path('permissions').validate(function (value: IPermission[]) {
  return hasAnyGrantedPermission(value);
}, 'At least one permission must be selected');

export default mongoose.model<IRole>('Role', RoleSchema);