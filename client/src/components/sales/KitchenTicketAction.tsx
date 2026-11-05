import { useState } from 'react';
import { buildKitchenTicketHtml } from '../../utils/kitchenTicket';
import type { KitchenTicketData } from '../../utils/kitchenTicket';
import { printBillHtml } from '../../utils/printDocument';

export default function KitchenTicketAction({ ticket }: { ticket?: KitchenTicketData }) {
  const [error, setError] = useState('');
  if (ticket?.status === 'none') return null;
  if (!ticket || ticket.status !== 'available') return <p className="text-sm text-muted">Kitchen ticket unavailable. {ticket?.status === 'unavailable' ? ticket.reason : 'This sale has no reliable saved prepared-item classification.'}</p>;
  return <div><button type="button" className="ss-button" onClick={() => { try { setError(''); printBillHtml(buildKitchenTicketHtml(ticket)); } catch { setError('Kitchen ticket could not be printed. Reopen this saved sale and retry printing.'); } }}>Print Kitchen Ticket</button>{error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}</div>;
}
