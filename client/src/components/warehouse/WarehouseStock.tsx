import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import PermissionGate from '../common/PermissionGate';
import IssueToKitchenDialog from './IssueToKitchenDialog';

type StockLine = { productId: string; name: string; code: string; stockUnit: string | null; quantity: number | null; isSellable: boolean | null; variant: string; batch: string; sourceKey: string; legacyKey: boolean; trackingNeedsReview: boolean; issueSupported: boolean;
  stockAlert: number | null; alertEditable: boolean; reorderSupported: boolean; incoming: number | null; incomingNote: string; onOrderOnly?: boolean;
  alertState: 'low_stock' | 'out_of_stock' | 'threshold_missing' | 'stock_unknown' | 'healthy';
};
function StockAlertEditor({ item, warehouseId, onSaved }: { item: StockLine; warehouseId: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false), [value, setValue] = useState(item.stockAlert === null ? '' : String(item.stockAlert));
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const save = async (threshold: number | null) => {
    if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0)) { setError('Enter a nonnegative threshold in the recorded stock unit.'); return; }
    setSaving(true); setError('');
    try {
      const api = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${api}/warehouses/${warehouseId}/stock/${item.productId}/alert`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: JSON.stringify({ stockAlert: threshold, stockUnit: item.stockUnit }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Could not save threshold');
      setEditing(false); onSaved();
    } catch (error) { setError((error as Error).message); } finally { setSaving(false); }
  };
  return <div className="space-y-2">
    <div>{item.stockAlert === null ? 'Not configured' : `${item.stockAlert.toLocaleString()} ${item.stockUnit || ''}`}</div>
    {item.alertEditable ? <PermissionGate component="manageProducts" action="update">
      {editing ? <form aria-label={`Edit threshold for ${item.name}`} onSubmit={event => { event.preventDefault(); if (value.trim() === '') { setError('Enter a threshold, or use Clear threshold.'); return; } void save(Number(value)); }} className="space-y-2">
        <label className="block text-xs">Alert at or below ({item.stockUnit})<input aria-label={`Low-stock threshold for ${item.name}`} type="number" min="0" step="any" required value={value} onChange={event => setValue(event.target.value)} disabled={saving} className="mt-1 w-28 rounded border border-line bg-surface p-2" /></label>
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={saving} className="ss-button">{saving ? 'Saving…' : 'Save threshold'}</button><button type="button" disabled={saving} className="ss-button" onClick={() => void save(null)}>Clear threshold</button><button type="button" disabled={saving} className="text-sm underline" onClick={() => { setEditing(false); setError(''); }}>Cancel</button></div>
      </form> : <button type="button" className="text-sm text-primary underline" onClick={() => { setValue(item.stockAlert === null ? '' : String(item.stockAlert)); setEditing(true); }}>Edit threshold</button>}
    </PermissionGate> : <p className="text-xs text-muted">{item.onOrderOnly ? 'Available after the first receipt.' : 'Review canonical single-item stock before editing here.'}</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </div>;
}
const alertLabels = { low_stock: 'Low Stock', out_of_stock: 'Out of Stock', threshold_missing: 'Threshold missing', stock_unknown: 'On Hand unavailable', healthy: 'In stock' };
export default function WarehouseStock() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [issueProduct, setIssueProduct] = useState(params.get('issueProductId') || '');
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<{ warehouse: { name: string }; items: StockLine[] } | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [alertFilter, setAlertFilter] = useState('');
  const table = useRef<HTMLDivElement>(null);
  const [tableOverflows, setTableOverflows] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setError(''); setData(null);
    const api = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    fetch(`${api}/warehouses/${id}/stock`, { signal: controller.signal, headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Could not load stock'); setData(result.data); })
      .catch(error => { if (error.name !== 'AbortError') setError(error.message); });
    return () => controller.abort();
  }, [id, version]);
  const items = data?.items.filter(item => `${item.name} ${item.code} ${item.variant}`.toLowerCase().includes(query.toLowerCase()) && (!alertFilter || item.alertState === alertFilter)) || [];
  useEffect(() => {
    const node = table.current; if (!node) return;
    const update = () => setTableOverflows(node.scrollWidth > node.clientWidth);
    update(); const observer = new ResizeObserver(update); observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [data, items.length]);
  return <div className="min-w-0 p-4 sm:p-6 lg:p-8 space-y-5">
    <Link to="/viewWarehouses" className="text-sm text-primary underline">Back to Warehouses</Link>
    <div className="flex flex-wrap justify-between gap-4 items-start">
      <div><h1 className="text-2xl font-bold text-foreground">{data?.warehouse.name || 'Warehouse'} stock</h1><p className="mt-2 text-sm text-muted">Warehouse balances in each item's stock unit, including stocked sellable goods. Kitchen ingredient balances are separate.</p></div>
      <div className="flex flex-wrap gap-2">
        <PermissionGate component="manageProducts" action="create"><Link to={`/inventory-items/new?warehouseId=${id}`} className="ss-button">Create Item</Link></PermissionGate>
        <PermissionGate component="manageProducts" action="update"><PermissionGate component="managePurchases" action="read"><Link to={`/purchases?warehouseId=${id}`} className="ss-button bg-primary text-on-primary">Receive Stock</Link></PermissionGate></PermissionGate>
      </div>
    </div>
    <p className="text-sm text-muted">Low Stock means On Hand is at or below the configured threshold. Incoming is shown separately from unreceived purchase orders; it never clears an On Hand alert. Reorder opens a purchase draft for review. Different stock units are never combined.</p>
    {data && <p role="status" className="text-sm font-semibold">{data.items.filter(item => item.alertState === 'low_stock').length} low stock · {data.items.filter(item => item.alertState === 'out_of_stock').length} out of stock · {data.items.filter(item => item.stockAlert === null).length} thresholds missing</p>}
    <div className="flex flex-wrap gap-3"><input aria-label="Search warehouse stock" placeholder="Search name, SKU or variation" value={query} onChange={event => setQuery(event.target.value)} className="w-full max-w-md border border-line rounded-lg px-3 py-2" /><select aria-label="Stock alert filter" value={alertFilter} onChange={event => setAlertFilter(event.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2"><option value="">All stock</option>{Object.entries(alertLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="ss-button" onClick={() => setVersion(value => value + 1)}>Refresh stock</button></div>
    {error ? <p role="alert" className="text-danger">{error}</p> : !data ? <p role="status">Loading warehouse stock...</p> : <>
      {tableOverflows && <div className="flex flex-wrap items-center justify-between gap-2"><p id="stock-scroll-help" className="text-xs text-muted">Scroll horizontally or use the arrows to see thresholds and actions.</p><div className="flex gap-2"><button type="button" aria-label="Scroll stock table left" aria-controls="warehouse-stock-table-scroll" className="ss-icon-button border border-line" onClick={() => table.current?.scrollBy({ left: -360, behavior: 'smooth' })}><ChevronLeft size={18} /></button><button type="button" aria-label="Scroll stock table right" aria-controls="warehouse-stock-table-scroll" className="ss-icon-button border border-line" onClick={() => table.current?.scrollBy({ left: 360, behavior: 'smooth' })}><ChevronRight size={18} /></button></div></div>}
      <div ref={table} id="warehouse-stock-table-scroll" role="region" aria-label="Warehouse stock table" aria-describedby={tableOverflows ? 'stock-scroll-help' : undefined} tabIndex={0} className="overflow-x-auto custom-scrollbar rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[76rem] text-sm text-left"><thead className="bg-surface-raised"><tr>{['Item / SKU', 'Selling type', 'Variation / batch', 'On Hand', 'Incoming', 'Low-stock threshold', 'Stock status', 'Actions'].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{items.map((item, index) => <tr key={`${item.productId}-${item.sourceKey}-${index}`}>
            <td className="p-4"><div className="font-semibold">{item.name}</div><div className="text-muted">{item.code}</div>{(item.legacyKey || item.trackingNeedsReview) && <div className="text-warning">Legacy stock needs review; not merged</div>}</td>
            <td className="p-4">{item.isSellable === true ? 'Sellable' : item.isSellable === false ? 'Inventory only' : 'Needs Review'}</td>
            <td className="p-4">{[item.variant, item.batch].filter(Boolean).join(' / ') || 'Single item'}</td>
            <td className="p-4 font-semibold">{item.quantity === null ? 'Not recorded' : item.quantity.toLocaleString()}<span className="block text-xs font-normal text-muted">{item.stockUnit || 'Unit not recorded'}</span></td>
            <td className="p-4"><div className="font-semibold">{item.incoming === null ? 'Unavailable' : item.incoming.toLocaleString()} {item.incoming !== null && item.stockUnit}</div>{item.incomingNote && <p className="mt-1 max-w-48 text-xs text-warning">{item.incomingNote}</p>}</td>
            <td className="p-4"><StockAlertEditor item={item} warehouseId={id || ''} onSaved={() => setVersion(value => value + 1)} /></td>
            <td className="p-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${item.alertState === 'out_of_stock' ? 'bg-danger-soft text-danger' : item.alertState === 'low_stock' || item.alertState === 'threshold_missing' ? 'bg-warning-soft text-warning' : 'bg-surface-muted text-foreground'}`}>{alertLabels[item.alertState]}</span></td>
            <td className="p-4"><div className="flex flex-col items-start gap-2"><PermissionGate component="manageProducts" action="update"><PermissionGate component="managePurchases" action="read">{item.reorderSupported ? <Link to={`/createPurchase?warehouseId=${id}&reorderProductId=${item.productId}`} className="ss-button whitespace-nowrap">Reorder</Link> : <p className="text-xs text-muted">Review stock identity before reordering.</p>}</PermissionGate><PermissionGate component="manageKitchen" action="edit_kitchen_inventory"><PermissionGate component="manageKitchen" action="view_kitchen_inventory">{item.issueSupported && <button type="button" className="ss-button whitespace-nowrap" onClick={() => setIssueProduct(item.productId)}>Issue to Kitchen</button>}</PermissionGate></PermissionGate></PermissionGate></div></td>
          </tr>)}{!items.length && <tr><td colSpan={8} className="p-8 text-center text-muted">No warehouse stock records match this view.</td></tr>}</tbody></table>
      </div><p className="text-xs text-muted">{items.length} stock lines. Purchasing and warehouse transfers do not automatically refill the separate kitchen balance.</p>
    </>}
    {issueProduct && id && <PermissionGate component="manageProducts" action="update"><PermissionGate component="manageKitchen" action="edit_kitchen_inventory"><PermissionGate component="manageKitchen" action="view_kitchen_inventory"><IssueToKitchenDialog key={`${id}-${issueProduct}`} warehouseId={id} productId={issueProduct} onPosted={() => setVersion(value => value + 1)} onClose={() => { setIssueProduct(''); if (params.has('issueProductId')) { const next = new URLSearchParams(params); next.delete('issueProductId'); setParams(next, { replace: true }); } }} /></PermissionGate></PermissionGate></PermissionGate>}
  </div>;
}
