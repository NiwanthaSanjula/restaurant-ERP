export const RECEIPT_BOOLEAN_FIELDS = [
  'showNote', 'showAddress', 'showBarcode', 'showTax', 'showPhone', 'showEmail',
  'showLogo', 'showCustomer', 'showDiscountShipping', 'showProductCode'
] as const;
const TEXT_FIELDS = ['logoUrl', 'note'] as const;

export type ReceiptConfig = Partial<
  Record<(typeof RECEIPT_BOOLEAN_FIELDS)[number], boolean> & Record<(typeof TEXT_FIELDS)[number], string>
>;

export interface ReceiptEditorValues {
  header: { logoUrl: string; showLogo: boolean; showAddress: boolean; showPhone: boolean; showEmail: boolean; showCustomer: boolean };
  productsTable: { columns: { productCode: boolean } };
  summary: { showTax: boolean; showDiscountShipping: boolean };
  footer: { showBarcode: boolean; showNote: boolean; note: string };
}

export function parseReceiptConfig(value: unknown): ReceiptConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid receipt settings response');
  const allowed: readonly string[] = [...RECEIPT_BOOLEAN_FIELDS, ...TEXT_FIELDS];
  if (Object.keys(value).some((field) => !allowed.includes(field))) throw new Error('Unsupported receipt settings response');
  const result: ReceiptConfig = {};
  for (const field of RECEIPT_BOOLEAN_FIELDS) {
    const entry: unknown = Reflect.get(value, field);
    if (entry === undefined) continue;
    if (typeof entry !== 'boolean') throw new Error('Invalid receipt display flag');
    result[field] = entry;
  }
  for (const field of TEXT_FIELDS) {
    const entry: unknown = Reflect.get(value, field);
    if (entry === undefined) continue;
    if (typeof entry !== 'string') throw new Error('Invalid receipt text');
    result[field] = entry;
  }
  return result;
}

export function receiptToEditor<T extends ReceiptEditorValues>(saved: ReceiptConfig, defaults: T): T {
  const editor = structuredClone(defaults);
  if (saved.logoUrl !== undefined) editor.header.logoUrl = saved.logoUrl;
  if (saved.showLogo !== undefined) editor.header.showLogo = saved.showLogo;
  if (saved.showAddress !== undefined) editor.header.showAddress = saved.showAddress;
  if (saved.showPhone !== undefined) editor.header.showPhone = saved.showPhone;
  if (saved.showEmail !== undefined) editor.header.showEmail = saved.showEmail;
  if (saved.showCustomer !== undefined) editor.header.showCustomer = saved.showCustomer;
  if (saved.showProductCode !== undefined) editor.productsTable.columns.productCode = saved.showProductCode;
  if (saved.showTax !== undefined) editor.summary.showTax = saved.showTax;
  if (saved.showDiscountShipping !== undefined) editor.summary.showDiscountShipping = saved.showDiscountShipping;
  if (saved.showBarcode !== undefined) editor.footer.showBarcode = saved.showBarcode;
  if (saved.showNote !== undefined) editor.footer.showNote = saved.showNote;
  if (saved.note !== undefined) editor.footer.note = saved.note;
  return editor;
}

function editorValues(editor: ReceiptEditorValues): Required<ReceiptConfig> {
  return {
    logoUrl: editor.header.logoUrl, showLogo: editor.header.showLogo,
    showAddress: editor.header.showAddress, showPhone: editor.header.showPhone,
    showEmail: editor.header.showEmail, showCustomer: editor.header.showCustomer,
    showProductCode: editor.productsTable.columns.productCode,
    showTax: editor.summary.showTax, showDiscountShipping: editor.summary.showDiscountShipping,
    showBarcode: editor.footer.showBarcode, showNote: editor.footer.showNote, note: editor.footer.note
  };
}

/** Display defaults are never sent unless the user changes a supported value. */
export function receiptEditorPatch(editor: ReceiptEditorValues, initial: ReceiptEditorValues): ReceiptConfig {
  const values = editorValues(editor);
  const original = editorValues(initial);
  const patch: ReceiptConfig = {};
  for (const field of RECEIPT_BOOLEAN_FIELDS) if (values[field] !== original[field]) patch[field] = values[field];
  for (const field of TEXT_FIELDS) if (values[field] !== original[field]) patch[field] = values[field];
  return patch;
}

export async function readReceiptResult(response: Pick<Response, 'ok' | 'json'>, operation: 'load' | 'save'): Promise<ReceiptConfig> {
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object') throw new Error('Invalid receipt settings response');
  const succeeded = operation === 'load' ? Reflect.get(body, 'status') === 'success' : Reflect.get(body, 'success') === true;
  if (!response.ok || !succeeded) {
    const message: unknown = Reflect.get(body, 'message');
    throw new Error(typeof message === 'string' ? message : 'Receipt settings request failed');
  }
  return parseReceiptConfig(Reflect.get(body, 'data'));
}
