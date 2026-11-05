import './demoSeed/env';
import { execFileSync } from 'child_process';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User';
import Role from '../models/Role';
import { PUBLIC_DEMO_USER_ID, PUBLIC_DEMO_ROLE_ID, PUBLIC_DEMO_EMAIL, PUBLIC_DEMO_PERMISSIONS, validPublicDemoIdentity } from '../config/publicDemo';
import { permissionMap, normalizePermissions } from '../config/rbac';

const roleName = 'Public Read-only Visitor';
export async function provisionPublicDemo(apply = false) {
  const db = mongoose.connection.db;
  const userId = new mongoose.Types.ObjectId(PUBLIC_DEMO_USER_ID), roleId = new mongoose.Types.ObjectId(PUBLIC_DEMO_ROLE_ID);
  const snapshot = async () => {
    const hash = createHash('sha256');
    for (const { name } of (await db.listCollections({}, { nameOnly: true }).toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
      const filter = name === User.collection.name ? { _id: { $ne: userId } } : name === Role.collection.name ? { _id: { $ne: roleId } } : {};
      hash.update(name);
      for await (const record of db.collection(name).find(filter).sort({ _id: 1 })) hash.update(JSON.stringify(record));
    }
    return hash.digest('hex');
  };
  const inspect = async (session?: mongoose.mongo.ClientSession) => {
    const options = session ? { session } : {};
    // MongoDB does not support parallel operations within one transaction.
    const user = await db.collection(User.collection.name).findOne({ _id: userId }, options);
    const role = await db.collection(Role.collection.name).findOne({ _id: roleId }, options);
    const userCollision = await db.collection(User.collection.name).findOne({ email: PUBLIC_DEMO_EMAIL, _id: { $ne: userId } }, options);
    const roleCollision = await db.collection(Role.collection.name).findOne({ name: roleName, _id: { $ne: roleId } }, options);
    if (userCollision || roleCollision) throw new Error('Public visitor identity/name collision. No existing record was changed.');
    if (role && (role.name !== roleName || role.isActive !== true || normalizePermissions(role.permissions).issues.length || JSON.stringify(normalizePermissions(role.permissions).permissions) !== JSON.stringify(normalizePermissions(PUBLIC_DEMO_PERMISSIONS).permissions))) throw new Error('Existing visitor role differs from its reviewed read-only grants. No grants were changed.');
    if (user && (!role || !validPublicDemoIdentity(user, { roleId: PUBLIC_DEMO_ROLE_ID, permissions: permissionMap(normalizePermissions(role.permissions).permissions) }) || user.email !== PUBLIC_DEMO_EMAIL || user.role !== 'staff')) throw new Error('Existing visitor identity needs owner review. No account was changed.');
    return { user, role };
  };
  const before = await snapshot(), existing = await inspect();
  const roleDoc = new Role({ _id: roleId, name: roleName, description: 'Explicit public read grants. Business mutations are blocked independently at the API boundary.', isActive: true, permissions: PUBLIC_DEMO_PERMISSIONS });
  const userDoc = new User({ _id: userId, name: 'Public Visitor', email: PUBLIC_DEMO_EMAIL, role: 'staff', roleId, isActive: true, isPublicDemo: true, passwordHash: await bcrypt.hash(randomBytes(48).toString('base64url'), 12) });
  await roleDoc.validate(); await userDoc.validate();
  const session = await mongoose.startSession();
  let addedUsers = 0, addedRoles = 0;
  try {
    if (apply) await session.withTransaction(async () => {
      addedUsers = 0; addedRoles = 0;
      const current = await inspect(session);
      if (!current.role) { await roleDoc.save({ session }); addedRoles = 1; }
      if (!current.user) { await userDoc.save({ session }); addedUsers = 1; }
    });
    else { session.startTransaction({ readConcern: { level: 'snapshot' } }); await inspect(session); await session.abortTransaction(); }
  } finally { await session.endSession(); }
  const after = await snapshot();
  if (before !== after) throw new Error('Non-visitor data changed during verification. Review concurrent activity; no existing data was intentionally modified.');
  if (apply) { const verified = await inspect(); if (!verified.user || !verified.role) throw new Error('Visitor provisioning could not be verified.'); }
  return { mode: apply ? 'apply' : 'dry-run', wouldAddUsers: existing.user ? 0 : 1, wouldAddRoles: existing.role ? 0 : 1, addedUsers, addedRoles, otherRecordsUnchanged: true, interactivePasswordLogin: 'disabled server-side', permissions: 'explicit read-only canonical grants' };
}
if (require.main === module) (async () => {
  if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Use no arguments for dry-run or --apply.');
  if (execFileSync('git', ['branch', '--show-current'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim() !== 'develop') throw new Error('Provisioning requires develop.');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dilshani_db', { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000 });
  console.log(JSON.stringify(await provisionPublicDemo(process.argv.includes('--apply'))));
})().catch(error => { console.error(JSON.stringify({ status: 'failed', message: error.constructor === Error ? error.message : 'Public visitor preflight/provisioning failed. Connection details and record values are withheld.', errorType: error.name, code: typeof error.code === 'number' ? error.code : undefined })); process.exitCode = 1; }).finally(() => mongoose.disconnect());
