import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../common/Loader';
import { showSuccessToast, showErrorToast } from '../../utils/toast';

type UnitOpt = { _id: string; unitName: string; shortName: string };
type InvProd = { _id: string; name: string; code: string; isInventory?: boolean };

const fieldClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-[#003366] focus:outline-none focus:ring-2 focus:ring-[#003366]/20';

const selectChevronClass =
  "cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%236b7280%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27M19 9l-7 7-7-7%27/%3E%3C/svg%3E')] bg-[length:1.25rem] bg-[right_0.65rem_center] bg-no-repeat pr-10";

const Label: React.FC<{ children: React.ReactNode; required?: boolean }> = ({ children, required }) => (
  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
    {children}
    {required && <span className="ml-0.5 text-red-500">*</span>}
  </label>
);

const CreateKitchenProduct: React.FC = () => {
  const [name, setName] = useState('');
  const [unitId, setUnitId] = useState('');
  const [inventoryProductId, setInventoryProductId] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('');
  const [initialStock, setInitialStock] = useState('');
  const [description, setDescription] = useState('');
  const [units, setUnits] = useState<UnitOpt[]>([]);
  const [invProducts, setInvProducts] = useState<InvProd[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${api}/units`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (res.ok && data.data) {
          setUnits(
            data.data.map((u: any) => ({
              _id: u._id,
              unitName: u.unitName,
              shortName: u.shortName
            }))
          );
        }
      } catch {
        /* ignore */
      }
    };
    load();
  }, [api]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${api}/products?status=Active`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (res.ok && data.data) {
          const list = (data.data as InvProd[]).filter((p) => p.isInventory === true);
          setInvProducts(list);
        }
      } catch {
        /* ignore */
      }
    };
    loadProducts();
  }, [api]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId) {
      showErrorToast('Select a unit');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const body: Record<string, unknown> = {
        name: name.trim(),
        unitId,
        ...(inventoryProductId ? { inventoryProductId } : {}),
        ...(minStockLevel.trim() !== '' && { minStockLevel: parseFloat(minStockLevel) }),
        ...(initialStock.trim() !== '' && { initialStock: parseFloat(initialStock) }),
        ...(description.trim() && { description: description.trim() })
      };
      const res = await fetch(`${api}/kitchen/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Failed to create');
        return;
      }
      showSuccessToast(data.message || 'Ingredient created');
      navigate('/kitchen/inventory');
    } catch (err) {
      showErrorToast((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#eef1f4]">
      {loading && <Loader text="Saving" />}
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* Header */}
          <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-6 sm:flex-row sm:items-start sm:px-8">
            <button
              type="button"
              onClick={() => navigate('/kitchen/inventory')}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800"
              aria-label="Back to inventory"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0 flex-1 sm:pl-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">Kitchen</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                Add ingredient
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
                Define how this item is counted and alerted. Set optional opening stock, or start at zero and use{' '}
                <span className="font-medium text-gray-800">Stock In</span> from the inventory list.
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="px-5 py-6 sm:px-8 sm:py-8">
            <div className="space-y-8">
              <section>
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-900">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#003366]/10 text-[#003366]">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </span>
                  Basics
                </h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label required>Product name</Label>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. Raw rice"
                    />
                  </div>
                  <div className="sm:col-span-2 sm:max-w-md">
                    <Label required>Unit</Label>
                    <select
                      required
                      value={unitId}
                      onChange={(e) => setUnitId(e.target.value)}
                      className={`${fieldClass} ${selectChevronClass}`}
                    >
                      <option value="">Select unit</option>
                      {units.map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.unitName} ({u.shortName})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-900">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </span>
                  Stock &amp; alerts
                </h2>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label>Opening stock</Label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={initialStock}
                      onChange={(e) => setInitialStock(e.target.value)}
                      className={fieldClass}
                      placeholder="0"
                    />
                    <p className="mt-1.5 text-xs text-gray-500">
                      Logged as <span className="font-medium text-gray-600">Opening balance</span> in movement history.
                    </p>
                  </div>
                  <div>
                    <Label>Minimum level (kitchen-only)</Label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={minStockLevel}
                      onChange={(e) => setMinStockLevel(e.target.value)}
                      className={fieldClass}
                      placeholder="Optional"
                    />
                    <p className="mt-1.5 text-xs text-gray-500">Used when no inventory product is linked.</p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-900">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                  </span>
                  Link to inventory
                </h2>
                <div>
                  <Label>Inventory product</Label>
                  <select
                    value={inventoryProductId}
                    onChange={(e) => setInventoryProductId(e.target.value)}
                    className={`${fieldClass} ${selectChevronClass}`}
                  >
                    <option value="">None — kitchen min only</option>
                    {invProducts.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                  <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50/80 px-4 py-3 text-xs leading-relaxed text-gray-600">
                    Only <span className="font-semibold text-gray-800">inventory products</span> (
                    <code className="rounded bg-white px-1 py-0.5 text-[10px] text-gray-700">isInventory: true</code>)
                    appear here. Alerts use the linked product&apos;s{' '}
                    <code className="rounded bg-white px-1 py-0.5 text-[10px] text-gray-700">stockAlert</code> for the
                    warehouse you choose on the kitchen list.
                  </div>
                </div>
              </section>

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-900">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h7"
                      />
                    </svg>
                  </span>
                  Notes
                </h2>
                <div>
                  <Label>Description</Label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className={`${fieldClass} resize-none`}
                    placeholder="Storage location, supplier notes, allergens…"
                  />
                </div>
              </section>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => navigate('/kitchen/inventory')}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#003366] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#004080]"
              >
                Create ingredient
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateKitchenProduct;
