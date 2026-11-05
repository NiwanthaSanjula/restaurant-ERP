type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PurchaseAcknowledgement = { _id: string; purchaseId: string; purchaseStatus: 'Ordered' | 'Pending' | 'Received'; stockReceivedAt?: string };
export type PurchaseSubmission = {
  payload: Record<string, unknown>; receive: boolean; display: Record<string, unknown>; purchase?: PurchaseAcknowledgement;
};
const key = (actorId: string) => `purchase_submission_v1_${actorId}`;
export function pendingPurchase(storage: DraftStorage, actorId: string): PurchaseSubmission | null {
  const raw = storage.getItem(key(actorId));
  if (!raw) return null;
  const saved = JSON.parse(raw) as PurchaseSubmission;
  if (!saved || !saved.payload || typeof saved.payload.createRequestId !== 'string' || typeof saved.receive !== 'boolean' || !saved.display) throw new Error('The pending purchase could not be read. Review saved orders before creating another purchase.');
  return saved;
}
export function preparePurchase(storage: DraftStorage, actorId: string, payload: Record<string, unknown>, receive: boolean, display: Record<string, unknown>): PurchaseSubmission {
  if (pendingPurchase(storage, actorId)) throw new Error('A purchase is awaiting confirmation. Retry that saved operation before starting another.');
  const draft = JSON.parse(JSON.stringify({ payload, receive, display })) as PurchaseSubmission;
  storage.setItem(key(actorId), JSON.stringify(draft));
  return draft;
}
function acknowledgement(value: PurchaseAcknowledgement): PurchaseAcknowledgement {
  if (!value || !/^[a-f\d]{24}$/i.test(value._id) || !value.purchaseId || !['Ordered', 'Pending', 'Received'].includes(value.purchaseStatus) || (value.purchaseStatus === 'Received' && !value.stockReceivedAt)) throw new Error('Purchase response could not be confirmed. Retry the saved operation.');
  return { _id: value._id, purchaseId: value.purchaseId, purchaseStatus: value.purchaseStatus, ...(value.stockReceivedAt ? { stockReceivedAt: value.stockReceivedAt } : {}) };
}
/** Creation and receipt have separate durable checkpoints. A retry never changes the creation payload or receipt ID. */
export async function completePurchase(storage: DraftStorage, actorId: string, post: (path: string, body: Record<string, unknown>) => Promise<PurchaseAcknowledgement>) {
  const draft = pendingPurchase(storage, actorId);
  if (!draft) throw new Error('No pending purchase to confirm');
  if (!draft.purchase) {
    try { draft.purchase = acknowledgement(await post('/purchases', draft.payload)); }
    catch (error) {
      // A definite validation rollback allows correction. Unknown outcomes keep the stable creation key.
      if ((error as { response?: { status?: number } }).response?.status === 400) storage.removeItem(key(actorId));
      throw error;
    }
    storage.setItem(key(actorId), JSON.stringify(draft));
  }
  if (draft.receive && draft.purchase.purchaseStatus !== 'Received') {
    const receipt = acknowledgement(await post(`/purchases/${draft.purchase._id}/receive`, {}));
    if (receipt._id !== draft.purchase._id || receipt.purchaseStatus !== 'Received') throw new Error('Stock receipt could not be confirmed. Retry this saved order.');
    draft.purchase = receipt;
  }
  storage.removeItem(key(actorId));
  return { purchase: draft.purchase, display: draft.display };
}
