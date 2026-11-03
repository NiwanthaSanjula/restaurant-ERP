import express from 'express';
import mongoose from 'mongoose';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import putRoutes from '../routes/putRoutes';
import deleteRoutes from '../routes/deleteRoutes';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { assertRoleRecovery, canManageRoles, RoleRecoveryError } from './roleRecovery';
import { normalizePermissions, permissionMap, checkPermissionInMap } from '../config/permissionDefinitions';

const mocks = { user: jest.fn(), users: jest.fn(), userUpdate: jest.fn(), userDelete: jest.fn(), role: jest.fn(), roles: jest.fn(), roleName: jest.fn(), roleUpdate: jest.fn(), roleDelete: jest.fn(), lock: jest.fn() };
jest.mock('../models/User', () => ({ __esModule: true, default: {
  findById: (...args: unknown[]) => mocks.user(...args), find: (...args: unknown[]) => mocks.users(...args),
  findByIdAndUpdate: (...args: unknown[]) => mocks.userUpdate(...args), findByIdAndDelete: (...args: unknown[]) => mocks.userDelete(...args)
} }));
jest.mock('../models/Role', () => ({ __esModule: true, default: {
  findById: (...args: unknown[]) => mocks.role(...args), find: (...args: unknown[]) => mocks.roles(...args), findOne: (...args: unknown[]) => mocks.roleName(...args),
  findByIdAndUpdate: (...args: unknown[]) => mocks.roleUpdate(...args), findByIdAndDelete: (...args: unknown[]) => mocks.roleDelete(...args)
} }));
jest.mock('jsonwebtoken', () => ({ __esModule: true, default: { verify: (token: string) => ({ id: token }) } }));
jest.mock('../utils/email', () => ({ sendEmail: () => { throw new Error('Email forbidden in recovery tests'); } }));

const A = '1'.repeat(24), B = '2'.repeat(24), R = 'a'.repeat(24), S = 'b'.repeat(24), WORKER = 'c'.repeat(24);
const managerGrants = () => [
  { component: 'manageRolesAndPermissions', actions: { view_role: true, edit_role: true, delete_role: true } },
  { component: 'manageUsers', actions: { view_user: true, edit_user: true, delete_user: true } }
];
const otherGrants = () => [{ component: 'manageProducts', actions: { read: true } }];
let roles: Record<string, any>, users: Record<string, any>, queue: Promise<void>;
function query(value: unknown) {
  const result = { select: () => result, session: () => result, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  return result;
}
const app = express();
// Actual production mutation routers, validators, authentication and authorization.
app.use('/api', putRoutes); app.use('/api', deleteRoutes);
app.get('/api/purchases', authenticate, requirePermission('managePurchases', 'read'), (_req, res) => res.json({ status: 'success' }));
function request(method: string, url: string, actor?: string, body: unknown = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), { method, url, body, headers: { host: 'recovery.test', ...(actor ? { authorization: 'Bearer ' + actor } : {}) } });
    const res = new ServerResponse(req);
    jest.spyOn(res, 'end').mockImplementation((chunk: unknown) => {
      try { resolve({ status: res.statusCode, body: JSON.parse(String(chunk)) }); } catch (error) { reject(error); }
      socket.destroy(); return res;
    });
    app(req, res);
  });
}
const originalDatabase = mongoose.connection.db;
beforeEach(() => {
  jest.clearAllMocks(); queue = Promise.resolve();
  roles = {
    [R]: { _id: R, name: 'Arbitrary role title', isActive: true, permissions: managerGrants() },
    [S]: { _id: S, name: 'Second manager', isActive: true, permissions: managerGrants() },
    [WORKER]: { _id: WORKER, name: 'Super Admin', isActive: true, permissions: otherGrants() }
  };
  users = { [A]: { _id: A, name: 'Fictional account', email: 'first@example.invalid', role: 'staff', roleId: R, isActive: true } };
  mocks.user.mockImplementation(id => query(users[String(id)] || null));
  mocks.users.mockImplementation(filter => query(Object.values(users).filter(user => Object.entries(filter).every(([key, value]) => String(user[key]) === String(value)))));
  mocks.role.mockImplementation(id => query(roles[String(id)] || null));
  mocks.roles.mockImplementation(() => query(Object.values(roles)));
  mocks.roleName.mockReturnValue(query(null));
  mocks.roleUpdate.mockImplementation(async (id, update) => roles[id] ? Object.assign(roles[id], update) : null);
  mocks.userUpdate.mockImplementation(async (id, update) => users[id] ? Object.assign(users[id], update) : null);
  mocks.roleDelete.mockImplementation(async id => { const role = roles[id]; delete roles[id]; return role; });
  mocks.userDelete.mockImplementation(async id => { const user = users[id]; delete users[id]; return user; });
  // Model the shared guard write's transactional lock, including rollback.
  mocks.lock.mockImplementation(async (_filter, _update, options) => {
    const previous = queue;
    queue = new Promise<void>(resolve => { options.session.release = resolve; });
    await previous;
    options.session.snapshot = structuredClone({ roles, users });
    return { acknowledged: true };
  });
  Object.defineProperty(mongoose.connection, 'db', { configurable: true, value: { collection: () => ({ updateOne: mocks.lock }) } });
  jest.spyOn(mongoose, 'startSession').mockImplementation(async () => {
    const session = { release: () => {}, snapshot: null as { roles: typeof roles; users: typeof users } | null,
      withTransaction: async work => { try { return await work(); } catch (error) {
        if (session.snapshot) { roles = session.snapshot.roles; users = session.snapshot.users; }
        throw error;
      } finally { session.release(); } }, endSession: async () => {} };
    return session as unknown as mongoose.ClientSession;
  });
});
afterAll(() => { jest.restoreAllMocks(); Object.defineProperty(mongoose.connection, 'db', { configurable: true, value: originalDatabase }); });

describe('effective recovery grants', () => {
  it('requires both role view and edit, independent of labels and legacy aliases', () => {
    expect(canManageRoles(roles[R])).toBe(true); expect(canManageRoles(roles[WORKER])).toBe(false);
    expect(canManageRoles({ ...roles[R], permissions: [{ component: 'manageRoles', actions: { read: true, update: true } }] })).toBe(true);
    for (const action of ['view_role', 'edit_role']) expect(canManageRoles({ ...roles[R], permissions: [{ component: 'manageRolesAndPermissions', actions: { [action]: true } }] })).toBe(false);
    expect(canManageRoles({ ...roles[R], isActive: false })).toBe(false);
  });
  it('does not count inactive accounts, invalid assignments, unknown actions or conflicting aliases', () => {
    const list = Object.values(users);
    roles.invalid = { ...roles[R], _id: 'invalid' };
    for (const candidate of [
      { _id: B, roleId: S, isActive: false }, { _id: B, roleId: 'missing', isActive: true },
      { _id: B, roleId: WORKER, isActive: true }, { _id: B, roleId: 'invalid', isActive: true }
    ]) expect(() => assertRoleRecovery([...list, candidate], Object.values(roles), { kind: 'account', id: A, deleted: true })).toThrow(RoleRecoveryError);
    expect(canManageRoles({ ...roles[R], permissions: [{ component: 'manageRoles', actions: { read: true, update: true, edit_role: false } }] })).toBe(false);
    expect(canManageRoles({ ...roles[R], permissions: [{ component: 'unknown', actions: { view_role: true, edit_role: true } }] })).toBe(false);
  });
  it('also preserves an existing API-only editor while allowing explicit repair of missing view access', () => {
    roles[R].permissions = [{ component: 'manageRolesAndPermissions', actions: { edit_role: true } }];
    expect(() => assertRoleRecovery(Object.values(users), Object.values(roles), { kind: 'account', id: A, deleted: true })).toThrow(RoleRecoveryError);
    expect(() => assertRoleRecovery(Object.values(users), Object.values(roles), { kind: 'role', id: R, permissions: managerGrants() })).not.toThrow();
  });
});

describe('mounted role/account access mutations', () => {
  it('allows an authorized manager to add only Purchases Read and preserves all other grants', async () => {
    const initial = structuredClone(roles[R].permissions);
    expect((await request('GET', '/api/purchases', A)).status).toBe(403);
    const result = await request('PUT', '/api/roles/' + R, A, { permissions: [...initial, { component: 'managePurchases', actions: { read: true } }] });
    expect(result.status).toBe(200);
    expect(roles[R].permissions.slice(0, initial.length)).toEqual(initial);
    expect(roles[R].permissions.at(-1)).toEqual({ component: 'managePurchases', actions: { read: true } });
    expect((await request('GET', '/api/purchases', A)).status).toBe(200);
    expect(mocks.roleUpdate.mock.calls[0][2].session).toBeDefined();
    expect(checkPermissionInMap(permissionMap(normalizePermissions(roles[R].permissions).permissions), 'manageSettings', 'view_mail_settings')).toBe(false);
  });
  it('denies unauthenticated and restricted requests before any guard/storage write', async () => {
    users[B] = { ...users[A], _id: B, role: 'admin', roleId: WORKER };
    expect((await request('PUT', '/api/roles/' + R, undefined, { isActive: false })).status).toBe(401);
    expect((await request('PUT', '/api/roles/' + R, B, { isActive: false })).status).toBe(403);
    expect((await request('GET', '/api/purchases', B)).status).toBe(403);
    expect(mocks.lock).not.toHaveBeenCalled(); expect(mocks.roleUpdate).not.toHaveBeenCalled();
  });
  it.each([
    ['permission removal', 'PUT', '/api/roles/' + R, { permissions: otherGrants() }],
    ['role deactivation', 'PUT', '/api/roles/' + R, { isActive: false }],
    ['role deletion', 'DELETE', '/api/roles/' + R, {}],
    ['account deactivation', 'PUT', '/api/users/' + A, { name: 'Fictional account', email: 'first@example.invalid', isActive: false }],
    ['account reassignment', 'PUT', '/api/users/' + A, { name: 'Fictional account', email: 'first@example.invalid', roleId: WORKER }],
    ['account deletion', 'DELETE', '/api/users/' + A, {}]
  ])('rejects last-manager %s clearly and leaves data unchanged', async (_name, method, url, body) => {
    const before = structuredClone({ roles, users });
    const result = await request(String(method), String(url), A, body);
    expect(result.status).toBe(409); expect(result.body.message).toContain('last active account');
    expect({ roles, users }).toEqual(before);
    expect(mocks.roleUpdate).not.toHaveBeenCalled(); expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.roleDelete).not.toHaveBeenCalled(); expect(mocks.userDelete).not.toHaveBeenCalled();
  });
  it('allows removal when another active account has effective recovery access', async () => {
    users[B] = { ...users[A], _id: B, roleId: S };
    expect((await request('PUT', '/api/roles/' + R, A, { permissions: otherGrants() })).status).toBe(200);
    expect(canManageRoles(roles[S])).toBe(true);
  });
  it('still rejects deleting an assigned role and allows deleting an unassigned role', async () => {
    users[B] = { ...users[A], _id: B, roleId: S };
    expect((await request('DELETE', '/api/roles/' + R, A)).status).toBe(400);
    expect((await request('DELETE', '/api/roles/' + WORKER, A)).status).toBe(200);
  });
  it('serializes concurrent removals across different roles so one manager remains', async () => {
    users[B] = { ...users[A], _id: B, roleId: S };
    const results = await Promise.all([
      request('PUT', '/api/roles/' + R, A, { permissions: otherGrants() }),
      request('PUT', '/api/roles/' + S, B, { permissions: otherGrants() })
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(Object.values(roles).filter(canManageRoles)).toHaveLength(1);
    expect(mocks.lock).toHaveBeenCalledTimes(2);
  });
  it('fails closed without transaction support instead of performing an unsafe update', async () => {
    mocks.lock.mockRejectedValueOnce(Object.assign(new Error('Standalone'), { code: 20 }));
    const result = await request('PUT', '/api/roles/' + R, A, { isActive: false });
    expect(result.status).toBe(503); expect(result.body.message).toContain('transaction support');
    expect(mocks.roleUpdate).not.toHaveBeenCalled();
  });
});
