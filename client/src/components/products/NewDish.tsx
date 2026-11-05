import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { usePermissions } from '../../contexts/PermissionContext';
import { clearDishDraft, createDishDraft, loadDishDraft, newDishDraft, storeDishDraft } from '../../services/dishDraft';
import type { DishDraft } from '../../services/dishDraft';

type Unit = { _id: string; unitName: string; shortName: string };
type Location = { _id: string; name: string; isActive: boolean };
type Ingredient = { _id: string; name: string; unitId?: { shortName?: string }; currentStock: number };
type Setup = { categories: { category: string }[]; units: Unit[]; locations: Location[]; ingredients: Ingredient[] };
type Recipe = { ingredients: { ingredientProductId: string; quantity: number; unit: string }[] };
type SavedDish = { _id: string; name: string; code: string; category: string; unit: string; status: string; isInventory: boolean; ptype: string; guidedDishDraft?: unknown; warehouse: Record<string, { productPrice: number; productCost: number }> };
const field = 'w-full mt-1 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-foreground disabled:opacity-60';
class ApiError extends Error { status: number; code?: string; constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; } }
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}${path}`, { method, headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new ApiError(response.status === 403 ? `${result.message || 'Access denied'} (${path}). Ask an administrator for the existing permission needed by this step.` : result.message || `Could not load ${path}`, response.status, result.code);
  return result.data;
}
function actorId() { try { const user = JSON.parse(localStorage.getItem('user') || '{}'); return String(user._id || user.id || ''); } catch { return ''; } }

export default function NewDish() {
  const [params] = useSearchParams(); const requestedId = params.get('productId');
  const actor = actorId(), { currencyCode } = useCurrency(), { hasPermission } = usePermissions();
  const [draft, setDraft] = useState<DishDraft>(() => { try { return loadDishDraft(localStorage, actor) || newDishDraft(); } catch { return newDishDraft(); } });
  const [setup, setSetup] = useState<Setup | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [active, setActive] = useState(false); const [revision, setRevision] = useState(0);
  const inFlight = useRef(false), currentDraft = useRef(draft); currentDraft.current = draft;
  const persist = (value: DishDraft) => { storeDishDraft(localStorage, actor, value); setDraft(value); };
  useEffect(() => {
    let live = true;
    (async () => {
      const [categories, units, locations, ingredients] = await Promise.all([api('/categories'), api('/units'), api('/warehouses'), api('/kitchen/products')]);
      if (!live) return;
      const data: Setup = { categories, units, locations: locations.filter((item: Location) => item.isActive), ingredients }; setSetup(data);
      const id = requestedId || currentDraft.current.productId;
      if (id) {
        const product: SavedDish = await api(`/products/${id}`);
        if (!product.guidedDishDraft || product.isInventory !== false || product.ptype !== 'Single') throw new Error('This item uses the existing product and recipe editors.');
        const recipe: Recipe | null = hasPermission('manageKitchen', 'view_recipe') ? await api(`/kitchen/recipes/${id}`) : null;
        if (!live) return;
        const previous = currentDraft.current, locationId = Object.keys(product.warehouse || {})[0] || '';
        const same = previous.productId === id;
        const loaded: DishDraft = { ...(same ? previous : newDishDraft()), productId: id, fields: { name: product.name, code: product.code, category: product.category, unit: product.unit, locationId, price: String(product.warehouse[locationId]?.productPrice ?? ''), cost: String(product.warehouse[locationId]?.productCost ?? '') } };
        if (recipe?.ingredients?.length && (!same || previous.recipeSaved)) { loaded.rows = recipe.ingredients.map(item => ({ id: item.ingredientProductId, quantity: String(item.quantity) })); loaded.recipeSaved = true; }
        persist(loaded); setActive(product.status === 'Active');
      } else if (!currentDraft.current.fields.unit) {
        const serving = data.units.find(unit => unit.shortName.toLowerCase() === 'ptn');
        if (serving) persist({ ...currentDraft.current, fields: { ...currentDraft.current.fields, unit: serving.unitName } });
      }
    })().catch(error => { if (live) setError(error.message); });
    return () => { live = false; };
  }, [requestedId, revision]);
  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not save this step'); try { const saved = loadDishDraft(localStorage, actor); if (saved) setDraft(saved); } catch { /* Keep visible draft intact. */ } }
    finally { inFlight.current = false; setBusy(false); }
  };
  const changeField = (name: keyof DishDraft['fields'], value: string) => { try { persist({ ...draft, fields: { ...draft.fields, [name]: value } }); } catch { setError('Browser storage must be available to keep a resumable draft.'); } };
  const changeRows = (rows: DishDraft['rows']) => { try { persist({ ...draft, rows, recipeSaved: false }); } catch { setError('Could not preserve this draft in browser storage.'); } };
  const saveDetails = () => run(async () => {
    const f = draft.fields;
    if (!f.name.trim() || !f.code.trim() || !f.category || !f.unit || !f.locationId || f.price.trim() === '' || f.cost.trim() === '' || !Number.isFinite(Number(f.price)) || Number(f.price) < 0 || !Number.isFinite(Number(f.cost)) || Number(f.cost) < 0) throw new Error('Complete the dish name, SKU, category, serving unit, location, selling price and recorded cost.');
    const next = await createDishDraft(localStorage, actor, draft, setup?.locations.find(item => item._id === f.locationId)?.name || '', body => api('/products', 'POST', body)); setDraft(next);
  });
  const saveRecipe = () => run(async () => {
    if (!draft.productId) throw new Error('Save dish details first');
    const seen = new Set<string>();
    const ingredients = draft.rows.map(row => {
      const item = setup?.ingredients.find(item => item._id === row.id), quantity = Number(row.quantity);
      if (!item?.unitId?.shortName || !Number.isFinite(quantity) || quantity <= 0 || seen.has(row.id)) throw new Error('Choose distinct kitchen ingredients with a positive quantity per serving and a configured unit.');
      seen.add(row.id); return { ingredientProductId: row.id, quantity, unit: item.unitId.shortName };
    });
    if (!ingredients.length) throw new Error('Add at least one ingredient');
    const saved: Recipe = await api('/kitchen/recipes', 'POST', { productId: draft.productId, ingredients });
    if (!saved?.ingredients?.length) throw new Error('Recipe save could not be confirmed. Retry this same draft.');
    persist({ ...draft, recipeSaved: true });
  });
  const activate = () => run(async () => {
    if (!draft.productId || !draft.recipeSaved) throw new Error('Save the recipe before activation');
    await api(`/products/${draft.productId}`, 'PUT', { status: 'Active' }); setActive(true); clearDishDraft(localStorage, actor, draft.productId);
  });
  const detailsLocked = busy || !!draft.productId || !!draft.creationPayload;
  return <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
    <Link to="/pos-products" className="text-primary underline text-sm">Back to POS Products</Link>
    <div><h1 className="text-2xl font-bold">New Dish</h1><p className="mt-2 text-sm text-muted">One dish, one serving size. Save details → save ingredients per serving → activate. Pending dishes stay out of POS.</p></div>
    <ol className="flex flex-wrap gap-3 text-sm" aria-label="Dish setup progress"><li>1. Details {draft.productId ? '✓' : ''}</li><li>2. Recipe {draft.recipeSaved ? '✓' : ''}</li><li>3. {active ? 'Active ✓' : 'Activate'}</li></ol>
    {error && <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-4">{error}</p>}
    {!actor && <p role="alert">Sign in again so this draft can be saved under your account.</p>}
    {!setup ? <><p role="status">Loading dish setup…</p><button type="button" className="ss-button disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => { setError(''); setRevision(value => value + 1); }}>Retry setup</button></> : <>
      {(!setup.locations.length || !setup.categories.length || !setup.units.length) && <aside className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm">Finish missing setup first: {!setup.locations.length && <Link className="underline mr-3" to="/viewWarehouses">add an active selling location</Link>}{!setup.categories.length && <Link className="underline mr-3" to="/viewCategories">add a category</Link>}{!setup.units.length && <Link className="underline" to="/viewUnits">add a serving unit</Link>}. Your dish draft is retained when you leave this page.</aside>}
      {!setup.ingredients.length && <aside className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm space-y-2"><p>No kitchen ingredients exist yet. You can save dish details as Pending, but must add ingredients before saving its recipe.</p><Link className="underline text-primary" to="/kitchen/inventory/create">Add a kitchen ingredient</Link><p>Choose its recipe unit (for example, rice in g). Ingredient stock must be available before checkout; this flow does not add stock.</p><button type="button" className="ss-button disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => setRevision(value => value + 1)}>Reload setup</button></aside>}
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5 space-y-4"><h2 className="text-lg font-bold">1. Dish and selling details</h2>
        <fieldset disabled={detailsLocked || active} className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm">Dish name<input aria-label="Dish name" className={field} value={draft.fields.name} onChange={event => changeField('name', event.target.value)} required /></label>
          <label className="text-sm">SKU<input aria-label="SKU" className={field} value={draft.fields.code} onChange={event => changeField('code', event.target.value)} required /></label>
          <label className="text-sm">Category<select aria-label="Category" className={field} value={draft.fields.category} onChange={event => changeField('category', event.target.value)}><option value="">Choose category</option>{setup.categories.map(item => <option key={item.category}>{item.category}</option>)}</select></label>
          <label className="text-sm">Serving unit<select aria-label="Serving unit" className={field} value={draft.fields.unit} onChange={event => changeField('unit', event.target.value)}><option value="">Choose unit for one serving</option>{setup.units.map(item => <option key={item._id} value={item.unitName}>{item.unitName} ({item.shortName})</option>)}</select></label>
          <label className="text-sm">Selling location<select aria-label="Selling location" className={field} value={draft.fields.locationId} onChange={event => changeField('locationId', event.target.value)}><option value="">Choose selling location</option>{setup.locations.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
          <label className="text-sm">Selling price ({currencyCode})<input aria-label="Selling price" className={field} type="number" min="0" step="any" value={draft.fields.price} onChange={event => changeField('price', event.target.value)} /></label>
          <label className="text-sm">Recorded cost per serving ({currencyCode})<input aria-label="Recorded cost per serving" className={field} type="number" min="0" step="any" value={draft.fields.cost} onChange={event => changeField('cost', event.target.value)} /></label>
        </fieldset>
        <p className="text-xs text-muted">Recorded cost is required by the existing product model. This flow does not calculate or replace financial costs.</p>
        {!draft.productId ? <button type="button" className="ss-button bg-primary text-on-primary disabled:opacity-50 disabled:cursor-not-allowed" disabled={busy || !actor || !setup.locations.length || !setup.categories.length || !setup.units.length} onClick={saveDetails}>{draft.creationPayload ? 'Retry same dish draft' : 'Save dish & continue to recipe'}</button> : <p role="status" className="text-sm">Dish details saved. {active ? 'The dish is Active.' : 'Status: Pending. Next: save the recipe below.'} <Link className="underline text-primary" to={`/pos-products/${draft.productId}/edit`}>Edit saved details</Link></p>}
        {draft.creationPayload && !draft.productId && <p className="text-sm text-warning">Creation is awaiting confirmation. Retry the same request; do not create another dish.</p>}
      </section>
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5 space-y-4"><h2 className="text-lg font-bold">2. Ingredients for one serving</h2>
        <fieldset disabled={busy || !draft.productId || active} className="space-y-3">{draft.rows.map((row, index) => { const ingredient = setup.ingredients.find(item => item._id === row.id); return <div key={index} className="grid sm:grid-cols-[1fr_10rem_auto] gap-2 items-end"><label className="text-sm">Ingredient {index + 1}<select aria-label={`Ingredient ${index + 1}`} className={field} value={row.id} onChange={event => changeRows(draft.rows.map((item, i) => i === index ? { ...item, id: event.target.value } : item))}><option value="">Choose kitchen ingredient</option>{setup.ingredients.map(item => <option key={item._id} value={item._id}>{item.name} ({item.unitId?.shortName || 'unit missing'})</option>)}</select></label><label className="text-sm">Quantity ({ingredient?.unitId?.shortName || 'recipe unit'})<input aria-label={`Quantity per serving ${index + 1}`} type="number" min="0.0001" step="any" className={field} value={row.quantity} onChange={event => changeRows(draft.rows.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} /></label><button type="button" className="ss-button disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => changeRows(draft.rows.filter((_item, i) => i !== index))}>Remove</button>{ingredient && <p className="text-xs text-muted sm:col-span-3">Kitchen on hand: {(typeof ingredient.currentStock === 'number' && Number.isFinite(ingredient.currentStock) ? ingredient.currentStock.toLocaleString() : 'Not recorded')} {ingredient.unitId?.shortName}. Recipe quantity is per one serving.</p>}</div>; })}<button type="button" className="ss-button disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => changeRows([...draft.rows, { id: '', quantity: '' }])}>Add ingredient</button></fieldset>
        <button type="button" className="ss-button bg-primary text-on-primary disabled:opacity-50 disabled:cursor-not-allowed" disabled={busy || !draft.productId || !setup.ingredients.length || active || !hasPermission('manageKitchen', 'create_recipe')} onClick={saveRecipe}>Save recipe &amp; review</button>
        {!hasPermission('manageKitchen', 'create_recipe') && <p className="text-sm text-warning">Recipe creation permission is required to save this step.</p>}
        {draft.recipeSaved && !active && <p role="status" className="text-sm">Recipe saved. The dish is still Pending until you activate it.</p>}
      </section>
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5 space-y-3"><h2 className="text-lg font-bold">3. Review and activate</h2><p className="text-sm">{draft.fields.name || 'Dish'} · {draft.fields.code || 'SKU'} · {setup.locations.find(item => item._id === draft.fields.locationId)?.name || 'Selling location needed'} · {currencyCode} {draft.fields.price || 'price needed'} per serving</p>
        {active ? <p role="status">Dish activated. Select its selling location in POS. <Link to="/pos" className="underline text-primary">Open POS</Link></p> : <button type="button" className="ss-button bg-secondary text-on-secondary disabled:opacity-50 disabled:cursor-not-allowed" disabled={busy || !draft.recipeSaved || !draft.productId || !hasPermission('manageProducts', 'update')} onClick={activate}>Activate dish</button>}
        {!hasPermission('manageProducts', 'update') && <p className="text-sm text-warning">Product update permission is required to activate this dish. Its Pending draft is retained.</p>}
        {draft.productId && <Link className="block text-sm underline text-primary" to={`/kitchen/recipes?productId=${draft.productId}`}>Open existing recipe editor</Link>}
      </section>
    </>}
  </div>;
}
