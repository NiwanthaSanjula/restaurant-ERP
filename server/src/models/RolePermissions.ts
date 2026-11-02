import mongoose, { Document, Schema } from 'mongoose';

/**
 * PermissionMap: nested structure mapping component → action → boolean
 * e.g. { manageMenu: { create_menu: true, view_menu: true }, ... }
 */
export interface PermissionMap {
  [component: string]: {
    [action: string]: boolean;
  };
}

export interface IRolePermissions extends Document {
  roleName: string;
  permissions: PermissionMap;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RolePermissionsSchema = new Schema(
  {
    roleName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    permissions: {
      type: Schema.Types.Mixed,
      required: true,
      default: {}
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IRolePermissions>('RolePermissions', RolePermissionsSchema);
