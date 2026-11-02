import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Loader from '../common/Loader';
import { showSuccessToast, showErrorToast } from '../../utils/toast';

type UnitOpt = { _id: string; unitName: string; shortName: string };
type InvProd = { _id: string; name: string; code: string; isInventory?: boolean };

const EditKitchenProduct: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState('');
  const [unitId, setUnitId] = useState('');
  const [inventoryProductId, setInventoryProductId] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('');
  const [description, setDescription] = useState('');
  const [currentStock, setCurrentStock] = useState<number | null>(null);
  const [units, setUnits] = useState<UnitOpt[]>([]);
  const [invProducts, setInvProducts] = useState<InvProd[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  useEffect(() => {
    const loadUnits = async () => {
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
    loadUnits();
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
          setInvProducts((data.data as InvProd[]).filter((p) => p.isInventory === true));
        }
      } catch {
        /* ignore */
      }
    };
    loadProducts();
  }, [api]);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${api}/kitchen/products/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (!res.ok) {
          showErrorToast(data?.message || 'Not found');
          navigate('/kitchen/inventory');
          return;
        }
        const p = data.data;
        setName(p.name || '');
        setUnitId(typeof p.unitId === 'object' && p.unitId?._id ? p.unitId._id : p.unitId || '');
        setMinStockLevel(p.minStockLevel != null ? String(p.minStockLevel) : '');
        setDescription(p.description || '');
        setCurrentStock(typeof p.currentStock === 'number' ? p.currentStock : null);
        const inv = p.inventoryProductId;
        setInventoryProductId(
          inv && typeof inv === 'object' && inv._id ? inv._id : inv && typeof inv === 'string' ? inv : ''
        );
      } catch {
        showErrorToast('Failed to load');
        navigate('/kitchen/inventory');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [api, id, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !unitId) {
      showErrorToast('Select a unit');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const body: Record<string, unknown> = {
        name: name.trim(),
        unitId,
        inventoryProductId: inventoryProductId || null,
        ...(minStockLevel.trim() !== '' ? { minStockLevel: parseFloat(minStockLevel) } : { minStockLevel: null }),
        ...(description.trim() ? { description: description.trim() } : { description: '' })
      };
      const res = await fetch(`${api}/kitchen/products/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Update failed');
        return;
      }
      showSuccessToast(data.message || 'Updated');
      navigate('/kitchen/inventory');
    } catch (err) {
      showErrorToast((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      {loading && <Loader text="Loading" />}
      <div className="bg-surface border-b">
        <div className="px-6 py-4 flex items-center">
          <button
            type="button"
            onClick={() => navigate('/kitchen/inventory')}
            className="mr-4 p-2 text-subtle hover:text-muted hover:bg-surface-muted rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Edit kitchen ingredient</h1>
            <p className="text-sm text-muted mt-1">Stock can only change via Stock in / Stock out</p>
          </div>
        </div>
      </div>
      <div className="p-6 max-w-2xl mx-auto">
        {currentStock !== null && (
          <div className="mb-4 p-4 bg-primary-soft border border-primary-line rounded-lg text-sm text-primary">
            <span className="font-medium">Current stock (read only):</span>{' '}
            <span className="font-mono tabular-nums">{currentStock}</span>
          </div>
        )}
        <div className="bg-surface rounded-lg border border-line p-6">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Product name <span className="text-danger">*</span>
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Unit <span className="text-danger">*</span>
              </label>
              <select
                required
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">Select unit</option>
                {units.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.unitName} ({u.shortName})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Link inventory product (optional)
              </label>
              <select
                value={inventoryProductId}
                onChange={(e) => setInventoryProductId(e.target.value)}
                className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">None — use kitchen min only</option>
                {invProducts.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted mt-1">
                Only <code className="text-[11px]">isInventory: true</code> products appear. Prepared meals are
                excluded. Alert uses linked product <code className="text-[11px]">stockAlert</code> (warehouse on
                kitchen list).
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Minimum stock level (optional, kitchen-only)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
                className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-line">
              <button
                type="button"
                onClick={() => navigate('/kitchen/inventory')}
                className="px-4 py-2 rounded-lg bg-surface-muted text-foreground hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary-hover">
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditKitchenProduct;
