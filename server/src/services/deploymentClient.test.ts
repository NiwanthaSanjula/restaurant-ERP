import fs from 'fs';
import path from 'path';
import ts from 'typescript';
const source = fs.readFileSync(path.resolve(__dirname, '../../../client/vite.config.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
function config(url?: string, hosted = true) {
  const bindings = { env: { VERCEL: hosted ? '1' : undefined, VITE_API_URL: url }, cwd: () => '/fixture' };
  const requireFixture = (name: string) => name === 'vite' ? { defineConfig: (fn: unknown) => fn, loadEnv: () => ({}) } : { __esModule: true, default: () => ({ name: 'react-fixture' }) };
  const module = { exports: {} as { default?: (context: { mode: string }) => unknown } };
  new Function('require', 'process', 'exports', compiled)(requireFixture, bindings, module.exports);
  return () => module.exports.default!({ mode: 'production' });
}
it.each([undefined, 'http://localhost:5000/api', 'https://api.example.invalid/api/', 'https://user:password@api.example.invalid/api', 'https://api.example.invalid/api?token=private'])('rejects unsafe/missing hosted API configuration %p', url => {
  expect(config(url)).toThrow('Vercel requires VITE_API_URL');
});
it('accepts the explicit public HTTPS API and preserves local development builds', () => {
  expect(config('https://api.example.invalid/api')()).toMatchObject({ plugins: [{ name: 'react-fixture' }] });
  expect(config(undefined, false)()).toMatchObject({ plugins: [{ name: 'react-fixture' }] });
});
it('enables hosted file restrictions automatically on Vercel and leaves local development unchanged', () => {
  expect(config('https://api.example.invalid/api')()).toMatchObject({ define: { 'import.meta.env.VITE_HOSTED_MODE': '"true"' } });
  expect(config(undefined, false)()).toMatchObject({ define: { 'import.meta.env.VITE_HOSTED_MODE': '"false"' } });
});
