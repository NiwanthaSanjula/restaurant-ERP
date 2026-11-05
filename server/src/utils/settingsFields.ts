// Only these system fields are used by ordinary staff's currency, navbar and invoice screens.
export const STAFF_SYSTEM_FIELDS = [
  'companyLogo', 'currency', 'companyName', 'defaultEmail', 'companyMobile',
  'address', 'city', 'country', 'postalCode', 'defaultPosWarehouseId'
] as const;

export const SYSTEM_FIELDS = [
  ...STAFF_SYSTEM_FIELDS, 'whatsappNumber', 'developedBy', 'dateFormat'
] as const;

export const MAIL_FIELDS = [
  'mailMailer', 'mailHost', 'mailPort', 'mailSenderName', 'username'
] as const;

export const RECEIPT_FIELDS = [
  'showNote', 'showAddress', 'showBarcode', 'showTax', 'showPhone', 'showEmail',
  'showLogo', 'showCustomer', 'showDiscountShipping', 'showProductCode', 'logoUrl', 'note'
] as const;

/** Settings responses and updates contain only explicitly allowed scalar fields. */
export const pickSettingsFields = (source: unknown, fields: readonly string[]) => {
  const result: Record<string, string | number | boolean | null> = {};
  if (!source || typeof source !== 'object') return result;
  for (const field of fields) {
    const value: unknown = Reflect.get(source, field);
    if (value === null) {
      result[field] = null;
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[field] = value;
    }
  }
  return result;
};
