import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { webcrypto } from 'crypto';

const clientRoot = path.resolve(__dirname, '../../../client/src');
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const helper = new Function('exports', 'crypto', compile(fs.readFileSync(path.join(clientRoot, 'services/posCheckoutRequest.ts'), 'utf8')) + ';return exports;')({}, webcrypto);
const source = fs.readFileSync(path.join(clientRoot, 'components/pos/POSCheckout.tsx'), 'utf8');
const receiptSource = source.slice(source.indexOf('function buildFallbackReceiptHtml('), source.indexOf('type Variation ='));
const renderReceipt = new Function(compile(receiptSource) + ';return buildFallbackReceiptHtml;')();
const payload = { sessionId: 'register-fixture', warehouseId: 'selected-warehouse', items: [{ id: 'dish', qty: 1, price: 9.5 }], payments: [{ type: 'cash', amount: 10 }] };
function storage() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
}

describe('actual POS retry helper and receipt renderer', () => {
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
});
