import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { webcrypto } from 'crypto';

const clientRoot = path.resolve(__dirname, '../../../client/src');
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const helper = new Function('exports', 'crypto', compile(fs.readFileSync(path.join(clientRoot, 'services/posCheckoutRequest.ts'), 'utf8')) + ';return exports;')({}, webcrypto);
const source = fs.readFileSync(path.join(clientRoot, 'components/pos/POSCheckout.tsx'), 'utf8');
const receiptSource = source.slice(source.indexOf('function buildFallbackReceiptHtml('), source.indexOf('type Variation ='));
const printModule = new Function('exports', compile(fs.readFileSync(path.join(clientRoot, 'utils/printDocument.ts'), 'utf8')) + ';return exports;')({});
const renderReceipt = new Function('POS_PRINT_CSS', compile(receiptSource) + ';return buildFallbackReceiptHtml;')(printModule.POS_PRINT_CSS);
const ticketModule = new Function('require', 'exports', compile(fs.readFileSync(path.join(clientRoot, 'utils/kitchenTicket.ts'), 'utf8')) + ';return exports;')(() => printModule, {});
// Execute the actual catalog effect, including cleanup, against controllable fetches.
const catalogStart = source.indexOf('    // When the warehouse changes to a different one');
const catalogEnd = source.indexOf('  }, [selectedWarehouseId]);', catalogStart);
if (catalogStart < 0 || catalogEnd < 0) throw new Error('POS catalog effect not found');
const effectKeys = ['fetch', 'selectedWarehouseId', 'prevWarehouseRef', 'setCartItems', 'localStorage', 'POS_API_BASE', 'setCatalogLoading', 'setCatalogFromApi', 'setCatalogItems', 'setUiCategories', 'setUiBrands', 'setSelectedCategory', 'setSelectedBrand', 'showInfoToast', 'DEFAULT_CATEGORIES', 'DEFAULT_BRANDS', 'CATALOG_PLACEHOLDER_IMG'];
const catalogEffect = new Function('runtime', compile(`function run() { const { ${effectKeys.join(', ')} } = runtime; ${source.slice(catalogStart, catalogEnd)} }`) + ';return run();');
function catalogRuntime(warehouseId: string) {
  const state = { items: [] as unknown[], loading: false, fromApi: false };
  const runtime = { selectedWarehouseId: warehouseId, fetch: jest.fn(), prevWarehouseRef: { current: null }, setCartItems: jest.fn(), localStorage: { getItem: () => null }, POS_API_BASE: 'http://fixture.invalid/api',
    setCatalogLoading: (value: boolean) => { state.loading = value; }, setCatalogFromApi: (value: boolean) => { state.fromApi = value; }, setCatalogItems: (value: unknown[]) => { state.items = value; },
    setUiCategories: jest.fn(), setUiBrands: jest.fn(), setSelectedCategory: jest.fn(), setSelectedBrand: jest.fn(), showInfoToast: jest.fn(), DEFAULT_CATEGORIES: [], DEFAULT_BRANDS: [], CATALOG_PLACEHOLDER_IMG: '/fixture.svg' };
  return { state, runtime };
}
const settleCatalog = async () => { for (let n = 0; n < 10; n++) await Promise.resolve(); };
const payload = { sessionId: 'register-fixture', warehouseId: 'selected-warehouse', items: [{ id: 'dish', qty: 1, price: 9.5 }], payments: [{ type: 'cash', amount: 10 }] };
function storage() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
}

describe('actual POS retry helper and receipt renderer', () => {
  it('never requests an unscoped catalog before a warehouse is selected', () => {
    const { state, runtime } = catalogRuntime(''); const cleanup = catalogEffect(runtime);
    expect(runtime.fetch).not.toHaveBeenCalled(); expect(state).toEqual({ items: [], loading: false, fromApi: false }); cleanup();
  });
  it('ignores a slow previous warehouse response instead of showing its products and prices in the current warehouse', async () => {
    const { state, runtime } = catalogRuntime('main-kitchen'); let finishOld: (value: unknown) => void, finishCurrent: (value: unknown) => void;
    runtime.fetch.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockImplementationOnce(() => new Promise(resolve => { finishCurrent = resolve; }));
    const oldCleanup = catalogEffect(runtime); oldCleanup(); runtime.selectedWarehouseId = 'dry-store'; const cleanup = catalogEffect(runtime);
    finishCurrent!({ json: async () => ({ status: 'success', data: { categories: [], brands: [], items: [{ id: 'water', name: 'Lucky Bottled Water', price: 100 }] } }) }); await settleCatalog();
    expect(state.items).toEqual([expect.objectContaining({ id: 'water', price: 100 })]);
    finishOld!({ json: async () => ({ status: 'success', data: { categories: [], brands: [], items: [{ id: 'wrong-warehouse', name: 'Other item', price: 999 }] } }) }); await settleCatalog();
    expect(state.items).toEqual([expect.objectContaining({ id: 'water', price: 100 })]); expect(state.loading).toBe(false); expect(runtime.showInfoToast).not.toHaveBeenCalled();
    expect(runtime.fetch.mock.calls.map(call => call[0])).toEqual(['http://fixture.invalid/api/pos/catalog?warehouseId=main-kitchen', 'http://fixture.invalid/api/pos/catalog?warehouseId=dry-store']); cleanup();
  });
  it('does not let an aborted older failure clear a successfully loaded warehouse', async () => {
    const { state, runtime } = catalogRuntime('main-kitchen'); let rejectOld: (error: Error) => void;
    runtime.fetch.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; })).mockResolvedValueOnce({ json: async () => ({ status: 'success', data: { categories: [], brands: [], items: [{ id: 'water', name: 'Water', price: 100 }] } }) });
    const oldCleanup = catalogEffect(runtime); oldCleanup(); runtime.selectedWarehouseId = 'dry-store'; const cleanup = catalogEffect(runtime); await settleCatalog();
    rejectOld!(new Error('Previous request cancelled')); await settleCatalog();
    expect(state.items).toHaveLength(1); expect(state.fromApi).toBe(true); expect(runtime.showInfoToast).not.toHaveBeenCalled(); cleanup();
  });
  it('persists the exact checkout ID and body across repeated calls and reloads', () => {
    const local = storage(), request = helper.preparePosCheckout(local, payload);
    expect(request.warehouseId).toBe('selected-warehouse'); expect(request.checkoutRequestId).toMatch(/^[\da-f-]{36}$/);
    expect(helper.preparePosCheckout(local, structuredClone(payload))).toEqual(request);
    const reloaded = helper.pendingPosCheckout(local, payload.sessionId);
    expect(reloaded.checkoutRequestId).toBe(request.checkoutRequestId); expect(reloaded.payload.payments[0].amount).toBe(10);
  });
  it('refuses a changed cart, warehouse or payment while the outcome is unconfirmed', () => {
    const local = storage(), original = helper.preparePosCheckout(local, payload);
    for (const changed of [{ ...payload, warehouseId: 'other' }, { ...payload, items: [] }, { ...payload, payments: [{ type: 'cash', amount: 20 }] }]) {
      expect(() => helper.preparePosCheckout(local, changed)).toThrow(/previous payment is unconfirmed/);
    }
    expect(helper.preparePosCheckout(local, payload)).toEqual(original);
  });
  it('starts a new checkout only after success or definite validation failure clears the matching request', () => {
    const local = storage(), original = helper.preparePosCheckout(local, payload);
    helper.clearPosCheckout(local, payload.sessionId, 'different-id');
    expect(helper.preparePosCheckout(local, payload)).toEqual(original);
    helper.clearPosCheckout(local, payload.sessionId, original.checkoutRequestId);
    expect(helper.preparePosCheckout(local, payload).checkoutRequestId).not.toBe(original.checkoutRequestId);
  });
  it('does not send an unsafe new request if durable storage fails or a pending record is corrupt', () => {
    expect(() => helper.preparePosCheckout({ ...storage(), setItem: () => { throw new Error('storage unavailable'); } }, payload)).toThrow('storage unavailable');
    expect(() => helper.preparePosCheckout({ ...storage(), getItem: () => '{}' }, payload)).toThrow(/pending payment could not be read/);
  });
  it('prints authoritative price/total, 10.00 tender, 0.50 change and zero due in configured currency on white paper', () => {
    const html = renderReceipt({ companyName: 'Fixture Kitchen', currencyCode: 'EUR', orderId: 'T-fixture', items: [{ name: 'Rice & curry <bowl>', quantity: 1, price: 9.5 }],
      subtotal: 9.5, discountAmount: 0, shipping: 0, taxAmount: 0, total: 9.5, paid: 10, change: 0.5, due: 0 });
    expect(html).toContain('Rice &amp; curry &lt;bowl&gt;'); expect(html).toContain('EUR 9.50');
    expect(html).toMatch(/Paid<\/td>.*EUR 10\.00/); expect(html).toMatch(/Change<\/td>.*EUR 0\.50/); expect(html).toMatch(/Due<\/td>.*EUR 0\.00/);
    expect(html).toContain('background:#fff');
  });
  it('prints only saved kitchen fields, escapes names, and shares the white receipt paper styles', () => {
    const ticket = { status: 'available', saleId: 'sale', reference: 'T-saved', orderedAt: '2026-11-04T10:00:00Z', displayTime: '2026-11-04 15:30:00 (Asia/Colombo)', items: [{ name: 'Fried Rice <bowl>', quantity: 2 }] };
    const html = ticketModule.buildKitchenTicketHtml({ ...ticket, total: 1100, payments: [{ amount: 1100 }], customer: 'Private name' });
    expect(html).toContain('2 × Fried Rice &lt;bowl&gt;'); expect(html).toContain('T-saved'); expect(html).toContain(ticket.displayTime);
    expect(html).toContain(printModule.POS_PRINT_CSS);
    expect(html).not.toMatch(/Bottled|1100|Private name|Payment|Total|Price|LKR/);
    expect(() => ticketModule.buildKitchenTicketHtml({ ...ticket, items: [] })).toThrow(/incomplete/);
    expect(() => ticketModule.buildKitchenTicketHtml({ ...ticket, items: [{ name: 'Rice', quantity: 0 }] })).toThrow(/incomplete/);
  });
});
