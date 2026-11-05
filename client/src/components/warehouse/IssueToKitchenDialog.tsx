import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

type Rule = { sourceUnitId: string; warehouseQuantity: number; kitchenQuantity: number; revision: number };
type Ingredient = { id: string; name: string; unit: string; onHand: number; linked: boolean; conversion: Rule | null };
type Issue = { id: string; sourceQuantity: number; sourceUnit: string; quantity: number; kitchenUnit: string; sourceBefore: number; sourceAfter: number; kitchenBefore: number; kitchenAfter: number; kitchenName: string; postedAt: string };
type Options = { actorId: string; item: { name: string; stockUnit: string; onHand: number }; warehouse: { name: string }; ingredients: Ingredient[]; sourceUnits: { id: string; shortName: string; name: string }[]; history: Issue[] };
type Draft = { productId: string; kitchenProductId: string; quantity: number; conversionRevision: number; requestId: string };
const field = 'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-foreground disabled:opacity-60';
const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 6 });
class RequestError extends Error {
  status: number; code: string;
  constructor(message: string, status: number, code: string) { super(message); this.status = status; this.code = code; }
}
async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}${path}`, {
    method, headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json();
  if (!response.ok) throw new RequestError(result.message || 'Request failed', response.status, result.code);
  return result;
}

export default function IssueToKitchenDialog({ warehouseId, productId, onClose, onPosted }: { warehouseId: string; productId: string; onClose: () => void; onPosted: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [ingredientId, setIngredientId] = useState('');
  const [sourceUnitId, setSourceUnitId] = useState('');
  const [from, setFrom] = useState('1'); const [to, setTo] = useState('');
  const [quantity, setQuantity] = useState('1'); const [link, setLink] = useState(false);
  const [preview, setPreview] = useState<Issue | null>(null); const [posted, setPosted] = useState<Issue | null>(null);
  const [pending, setPending] = useState<Draft | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const ingredient = options?.ingredients.find(item => item.id === ingredientId);
  const storageKey = options ? `kitchen-issue:${options.actorId}:${warehouseId}:${productId}` : '';
  const frozen = busy || !!pending || !!posted;
  const selectIngredient = (id: string, data: Options) => {
    const selected = data.ingredients.find(item => item.id === id);
    setIngredientId(id); setFrom(String(selected?.conversion?.warehouseQuantity || 1)); setTo(selected?.conversion ? String(selected.conversion.kitchenQuantity) : '');
    setSourceUnitId(selected?.conversion?.sourceUnitId || (data.sourceUnits.length === 1 ? data.sourceUnits[0].id : '')); setLink(false); setPreview(null);
  };
  useEffect(() => {
    const element = dialog.current!; element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    let active = true;
    request(`/warehouses/${warehouseId}/kitchen-issue-options?productId=${productId}`).then(result => {
      if (!active) return;
      const data: Options = result.data; setOptions(data);
      const linked = data.ingredients.filter(item => item.linked);
      let saved: Draft | null = null;
      try { saved = JSON.parse(sessionStorage.getItem(`kitchen-issue:${data.actorId}:${warehouseId}:${productId}`) || 'null'); } catch { /* A new attempt will require working draft storage. */ }
      if (saved && saved.productId === productId && typeof saved.requestId === 'string') {
        setPending(saved); selectIngredient(saved.kitchenProductId, data); setQuantity(String(saved.quantity));
      } else selectIngredient(linked.length === 1 ? linked[0].id : '', data);
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [warehouseId, productId]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'Request failed'); } finally { setBusy(false); }
  };
  const saveConversion = () => run(async () => {
    if (!ingredient || !Number.isFinite(Number(from)) || !Number.isFinite(Number(to)) || Number(from) <= 0 || Number(to) <= 0) throw new Error('Enter positive quantities for both sides of the conversion.');
    const result = await request(`/products/${productId}/kitchen-issue-conversion`, 'PUT', { warehouseId, kitchenProductId: ingredientId, sourceUnitId, warehouseQuantity: Number(from), kitchenQuantity: Number(to), expectedRevision: ingredient.conversion?.revision || 0, linkIngredient: link });
    setOptions(current => current && ({ ...current, ingredients: current.ingredients.map(item => item.id === ingredientId ? { ...item, linked: true, conversion: result.data } : item) })); setPreview(null);
  });
  const review = () => run(async () => {
    setPreview(null);
    const result = await request(`/warehouses/${warehouseId}/kitchen-issues/preview`, 'POST', { productId, kitchenProductId: ingredientId, quantity: Number(quantity), conversionRevision: ingredient?.conversion?.revision });
    setPreview(result.data);
  });
  const post = () => run(async () => {
    const draft = pending || { productId, kitchenProductId: ingredientId, quantity: Number(quantity), conversionRevision: ingredient!.conversion!.revision, requestId: crypto.randomUUID() };
    // Persist before sending: reopening the dialog must retry the identical operation.
    try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch { throw new Error('Browser draft storage is unavailable. Enable it before posting so an uncertain request can be retried safely.'); }
    setPending(draft);
    try {
      const result = await request(`/warehouses/${warehouseId}/kitchen-issues`, 'POST', draft);
      setPosted(result.issue); setPreview(null); onPosted();
      try { sessionStorage.removeItem(storageKey); } catch { /* Retrying this persisted key remains safe. */ }
      setPending(null);
    } catch (error) {
      if (error instanceof RequestError && [400, 409].includes(error.status) && error.code !== 'request_reused') {
        try { sessionStorage.removeItem(storageKey); } catch { /* Keep the same key if storage fails. */ }
        setPending(null); setPreview(null);
      }
      throw error;
    }
  });
  const dirty = ingredient?.conversion && (Number(from) !== ingredient.conversion.warehouseQuantity || Number(to) !== ingredient.conversion.kitchenQuantity || sourceUnitId !== ingredient.conversion.sourceUnitId);
  return <dialog ref={dialog} aria-labelledby="kitchen-issue-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className="m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-line bg-surface text-foreground p-0 shadow-xl backdrop:bg-black/50">
    <div className="p-5 sm:p-6 space-y-4">
      <div className="flex justify-between gap-4"><div><h2 id="kitchen-issue-title" className="text-xl font-bold">Issue to Kitchen</h2><p className="text-sm text-muted">{options?.warehouse.name} → kitchen recipe inventory</p></div><button type="button" className="ss-button" disabled={busy} onClick={onClose} aria-label="Close Issue to Kitchen">Close</button></div>
      <p className="text-sm text-muted">This moves stock between separate balances. It is not a warehouse transfer. Single items without variations or batches only.</p>
      {error && <p role="alert" className="rounded-lg border border-danger p-3 text-sm text-danger">{error}</p>}
      {!options ? !error && <p role="status">Loading issue options…</p> : <>
        <p className="font-semibold">{options.item.name} · {number(options.item.onHand)} {options.item.stockUnit} in warehouse</p>
        {posted ? <section role="status" className="rounded-xl border border-secondary-line bg-secondary-soft p-4 space-y-2"><h3 className="font-bold">Issue posted</h3><p>{number(posted.sourceQuantity)} {posted.sourceUnit} out → {number(posted.quantity)} {posted.kitchenUnit} in</p><p className="text-sm">Warehouse: {number(posted.sourceBefore)} → {number(posted.sourceAfter)}. Kitchen: {number(posted.kitchenBefore)} → {number(posted.kitchenAfter)} {posted.kitchenUnit}.</p><p className="text-xs break-all">Movement reference: {posted.id}</p><p className="text-xs text-muted">These are the balances at posting; subsequent sales may change them.</p></section> : <>
          {pending && <p role="status" className="rounded-lg border border-warning p-3 text-sm">An issue is awaiting confirmation. Retry this same request to recover its result without posting twice. Its details are locked.</p>}
          <label className="block text-sm font-medium">Kitchen ingredient<select aria-label="Kitchen ingredient" className={`${field} mt-1`} disabled={frozen} value={ingredientId} onChange={event => selectIngredient(event.target.value, options)}><option value="">Select an existing ingredient</option>{options.ingredients.map(item => <option key={item.id} value={item.id}>{item.name} ({item.unit || 'unit missing'}){item.linked ? ' · linked' : ' · not linked'}</option>)}</select></label>
          {!pending && <Link className="text-sm text-primary underline" to={`/kitchen/inventory/create?inventoryProductId=${productId}&returnWarehouseId=${warehouseId}`}>Create a linked ingredient with zero opening stock</Link>}
          {ingredient && <>
            <p className="text-sm text-muted">Kitchen on hand: {number(ingredient.onHand)} {ingredient.unit || '(set its recipe unit first)'}</p>
            {!ingredient.linked && <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={frozen} checked={link} onChange={event => setLink(event.target.checked)} />Link this ingredient to {options.item.name}. Existing stock is preserved.</label>}
            <fieldset disabled={frozen} className="rounded-xl border border-line p-4 space-y-3"><legend className="px-1 text-sm font-semibold">Explicit conversion for this item</legend>
              <label className="block text-sm">Warehouse unit<select aria-label="Warehouse unit" className={`${field} mt-1`} value={sourceUnitId} onChange={event => { setSourceUnitId(event.target.value); setPreview(null); }}><option value="">Select the matching stock unit</option>{options.sourceUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name} ({unit.shortName})</option>)}</select></label>
              {!options.sourceUnits.length && <p className="text-sm text-warning">The item's stock unit does not match a configured unit. Correct the item/unit setup before issuing.</p>}
              <div className="grid grid-cols-2 gap-3"><label className="text-sm">Warehouse quantity ({options.item.stockUnit})<input aria-label="Conversion warehouse quantity" className={`${field} mt-1`} type="number" min="0" step="any" value={from} onChange={event => { setFrom(event.target.value); setPreview(null); }} /></label><label className="text-sm">Kitchen quantity ({ingredient.unit})<input aria-label="Conversion kitchen quantity" className={`${field} mt-1`} type="number" min="0" step="any" value={to} onChange={event => { setTo(event.target.value); setPreview(null); }} placeholder="Enter explicitly" /></label></div>
              <p className="text-sm">{from || '—'} {options.item.stockUnit} = {to || '—'} {ingredient.unit}. Pack size is never inferred from the name.</p>
              <button type="button" className="ss-button" disabled={!sourceUnitId || (!ingredient.linked && !link)} onClick={saveConversion}>Save conversion{ingredient.conversion && !dirty ? ' (confirmed)' : ''}</button>
            </fieldset>
            <label className="block text-sm font-medium">Quantity to issue ({options.item.stockUnit})<input aria-label="Quantity to issue" className={`${field} mt-1`} type="number" min="0" step="any" value={quantity} disabled={frozen} onChange={event => { setQuantity(event.target.value); setPreview(null); }} /></label>
            {!pending && <button type="button" className="ss-button" disabled={busy || !ingredient.conversion || !!dirty || !ingredient.linked} onClick={review}>Review issue</button>}
            {!!dirty && <p className="text-sm text-warning">Save the edited conversion before reviewing an issue.</p>}
          </>}
          {preview && <section className="rounded-xl border border-line bg-surface-raised p-4 space-y-2" aria-label="Issue preview"><h3 className="font-bold">Review before posting</h3><p>{number(preview.sourceQuantity)} {preview.sourceUnit} out → {number(preview.quantity)} {preview.kitchenUnit} into {preview.kitchenName}</p><p>Warehouse: {number(preview.sourceBefore)} → {number(preview.sourceAfter)} {preview.sourceUnit}</p><p>Kitchen: {number(preview.kitchenBefore)} → {number(preview.kitchenAfter)} {preview.kitchenUnit}</p><p className="text-xs text-muted">Both balances and the linked movement are posted together. If stock changes, the server revalidates this issue.</p></section>}
          {(preview || pending) && <button type="button" disabled={busy} className="ss-button bg-primary text-on-primary w-full" onClick={post}>{busy ? 'Confirming…' : pending ? 'Retry same issue' : 'Confirm Issue to Kitchen'}</button>}
        </>}
        {!!options.history.length && <details className="border-t border-line pt-3"><summary className="cursor-pointer font-semibold text-sm">Recent linked issues ({options.history.length})</summary><ul className="mt-3 space-y-3 text-sm">{options.history.map(item => <li key={item.id}>{number(item.sourceQuantity)} {item.sourceUnit} out → {number(item.quantity)} {item.kitchenUnit} in · {item.kitchenName}<div className="text-xs text-muted break-all">{new Date(item.postedAt).toLocaleString()} · {item.id}</div></li>)}</ul></details>}
      </>}
    </div>
  </dialog>;
}
