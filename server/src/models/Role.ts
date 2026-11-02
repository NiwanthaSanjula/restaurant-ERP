import mongoose, { Document, Schema } from 'mongoose';
import { RBAC_COMPONENTS, normalizePermissions } from '../config/permissionDefinitions';

export interface IPermission {
  component: string;
  actions: Record<string, boolean>;
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
  actions: { type: Schema.Types.Mixed, required: true }
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
    Object.values(permission?.actions || {}).some(value => value === true)
  );

// Enforce at schema level so no API path can create/update a role with zero granted actions.
RoleSchema.path('permissions').validate(function (value: IPermission[]) {
  return normalizePermissions(value).issues.length === 0 && hasAnyGrantedPermission(value);
}, 'At least one permission must be selected');

export default mongoose.model<IRole>('Role', RoleSchema);
