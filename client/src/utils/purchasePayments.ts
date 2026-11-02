export function purchasePaymentAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function purchasePaymentTotal(rows: readonly { paid?: unknown; due?: unknown }[], field: 'paid' | 'due'): number | null {
  let total = 0;
  for (const row of rows) {
    const amount = purchasePaymentAmount(row[field]);
    if (amount === null) return null;
    total += amount;
  }
  return total;
}

export function formatPurchasePayment(value: unknown, currency: string): string {
  const amount = purchasePaymentAmount(value);
  return amount === null ? 'Not recorded' : `${currency} ${amount.toLocaleString()}`;
}
