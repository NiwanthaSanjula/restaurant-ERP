export const PREFIX_MAX_LENGTH = 8;

export const PREFIX_FIELDS = [
  'salePrefix',
  'saleReturnPrefix',
  'purchasePrefix',
  'purchaseReturnPrefix',
  'expensePrefix',
  'invoicePrefix',
  'orderPrefix',
  'customerPrefix'
] as const;

export type PrefixField = typeof PREFIX_FIELDS[number];

