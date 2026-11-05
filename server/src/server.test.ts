import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import express from 'express';
import { IncomingMessage, ServerResponse, Server } from 'http';
import { Socket } from 'net';
import bcrypt from 'bcryptjs';
import User from './models/User';
import { createHttpApp } from './httpApp';

const source = fs.readFileSync(path.join(__dirname, 'server.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true
} }).outputText;

// Execute the actual entrypoint with isolated environment/startup dependencies.
// HTTP middleware/routes remain real; no listener or database is opened.
function entrypoint(main = false, connect = jest.fn(async () => {})) {
  const moduleFixture = { exports: {} as { default?: express.Express } };
  const bindings = {
    dotenv: { config: jest.fn() }, express,
    './config/database': { __esModule: true, default: connect },
    './httpApp': { createHttpApp }
  };
  const requireFixture = Object.assign((name: string) => {
    if (!Object.prototype.hasOwnProperty.call(bindings, name)) throw Error('Unexpected entry dependency');
    return bindings[name];
  }, { main: main ? moduleFixture : {} });
  new Function('require', 'module', 'exports', 'process', compiled)(requireFixture, moduleFixture, moduleFixture.exports, process);
  return { app: moduleFixture.exports.default!, connect };
}
function request(app: express.Express, url: string) {
  return new Promise<{ status: number; body: any; poweredBy: unknown; origin: unknown; csp: unknown }>((resolve, reject) => {
    const socket = new Socket();
    const req = Object.assign(new IncomingMessage(socket), { method: 'GET', url,
      headers: { host: 'fixture.invalid', origin: 'https://client.example.invalid' } });
    const res = new ServerResponse(req);
    jest.spyOn(res, 'end').mockImplementation(chunk => {
      try { resolve({ status: res.statusCode, body: JSON.parse(String(chunk)), poweredBy: res.getHeader('x-powered-by'),
        origin: res.getHeader('access-control-allow-origin'), csp: res.getHeader('content-security-policy') }); }
      catch (error) { reject(error); }
      socket.destroy(); return res;
    });
    app(req, res);
  });
}
beforeEach(() => {
  jest.replaceProperty(process, 'env', { ...process.env, VERCEL: '1', NODE_ENV: 'production',
    JWT_SECRET: 'isolated-startup-regression-secret-32-characters',
    MONGODB_URI: 'mongodb://fixture.invalid/unreachable', FRONTEND_URL: 'https://client.example.invalid',
    DEMO_SESSION_STORE: 'mongodb' });
  jest.spyOn(express.application, 'listen').mockImplementation(() => ({} as Server));
});
afterEach(() => jest.restoreAllMocks());

it('directly imports Express as a runtime dependency at the recognized entrypoint', () => {
  const parsed = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
  expect(parsed.statements.some(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) &&
    node.moduleSpecifier.text === 'express' && node.importClause && !node.importClause.isTypeOnly)).toBe(true);
});
it('exports a functional hosted application without connecting or listening on import', async () => {
  const { app, connect } = entrypoint();
  expect(typeof app).toBe('function'); expect(connect).not.toHaveBeenCalled();
  expect(express.application.listen).not.toHaveBeenCalled();
  const response = await request(app, '/api/health');
  expect(response.status).toBe(200); expect(connect).toHaveBeenCalledTimes(1);
  expect(response.poweredBy).toBeUndefined(); expect(response.origin).toBe('https://client.example.invalid');
  expect(response.csp).toEqual(expect.any(String));
  expect((await request(app, '/api/purchases')).status).toBe(401);
  expect((await request(app, '/missing')).status).toBe(404);
});
it('awaits hosted connection readiness and fails safely before routing', async () => {
  let release: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const { app } = entrypoint(false, jest.fn(() => wait));
  const result = request(app, '/api/health'); let finished = false;
  void result.then(() => { finished = true; }); await Promise.resolve(); expect(finished).toBe(false);
  release!(); expect((await result).status).toBe(200);
  const failed = entrypoint(false, jest.fn(async () => { throw Error('private storage detail'); }));
  const response = await request(failed.app, '/api/health');
  expect(response.status).toBe(503); expect(JSON.stringify(response.body)).not.toContain('private storage detail');
});
it('does not listen even when Vercel loads the entrypoint as main', async () => {
  const { connect } = entrypoint(true); await Promise.resolve();
  expect(connect).not.toHaveBeenCalled(); expect(express.application.listen).not.toHaveBeenCalled();
});
it('preserves local import behavior and starts locally only after connection readiness', async () => {
  delete process.env.VERCEL; process.env.NODE_ENV = 'development'; process.env.PORT = '5678';
  const imported = entrypoint(); expect(imported.connect).not.toHaveBeenCalled();
  let release: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const { connect } = entrypoint(true, jest.fn(() => pending));
  expect(connect).toHaveBeenCalledTimes(1); expect(express.application.listen).not.toHaveBeenCalled();
  release!(); await Promise.resolve();
  expect(express.application.listen).toHaveBeenCalledWith('5678', expect.any(Function));
});
it('preserves safe local connection failure without starting a listener', async () => {
  delete process.env.VERCEL; process.env.NODE_ENV = 'development';
  const originalExitCode = process.exitCode, error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    entrypoint(true, jest.fn(async () => { throw Error('private storage detail'); }));
    await Promise.resolve(); await Promise.resolve();
    expect(express.application.listen).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith('Database connection failed; connection details withheld.');
  } finally { process.exitCode = originalExitCode; }
});
it.each([
  ['JWT_SECRET', undefined], ['JWT_SECRET', 'short'], ['MONGODB_URI', undefined],
  ['FRONTEND_URL', undefined], ['FRONTEND_URL', 'http://client.example.invalid'],
  ['FRONTEND_URL', 'https://client.example.invalid/path'], ['DEMO_SESSION_STORE', 'memory']
])('preserves deployment environment validation for %s = %s', (key, value) => {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  expect(() => entrypoint()).toThrow(); expect(express.application.listen).not.toHaveBeenCalled();
});
it('compares saved bcrypt password hashes using the existing pure-JS runtime without native bindings', async () => {
  const hash = await bcrypt.hash('isolated-password-fixture', 4);
  const user = new User({ passwordHash: hash });
  expect(await user.comparePassword('isolated-password-fixture')).toBe(true);
  expect(await user.comparePassword('incorrect')).toBe(false);
});
