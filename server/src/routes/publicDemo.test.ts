import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { createApiRouter } from './api';
import User from '../models/User';
import Role from '../models/Role';
import Setting from '../models/Setting';
import MailSetting from '../models/MailSetting';
import Currency from '../models/Currency';
import Warehouse from '../models/Warehouse';
import { PUBLIC_DEMO_PERMISSIONS, PUBLIC_DEMO_USER_ID, PUBLIC_DEMO_ROLE_ID } from '../config/publicDemo';
import { createDemoSession, resetDemoSessionsForTests } from '../services/publicDemoSessions';
import { demoResponse } from '../utils/demoResponse';
import { apiPolicy } from '../middleware/apiPolicy';
import { checkPermissionInMap, permissionMap } from '../config/rbac';
import { sendEmail } from '../utils/email';

const upload = jest.fn();
jest.mock('multer', () => ({ __esModule: true, default: Object.assign(() => ({ single: () => (_req, _res, next) => { upload(); next(); } }), { diskStorage: options => options }) }));
jest.mock('../utils/email', () => ({ sendEmail: jest.fn(() => { throw new Error('Email must not be reached'); }) }));
const app = express(); app.use('/api', createApiRouter());
function request(method: string, url: string, token?: string, body: Record<string, unknown> = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), { method, url: '/api' + url, body, headers: { host: 'demo.test', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    const res = new ServerResponse(req);
    jest.spyOn(res, 'end').mockImplementation((chunk: unknown) => {
      try { const text = String(chunk); resolve({ status: res.statusCode, body: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text }); } catch (error) { reject(error); }
      socket.destroy(); return res;
    });
    app(req, res);
  });
}
const chain = (value: unknown): any => {
  const result = new Proxy({}, { get: (_target, key) => key === 'then' ? (resolve, reject) => Promise.resolve(value).then(resolve, reject) : key === 'lean' ? () => Promise.resolve(value) : () => result });
  return result;
};
const staffId = '123456789012345678901234', staffRole = '123456789012345678901235';
let staffGrants: any[], demoGrants: any[], demoToken: string, expectedFixtureWrite: boolean;
const storageReads: jest.SpyInstance[] = [], mutations: jest.SpyInstance[] = [];
beforeAll(() => { process.env.JWT_SECRET = 'public-demo-isolated-fixture-signing-key'; });
beforeEach(async () => {
  resetDemoSessionsForTests(); jest.restoreAllMocks(); upload.mockClear(); (sendEmail as jest.Mock).mockClear();
  staffGrants = [{ component: 'manageProducts', actions: { read: true } }]; demoGrants = PUBLIC_DEMO_PERMISSIONS;
  expectedFixtureWrite = false;
  storageReads.length = 0; mutations.length = 0;
  for (const model of Object.values(mongoose.models).filter(model => model !== User && model !== Role)) {
    for (const method of ['find', 'findOne', 'findById', 'aggregate', 'countDocuments', 'distinct'] as const) storageReads.push(jest.spyOn(model, method as any).mockImplementation(() => chain(method === 'countDocuments' ? 0 : method === 'findById' || method === 'findOne' ? null : [])));
  }
  for (const method of ['create', 'insertMany', 'updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate', 'deleteOne', 'deleteMany', 'findByIdAndDelete', 'findOneAndDelete', 'bulkWrite'] as const) mutations.push(jest.spyOn(mongoose.Model, method as any).mockImplementation(() => { throw new Error('Business storage must not be reached'); }));
  mutations.push(jest.spyOn(mongoose.Model.prototype, 'save').mockImplementation(() => { throw new Error('Save must not be reached'); }));
  jest.spyOn(User, 'findById').mockImplementation((id: any) => chain(String(id) === PUBLIC_DEMO_USER_ID ? { _id: PUBLIC_DEMO_USER_ID, roleId: PUBLIC_DEMO_ROLE_ID, name: 'Public Visitor', role: 'staff', isActive: true, isPublicDemo: true } : { _id: staffId, roleId: staffRole, role: 'staff', name: 'Staff fixture', isActive: true }));
  jest.spyOn(Role, 'findById').mockImplementation((id: any) => chain({ _id: id, name: 'Fixture role', isActive: true, permissions: String(id) === PUBLIC_DEMO_ROLE_ID ? demoGrants : staffGrants }));
  demoToken = await createDemoSession();
});
afterEach(() => { if (!expectedFixtureWrite) for (const spy of mutations) expect(spy).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled(); expect(sendEmail).not.toHaveBeenCalled(); });

// Audit the actual mounted route source: newly mounted mutations must enter this
// suite automatically, rather than silently escaping a hand-maintained test list.
const mounted = [
  ['getRoutes.ts', ''], ['postRoutes.ts', ''], ['putRoutes.ts', ''], ['deleteRoutes.ts', ''],
  ['settingRoutes.ts', '/settings'], ['specialOfferRoutes.ts', '/special-offers'], ['userRoutes.ts', '/users'],
  ['../controllers/PrefixController.ts', '/settings']
].flatMap(([file, prefix]) => [...fs.readFileSync(path.resolve(__dirname, file), 'utf8').matchAll(/router\.(get|post|put|patch|delete)\(['"]([^'"]+)['"]/g)].map(match => ({ method: match[1].toUpperCase(), url: prefix + match[2] })));
const businessMutations = [...mounted.filter(route => route.method !== 'GET' && !route.url.startsWith('/auth/')), { method: 'POST', url: '/upload' }]
  .filter(route => !route.url.endsWith('/kitchen-issues/preview'));
const substitute = (url: string) => url.replace(/:[A-Za-z]+/g, staffId);
describe('actual mounted API mutation boundary', () => {
  it.each(businessMutations)('denies demo $method $url before storage/uploads', async ({ method, url }) => {
    const result = await request(method, substitute(url), demoToken, { isDemo: false, role: 'admin', permissions: { all: true } });
    expect(result.status).toBe(403); expect(result.body.code).toBe('demo_read_only');
    for (const spy of storageReads) expect(spy).not.toHaveBeenCalled();
  });
  it.each(businessMutations)('denies anonymous $method $url before storage', async ({ method, url }) => {
    expect((await request(method, substitute(url))).status).toBe(401);
    for (const spy of storageReads) expect(spy).not.toHaveBeenCalled();
  });
  it.each(mounted.filter(route => route.method === 'GET' && !['/health', '/branding'].includes(route.url)))('protects anonymous GET $url', async ({ url }) => {
    expect((await request('GET', substitute(url))).status).toBe(401);
  });
});
describe('demo session and normal authorization', () => {
  it('logs in without accepting client-supplied identity and lands with read-only grants', async () => {
    const response = await request('POST', '/auth/demo'); expect(response.status).toBe(200);
    const user = response.body.data.user; expect(user.isDemo).toBe(true); expect(user.role).toBe('staff');
    expect(user.permissions.managePOS.create_sale).toBeUndefined(); expect(user.password).toBeUndefined();
    expect((await request('POST', '/auth/demo', undefined, { role: 'admin' })).status).toBe(400);
  });
  it('throttles login requests before storage', async () => {
    for (let i = 0; i < 10; i++) expect((await request('POST', '/auth/demo')).status).toBe(200);
    const reads = (User.findById as jest.Mock).mock.calls.length;
    expect((await request('POST', '/auth/demo')).status).toBe(429);
    expect((User.findById as jest.Mock).mock.calls.length).toBe(reads);
  });
  it('revokes an individual demo session on exit', async () => {
    expect((await request('GET', '/auth/me', demoToken)).body.data.user.isDemo).toBe(true);
    expect((await request('POST', '/auth/demo/exit', demoToken)).status).toBe(200);
    expect((await request('GET', '/auth/me', demoToken)).status).toBe(401);
  });
  it('does not allow request fields, missing claims or changed grants to remove demo restrictions', async () => {
    const forged = jwt.sign({ id: PUBLIC_DEMO_USER_ID, demo: false }, process.env.JWT_SECRET!);
    expect((await request('GET', '/products', forged)).status).toBe(401);
    demoGrants = [...PUBLIC_DEMO_PERMISSIONS, { component: 'managePOS', actions: { create_sale: true } }];
    expect((await request('GET', '/products', demoToken)).status).toBe(401);
  });
  it('requires explicit staff grants, without a demo or role-name allowance', async () => {
    const token = jwt.sign({ id: staffId }, process.env.JWT_SECRET!);
    expect((await request('GET', '/products', token)).status).toBe(200);
    expect((await request('POST', '/currencies', token, { isDemo: false })).status).toBe(403);
    staffGrants = [{ component: 'manageSettings', actions: { edit_restaurant_settings: true } }];
    expect((await request('GET', '/products', token)).status).toBe(403);
    // An authorized normal staff write reaches validation, rather than the demo block.
    expect((await request('POST', '/currencies', token, {})).status).toBe(400);
  });
  it('the explicit read role covers every mounted business read policy', () => {
    const grants = permissionMap(PUBLIC_DEMO_PERMISSIONS);
    for (const { url, method } of mounted.filter(route => route.method === 'GET' && !['/health', '/branding'].includes(route.url))) {
      const policy = apiPolicy(substitute(url), method); expect(policy).not.toBeNull();
      const checks = policy!.reads.map(([component, action]) => checkPermissionInMap(grants, component, action));
      expect(policy!.anyRead ? checks.some(Boolean) : checks.every(Boolean)).toBe(true);
    }
  });
  it('preserves an ordinary authorized staff mutation using isolated storage', async () => {
    staffGrants = [{ component: 'manageSettings', actions: { edit_restaurant_settings: true } }];
    const token = jwt.sign({ id: staffId }, process.env.JWT_SECRET!);
    expectedFixtureWrite = true;
    (Currency.create as jest.Mock).mockResolvedValue({ name: 'Fixture currency', code: 'ZZZ', symbol: 'Z' });
    const response = await request('POST', '/currencies', token, { name: 'Fixture currency', code: 'ZZZ', symbol: 'Z' });
    expect(response.status).toBe(201); expect(Currency.create).toHaveBeenCalledTimes(1);
    expect(mutations.reduce((count, spy) => count + spy.mock.calls.length, 0)).toBe(1);
  });
  it('preserves role-catalog access for explicit role creators without a view-role grant', async () => {
    staffGrants = [{ component: 'manageRolesAndPermissions', actions: { create_role: true } }];
    const token = jwt.sign({ id: staffId }, process.env.JWT_SECRET!);
    expect((await request('GET', '/roles/permission-catalog', token)).status).toBe(200);
    expect((await request('GET', '/roles', token)).status).toBe(403);
  });
  it('rejects serverless disk actions before multipart parsing, storage or external side effects', async () => {
    const original = process.env.VERCEL;
    try {
      process.env.VERCEL = '1';
      staffGrants = [{ component: 'manageSettings', actions: { edit_restaurant_settings: true } }, { component: 'manageCustomers', actions: { import_customer: true } }];
      const token = jwt.sign({ id: staffId }, process.env.JWT_SECRET!);
      for (const [method, url] of [['POST', '/upload'], ['POST', '/settings/receipt-logo'], ['DELETE', '/settings/receipt-logo'], ['POST', '/customers/import']]) {
        const result = await request(method, url, token); expect(result.status).toBe(503); expect(result.body.code).toBe('hosted_file_actions_disabled');
      }
    } finally { if (original === undefined) delete process.env.VERCEL; else process.env.VERCEL = original; }
  });
  it('serves bundled hosted branding through the mounted safe response chain and preserves denial precedence', async () => {
    const original = process.env.PORTFOLIO_HOSTED_MODE;
    try {
      process.env.PORTFOLIO_HOSTED_MODE = '1';
      jest.spyOn(Setting, 'findOne').mockImplementation(() => chain({ system: { companyName: 'La Tavola', companyLogo: 'http://localhost:5000/uploads/approved-logo.jpg', password: 'fixture-secret' } }));
      const branding = await request('GET', '/branding');
      expect(branding.body.data).toEqual({ companyName: 'La Tavola', companyLogo: '/portfolio-assets/la-tavola-logo.jpg' });
      const settings = await request('GET', '/settings/system', demoToken);
      expect(settings.body.data.system.companyLogo).toBe('/portfolio-assets/la-tavola-logo.jpg');
      expect(JSON.stringify(settings.body)).not.toContain('fixture-secret');
      const token = jwt.sign({ id: staffId }, process.env.JWT_SECRET!);
      for (const [method, url] of [['POST', '/upload'], ['POST', '/settings/receipt-logo'], ['DELETE', '/settings/receipt-logo'], ['POST', '/customers/import']]) {
        expect((await request(method, url)).status).toBe(401);
        expect((await request(method, url, token)).status).toBe(403);
        expect((await request(method, url, demoToken)).body.code).toBe('demo_read_only');
      }
    } finally { if (original === undefined) delete process.env.PORTFOLIO_HOSTED_MODE; else process.env.PORTFOLIO_HOSTED_MODE = original; }
  });
  it('exposes safe active selling options to POS staff without requiring warehouse-directory grants', async () => {
    staffGrants = [{ component: 'managePOS', actions: { view_pos: true } }];
    const token = jwt.sign({ id: staffId }, process.env.JWT_SECRET!);
    jest.spyOn(Warehouse, 'find').mockImplementation(() => chain([{ _id: staffRole, name: 'Counter', isActive: true, privateKey: 'not-public' }]));
    jest.spyOn(Setting, 'findOne').mockImplementation(() => chain({ system: { defaultPosWarehouseId: staffRole } }));
    const result = await request('GET', '/pos/locations', token);
    expect(result.status).toBe(200); expect(result.body.data.defaultWarehouseId).toBe(staffRole);
    expect((await request('GET', '/warehouses', token)).status).toBe(403);
    const demo = await request('GET', '/pos/locations', demoToken);
    expect(demo.body.data.locations[0]).toEqual({ _id: staffRole, name: 'Counter', isActive: true });
    expect(demo.body.data.defaultWarehouseId).toBe(staffRole);
  });
  it('keeps empty currency reads side-effect free and no register is created', async () => {
    expect((await request('GET', '/currencies', demoToken)).body.data).toEqual([]);
    expect((await request('GET', '/pos/active', demoToken)).body.data).toBeNull();
    expect(Currency.insertMany).not.toHaveBeenCalled();
  });
  it('does not allow demo sessions to invoke password reset/email/provisioning flows', async () => {
    for (const url of ['/auth/forgot-password', '/auth/initial-run', '/auth/login']) expect((await request('POST', url, demoToken)).status).toBe(403);
    expect((await request('PUT', '/auth/reset-password', demoToken)).status).toBe(403);
  });
  it('redacts private settings and account fields through the actual routing chain', async () => {
    jest.spyOn(Setting, 'findOne').mockImplementation(() => chain({ system: { companyName: 'La Tavola', currency: 'LKR', companyMobile: 'private-contact', password: 'fixture-secret', developedBy: 'private' } }));
    jest.spyOn(MailSetting, 'findOne').mockImplementation(() => chain({ username: 'private-mail', password: 'fixture-secret', mailHost: 'private-host' }));
    const system = await request('GET', '/settings/system', demoToken);
    expect(system.body.data.system).toEqual({ companyName: 'La Tavola', currency: 'LKR' });
    const mail = await request('GET', '/settings/mail', demoToken);
    expect(mail.body.data).toEqual({ credentialsRedacted: true });
  });
  it('uses nested allowlists and removes arbitrary stored fields, even inside business responses', () => {
    const response = demoResponse({ status: 'success', data: [{ name: 'Dish', warehouse: { storage: { productQty: 3, smtpPassword: 'fixture-secret' } }, createdBy: { passwordHash: 'fixture-secret' }, token: 'fixture-secret', metadata: { secret: 'fixture-secret' } }] }, 'product');
    expect(response.data[0].warehouse.storage.productQty).toBe(3); expect(JSON.stringify(response)).not.toContain('fixture-secret');
    const user = demoResponse({ status: 'success', data: [{ name: 'Staff', email: 'private', password: 'fixture-secret', roleId: { _id: staffRole, name: 'Staff', privateKey: 'fixture-secret' } }] }, 'user');
    expect(user.data[0].email).toBeUndefined(); expect(user.data[0].roleId.name).toBe('Staff');
  });
  it('preserves financial zero values and saved kitchen ticket/receipt fields', () => {
    const body = demoResponse({ status: 'success', data: { invoiceId: 'SALE-0001', total: 2400, changeAmount: 0, cashAmount: 2400, products: [{ productName: 'Fried Rice', qty: 2, price: 1150, isPrepared: true }, { productName: 'Water', qty: 1, price: 100, isPrepared: false }], kitchenTicket: { status: 'available', saleId: staffId, orderedAt: '2026-11-05T05:00:00Z', displayTime: '2026-11-05 10:30', reference: 'SALE-0001', items: [{ name: 'Fried Rice', quantity: 2 }] } } }, 'sale');
    expect(body.data.changeAmount).toBe(0); expect(body.data.products).toHaveLength(2); expect(body.data.kitchenTicket.items).toEqual([{ name: 'Fried Rice', quantity: 2 }]);
  });
});
