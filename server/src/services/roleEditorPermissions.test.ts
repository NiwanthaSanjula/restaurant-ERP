import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve(__dirname, '../../../client/src/components/roles&Permissions/roleEditorPermissions.ts'), 'utf8');
const client = new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText + '\nreturn exports;')({});
const saved = [{ component: 'manageRolesAndPermissions', actions: { view_role: true, edit_role: true } }, { component: 'managePurchases', actions: { read: false } }];
describe('role permission review', () => {
  it('shows no changes for unchanged effective selections', () => {
    expect(client.permissionDiff(saved, structuredClone(saved))).toEqual({ added: [], removed: [] });
  });
  it('shows only the independently selected Purchases Read grant', () => {
    const next = structuredClone(saved); next[1].actions.read = true;
    expect(client.permissionDiff(saved, next)).toEqual({ added: ['managePurchases:read'], removed: [] });
    expect(client.permissionLabel('managePurchases:read')).toBe('Purchases → Read');
  });
  it('shows removed grants without treating false entries as removals or mutating the baseline', () => {
    const next = structuredClone(saved); next[0].actions.edit_role = false;
    expect(client.permissionDiff(saved, next)).toEqual({ added: [], removed: ['manageRolesAndPermissions:edit_role'] });
    expect(saved[0].actions.edit_role).toBe(true);
  });
});
