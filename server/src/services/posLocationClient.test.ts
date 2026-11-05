import fs from 'fs';
import path from 'path';
import ts from 'typescript';
const source = fs.readFileSync(path.resolve(__dirname, '../../../client/src/services/posLocation.ts'), 'utf8').replace('import.meta.env.VITE_API_URL', 'undefined');
const location = new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText + ';return exports;')({});
const choices = [{ _id: 'storage', name: 'Main Storage', isActive: true }, { _id: 'counter', name: 'Sales Counter', isActive: true }, { _id: 'closed', name: 'Closed location', isActive: false }];
function storage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; }
it('opens the configured counter for fresh staff and visitor identities, with no first-location fallback', () => {
  for (const user of ['staff', 'visitor']) expect(location.resolvePosLocation(user, choices, 'counter', storage())).toBe('counter');
  expect(location.resolvePosLocation('staff', choices, null, storage())).toBe('');
});
it('prefers a saved valid location and keeps accounts separate', () => {
  const local = storage();
  expect(location.rememberPosLocation('staff', 'storage', choices, local)).toBe(true);
  expect(location.resolvePosLocation('staff', choices, 'counter', local)).toBe('storage');
  expect(location.resolvePosLocation('visitor', choices, 'counter', local)).toBe('counter');
});
it.each(['closed', 'deleted', 'unauthorized'])('rejects saved/default %s locations outside the active authorized options', bad => {
  const local = storage(); local.setItem(location.posLocationStorageKey('staff'), bad);
  expect(location.resolvePosLocation('staff', choices, 'counter', local)).toBe('counter');
  expect(location.resolvePosLocation('staff', choices, bad, local)).toBe('');
  expect(location.rememberPosLocation('staff', bad, choices, local)).toBe(false);
});
it('can use the explicit default when browser storage is unavailable', () => {
  const broken = { getItem: () => { throw Error('Unavailable'); }, setItem: () => { throw Error('Unavailable'); } };
  expect(location.resolvePosLocation('staff', choices, 'counter', broken)).toBe('counter');
  expect(location.rememberPosLocation('staff', 'counter', choices, broken)).toBe(false);
});

const posSource = fs.readFileSync(path.resolve(__dirname, '../../../client/src/components/pos/POSCheckout.tsx'), 'utf8');
const parsed = ts.createSourceFile('POSCheckout.tsx', posSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
let change: ts.Expression | undefined;
function find(node: ts.Node) { if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'handleLocationChange') change = node.initializer; ts.forEachChild(node, find); }
find(parsed); if (!change) throw Error('The actual location-change handler is missing.');
const handler = ts.transpileModule(`const handleLocationChange = ${change.getText(parsed)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function runtime() {
  const local = storage();
  const bindings = { selectedWarehouseId: 'counter', warehouses: choices, validPosLocation: location.validPosLocation, sessionStorage: { getItem: () => 'register-fixture' },
    isDemo: false, userId: 'staff', pendingPosCheckout: jest.fn(() => null as unknown), localStorage: { getItem: local.getItem, setItem: jest.fn(local.setItem) },
    cartItems: [{ id: 'rice', name: 'Rice', quantity: 1 }], discountType: 'fixed', discount: 0, tax: 0, shipping: 0, selectedCustomer: null, customerQuery: '', selectedOfferId: '',
    window: { confirm: jest.fn(() => true) }, showInfoToast: jest.fn(), posCartDraftStorageKey: (id: string) => 'draft-' + id, rememberPosLocation: location.rememberPosLocation,
    setNameCodeQuery: jest.fn(), setBarcodeQuery: jest.fn(), setSelectedCategory: jest.fn(), setSelectedBrand: jest.fn(), setSelectedWarehouseId: jest.fn() };
  return { bindings, run: new Function(...Object.keys(bindings), handler + ';return handleLocationChange;')(...Object.values(bindings)) };
}
it('protects a populated cart when the cashier cancels changing location', () => {
  const { bindings, run } = runtime(); bindings.window.confirm.mockReturnValue(false); run('storage');
  expect(bindings.setSelectedWarehouseId).not.toHaveBeenCalled(); expect(bindings.localStorage.setItem).not.toHaveBeenCalled();
});
it('saves the old-location draft before changing, remembers the user choice and clears filters', () => {
  const { bindings, run } = runtime(); run('storage');
  expect(JSON.parse(bindings.localStorage.getItem('draft-counter')!)).toMatchObject({ cartItems: bindings.cartItems, discount: 0, tax: 0 });
  expect(bindings.setSelectedWarehouseId).toHaveBeenCalledWith('storage');
  expect(bindings.localStorage.setItem.mock.invocationCallOrder[0]).toBeLessThan(bindings.setSelectedWarehouseId.mock.invocationCallOrder[0]);
  expect(bindings.setNameCodeQuery).toHaveBeenCalledWith(''); expect(bindings.setBarcodeQuery).toHaveBeenCalledWith('');
  expect(bindings.setSelectedCategory).toHaveBeenCalledWith('all'); expect(bindings.setSelectedBrand).toHaveBeenCalledWith('all');
});
it('refuses a location change during an unconfirmed payment', () => {
  const { bindings, run } = runtime(); bindings.pendingPosCheckout.mockReturnValue({ checkoutRequestId: 'unconfirmed' }); run('storage');
  expect(bindings.setSelectedWarehouseId).not.toHaveBeenCalled(); expect(bindings.window.confirm).not.toHaveBeenCalled(); expect(bindings.showInfoToast).toHaveBeenCalledWith(expect.stringContaining('unconfirmed payment'));
});
it('keeps the current location/cart if saving its draft fails', () => {
  const { bindings, run } = runtime(); bindings.localStorage.setItem.mockImplementation(() => { throw Error('Quota'); }); run('storage');
  expect(bindings.setSelectedWarehouseId).not.toHaveBeenCalled(); expect(bindings.showInfoToast).toHaveBeenCalledWith(expect.stringContaining('cart could not be saved'));
});
