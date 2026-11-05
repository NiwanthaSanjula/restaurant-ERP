import { kitchenTicketForSale } from './kitchenTicket';

const sale = () => ({ _id: 'saved-id', invoiceId: 'T-20261104-001', saleType: 'pos', status: 'completed', date: '2026-11-04T10:00:00Z', products: [
  { productName: 'Fried Rice', qty: 2, isPrepared: true, price: 500 }, { productName: 'Bottled water', qty: 1, isPrepared: false, price: 100 }
] });
describe('Historical kitchen ticket allowlist', () => {
  it('uses the saved sale time and only prepared names/quantities', () => {
    expect(kitchenTicketForSale(sale())).toEqual({ status: 'available', saleId: 'saved-id', reference: 'T-20261104-001', orderedAt: '2026-11-04T10:00:00.000Z', displayTime: '2026-11-04 15:30:00 (Asia/Colombo)', items: [{ name: 'Fried Rice', quantity: 2 }] });
  });
  it.each([
    { products: [{ productName: 'Unknown', qty: 1 }] },
    { date: 'invalid' }, { date: undefined }, { saleType: 'non-pos' }, { status: 'pending' },
    { products: [{ productName: 'Fried Rice', qty: 0, isPrepared: true }] },
    { products: [{ productName: '', qty: 2, isPrepared: true }] },
    { products: [{ productName: 'Fried Rice', qty: 2, isPrepared: true, variation: 'Large' }] },
    { products: [] },
  ])('marks incomplete or unsupported historical data unavailable: %j', change => {
    expect(kitchenTicketForSale({ ...sale(), ...change }).status).toBe('unavailable');
  });
});
