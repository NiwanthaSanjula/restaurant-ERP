import { APP_TIME_ZONE, formatDateOnlyParts, getZonedParts } from './timezone';

/** No product lookups: only the persisted classification/name/quantity at sale time. */
export function kitchenTicketForSale(sale: any) {
  const unavailable = (reason: string) => ({ status: 'unavailable' as const, reason });
  if (sale.saleType !== 'pos' || sale.status !== 'completed') return unavailable('Kitchen tickets are available only for completed POS sales.');
  if (!Array.isArray(sale.products) || !sale.products.length || sale.products.some((line: any) => typeof line.isPrepared !== 'boolean')) return unavailable('This sale has no reliable saved prepared-item classification.');
  const prepared = sale.products.filter((line: any) => line.isPrepared === true);
  if (!prepared.length) return { status: 'none' as const };
  if (prepared.some((line: any) => line.variation)) return unavailable('Kitchen tickets for variations are outside this batch.');
  if (prepared.some((line: any) => typeof line.productName !== 'string' || !line.productName.trim() || typeof line.qty !== 'number' || !Number.isFinite(line.qty) || line.qty <= 0)) return unavailable('Prepared item names or quantities are missing from this sale.');
  const date = new Date(sale.date || sale.createdAt);
  if (!Number.isFinite(date.getTime())) return unavailable('The saved sale time is unavailable.');
  const parts = getZonedParts(date), pad = (value: number) => String(value).padStart(2, '0');
  return { status: 'available' as const, saleId: String(sale._id), reference: String(sale.invoiceId || sale._id),
    orderedAt: date.toISOString(), displayTime: `${formatDateOnlyParts(parts)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)} (${APP_TIME_ZONE})`,
    items: prepared.map((line: any) => ({ name: line.productName, quantity: line.qty })) };
}
