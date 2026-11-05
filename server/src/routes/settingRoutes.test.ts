import express from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import settingsRouter from './settingRoutes';
import { PermissionMap } from '../models/RolePermissions';

const mocks = {
  verify: jest.fn(), user: jest.fn(), permissions: jest.fn(),
  systemRead: jest.fn(), systemWrite: jest.fn(),
  mailRead: jest.fn(), mailWrite: jest.fn(),
  receiptRead: jest.fn(), receiptWrite: jest.fn(), receiptCreate: jest.fn(), upload: jest.fn(), location: jest.fn()
};

jest.mock('jsonwebtoken', () => ({
  __esModule: true, default: { verify: (...args: unknown[]) => mocks.verify(...args) }
}));
jest.mock('../models/User', () => ({
  __esModule: true, default: { findById: (...args: unknown[]) => mocks.user(...args) }
}));
jest.mock('../models/Role', () => ({
  __esModule: true, default: { findById: (...args: unknown[]) => mocks.permissions(...args) }
}));
jest.mock('../models/Setting', () => ({
  __esModule: true, default: {
    findOne: (...args: unknown[]) => mocks.systemRead(...args),
    findOneAndUpdate: (...args: unknown[]) => mocks.systemWrite(...args)
  }
}));
jest.mock('../models/Warehouse', () => ({ __esModule: true, default: { findOne: (...args: unknown[]) => mocks.location(...args) } }));
jest.mock('../models/MailSetting', () => ({
  __esModule: true, default: {
    findOne: (...args: unknown[]) => mocks.mailRead(...args),
    findOneAndUpdate: (...args: unknown[]) => mocks.mailWrite(...args)
  }
}));
jest.mock('../models/ReceiptSetting', () => ({
  __esModule: true, default: {
    findOne: (...args: unknown[]) => mocks.receiptRead(...args),
    findOneAndUpdate: (...args: unknown[]) => mocks.receiptWrite(...args),
    create: (...args: unknown[]) => mocks.receiptCreate(...args)
  }
}));
// The real upload boundary is replaced before it can create files.
jest.mock('multer', () => ({
  __esModule: true,
  default: Object.assign(() => ({
    single: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      mocks.upload();
      req.file = { filename: 'sample-logo.png' } as Express.Multer.File;
      next();
    }
  }), { diskStorage: (options: unknown) => options })
}));

const app = express();
// Use the production mount and real router, authentication, permission middleware and controllers.
// Incoming messages have parsed JSON bodies; no listening server or database is started.
app.use('/api/settings', settingsRouter);

function request(method: string, route: string, role?: string, body: Record<string, unknown> = {}) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), {
      method, url: `/api/settings${route}`, body,
      headers: { host: 'settings.test', ...(role ? { authorization: `Bearer ${role}` } : {}) }
    });
    const res = new ServerResponse(req);
    jest.spyOn(res, 'end').mockImplementation((chunk: unknown) => {
      try {
        resolve({ status: res.statusCode, body: JSON.parse(String(chunk)) });
      } catch (error) { reject(error); }
      socket.destroy();
      return res;
    });
    app(req, res);
  });
}

const secret = 'test-only-smtp-value';
describe('Default POS selling-location settings contract', () => {
  const id = 'a'.repeat(24);
  it('lets the existing settings administrator set only the active-location field', async () => {
    const originalName = system.companyName;
    const response = await request('PUT', '/system', 'admin', { system: { defaultPosWarehouseId: id } });
    expect(response.status).toBe(200); expect(system.defaultPosWarehouseId).toBe(id); expect(system.companyName).toBe(originalName);
    expect(mocks.systemWrite.mock.calls[0][1]).toEqual({ $set: { 'system.defaultPosWarehouseId': id } });
    expect((await request('GET', '/system', 'staff')).body.data).toMatchObject({ system: { defaultPosWarehouseId: id } });
  });
  it('preserves the default when omitted and supports explicit removal', async () => {
    system.defaultPosWarehouseId = id;
    expect((await request('PUT', '/system', 'admin', { system: { companyName: 'Fixture restaurant' } })).status).toBe(200);
    expect(system.defaultPosWarehouseId).toBe(id);
    expect((await request('PUT', '/system', 'admin', { system: { defaultPosWarehouseId: null } })).status).toBe(200);
    expect(system.defaultPosWarehouseId).toBeNull();
  });
  it('stores a canonical location ID when an administrator provides valid uppercase hex', async () => {
    expect((await request('PUT', '/system', 'admin', { system: { defaultPosWarehouseId: id.toUpperCase() } })).status).toBe(200);
    expect(system.defaultPosWarehouseId).toBe(id);
  });
  it.each(['not-an-id', false, 42])('rejects invalid location %p without updating settings', async value => {
    expect((await request('PUT', '/system', 'admin', { system: { defaultPosWarehouseId: value } })).status).toBe(400);
    expect(mocks.systemWrite).not.toHaveBeenCalled();
  });
  it('rejects inactive/missing locations without updating settings', async () => {
    mocks.location.mockImplementation(() => ({ select: () => ({ lean: async () => null }) }));
    expect((await request('PUT', '/system', 'admin', { system: { defaultPosWarehouseId: id } })).status).toBe(400);
    expect(mocks.systemWrite).not.toHaveBeenCalled();
  });
  it('rejects ordinary staff setting changes before location lookup or settings writes', async () => {
    expect((await request('PUT', '/system', 'staff', { system: { defaultPosWarehouseId: id } })).status).toBe(403);
    expect(mocks.location).not.toHaveBeenCalled(); expect(mocks.systemWrite).not.toHaveBeenCalled();
  });
});
const adminPermissions = {
  view_settings: true, edit_restaurant_settings: true,
  view_mail_settings: true, edit_notification_settings: true
};
const roles: Record<string, PermissionMap> = {
  admin: { manageSettings: adminPermissions },
  staff: { managePOS: { view_pos: true } },
  reader: { manageSettings: { view_settings: true, view_mail_settings: true } },
  restaurantEditor: { manageSettings: { edit_restaurant_settings: true } }
};
const roleIds = Object.fromEntries(Object.keys(roles).map((role, index) => [role, (index + 1).toString(16).padStart(24, '0')]));
const safeSystem = {
  companyLogo: '/sample.png', currency: 'LKR', companyName: 'Example',
  defaultEmail: 'example@example.invalid', companyMobile: '000',
  address: 'Sample road', city: 'Sample city', country: 'Sample country', postalCode: '00000'
};
const mailInput = {
  mailMailer: 'smtp', mailHost: 'smtp.example.invalid', mailPort: 587,
  mailSenderName: 'Example', username: 'example@example.invalid'
};
let system: Record<string, unknown>;
let mail: Record<string, unknown> | null;
let receipt: Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mocks.location.mockImplementation(() => ({ select: () => ({ lean: async () => ({ _id: 'a'.repeat(24) }) }) }));
  system = { ...safeSystem, whatsappNumber: '000', developedBy: 'Example', dateFormat: 'DD/MM/YYYY', password: secret };
  mail = { ...mailInput, password: secret, apiKey: secret, _id: 'mail-id' };
  receipt = { showTax: false, showNote: true, note: 'Sample note', logoUrl: '', password: secret, credentials: { value: secret } };
  mocks.verify.mockImplementation((token: string) => {
    if (token === 'invalid') throw new Error('Invalid test token');
    return { id: token };
  });
  mocks.user.mockImplementation((role: string) => ({
    select: jest.fn().mockResolvedValue({ role, roleId: roleIds[role], isActive: role !== 'inactive' })
  }));
  mocks.permissions.mockImplementation((id: string) => {
    const roleName = Object.keys(roleIds).find(role => roleIds[role] === id);
    return { lean: jest.fn().mockResolvedValue(roleName ? { _id: id, name: roleName, isActive: true,
      permissions: Object.entries(roles[roleName]).map(([component, actions]) => ({ component, actions })) } : null) };
  });
  mocks.systemRead.mockImplementation(async () => ({ system, mail: { password: secret }, credentials: secret }));
  mocks.systemWrite.mockImplementation(async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
    for (const [key, value] of Object.entries(update.$set)) system[key.slice('system.'.length)] = value;
    return { system, mail: { password: secret } };
  });
  mocks.mailRead.mockImplementation(async () => mail ? { ...mail } : null);
  mocks.mailWrite.mockImplementation(async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
    mail = { ...mail, ...update.$set };
    return mail;
  });
  mocks.receiptRead.mockImplementation(async () => receipt);
  mocks.receiptWrite.mockImplementation(async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
    receipt = { ...receipt, ...update.$set };
    return receipt;
  });
  mocks.receiptCreate.mockImplementation(async () => receipt);
});

const endpoints: [string, string, Record<string, unknown>][] = [
  ['GET', '/system', {}], ['PUT', '/system', { 'system.currency': 'LKR' }],
  ['GET', '/mail', {}], ['POST', '/mail', mailInput],
  ['GET', '/receipt', {}], ['POST', '/receipt', { showTax: false }],
  ['GET', '/receipt-config', {}], ['PUT', '/receipt-config', { showTax: false }],
  ['POST', '/receipt-logo', {}], ['DELETE', '/receipt-logo', {}]
];

describe('settings mounted access policy, including legacy aliases', () => {
  it.each(endpoints)('denies anonymous %s %s before storage/upload', async (method, route, body) => {
    expect((await request(method, route, undefined, body)).status).toBe(401);
    for (const name of ['systemRead', 'systemWrite', 'mailRead', 'mailWrite', 'receiptRead', 'receiptWrite', 'receiptCreate', 'upload', 'permissions']) {
      expect(mocks[name]).not.toHaveBeenCalled();
    }
  });

  it.each(endpoints.slice(1))('denies ordinary staff %s %s', async (method, route, body) => {
    expect((await request(method, route, 'staff', body)).status).toBe(403);
    expect(mocks.systemWrite).not.toHaveBeenCalled();
    expect(mocks.mailRead).not.toHaveBeenCalled();
    expect(mocks.mailWrite).not.toHaveBeenCalled();
    expect(mocks.receiptRead).not.toHaveBeenCalled();
    expect(mocks.receiptWrite).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it.each(endpoints)('allows a permitted administrator %s %s without exposing stored secrets', async (method, route, body) => {
    const result = await request(method, route, 'admin', body);
    expect(result.status).toBe(200);
    expect(JSON.stringify(result.body)).not.toContain(secret);
    expect(result.body.data).not.toHaveProperty('password');
    expect(result.body.data).not.toHaveProperty('credentials');
    expect(result.body.data).not.toHaveProperty('apiKey');
  });

  it.each(['invalid', 'inactive'])('rejects %s authentication', async (token) => {
    expect((await request('GET', '/system', token)).status).toBe(401);
    expect(mocks.systemRead).not.toHaveBeenCalled();
  });

  it('does not bypass missing canonical grants for a legacy administrator role name', async () => {
    expect((await request('PUT', '/system', 'Super Admin', { 'system.currency': 'LKR' })).status).toBe(403);
    expect(mocks.systemWrite).not.toHaveBeenCalled();
  });

  it.each(endpoints.filter(([method]) => method !== 'GET'))('a reader cannot mutate using %s %s', async (method, route, body) => {
    expect((await request(method, route, 'reader', body)).status).toBe(403);
  });

  it('restaurant settings permission does not grant access to SMTP configuration', async () => {
    expect((await request('GET', '/mail', 'restaurantEditor')).status).toBe(403);
    expect((await request('POST', '/mail', 'restaurantEditor', mailInput)).status).toBe(403);
  });
});

describe('system and receipt allowlists', () => {
  it.each(['staff'])('returns only active-screen fields to %s', async (role) => {
    expect((await request('GET', '/system', role)).body).toEqual({ success: true, data: { system: safeSystem } });
  });

  it('denies an unprovisioned role before settings storage', async () => {
    expect((await request('GET', '/system', 'unprovisioned')).status).toBe(403);
    expect(mocks.systemRead).not.toHaveBeenCalled();
  });

  it('returns editor fields only with view_settings, excluding unknown stored fields', async () => {
    const result = await request('GET', '/system', 'reader');
    expect(result.body.data).toEqual({ system: { ...safeSystem, whatsappNumber: '000', developedBy: 'Example', dateFormat: 'DD/MM/YYYY' } });
  });

  it('supports nested and dotted system updates without permitting cross-settings/operator updates', async () => {
    const result = await request('PUT', '/system', 'admin', {
      system: { companyName: 'Changed', password: secret }, 'system.currency': 'USD',
      'mail.password': secret, mail: { password: secret }, $unset: { system: '' }
    });
    expect(result.status).toBe(200);
    expect(mocks.systemWrite.mock.calls[0][1]).toEqual({ $set: { 'system.companyName': 'Changed', 'system.currency': 'USD' } });
    expect(JSON.stringify(result.body)).not.toContain(secret);
  });

  it.each(['/receipt', '/receipt-config'])('allowlists receipt reads at %s, retaining false', async (route) => {
    const result = await request('GET', route, 'reader');
    expect(result.body.data).toEqual({ showTax: false, showNote: true, note: 'Sample note', logoUrl: '' });
  });

  it.each(['/receipt', '/receipt-config'])('returns missing receipt defaults at %s without creating settings with read-only permission', async (route) => {
    mocks.receiptRead.mockResolvedValue(null);
    const result = await request('GET', route, 'reader');
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ logoUrl: '' });
    expect(mocks.receiptCreate).not.toHaveBeenCalled();
    expect(mocks.receiptWrite).not.toHaveBeenCalled();
  });

  it('allowlists valid receipt changes and their response', async () => {
    const result = await request('POST', '/receipt', 'admin', { showTax: false });
    expect(result.status).toBe(200);
    expect(mocks.receiptWrite.mock.calls[0][1]).toEqual({ $set: { showTax: false } });
    expect(JSON.stringify(result.body)).not.toContain(secret);
  });

  it('rejects mixed supported and unsupported receipt fields without discarding them', async () => {
    expect((await request('POST', '/receipt', 'admin', { showTax: false, password: secret })).status).toBe(400);
    expect(mocks.receiptWrite).not.toHaveBeenCalled();
  });

  it('rejects unsupported system update fields', async () => {
    expect((await request('PUT', '/system', 'admin', { mail: { password: secret } })).status).toBe(400);
    expect(mocks.systemWrite).not.toHaveBeenCalled();
  });

  it('does not silently accept the existing receipt editor/schema mismatch', async () => {
    expect((await request('PUT', '/receipt-config', 'admin', { header: { showLogo: true } })).status).toBe(400);
    expect(mocks.receiptWrite).not.toHaveBeenCalled();
  });
});

describe('SMTP password handling', () => {
  it.each([undefined, '', '   ', '********', '\u2022\u2022\u2022\u2022', '[REDACTED]', '<redacted>'])('preserves an existing password for omitted/blank/redacted input %#', async (password) => {
    const result = await request('POST', '/mail', 'admin', { ...mailInput, ...(password === undefined ? {} : { password }) });
    expect(result.status).toBe(200);
    expect(mocks.mailWrite.mock.calls[0][1].$set).not.toHaveProperty('password');
    expect(mail.password).toBe(secret);
    expect(result.body.data).toEqual({ ...mailInput, hasPassword: true });
  });

  it('preserves a concurrent password change rather than writing back a stale value', async () => {
    const savedWrite = mocks.mailWrite.getMockImplementation();
    mocks.mailWrite.mockImplementation(async (...args: unknown[]) => {
      mail.password = 'test-only-concurrent-value';
      return savedWrite(...args);
    });
    await request('POST', '/mail', 'admin', mailInput);
    expect(mail.password).toBe('test-only-concurrent-value');
  });

  it('allows an explicit new password without returning it', async () => {
    const result = await request('POST', '/mail', 'admin', { ...mailInput, password: ' test-only-new-value ' });
    expect(mail.password).toBe('test-only-new-value');
    expect(result.body.data).toEqual({ ...mailInput, hasPassword: true });
  });

  it('requires a genuine password for the first save', async () => {
    mail = null;
    expect((await request('POST', '/mail', 'admin', mailInput)).status).toBe(400);
    expect((await request('POST', '/mail', 'admin', { ...mailInput, password: '********' })).status).toBe(400);
    expect(mocks.mailWrite).not.toHaveBeenCalled();
    expect((await request('POST', '/mail', 'admin', { ...mailInput, password: secret })).status).toBe(200);
  });
});

describe('error responses', () => {
  it.each([
    ['GET', '/system', 'systemRead', {}], ['PUT', '/system', 'systemWrite', { 'system.currency': 'LKR' }],
    ['GET', '/mail', 'mailRead', {}], ['POST', '/mail', 'mailWrite', mailInput],
    ['GET', '/receipt', 'receiptRead', {}], ['POST', '/receipt', 'receiptWrite', { showTax: true }],
    ['POST', '/receipt-logo', 'receiptWrite', {}], ['DELETE', '/receipt-logo', 'receiptWrite', {}]
  ])('does not echo storage error details from %s %s', async (method: string, route: string, mockName: string, body: Record<string, unknown>) => {
    mocks[mockName].mockRejectedValue(new Error(secret));
    const result = await request(method, route, 'admin', body);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(result.body)).not.toContain(secret);
  });
});

// Compile the actual, dependency-free client adapter without changing either app's compiler settings.
const clientDirectory = path.resolve(__dirname, '../../../client/src/components/settings');
const editorSource = fs.readFileSync(path.join(clientDirectory, 'ReceiptSettings.tsx'), 'utf8');
const editorAst = ts.createSourceFile('ReceiptSettings.tsx', editorSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function editorDeclaration(name: string) {
  let result = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(editorAst) === name) result = `const ${node.getText(editorAst)};`;
    ts.forEachChild(node, visit);
  };
  visit(editorAst);
  if (!result) throw new Error(`Missing editor declaration: ${name}`);
  return result;
}
const compileClient = (source: string) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
const contract = new Function('exports', compileClient(fs.readFileSync(path.join(clientDirectory, 'receiptSettingsContract.ts'), 'utf8')) + '\nreturn exports;')({});
const editorDefaults = new Function(compileClient(editorDeclaration('DEFAULT_SETTINGS')) + '\nreturn DEFAULT_SETTINGS;')();

describe('receipt editor and persisted contract integration', () => {
  it.each([['/receipt', 'POST'], ['/receipt-config', 'PUT']])('retains values through load/edit/save/reload using %s', async (route, method) => {
    receipt = {
      showNote: true, note: 'Existing note', showAddress: false, showBarcode: false, showTax: false,
      showPhone: true, showEmail: true, showLogo: false, showCustomer: true,
      showDiscountShipping: false, showProductCode: false, logoUrl: '/saved-logo.png'
    };
    const initial = contract.parseReceiptConfig((await request('GET', route, 'reader')).body.data);
    const editor = contract.receiptToEditor(initial, editorDefaults);
    expect(contract.receiptEditorPatch(editor, contract.receiptToEditor(initial, editorDefaults))).toEqual({});
    editor.summary.showTax = true;
    editor.header.showCustomer = false;
    editor.footer.note = 'Edited note';
    const patch = contract.receiptEditorPatch(editor, contract.receiptToEditor(initial, editorDefaults));
    expect(patch).toEqual({ showTax: true, showCustomer: false, note: 'Edited note' });
    const saved = await request(method, route, 'admin', patch);
    const parsed = await contract.readReceiptResult({ ok: saved.status === 200, json: async () => saved.body }, 'save');
    const reloaded = (await request('GET', route, 'reader')).body.data;
    expect(reloaded).toEqual({ ...initial, ...patch });
    expect(parsed).toEqual(reloaded);
    expect(contract.receiptToEditor(reloaded, editorDefaults)).toEqual(editor);
  });

  it('does not materialize display defaults or overwrite omitted optional values', async () => {
    const empty = contract.receiptToEditor({}, editorDefaults);
    expect(contract.receiptEditorPatch(empty, contract.receiptToEditor({}, editorDefaults))).toEqual({});
    empty.header.showLogo = false;
    expect(contract.receiptEditorPatch(empty, contract.receiptToEditor({}, editorDefaults))).toEqual({ showLogo: false });
    const original = { ...receipt };
    expect((await request('PUT', '/receipt-config', 'admin', { showTax: true })).status).toBe(200);
    expect(receipt).toEqual({ ...original, showTax: true });
    expect(mocks.receiptWrite.mock.calls[0][1]).toEqual({ $set: { showTax: true } });
  });

  it('preserves an omitted saved note while enabling or disabling it', async () => {
    expect((await request('PUT', '/receipt-config', 'admin', { showNote: true })).status).toBe(200);
    expect(receipt.note).toBe('Sample note');
    expect((await request('PUT', '/receipt-config', 'admin', { showNote: false })).status).toBe(200);
    expect(receipt.note).toBe('Sample note');
  });

  it.each([
    {}, { header: { showLogo: true } }, { showLogo: 'false' }, { note: false },
    { logoUrl: 7 }, { showNote: null }, { showTax: true, unsupported: true },
    { showNote: true, note: '   ' }, { note: '' }
  ])('rejects invalid or unsupported receipt payload %# without writing', async (body) => {
    expect((await request('PUT', '/receipt-config', 'admin', body)).status).toBe(400);
    expect(mocks.receiptWrite).not.toHaveBeenCalled();
  });

  it('keeps logo values out of subsequent patches after upload/delete updates the baseline', () => {
    for (const logoUrl of ['/uploaded-logo.png', '']) {
      const saved = { logoUrl, showTax: false };
      const editor = contract.receiptToEditor(saved, editorDefaults);
      editor.summary.showTax = true;
      expect(contract.receiptEditorPatch(editor, contract.receiptToEditor(saved, editorDefaults))).toEqual({ showTax: true });
    }
  });

  it.each([400, 401, 403, 500, 200])('keeps failed save %s visibly failed and retains unsaved editor values', async (status) => {
    const savedSettings = { showTax: false, showNote: true, note: 'Saved note' };
    const settings = contract.receiptToEditor(savedSettings, editorDefaults);
    settings.summary.showTax = true;
    settings.footer.note = 'Unsaved note';
    const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
    const setSettings = jest.fn(), setSavedSettings = jest.fn(), setLoading = jest.fn();
    const fetch = jest.fn().mockResolvedValue({ ok: status === 200, json: async () => ({ success: false, message: 'Save denied' }) });
    const bindings = {
      isLoaded: true, setLoading, settings, savedSettings, DEFAULT_SETTINGS: editorDefaults,
      receiptEditorPatch: contract.receiptEditorPatch, receiptToEditor: contract.receiptToEditor,
      fetch, apiBase: 'http://mock.invalid/api', authHeaders: {}, readReceiptResult: contract.readReceiptResult,
      setSavedSettings, setSettings, toast
    };
    const save = new Function(...Object.keys(bindings), compileClient(editorDeclaration('handleSave')) + '\nreturn handleSave;')(...Object.values(bindings));
    await save();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Save denied');
    expect(setSettings).not.toHaveBeenCalled();
    expect(setSavedSettings).not.toHaveBeenCalled();
    expect(settings.footer.note).toBe('Unsaved note');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ showTax: true, note: 'Unsaved note' });
    expect(setLoading.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });

  it('the actual editor save handler accepts the server success response and reloads supported values', async () => {
    const savedSettings = contract.parseReceiptConfig((await request('GET', '/receipt-config', 'reader')).body.data);
    const settings = contract.receiptToEditor(savedSettings, editorDefaults);
    settings.header.showLogo = false;
    const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
    const setSettings = jest.fn(), setSavedSettings = jest.fn(), setLoading = jest.fn();
    const fetch = jest.fn().mockImplementation(async (_url: string, options: { body: string }) => {
      const result = await request('PUT', '/receipt-config', 'admin', JSON.parse(options.body));
      return { ok: result.status === 200, json: async () => result.body };
    });
    const bindings = {
      isLoaded: true, setLoading, settings, savedSettings, DEFAULT_SETTINGS: editorDefaults,
      receiptEditorPatch: contract.receiptEditorPatch, receiptToEditor: contract.receiptToEditor,
      fetch, apiBase: 'http://mock.invalid/api', authHeaders: {}, readReceiptResult: contract.readReceiptResult,
      setSavedSettings, setSettings, toast
    };
    const save = new Function(...Object.keys(bindings), compileClient(editorDeclaration('handleSave')) + '\nreturn handleSave;')(...Object.values(bindings));
    await save();
    const reloaded = (await request('GET', '/receipt-config', 'reader')).body.data;
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(setSavedSettings).toHaveBeenCalledWith(reloaded);
    expect(setSettings).toHaveBeenCalledWith(contract.receiptToEditor(reloaded, editorDefaults));
    expect(mocks.receiptWrite.mock.calls[0][1]).toEqual({ $set: { showLogo: false } });
  });
});
