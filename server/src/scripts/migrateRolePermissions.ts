import fs from 'fs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Role from '../models/Role';
import RolePermissions from '../models/RolePermissions';
import User from '../models/User';
import { normalizePermissions, RolePermission } from '../config/permissionDefinitions';

interface SnapshotRole { id: string; name: string; isActive: boolean; permissions: unknown }
interface SnapshotLegacy { roleName: string; permissions: Record<string, Record<string, boolean>> }
interface SnapshotUser { id: string; roleId?: string; role?: string }
export interface PermissionSnapshot { roles: SnapshotRole[]; legacyRoles: SnapshotLegacy[]; users: SnapshotUser[] }
interface RolePlan extends SnapshotRole { after: RolePermission[]; issues: string[]; fingerprint: string }
export interface PermissionMigrationPlan { version: 1; roles: RolePlan[]; unassignedUsers: string[]; unmatchedLegacyRoles: string[] }
const fingerprint = (role: SnapshotRole) => crypto.createHash('sha256').update(JSON.stringify({ permissions: role.permissions, isActive: role.isActive })).digest('hex');
const grants = (entries: RolePermission[]) => entries.flatMap(entry => Object.entries(entry.actions).filter(([, granted]) => granted === true).map(([action]) => entry.component + ':' + action)).sort();

/** A lossless planner: neither coarse user labels nor separate legacy grants are used to invent assignments. */
export function planPermissionMigration(snapshot: PermissionSnapshot): PermissionMigrationPlan {
  const roles = snapshot.roles.map(role => {
    const normalized = normalizePermissions(role.permissions);
    const issues = [...normalized.issues];
    if (typeof role.isActive !== 'boolean') issues.push('Missing active status requires review.');
    if (!normalized.permissions.some(entry => Object.values(entry.actions).some(granted => granted === true))) issues.push('No recognized grants; keep denied until explicitly reviewed.');
    const labels = new Set([role.name, ...snapshot.users.filter(user => user.roleId === role.id).map(user => user.role).filter(Boolean)]);
    for (const legacy of snapshot.legacyRoles.filter(entry => labels.has(entry.roleName))) {
      const old = normalizePermissions(Object.entries(legacy.permissions).map(([component, actions]) => ({ component, actions })));
      if (old.issues.length || JSON.stringify(grants(old.permissions)) !== JSON.stringify(grants(normalized.permissions))) {
        issues.push('Separate RolePermissions grants differ; explicit review required. No grants were merged.');
      }
    }
    return { ...role, after: normalized.permissions, issues, fingerprint: fingerprint(role) };
  });
  return {
    version: 1, roles,
    unassignedUsers: snapshot.users.filter(user => !user.roleId || !roles.some(role => role.id === user.roleId)).map(user => user.id),
    unmatchedLegacyRoles: snapshot.legacyRoles.filter(legacy => !snapshot.roles.some(role => role.name === legacy.roleName) && !snapshot.users.some(user => user.role === legacy.roleName && snapshot.roles.some(role => role.id === user.roleId))).map(legacy => legacy.roleName)
  };
}

/** Apply only reviewed, unambiguous, lossless changes; use compare-and-set to reject stale plans. */
export async function applyPermissionMigration(plan: PermissionMigrationPlan) {
  if (plan.version !== 1 || !Array.isArray(plan.roles)) throw new Error('Invalid plan');
  let updated = 0;
  for (const entry of plan.roles) {
    if (entry.issues.length) continue;
    const normalized = normalizePermissions(entry.permissions);
    if (normalized.issues.length || fingerprint(entry) !== entry.fingerprint || JSON.stringify(normalized.permissions) !== JSON.stringify(entry.after)) throw new Error('Plan was modified');
    if (JSON.stringify(entry.permissions) === JSON.stringify(entry.after)) continue;
    const result = await Role.updateOne(
      { _id: entry.id, permissions: entry.permissions, isActive: entry.isActive },
      { $set: { permissions: entry.after } }, { runValidators: true }
    );
    if (result.matchedCount !== 1) throw new Error('Stale plan; stop and generate a new dry run');
    updated++;
  }
  return { updated, skipped: plan.roles.filter(role => role.issues.length).length, unassignedUsers: plan.unassignedUsers.length };
}

async function run() {
  const args = process.argv.slice(2);
  const option = (name: string) => args[args.indexOf(name) + 1];
  const snapshotFile = args.includes('--snapshot') ? option('--snapshot') : undefined;
  const output = args.includes('--out') ? option('--out') : undefined;
  const apply = args.includes('--apply');
  if (!snapshotFile && !args.includes('--scan') && !apply) throw new Error('Use --snapshot or --scan for a dry run first.');
  if (apply && (!args.includes('--confirm-reviewed') || !args.includes('--plan') || snapshotFile || args.includes('--scan'))) throw new Error('A reviewed plan and --confirm-reviewed are required.');
  if (snapshotFile) {
    const plan = planPermissionMigration(JSON.parse(fs.readFileSync(snapshotFile, 'utf8')));
    if (output) fs.writeFileSync(output, JSON.stringify(plan, null, 2));
    else process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
    return;
  }
  // No connection is made on import or an offline dry run. This branch requires explicit CLI intent.
  require('dotenv').config();
  if (!process.env.MONGODB_URI) throw new Error('Explicit database configuration is required.');
  const plan = apply ? JSON.parse(fs.readFileSync(option('--plan'), 'utf8')) as PermissionMigrationPlan : undefined;
  if (apply && (plan.version !== 1 || !Array.isArray(plan.roles))) throw new Error('Invalid reviewed plan.');
  if (!apply && !output) throw new Error('--scan requires --out so a reviewable plan is retained.');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    if (apply) {
      process.stdout.write(JSON.stringify(await applyPermissionMigration(plan)) + '\n');
    } else {
      const [roles, legacyRoles, users] = await Promise.all([
        Role.find().lean(), RolePermissions.find().lean(), User.find().select('_id role roleId').lean()
      ]);
      const snapshot: PermissionSnapshot = {
        roles: roles.map(role => ({ id: String(role._id), name: role.name, isActive: role.isActive, permissions: role.permissions })),
        legacyRoles: legacyRoles.map(role => ({ roleName: role.roleName, permissions: role.permissions })),
        users: users.map(user => ({ id: String(user._id), roleId: user.roleId ? String(user.roleId) : undefined, role: user.role }))
      };
      fs.writeFileSync(output, JSON.stringify(planPermissionMigration(snapshot), null, 2));
      process.stdout.write('Dry-run plan written. No records changed.\n');
    }
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) {
  run().catch(() => { process.stderr.write('Permission migration stopped. Review configuration and the dry-run plan; no automatic recovery was attempted.\n'); process.exitCode = 1; });
}
