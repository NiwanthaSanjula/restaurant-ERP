import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import mongoose from 'mongoose';
import { authenticate } from './auth';
import { requireAnyPermission, requirePermission } from './permissions';
import { getCurrentUser } from '../controllers/auth/currentUser';
import { postInitialRun, postLogin } from '../controllers/auth';
import { updateRole, updateRoleValidators } from '../controllers/roles&Permissions';
import { administratorPermissions, canonicalPermission, clientPermissionMap, normalizePermissions, permissionMap, PermissionMap, RolePermission } from '../config/permissionDefinitions';
import { applyPermissionMigration, planPermissionMigration } from '../scripts/migrateRolePermissions';

const mocks = {
  roleById: jest.fn(), roleByName: jest.fn(), roleUpdate: jest.fn(), roleCreate: jest.fn(), roleCAS: jest.fn(),
  userById: jest.fn(), userByEmail: jest.fn(), userCount: jest.fn(), userCreate: jest.fn(), metadata: jest.fn(), legacyStore: jest.fn(),
  sign: jest.fn(), hash: jest.fn(), roleFind: jest.fn(), userFind: jest.fn(), recoveryLock: jest.fn()
};
jest.mock('../models/Role', () => ({ __esModule: true, default: {
  findById: (...args: unknown[]) => mocks.roleById(...args), findOne: (...args: unknown[]) => mocks.roleByName(...args),
  findByIdAndUpdate: (...args: unknown[]) => mocks.roleUpdate(...args), create: (...args: unknown[]) => mocks.roleCreate(...args),
  updateOne: (...args: unknown[]) => mocks.roleCAS(...args), find: (...args: unknown[]) => mocks.roleFind(...args)
} }));
jest.mock('../models/User', () => ({ __esModule: true, default: {
  findById: (...args: unknown[]) => mocks.userById(...args), findOne: (...args: unknown[]) => mocks.userByEmail(...args),
  countDocuments: (...args: unknown[]) => mocks.userCount(...args), create: (...args: unknown[]) => mocks.userCreate(...args),
  find: (...args: unknown[]) => mocks.userFind(...args)
} }));
jest.mock('../models/RolePermissions', () => ({ __esModule: true, default: {
  findOne: (...args: unknown[]) => mocks.legacyStore(...args)
} }));
jest.mock('../models/Permission', () => ({ __esModule: true, default: { insertMany: (...args: unknown[]) => mocks.metadata(...args) } }));
jest.mock('../models/OTP', () => ({ __esModule: true, default: {} }));
jest.mock('../models/PrefixSetting', () => ({ __esModule: true, default: {
  countDocuments: async () => 1, findOne: async () => ({})
} }));
jest.mock('../utils/email', () => ({ sendEmail: () => { throw new Error('Email is forbidden in permission tests'); } }));
jest.mock('bcryptjs', () => ({ __esModule: true, default: { hash: (...args: unknown[]) => mocks.hash(...args) } }));
jest.mock('jsonwebtoken', () => ({ __esModule: true, default: {
  verify: (token: string) => { if (token === 'invalid-token') throw new Error('Invalid token'); return { id: token }; },
  sign: (...args: unknown[]) => mocks.sign(...args)
} }));

interface RoleDoc { _id: string; name: string; isActive: boolean; permissions: RolePermission[] }
interface UserDoc { _id: string; name: string; email: string; role: string; roleId?: string; isActive: boolean; passwordHash: string; comparePassword: () => Promise<boolean> }
const ADMIN = 'a'.repeat(24), WORKER = 'b'.repeat(24), NEW_ROLE = 'c'.repeat(24);
let roleDocs: Record<string, RoleDoc>;
let users: Record<string, UserDoc>;
function query<T>(value: T) {
  return { lean: async () => value, select: () => query(value), session: () => query(value), then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
}
const app = express();
app.get('/auth/me', authenticate, getCurrentUser);
app.post('/auth/login', postLogin);
app.post('/auth/initial-run', postInitialRun);
app.get('/products', authenticate, requirePermission('manageProducts', 'read'), (_req, res) => res.json({ status: 'success' }));
app.post('/products', authenticate, requirePermission('manageProducts', 'create'), (_req, res) => res.json({ status: 'success' }));
app.get('/settings/mail', authenticate, requirePermission('manageSettings', 'view_mail_settings'), (_req, res) => res.json({ status: 'success' }));
app.get('/either', authenticate, requireAnyPermission([{ component: 'manageProducts', action: 'create' }, { component: 'manageSettings', action: 'view_settings' }]), (_req, res) => res.json({ status: 'success' }));
app.put('/roles/:id', authenticate, requirePermission('manageRolesAndPermissions', 'edit_role'), ...updateRoleValidators, updateRole);

interface Reply { status: number; body: { status?: string; message?: string; data?: { roleId?: string; user?: { roleId: string; roleName: string; permissions: PermissionMap }; permissions?: RolePermission[] } } }
function request(method: string, url: string, token?: string, body: unknown = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), { method, url, body,
      headers: { host: 'permissions.test', ...(token ? { authorization: 'Bearer ' + token } : {}) } });
    const res = new ServerResponse(req);
    jest.spyOn(res, 'end').mockImplementation((chunk: unknown) => {
      try { resolve({ status: res.statusCode, body: JSON.parse(String(chunk)) }); } catch (error) { reject(error); }
      socket.destroy(); return res;
    });
    app(req, res);
  });
}

const envKeys = ['INITIAL_RUN_SECRET', 'INITIAL_ADMIN_EMAIL', 'INITIAL_ADMIN_PASSWORD', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
let originalEnv: Record<string, string | undefined>;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(mongoose, 'startSession').mockResolvedValue({ withTransaction: async work => work(), endSession: async () => {} } as unknown as mongoose.ClientSession);
  Object.defineProperty(mongoose.connection, 'db', { configurable: true, value: { collection: () => ({ updateOne: mocks.recoveryLock }) } });
  mocks.recoveryLock.mockResolvedValue({ matchedCount: 1 });
  originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.INITIAL_RUN_SECRET = 'test-only-bootstrap-secret';
  process.env.INITIAL_ADMIN_EMAIL = 'bootstrap@example.invalid';
  process.env.INITIAL_ADMIN_PASSWORD = 'Test-only-Password1!';
  roleDocs = {
    [ADMIN]: { _id: ADMIN, name: 'Explicit administrator', isActive: true, permissions: administratorPermissions() },
    [WORKER]: { _id: WORKER, name: 'Product reader', isActive: true, permissions: [{ component: 'manageProducts', actions: { read: true } }] }
  };
  const user = (id: string, role: string, roleId?: string): UserDoc => ({ _id: id, name: id, email: id + '@example.invalid', role, roleId,
    isActive: true, passwordHash: 'test-only-hash', comparePassword: async () => true });
  users = { admin: user('admin', 'admin', ADMIN), worker: user('worker', 'staff', WORKER), missing: user('missing', 'admin'), invalid: user('invalid', 'admin', 'not-an-id') };
  mocks.userById.mockImplementation(id => query(users[id] || null));
  mocks.userByEmail.mockImplementation(({ email }) => query(Object.values(users).find(entry => entry.email === email) || null));
  mocks.userCount.mockResolvedValue(2);
  mocks.roleById.mockImplementation(id => query(roleDocs[String(id)] || null));
  mocks.roleFind.mockImplementation(() => query(Object.values(roleDocs)));
  mocks.userFind.mockImplementation(() => query(Object.values(users).filter(user => user.isActive)));
  mocks.roleByName.mockImplementation(({ name }) => query(Object.values(roleDocs).find(role => role.name === name) || null));
  mocks.roleUpdate.mockImplementation(async (id, update) => Object.assign(roleDocs[id], update));
  mocks.roleCreate.mockImplementation(async data => { roleDocs[NEW_ROLE] = { _id: NEW_ROLE, ...data }; return roleDocs[NEW_ROLE]; });
  mocks.userCreate.mockImplementation(async data => { users.provisioned = { _id: 'provisioned', ...data }; return users.provisioned; });
  mocks.metadata.mockResolvedValue([]); mocks.hash.mockResolvedValue('test-only-hash'); mocks.sign.mockReturnValue('test-only-token');
  mocks.roleCAS.mockResolvedValue({ matchedCount: 1 });
  mocks.legacyStore.mockImplementation(() => { throw new Error('Legacy grants must never authorize requests'); });
});
afterEach(() => { for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; } });
afterAll(() => { jest.restoreAllMocks(); Object.defineProperty(mongoose.connection, 'db', { configurable: true, value: undefined }); });

describe('actual permission middleware and assigned Role authority', () => {
  it('denies unauthenticated and invalid-token product requests', async () => {
    expect((await request('GET', '/products')).status).toBe(401);
    expect((await request('GET', '/products', 'invalid-token')).status).toBe(401);
    expect(mocks.roleById).not.toHaveBeenCalled();
  });
  it.each(['missing', 'invalid'])('denies %s roles even for a coarse admin label', async token => {
    expect((await request('GET', '/products', token)).status).toBe(403);
    expect((await request('GET', '/auth/me', token)).status).toBe(403);
    expect(mocks.legacyStore).not.toHaveBeenCalled();
  });
  it('denies deleted, inactive and empty roles', async () => {
    delete roleDocs[WORKER]; expect((await request('GET', '/products', 'worker')).status).toBe(403);
    roleDocs[WORKER] = { _id: WORKER, name: 'Inactive', isActive: false, permissions: administratorPermissions() };
    expect((await request('GET', '/products', 'worker')).status).toBe(403);
    roleDocs[WORKER].isActive = true; roleDocs[WORKER].permissions = [];
    expect((await request('GET', '/products', 'worker')).status).toBe(403);
  });
  it('grants product reads and denies writes without a product bypass', async () => {
    users.worker.role = 'admin';
    expect((await request('GET', '/products', 'worker')).status).toBe(200);
    expect((await request('POST', '/products', 'worker')).status).toBe(403);
    expect((await request('GET', '/either', 'worker')).status).toBe(403);
    expect((await request('GET', '/settings/mail', 'worker')).status).toBe(403);
  });
  it('role edits change subsequent access with the same token and roleId, including a rename', async () => {
    expect((await request('GET', '/products', 'worker')).status).toBe(200);
    const edited = await request('PUT', '/roles/' + WORKER, 'admin', { name: 'Product creator', permissions: [{ component: 'manageProducts', actions: { read: false, create: true } }] });
    expect(edited.status).toBe(200);
    expect((await request('GET', '/products', 'worker')).status).toBe(403);
    expect((await request('POST', '/products', 'worker')).status).toBe(200);
    expect((await request('GET', '/either', 'worker')).status).toBe(200);
    expect((await request('GET', '/auth/me', 'worker')).body.data.user.roleName).toBe('Product creator');
  });
  it('explicit role reassignment changes access, while removing the assignment denies it', async () => {
    expect((await request('POST', '/products', 'worker')).status).toBe(403);
    users.worker.roleId = ADMIN;
    expect((await request('POST', '/products', 'worker')).status).toBe(200);
    expect((await request('GET', '/settings/mail', 'worker')).status).toBe(200);
    users.worker.roleId = undefined;
    expect((await request('GET', '/products', 'worker')).status).toBe(403);
  });
  it('deactivation and rejected permission edits take effect without falling back to labels', async () => {
    expect((await request('PUT', '/roles/' + WORKER, 'worker', { isActive: false })).status).toBe(403);
    expect((await request('PUT', '/roles/' + WORKER, 'admin', { permissions: [{ component: 'manageProducts', actions: { surprise: true } }] })).status).toBe(400);
    expect(mocks.roleUpdate).not.toHaveBeenCalled();
    expect((await request('PUT', '/roles/' + WORKER, 'admin', { isActive: false })).status).toBe(200);
    expect((await request('GET', '/products', 'worker')).status).toBe(403);
  });
  it('denies unknown actions and contradictory aliases rather than expanding them', async () => {
    expect(canonicalPermission('managePOS', 'update')).toBeNull();
    expect(canonicalPermission('unknown', 'read')).toBeNull();
    expect(canonicalPermission('manageProducts', 'constructor')).toBeNull();
    roleDocs[WORKER].permissions.push({ component: 'posOperations', actions: { update: true } });
    expect((await request('GET', '/products', 'worker')).status).toBe(200);
    expect((await request('GET', '/settings/mail', 'worker')).status).toBe(403);
    const conflict = normalizePermissions([{ component: 'manageUsers', actions: { read: true, view_user: false } }]);
    expect(conflict.issues.length).toBeGreaterThan(0);
    expect(permissionMap(conflict.permissions).manageUsers.view_user).toBe(false);
  });
  it('maps only explicit legacy component/actions and retains separate sensitive settings grants', async () => {
    const legacy = normalizePermissions([{ component: 'manageRoles', actions: { read: true } }, { component: 'posOperations', actions: { create: true } }]);
    expect(legacy.issues).toEqual([]);
    const grants = clientPermissionMap(permissionMap(legacy.permissions));
    expect(grants.manageRoles.read).toBe(true); expect(grants.manageRolesAndPermissions.view_role).toBe(true);
    expect(grants.posOperations.create).toBe(true); expect(grants.managePOS.create_sale).toBe(true);
    expect(grants.manageSettings).toBeUndefined(); expect(grants.managePOS.process_payment).toBeUndefined();
  });
});

describe('explicit administrator provisioning and login', () => {
  it('the actual Role schema accepts granular and provisioned grants, and rejects unknown actions without a database', () => {
    const ActualRole = jest.requireActual('../models/Role').default;
    expect(new ActualRole({ name: 'Provisioned', permissions: administratorPermissions(), isActive: true }).validateSync()).toBeUndefined();
    expect(new ActualRole({ name: 'Settings editor', permissions: [{ component: 'manageSettings', actions: { view_settings: true, edit_restaurant_settings: true } }], isActive: true }).validateSync()).toBeUndefined();
    expect(new ActualRole({ name: 'Invalid', permissions: [{ component: 'manageSettings', actions: { unknown: true } }], isActive: true }).validateSync()).toBeDefined();
  });
  it('does not provision with a missing/wrong setup secret or after users exist', async () => {
    expect((await request('POST', '/auth/initial-run', undefined, { secret: 'wrong-test-secret' })).status).toBe(403);
    expect((await request('POST', '/auth/initial-run', undefined, { secret: process.env.INITIAL_RUN_SECRET })).status).toBe(409);
    delete process.env.INITIAL_RUN_SECRET;
    expect((await request('POST', '/auth/initial-run', undefined, {})).status).toBe(403);
    expect(mocks.roleCreate).not.toHaveBeenCalled(); expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it('validates configured admin credentials before writing any grants', async () => {
    mocks.userCount.mockResolvedValue(0); delete process.env.INITIAL_ADMIN_PASSWORD; delete process.env.ADMIN_PASSWORD;
    expect((await request('POST', '/auth/initial-run', undefined, { secret: process.env.INITIAL_RUN_SECRET })).status).toBe(400);
    expect(mocks.roleCreate).not.toHaveBeenCalled(); expect(mocks.metadata).not.toHaveBeenCalled();
  });
  it('creates an explicitly granted Role and assigns its id only through the protected first-user path', async () => {
    users = {}; roleDocs = {}; mocks.userCount.mockResolvedValue(0);
    expect((await request('POST', '/auth/initial-run', undefined, { secret: process.env.INITIAL_RUN_SECRET })).status).toBe(201);
    expect(mocks.roleCreate.mock.calls[0][0].permissions).toEqual(administratorPermissions());
    expect(users.provisioned.roleId).toBe(NEW_ROLE);
    expect((await request('GET', '/settings/mail', 'provisioned')).status).toBe(200);
    delete roleDocs[NEW_ROLE];
    expect((await request('GET', '/settings/mail', 'provisioned')).status).toBe(403);
  });
  it('login/current-user return the effective Role grants, never role-name defaults', async () => {
    expect((await request('POST', '/auth/login', undefined, { email: users.missing.email, password: 'test-only-password' })).status).toBe(403);
    expect(mocks.sign).not.toHaveBeenCalled();
    const login = await request('POST', '/auth/login', undefined, { email: users.worker.email, password: 'test-only-password' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.permissions).toEqual({ manageProducts: { read: true } });
    expect((await request('GET', '/auth/me', 'worker')).body.data.user.permissions).toEqual(login.body.data.user.permissions);
    expect(login.body.data.user).not.toHaveProperty('passwordHash');
  });
});

describe('frontend and migration compatibility', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../client/src/utils/permissions.ts'), 'utf8');
  const frontend = new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText + '\nreturn exports;')({});
  it('uses identical server grants for frontend checks before and after role changes', async () => {
    const first = await request('GET', '/auth/me', 'worker');
    const map = frontend.parseEffectivePermissions(first.body.data.user.permissions);
    expect(frontend.checkEffectivePermission(map, 'manageProducts', 'read')).toBe(true);
    expect(frontend.checkEffectivePermission(map, 'manageProducts', 'create')).toBe(false);
    expect(frontend.checkEffectivePermission(map, 'manageProducts', 'unknown')).toBe(false);
    expect(frontend.checkEffectivePermission(null, 'manageProducts', 'create')).toBe(false);
    expect(() => frontend.parseEffectivePermissions({ manageProducts: { create: 'true' } })).toThrow();
    roleDocs[WORKER].permissions = [{ component: 'manageProducts', actions: { create: true, read: false } }];
    const next = frontend.parseEffectivePermissions((await request('GET', '/auth/me', 'worker')).body.data.user.permissions);
    expect(frontend.checkEffectivePermission(next, 'manageProducts', 'read')).toBe(false);
    expect(frontend.checkEffectivePermission(next, 'manageProducts', 'create')).toBe(true);
  });
  it('frontend route/navigation requirements use recognized API permissions', () => {
    const routeSource = fs.readFileSync(path.resolve(__dirname, '../../../client/src/utils/permissionRoutes.ts'), 'utf8');
    const routes = new Function('exports', ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText + '\nreturn exports;')({});
    for (const path of ['/viewProducts', '/createProduct', '/editProduct/id', '/viewRoles', '/createRole', '/editRole/id', '/viewUsers', '/createUser', '/editUser/id', '/SystemSettings', '/ReceiptSettings', '/mail-settings', '/pos', '/pos-checkout']) {
      const required = routes.permissionForPath(path);
      expect(required).not.toBeNull();
      expect(canonicalPermission(required.component, required.action)).not.toBeNull();
    }
    const readOnly = clientPermissionMap({ manageProducts: { read: true } });
    const view = routes.permissionForPath('/viewProducts');
    const create = routes.permissionForPath('/createProduct');
    expect(routes.permissionForPath('/VIEWPRODUCTS//')).toEqual(view);
    expect(routes.permissionForPath('/%76iewProducts')).toEqual(view);
    expect(frontend.checkEffectivePermission(readOnly, view.component, view.action)).toBe(true);
    expect(frontend.checkEffectivePermission(readOnly, create.component, create.action)).toBe(false);
  });
  it('plans lossless legacy mappings, reports conflicts/unassigned users, and never merges privileges', async () => {
    const plan = planPermissionMigration({ roles: [{ id: WORKER, name: 'Reader', isActive: true, permissions: [{ component: 'manageUsers', actions: { read: true } }] }], legacyRoles: [], users: [{ id: 'unassigned', role: 'admin' }] });
    expect(plan.roles[0].after).toEqual([{ component: 'manageUsers', actions: { view_user: true } }]);
    expect(plan.unassignedUsers).toEqual(['unassigned']);
    expect(mocks.roleCAS).not.toHaveBeenCalled();
    expect(await applyPermissionMigration(plan)).toEqual({ updated: 1, skipped: 0, unassignedUsers: 1 });
    const conflict = planPermissionMigration({ roles: [{ id: WORKER, name: 'Reader', isActive: true, permissions: [{ component: 'manageProducts', actions: { read: true } }] }], legacyRoles: [{ roleName: 'Reader', permissions: { manageProducts: { create: true } } }], users: [] });
    expect(conflict.roles[0].issues.length).toBeGreaterThan(0);
    expect((await applyPermissionMigration(conflict)).updated).toBe(0);
    mocks.roleCAS.mockResolvedValue({ matchedCount: 0 });
    await expect(applyPermissionMigration(plan)).rejects.toThrow(/Stale plan/);
  });
});
