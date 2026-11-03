type CheckoutStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PendingPosCheckout = { checkoutRequestId: string; payload: Record<string, unknown> };
const key = (sessionId: string) => `pos_pending_checkout_v1_${sessionId}`;

export function pendingPosCheckout(storage: CheckoutStorage, sessionId: string): PendingPosCheckout | null {
  const raw = storage.getItem(key(sessionId));
  if (!raw) return null;
  const pending = JSON.parse(raw) as PendingPosCheckout;
  if (!pending || typeof pending.checkoutRequestId !== 'string' || !pending.payload || typeof pending.payload !== 'object') {
    throw new Error('The pending payment could not be read. Ask a supervisor to confirm it before starting another sale.');
  }
  return pending;
}

/** Persist before sending. A lost response must never turn a retry into a new sale. */
export function preparePosCheckout(storage: CheckoutStorage, payload: Record<string, unknown>): Record<string, unknown> {
  const sessionId = String(payload.sessionId);
  const normalized = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  const pending = pendingPosCheckout(storage, sessionId);
  if (pending && JSON.stringify(pending.payload) !== JSON.stringify(normalized)) {
    throw new Error('A previous payment is unconfirmed. Restore its original cart, warehouse and payment amounts to retry; do not collect payment again.');
  }
  const next = pending ?? { checkoutRequestId: crypto.randomUUID(), payload: normalized };
  storage.setItem(key(sessionId), JSON.stringify(next));
  return { ...next.payload, checkoutRequestId: next.checkoutRequestId };
}

export function clearPosCheckout(storage: CheckoutStorage, sessionId: string, checkoutRequestId: unknown): void {
  if (pendingPosCheckout(storage, sessionId)?.checkoutRequestId === checkoutRequestId) storage.removeItem(key(sessionId));
}
