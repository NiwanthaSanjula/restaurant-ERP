import { POS_PRINT_CSS } from './printDocument';

export type KitchenTicketData = { status: 'none' } | { status: 'unavailable'; reason: string } | {
  status: 'available'; saleId: string; reference: string; orderedAt: string; displayTime: string; items: { name: string; quantity: number }[];
};
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
export function buildKitchenTicketHtml(ticket: Extract<KitchenTicketData, { status: 'available' }>): string {
  if (!ticket.items.length || ticket.items.some(item => !item.name || !Number.isFinite(item.quantity) || item.quantity <= 0)) throw new Error('Kitchen ticket data is incomplete');
  const rows = ticket.items.map(item => `<tr><td style="font-size:18px;padding:8px 0"><strong>${escape(item.quantity)} × ${escape(item.name)}</strong></td></tr>`).join('');
  // Explicit fields only: prices, costs, tender, customer and stocked items never enter this document.
  return `<!doctype html><html><head><meta charset="utf-8"><title>Kitchen Ticket</title><style>${POS_PRINT_CSS}</style></head><body><main class="r"><h2 class="c">Kitchen Ticket</h2><p class="c mt">Sale: ${escape(ticket.reference)}</p><p class="c small mt">${escape(ticket.displayTime)}</p><div class="line"></div><table><tbody>${rows}</tbody></table><div class="line"></div></main></body></html>`;
}
