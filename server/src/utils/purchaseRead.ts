/**
 * Purchase persists a status, not a payment amount or ledger. Creation and edits
 * accept that status independently, so it cannot establish how much was paid.
 * Do not turn an unverified Paid/Unpaid/Partial label into financial amounts.
 */
export function purchaseReadResponse<T extends object>(purchase: T) {
  const { createPayloadHash: _internalHash, ...safe } = purchase as T & { createPayloadHash?: string };
  return { ...safe, paid: null, due: null };
}
