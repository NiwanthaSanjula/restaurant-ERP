import mongoose, { ClientSession } from 'mongoose';
import Role from '../models/Role';
import User from '../models/User';
import { checkPermissionInMap, normalizePermissions, permissionMap } from '../config/permissionDefinitions';

export interface RecoveryRole { _id: unknown; isActive: boolean; permissions: unknown }
export interface RecoveryAccount { _id: unknown; isActive: boolean; roleId?: unknown }
export type RecoveryChange =
  | { kind: 'role'; id: string; permissions?: unknown; isActive?: boolean; deleted?: boolean }
  | { kind: 'account'; id: string; roleId?: unknown; isActive?: boolean; deleted?: boolean };

export class RoleRecoveryError extends Error {
  constructor(message = 'Cannot remove role-management access from the last active account. Keep an active account with View Role and Edit Role permissions.', public status = 409) {
    super(message);
    this.name = 'RoleRecoveryError';
  }
}

function hasRoleRecovery(role: RecoveryRole | undefined, requireView: boolean): boolean {
  if (role?.isActive !== true) return false;
  const permissions = permissionMap(normalizePermissions(role.permissions).permissions);
  return checkPermissionInMap(permissions, 'manageRolesAndPermissions', 'edit_role') &&
    (!requireView || checkPermissionInMap(permissions, 'manageRolesAndPermissions', 'view_role'));
}

export const canManageRoles = (role: RecoveryRole | undefined): boolean => hasRoleRecovery(role, true);

/** Match effective grants, never a role name or the legacy User.role label. */
export function assertRoleRecovery(accounts: RecoveryAccount[], roles: RecoveryRole[], change: RecoveryChange): void {
  const count = (users: RecoveryAccount[], entries: RecoveryRole[], requireView: boolean) => {
    const byId = new Map(entries.map(role => [String(role._id), role]));
    return users.filter(user => user.isActive === true && mongoose.isValidObjectId(user.roleId) &&
      hasRoleRecovery(byId.get(String(user.roleId)), requireView)).length;
  };
  const before = count(accounts, roles, true), beforeApi = count(accounts, roles, false);
  if (before === 0 && beforeApi === 0) return; // An existing broken assignment may still be explicitly repaired.
  const nextRoles = change.kind === 'role' ? roles.flatMap(role => {
    if (String(role._id) !== change.id) return [role];
    if (change.deleted) return [];
    return [{ ...role, ...(change.permissions !== undefined ? { permissions: change.permissions } : {}),
      ...(change.isActive !== undefined ? { isActive: change.isActive } : {}) }];
  }) : roles;
  const nextAccounts = change.kind === 'account' ? accounts.flatMap(user => {
    if (String(user._id) !== change.id) return [user];
    if (change.deleted) return [];
    return [{ ...user, ...(change.roleId !== undefined ? { roleId: change.roleId } : {}),
      ...(change.isActive !== undefined ? { isActive: change.isActive } : {}) }];
  }) : accounts;
  if ((before > 0 && count(nextAccounts, nextRoles, true) === 0) ||
      (beforeApi > 0 && count(nextAccounts, nextRoles, false) === 0)) throw new RoleRecoveryError();
}

/**
 * The shared transaction write prevents write skew across different roles/users.
 * A snapshot transaction alone would allow two managers to remove one another.
 * No collection/index is created on import; storage is touched only on a mutation.
 */
export async function protectRoleRecovery<T>(change: RecoveryChange, write: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      try {
        await mongoose.connection.db.collection<{ _id: string; revision: number }>('authorization_guards').updateOne(
          { _id: 'role-management-recovery' }, { $inc: { revision: 1 } }, { upsert: true, session },
        );
      } catch (error) {
        if (error.code === 11000) throw new RoleRecoveryError('Another access change is in progress. Please retry.', 503);
        throw error;
      }
      const roles = await Role.find({}).select('_id isActive permissions').session(session).lean();
      const accounts = await User.find({ isActive: true }).select('_id isActive roleId').session(session).lean();
      assertRoleRecovery(accounts, roles, change);
      result = await write(session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
    return result;
  } catch (error) {
    if (error.code === 20 || error.code === 303) {
      throw new RoleRecoveryError('Access changes require MongoDB transaction support to protect the last role manager. No changes were saved.', 503);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
