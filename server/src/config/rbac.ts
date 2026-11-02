import mongoose from 'mongoose';
import Role from '../models/Role';
import { normalizePermissions, permissionMap, PermissionMap } from './permissionDefinitions';
export * from './permissionDefinitions';

/** User.role is a legacy label. Only the explicitly assigned, active Role authorizes requests. */
export async function resolveRoleAccess(user: { roleId?: unknown }): Promise<{ roleId: string; roleName: string; permissions: PermissionMap } | null> {
  const id = user?.roleId;
  if (!id || !mongoose.isValidObjectId(id)) return null;
  const role = await Role.findById(id).lean();
  if (!role || role.isActive !== true) return null;
  const normalized = normalizePermissions(role.permissions);
  if (!normalized.permissions.some(entry => Object.values(entry.actions).some(granted => granted === true))) return null;
  return { roleId: String(role._id), roleName: role.name, permissions: permissionMap(normalized.permissions) };
}

export async function getRolePermissions(user: { roleId?: unknown }): Promise<PermissionMap | null> {
  return (await resolveRoleAccess(user))?.permissions ?? null;
}
