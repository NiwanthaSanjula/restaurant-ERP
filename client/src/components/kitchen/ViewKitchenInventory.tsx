import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import SearchBar from '../common/SearchBar';

type UnitPop = { _id: string; unitName: string; shortName: string };
type KitchenRow = {
  _id: string;
  name: string;
  unitId: UnitPop | string;
  currentStock: number;
  minStockLevel?: number;
  /** Resolved: linked Product's stockAlert when set, else minStockLevel */
  minStockLevelEffective?: number | null;
  stockAlertFromProduct?: number | null;
  inventoryProductId?: { _id: string; name?: string; code?: string } | string | null;
  description?: string;
};

type WarehouseOpt = { _id: string; name: string };

type MovementRow = {
  _id: string;
  type: 'in' | 'out';
  quantity: number;
  note?: string;
  createdAt: string;
  createdBy?: { name?: string; email?: string };
};

/** Preset labels sent as `reason`; combined with optional detail in movement history. */
const STOCK_OUT_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Select a reason…' },
  { value: 'Spoiled', label: 'Spoiled' },
  { value: 'Damaged', label: 'Damaged' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Waste / prep trim', label: 'Waste / prep trim' },
  { value: 'Tasting / staff meal', label: 'Tasting / staff meal' },
  { value: 'Theft / unaccounted loss', label: 'Theft / unaccounted loss' },
  { value: 'Transfer or other use', label: 'Transfer or other use' },
  { value: '__OTHER__', label: 'Other (specify below)' }
];

const ViewKitchenInventory: React.FC = () => {
  const { currencySymbol } = useCurrency();
  const [rows, setRows] = useState<KitchenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  /** Empty string = All (no warehouseId query param). */
  const [alertWarehouseId, setAlertWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([]);
  const [toDelete, setToDelete] = useState<KitchenRow | null>(null);

  const [stockModal, setStockModal] = useState<'in' | 'out' | null>(null);
  const [stockProduct, setStockProduct] = useState<KitchenRow | null>(null);
  const [stockQty, setStockQty] = useState('');
  const [stockPrice, setStockPrice] = useState('');
  const [stockNote, setStockNote] = useState('');
  const [stockOutReason, setStockOutReason] = useState('');

  const [movementsFor, setMovementsFor] = useState<KitchenRow | null>(null);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  };

  const unitLabel = (p: KitchenRow) => {
    const u = p.unitId;
    if (u && typeof u === 'object' && 'shortName' in u) {
      return `${u.unitName} (${u.shortName})`;
    }
    return '—';
  };

  useEffect(() => {
    const loadWh = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${api}/warehouses`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (res.ok && data.data?.length) {
          const list: WarehouseOpt[] = data.data.map((w: any) => ({ _id: w._id, name: w.name }));
          setWarehouses(list);
        }
      } catch {
        /* ignore */
      }
    };
    loadWh();
  }, [api]);

  const fetchRows = async (q: string, wid: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (wid) params.set('warehouseId', wid);
      const qs = params.toString();
      const res = await fetch(`${api}/kitchen/products${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Failed to load kitchen inventory');
        return;
      }
      setRows(data.data || []);
    } catch (e) {
      showErrorToast((e as Error).message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows(searchQuery, alertWarehouseId);
  }, [searchQuery, alertWarehouseId]);

  const openStock = (type: 'in' | 'out', p: KitchenRow) => {
    setStockModal(type);
    setStockProduct(p);
    setStockQty('');
    setStockPrice('');
    setStockNote('');
    setStockOutReason('');
  };

  const submitStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockProduct || !stockModal) return;
    const qty = parseFloat(stockQty);
    if (!qty || qty <= 0) {
      showErrorToast('Enter a valid quantity');
      return;
    }
    if (stockModal === 'out' && qty > stockProduct.currentStock) {
      showErrorToast(
        `Insufficient stock: ${stockProduct.name} has ${stockProduct.currentStock} available`
      );
      return;
    }
    if (stockModal === 'out') {
      if (!stockOutReason) {
        showErrorToast('Choose a reason for stock out');
        return;
      }
      if (stockOutReason === '__OTHER__' && !stockNote.trim()) {
        showErrorToast('Describe the reason under "Additional detail"');
        return;
      }
    }
    setLoading(true);
    try {
      const path = stockModal === 'in' ? 'stock-in' : 'stock-out';
      const body =
        stockModal === 'in'
          ? { 
              quantity: qty, 
              purchasePrice: stockPrice ? parseFloat(stockPrice) : undefined,
              note: stockNote.trim() || undefined 
            }
          : {
              quantity: qty,
              reason: stockOutReason === '__OTHER__' ? 'Other' : stockOutReason,
              note:
                stockOutReason === '__OTHER__'
                  ? stockNote.trim()
                  : stockNote.trim() || undefined
            };
      const res = await fetch(`${api}/kitchen/products/${stockProduct._id}/${path}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Request failed');
        return;
      }
      showSuccessToast(data.message || 'Saved');
      setStockModal(null);
      setStockProduct(null);
      fetchRows(searchQuery, alertWarehouseId);
    } catch (err) {
      showErrorToast((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openMovements = async (p: KitchenRow) => {
    setMovementsFor(p);
    setMovementsLoading(true);
    setMovements([]);
    try {
      const res = await fetch(`${api}/kitchen/products/${p._id}/movements?limit=200`, {
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Failed to load movements');
        setMovementsFor(null);
        return;
      }
      setMovements(data.data || []);
    } catch (e) {
      showErrorToast((e as Error).message);
      setMovementsFor(null);
    } finally {
      setMovementsLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setLoading(true);
    try {
      const res = await fetch(`${api}/kitchen/products/${toDelete._id}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Delete failed');
        return;
      }
      showSuccessToast(data.message || 'Deleted');
      setToDelete(null);
      fetchRows(searchQuery, alertWarehouseId);
    } catch (e) {
      showErrorToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const effectiveMin = (p: KitchenRow) =>
    p.minStockLevelEffective != null ? p.minStockLevelEffective : null;

  const isLow = (p: KitchenRow) => {
    const m = effectiveMin(p);
    return m != null && p.currentStock <= m;
  };

  const displayName = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

  const controlClass =
    'rounded-xl border border-line bg-surface px-4 py-3 text-sm text-foreground placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

  // BUG-020 FIX: non-finite next value (NaN/Infinity) handle කරනවා
  const stockBalancePreview = useMemo(() => {
    if (!stockModal || !stockProduct) return null;
    const q = parseFloat(stockQty);
    if (!Number.isFinite(q) || q <= 0) {
      return { current: stockProduct.currentStock, next: null as number | null, qty: null as number | null };
    }
    const next =
      stockModal === 'in' ? stockProduct.currentStock + q : stockProduct.currentStock - q;
    // next එක NaN හෝ Infinity වුණොත් null return කරනවා
    if (!Number.isFinite(next)) {
      return { current: stockProduct.currentStock, next: null as number | null, qty: null as number | null };
    }
    return { current: stockProduct.currentStock, next, qty: q };
  }, [stockModal, stockProduct, stockQty]);

  const selectChevron =
    "appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%236b7280%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27M19 9l-7 7-7-7%27/%3E%3C/svg%3E')] bg-[length:1.25rem] bg-[right_0.65rem_center] bg-no-repeat pr-10";

  return (
    <div className="min-h-screen bg-canvas">
      {loading && <Loader text="Loading" />}

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          {/* Page header */}
          <div className="flex flex-col gap-4 border-b border-line px-5 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-6">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                Kitchen
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Inventory</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Track ingredients, record stock in and out, and view movement history in one place.
              </p>
            </div>
            <Link
              to="/kitchen/inventory/create"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-primary-hover"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add ingredient
            </Link>
          </div>

          {/* Toolbar */}
          <div className="border-b border-line bg-surface px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:gap-8">
              <div className="min-w-0 flex-1">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Search ingredients
                </label>
                <SearchBar
                  onSearch={setSearchQuery}
                  placeholder="Search by name..."
                  inputClassName="rounded-lg border-line-strong py-2.5 text-sm shadow-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="w-full shrink-0 md:max-w-[280px]">
                <label
                  htmlFor="kitchen-warehouse-alert"
                  className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted"
                >
                  Warehouse for stock alert
                </label>
                <select
                  id="kitchen-warehouse-alert"
                  value={alertWarehouseId}
                  onChange={(e) => setAlertWarehouseId(e.target.value)}
                  className={`w-full cursor-pointer rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${selectChevron}`}
                  aria-label="Warehouse for stock alert"
                >
                  <option value="">All</option>
                  {warehouses.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-surface-muted">
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Product
                  </th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Unit
                  </th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Stock
                  </th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Alert / min
                  </th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted text-subtle">
                          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                            />
                          </svg>
                        </div>
                        <p className="text-base font-semibold text-foreground">No ingredients yet</p>
                        <p className="text-sm text-muted">Add your first ingredient to start tracking kitchen stock.</p>
                        <Link
                          to="/kitchen/inventory/create"
                          className="mt-1 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
                        >
                          Add ingredient
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((p) => (
                    <tr
                      key={p._id}
                      className={`border-b border-line transition-colors ${
                        isLow(p) ? 'bg-danger-soft/50 hover:bg-danger-soft/70' : 'hover:bg-surface-raised/80'
                      }`}
                    >
                      <td className="px-5 py-4 align-top">
                        <div className="font-semibold text-foreground">{displayName(p.name)}</div>
                        {p.inventoryProductId &&
                          typeof p.inventoryProductId === 'object' &&
                          p.inventoryProductId.name && (
                            <p className="mt-1 text-xs text-muted">
                              Linked {displayName(p.inventoryProductId.name)}
                              {p.inventoryProductId.code ? ` - ${p.inventoryProductId.code}` : ''}
                            </p>
                          )}
                        {p.description && (
                          <div className="mt-1 line-clamp-1 text-xs text-subtle">{p.description}</div>
                        )}
                      </td>
                      <td className="px-5 py-4 align-top text-sm text-foreground">{unitLabel(p)}</td>
                      <td className="px-5 py-4 align-top text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono text-base tabular-nums font-semibold text-foreground">
                            {p.currentStock}
                          </span>
                          {isLow(p) && (
                            <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-danger">
                              LOW
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top text-right text-sm text-foreground">
                        {effectiveMin(p) != null ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-mono tabular-nums font-semibold text-foreground">
                              {effectiveMin(p)}
                            </span>
                            {p.stockAlertFromProduct != null && (
                              <span className="text-[11px] font-normal text-muted">From product</span>
                            )}
                            {p.stockAlertFromProduct == null && p.minStockLevel != null && (
                              <span className="text-[11px] font-normal text-muted">Kitchen min</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openStock('in', p)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-secondary-line bg-secondary-soft px-3 py-2 text-xs font-semibold text-secondary transition hover:bg-secondary-soft"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Stock In
                          </button>
                          <button
                            type="button"
                            onClick={() => openStock('out', p)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-xs font-semibold text-warning transition hover:bg-warning-soft"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                            Stock out
                          </button>
                          <button
                            type="button"
                            title="History"
                            onClick={() => openMovements(p)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-muted transition hover:bg-surface-raised"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          </button>
                          <Link
                            to={`/kitchen/inventory/edit/${p._id}`}
                            title="Edit"
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary-line bg-primary-soft text-foreground transition hover:bg-primary-soft"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          </Link>
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => setToDelete(p)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-danger-line bg-danger-soft text-danger transition hover:bg-danger-soft"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {stockModal && stockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-elevated">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {stockModal === 'in' ? 'Stock in' : 'Stock out'}
                </h2>
                <p className="mt-1 text-sm text-muted">{displayName(stockProduct.name)}</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setStockModal(null);
                  setStockProduct(null);
                  setStockOutReason('');
                }}
                className="rounded-lg p-2 text-subtle transition hover:bg-surface-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {stockBalancePreview && (
              <div
                className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
                  stockModal === 'in'
                    ? 'border-secondary-line/80 bg-secondary-soft/90 text-secondary'
                    : 'border-warning-line/80 bg-warning-soft/90 text-warning'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-foreground">Current stock</span>
                  <span className="font-mono text-lg font-bold tabular-nums text-foreground">
                    {stockBalancePreview.current}
                  </span>
                </div>
                {stockBalancePreview.next != null &&
                  stockBalancePreview.qty != null &&
                  stockBalancePreview.next >= 0 && (
                    <p className="mt-2 border-t border-line/5 pt-2 text-sm">
                      {stockModal === 'in' ? (
                        <>
                          Adds <span className="font-mono font-semibold">{stockBalancePreview.qty}</span> →{' '}
                          <span className="font-medium">new balance</span>{' '}
                          <span className="font-mono text-base font-bold tabular-nums">
                            {stockBalancePreview.next}
                          </span>
                        </>
                      ) : (
                        <>
                          Subtracts <span className="font-mono font-semibold">{stockBalancePreview.qty}</span> →{' '}
                          <span className="font-medium">new balance</span>{' '}
                          <span className="font-mono text-base font-bold tabular-nums">
                            {stockBalancePreview.next}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                {stockModal === 'out' &&
                  stockBalancePreview.next != null &&
                  stockBalancePreview.next < 0 && (
                    <p className="mt-2 text-sm font-medium text-danger">
                      Not enough stock — reduce quantity or use a smaller amount.
                    </p>
                  )}
              </div>
            )}
            <form onSubmit={submitStock} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Quantity</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max={stockModal === 'out' ? stockProduct.currentStock : undefined}
                  required
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className={`w-full ${controlClass}`}
                />
              </div>

              {stockModal === 'in' && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">
                    Purchase Price (per unit) <span className="text-xs font-normal text-subtle">— Optional</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-subtle">{currencySymbol}</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={stockPrice}
                      onChange={(e) => setStockPrice(e.target.value)}
                      placeholder="0.00"
                      className={`w-full !pl-14 ${controlClass}`}
                    />
                  </div>
                </div>
              )}

              {stockModal === 'out' && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">
                    Reason for stock out <span className="text-danger">*</span>
                  </label>
                  <select
                    required
                    value={stockOutReason}
                    onChange={(e) => setStockOutReason(e.target.value)}
                    className={`w-full cursor-pointer ${controlClass}`}
                  >
                    {STOCK_OUT_REASON_OPTIONS.map((opt) => (
                      <option key={opt.value || 'placeholder'} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-muted">
                    Helps explain shrinkage and keeps movement history clear for audits.
                  </p>
                </div>
              )}
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">
                  {stockModal === 'in'
                    ? 'Reference note (optional)'
                    : stockOutReason === '__OTHER__'
                      ? 'Additional detail (required for "Other")'
                      : 'Additional detail (optional)'}
                </label>
                <textarea
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  rows={3}
                  className={`w-full resize-none ${controlClass}`}
                  placeholder={
                    stockModal === 'out' && stockOutReason === '__OTHER__'
                      ? 'e.g. Dropped container, wrong batch disposed…'
                      : stockModal === 'out'
                        ? 'e.g. Batch #, shift, who approved…'
                        : 'PO number, delivery note, etc.'
                  }
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-line pt-5">
                <button
                  type="button"
                  onClick={() => {
                    setStockModal(null);
                    setStockProduct(null);
                    setStockOutReason('');
                  }}
                  className="rounded-xl border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-surface-raised"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-primary-hover"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {movementsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">Movement history</h2>
                <p className="text-sm text-muted">{displayName(movementsFor.name)}</p>
              </div>
              <button
                type="button"
                onClick={() => setMovementsFor(null)}
                className="rounded-lg p-2 text-subtle transition hover:bg-surface-muted hover:text-foreground"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {movementsLoading ? (
                <p className="py-8 text-center text-sm text-muted">Loading…</p>
              ) : movements.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No movements yet.</p>
              ) : (
                <ul className="space-y-3">
                  {movements.map((m) => (
                    <li
                      key={m._id}
                      className={`rounded-xl border p-4 text-sm ${
                        m.type === 'in'
                          ? 'border-secondary-line/80 bg-secondary-soft/60'
                          : 'border-warning-line/80 bg-warning-soft/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
                            m.type === 'in'
                              ? 'bg-secondary-soft/80 text-secondary'
                              : 'bg-warning-soft/80 text-warning'
                          }`}
                        >
                          {m.type === 'in' ? 'In' : 'Out'}
                        </span>
                        <span className="font-mono text-lg font-bold tabular-nums text-foreground">{m.quantity}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted">{new Date(m.createdAt).toLocaleString()}</p>
                      {m.note && <p className="mt-2 text-foreground">{m.note}</p>}
                      {m.createdBy && (m.createdBy.name || m.createdBy.email) && (
                        <p className="mt-1 text-xs text-muted">
                          By {m.createdBy.name || m.createdBy.email}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <DeleteConfirmModal
          itemName={toDelete.name}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
};

export default ViewKitchenInventory;
