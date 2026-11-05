import { buildLaTavolaPlan, businessInstant, fingerprint, forbiddenLabel, oid, Plan, tradingDates } from './plan';
import { planHash, reconcile, registerOverlap, validateSchemas } from './validate';
import { isPosEligibleProduct } from '../../utils/productEligibility';
import { warehouseIncomingStock } from '../../utils/warehouseIncoming';
import { kitchenTicketForSale } from '../../utils/kitchenTicket';
import { checkoutReceipt } from '../../services/posCheckout';

const today = '2026-11-04', actor = { _id: oid('existing/cashier'), name: 'Kasun Jayawardena', isActive: true, roleId: oid('existing/role') };
function fixture() {
  const storage = { _id: oid('existing/storage'), name: 'Main Storage', isActive: true }, counter = { _id: oid('existing/counter'), name: 'Sales Counter', isActive: true };
  const unit = { _id: oid('existing/piece'), unitName: 'Piece', shortName: 'psc' };
  const water = { _id: oid('existing/water'), code: 'LKY-BTLW-1L', name: 'Lucky Pure Bottled Water', ptype: 'Single', unit: 'Piece', category: 'Cold Drinks', isSellable: true, isInventory: true, status: 'Active', warehouse: { [String(storage._id)]: { warehouseName: storage.name, productQty: 99, productPrice: 100, productCost: 75, stockAlert: 50, batches: [] } } };
  return { existing: { Warehouse: [storage, counter], Unit: [unit], Product: [water] }, storage, counter, water };
}
function planned() { const f = fixture(); return { ...f, plan: buildLaTavolaPlan(f.existing, today, 1200, actor) }; }
describe('La Tavola connected thirty-day dataset, without database access', () => {
  it('has thirty Colombo trading dates and a deterministic complete stock/financial ledger', async () => {
    const one = planned().plan, two = planned().plan;
    expect(tradingDates(today)).toHaveLength(30); expect(one.dates[0]).toBe('2026-10-06');
    await validateSchemas(one); await validateSchemas(two);
    expect(planHash(one)).toBe(planHash(two));
    expect(reconcile(one)).toMatchObject({ thirtyDates: true, paymentsAndRegisters: true, stockAndRecipeLedger: true, references: true });
  });
  it('reuses locations and the 1 L item, preserving all 99 original bottles and its identity/classification/prices', () => {
    const { plan, existing, water, storage, counter } = planned();
    expect(existing.Product[0]).toEqual(water); expect(plan.entries.filter(e => e.model === 'Warehouse')).toHaveLength(0);
    expect(plan.patches).toHaveLength(1); expect(plan.patches[0].before._id).toEqual(water._id);
    expect(plan.patches[0].after.warehouse[String(storage._id)]).toMatchObject({ productQty: 249, productPrice: 100, productCost: 75, stockAlert: 50 });
    expect(plan.patches[0].after.warehouse[String(counter._id)]).toMatchObject({ productQty: 50, productPrice: 100 });
    expect(water.warehouse[String(storage._id)].productQty).toBe(99); expect(Object.keys(water.warehouse)).toHaveLength(1);
    expect(plan.patches[0].increments).toEqual({ [`warehouse.${storage._id}.productQty`]: 150 });
  });
  it('includes sixteen explicitly priced sellable items and keeps all twelve ingredients outside POS', () => {
    const { plan } = planned();
    expect(plan.summary.menuItems).toHaveLength(16);
    expect(plan.summary.menuItems.map((p: any) => p.name)).toEqual(expect.arrayContaining(['Chicken Fried Rice', 'Vegetable Fried Rice', 'Chicken Kottu', 'Lime Juice', 'Lucky Pure Bottled Water']));
    const raw = plan.entries.filter(e => e.model === 'Product' && !e.doc.isSellable); expect(raw).toHaveLength(12);
    expect(raw.every(e => !isPosEligibleProduct(e.doc))).toBe(true);
    expect(plan.entries.filter(e => e.model === 'Product' && e.doc.isSellable).every(e => isPosEligibleProduct(e.doc) && e.doc.warehouse[plan.summary.counterId].productPrice > 0)).toBe(true);
  });
  it('has low-stock flour at 4 kg / threshold 5 with exactly 10 kg incoming, while kitchen balance is independent', () => {
    const { plan } = planned();
    const products = plan.entries.filter(e => e.model === 'Product').map(e => e.doc), orders = plan.entries.filter(e => e.model === 'Purchase').map(e => e.doc);
    const rows = warehouseIncomingStock(products, orders, plan.summary.storageId, plan.summary.storageName);
    expect(rows.find(row => row.productId === plan.summary.flour.id)).toMatchObject({ quantity: 4, stockAlert: 5, alertState: 'low_stock', incoming: 10, stockUnit: 'Kilogram' });
    const flour = plan.entries.find(e => e.model === 'KitchenInventoryProduct' && e.doc.name === 'Wheat Flour')!.doc;
    expect(flour.currentStock).toBeGreaterThanOrEqual(15000); expect(flour.warehouseIssueConversion).toMatchObject({ factor: 1000, warehouseQuantity: 1, kitchenQuantity: 1000, stockUnit: 'Kilogram', kitchenShort: 'g' });
  });
  it('has completed sales with saved receipt and kitchen-ticket data; read helpers never change the plan', async () => {
    const { plan } = planned(); await validateSchemas(plan); const before = fingerprint(plan);
    const sale = plan.entries.find(e => String(e.doc._id) === plan.summary.receiptId)!.doc;
    const receipt = checkoutReceipt(sale as any);
    expect(sale.invoiceId).toMatch(/^SALE-\d{4}$/);
    expect(new Set(plan.entries.filter(e => e.model === 'Sale').map(e => e.doc.invoiceId)).size).toBe(plan.entries.filter(e => e.model === 'Sale').length);
    expect(receipt.items).toEqual([{ name: 'Chicken Fried Rice', quantity: 2, price: 1150 }, { name: 'Lucky Pure Bottled Water', quantity: 1, price: 100 }]);
    expect(kitchenTicketForSale(sale)).toMatchObject({ status: 'available', items: [{ name: 'Chicken Fried Rice', quantity: 2 }] });
    expect(fingerprint(plan)).toBe(before);
  });
  it('never inserts users/roles/settings or placeholder names or customer phone data', () => {
    const { plan } = planned(); expect(plan.entries.some(e => ['User', 'Role', 'Setting', 'ReceiptSettings', 'Currency', 'Customer'].includes(e.model))).toBe(false);
    expect(plan.entries.some(e => ['name', 'title', 'brandName', 'companyName'].some(field => typeof e.doc[field] === 'string' && forbiddenLabel(e.doc[field])))).toBe(false);
    expect(plan.entries.filter(e => e.model === 'Supplier').every(e => !e.doc.mobile && !e.doc.email)).toBe(true);
  });
  it('preserves the exact uppercase L unit spelling required by the live issue contract', () => {
    const f = fixture(); f.existing.Unit.push({ _id: oid('existing/litre'), unitName: 'Litre', shortName: 'L' });
    const plan = buildLaTavolaPlan(f.existing, today, 1200, actor);
    const liquids = plan.entries.filter(e => e.model === 'KitchenInventoryProduct' && e.doc.warehouseIssueConversion.stockUnit === 'Litre');
    expect(liquids).toHaveLength(3); expect(liquids.every(e => e.doc.warehouseIssueConversion.sourceShort === 'L')).toBe(true);
    expect(() => reconcile(plan)).not.toThrow();
  });
  it.each(['total', 'stock', 'recipe movement', 'unit', 'paid ledger'])('rejects inconsistent %s before any apply', what => {
    const { plan } = planned();
    if (what === 'total') plan.entries.find(e => e.model === 'Sale')!.doc.total--;
    if (what === 'stock') plan.entries.find(e => e.model === 'Product' && e.doc.isInventory)!.doc.warehouse[plan.summary.storageId].productQty++;
    if (what === 'recipe movement') plan.entries.find(e => e.model === 'KitchenStockMovement' && e.doc.source === 'sale')!.doc.quantity++;
    if (what === 'unit') plan.entries.find(e => e.model === 'Purchase')!.doc.items[0].stockUnit = 'Bag(s)';
    if (what === 'paid ledger') plan.entries.find(e => e.model === 'Sale')!.doc.payments[0].amount--;
    expect(() => reconcile(plan)).toThrow();
  });
  it('does not overlap the existing open register or alter/register an active session', () => {
    const { plan } = planned(), shifts = plan.entries.filter(e => e.model === 'PosSession').map(e => e.doc);
    expect(shifts).toHaveLength(30); expect(shifts.every(s => s.status === 'CLOSED')).toBe(true);
    expect(() => registerOverlap(shifts, [{ openTime: businessInstant(today, 23 * 60), status: 'OPEN' }])).not.toThrow();
    expect(() => registerOverlap(shifts, [{ openTime: businessInstant(today, 8 * 60), status: 'OPEN' }])).toThrow(/overlaps/);
  });
  it('refuses ambiguous masters or an existing counter balance, rather than silently merging them', () => {
    const f = fixture(); f.existing.Warehouse.push({ ...f.storage, _id: oid('other/storage'), name: 'Storage' });
    expect(() => buildLaTavolaPlan(f.existing, today, 1200, actor)).toThrow(/Ambiguous/);
    const g = fixture(); (g.water.warehouse as any)[String(g.counter._id)] = { productQty: 7, productPrice: 125 };
    expect(() => buildLaTavolaPlan(g.existing, today, 1200, actor)).toThrow(/review/);
  });
});
