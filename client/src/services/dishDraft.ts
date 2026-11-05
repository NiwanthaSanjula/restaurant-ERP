export type DishFields = { name: string; code: string; category: string; unit: string; locationId: string; price: string; cost: string };
export type DishIngredient = { id: string; quantity: string };
export type DishDraft = { fields: DishFields; rows: DishIngredient[]; requestId: string; productId?: string; creationPayload?: Record<string, unknown>; recipeSaved: boolean };
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (actor: string) => `guided_dish_v1_${actor}`;
export const newDishDraft = (): DishDraft => ({ fields: { name: '', code: '', category: '', unit: '', locationId: '', price: '', cost: '' }, rows: [{ id: '', quantity: '' }], requestId: crypto.randomUUID(), recipeSaved: false });
export function loadDishDraft(storage: DraftStorage, actor: string): DishDraft | null {
  const raw = storage.getItem(key(actor)); if (!raw) return null;
  const data = JSON.parse(raw) as DishDraft;
  if (!data?.fields || !Array.isArray(data.rows) || typeof data.requestId !== 'string') throw new Error('The saved dish draft could not be read. Resume the Pending dish from POS Products.');
  return data;
}
export function storeDishDraft(storage: DraftStorage, actor: string, draft: DishDraft) { storage.setItem(key(actor), JSON.stringify(draft)); }
export function clearDishDraft(storage: DraftStorage, actor: string, productId: string) { if (loadDishDraft(storage, actor)?.productId === productId) storage.removeItem(key(actor)); }
/** Save the exact creation request before sending. An uncertain response always retries this same ID/payload. */
export async function createDishDraft(storage: DraftStorage, actor: string, draft: DishDraft, locationName: string, post: (body: Record<string, unknown>) => Promise<{ id: string }>) {
  if (draft.productId) return draft;
  const f = draft.fields;
  const next = { ...draft, creationPayload: draft.creationPayload || { dishDraftRequestId: draft.requestId, name: f.name.trim(), code: f.code.trim(), category: f.category, unit: f.unit, ptype: 'Single', isInventory: false, isSellable: true, status: 'Pending', warehouse: { [f.locationId]: { warehouseName: locationName, productPrice: Number(f.price), productCost: Number(f.cost) } } } };
  storeDishDraft(storage, actor, next);
  try {
    const result = await post(next.creationPayload);
    if (!result || !/^[a-f\d]{24}$/i.test(result.id)) throw new Error('Draft creation could not be confirmed. Retry this same draft.');
    const saved = { ...next, productId: result.id }; storeDishDraft(storage, actor, saved); return saved;
  } catch (error) {
    const failure = error as { status?: number; code?: string };
    if (failure.status === 400 || (failure.status === 409 && failure.code === 'dish_details_conflict')) storeDishDraft(storage, actor, { ...draft, creationPayload: undefined });
    throw error;
  }
}
