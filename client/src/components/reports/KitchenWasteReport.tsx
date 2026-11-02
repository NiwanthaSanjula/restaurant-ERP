import React, { useEffect, useMemo, useState } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast } from '../../utils/toast';
import Loader from '../common/Loader';
import { formatDate } from '../../utils/date.ts';

type WasteItem = {
  _id: string;
  kitchenProductId: { name: string; averageCost: number; unitId?: { shortName: string } };
  quantity: number;
  reason?: string;
  note?: string;
  createdAt: string;
  createdBy?: { name: string };
};

const KitchenWasteReport: React.FC = () => {
  const { currencyCode } = useCurrency();
  const [items, setItems] = useState<WasteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedReason, setSelectedReason] = useState('All Reasons');

  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const getReasonText = (item: WasteItem) => {
    const raw = item.reason || item.note || 'Manual Out';
    return raw.trim();
  };

  const getReasonCategoryFromText = (text: string) => {
    const normalized = text.trim().toLowerCase();
    if (normalized.startsWith('spoiled')) return 'Spoiled';
    if (normalized.startsWith('damaged')) return 'Damaged';
    if (normalized.startsWith('expired')) return 'Expired';
    if (normalized.startsWith('waste / prep trim')) return 'Waste / prep trim';
    if (normalized.startsWith('tasting / staff meal')) return 'Tasting / staff meal';
    if (normalized.startsWith('theft / unaccounted loss')) return 'Theft / unaccounted loss';
    if (normalized.startsWith('transfer or other use')) return 'Transfer or other use';
    return 'Other';
  };

  const getReasonCategory = (item: WasteItem) => getReasonCategoryFromText(getReasonText(item));

  const PRESET_REASON_OPTIONS = [
    'All Reasons',
    'Spoiled',
    'Damaged',
    'Expired',
    'Waste / prep trim',
    'Tasting / staff meal',
    'Theft / unaccounted loss',
    'Transfer or other use',
    'Other'
  ] as const;

  const customReasonOptions = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map(getReasonText)
            .filter(
              (reason) =>
                getReasonCategoryFromText(reason) === 'Other' && reason !== 'Manual Out'
            )
        )
      ).sort((a, b) => a.localeCompare(b)),
    [items]
  );

  const reasonOptions = useMemo(
    () => [...PRESET_REASON_OPTIONS, ...customReasonOptions],
    [customReasonOptions]
  );

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (selectedReason === 'All Reasons') return true;
        if (PRESET_REASON_OPTIONS.includes(selectedReason as typeof PRESET_REASON_OPTIONS[number])) {
          return getReasonCategory(item) === selectedReason;
        }
        return getReasonText(item) === selectedReason;
      }),
    [items, selectedReason]
  );

  const summary = useMemo(
    () =>
      filteredItems.reduce(
        (acc, curr) => {
          const cost = curr.kitchenProductId?.averageCost || 0;
          acc.totalWasteValue += cost * curr.quantity;
          acc.count += 1;
          return acc;
        },
        { totalWasteValue: 0, count: 0 }
      ),
    [filteredItems]
  );

  const fetchReport = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      
      const res = await fetch(`${api}/kitchen/reports/waste?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setItems(data.data.items);
      } else {
        showErrorToast(data.message || 'Failed to load report');
      }
    } catch (e) {
      showErrorToast('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-foreground">Kitchen Waste & Damage</h2>
          <p className="text-sm text-muted">Analyze inventory losses and spoilage.</p>
        </div>
        
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase text-subtle mb-1">From</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border-2 border-line rounded-xl text-sm font-bold text-foreground focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-subtle mb-1">To</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border-2 border-line rounded-xl text-sm font-bold text-foreground focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-subtle mb-1">Reason</label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="px-3 py-2 border-2 border-line rounded-xl text-sm font-bold text-foreground focus:border-primary outline-none"
            >
              {reasonOptions.map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>
          </div>
          <button 
            onClick={fetchReport}
            className="px-6 py-2 bg-primary text-on-primary rounded-xl font-black text-sm hover:bg-primary-hover transition-colors"
          >
            Filter
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface p-6 rounded-2xl border border-line flex items-center justify-between">
          <div>
            <p className="text-xs font-black text-subtle uppercase tracking-wider mb-1">Total Loss Value</p>
            <h3 className="text-3xl font-black text-danger">{currencyCode} {summary.totalWasteValue.toFixed(2)}</h3>
          </div>
          <div className="w-12 h-12 bg-danger-soft rounded-2xl flex items-center justify-center text-danger">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
        </div>
        <div className="bg-surface p-6 rounded-2xl border border-line flex items-center justify-between">
          <div>
            <p className="text-xs font-black text-subtle uppercase tracking-wider mb-1">Incidents Count</p>
            <h3 className="text-3xl font-black text-foreground">{summary.count}</h3>
          </div>
          <div className="w-12 h-12 bg-surface-raised rounded-2xl flex items-center justify-center text-foreground">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-raised/50 border-b border-line text-[10px] font-black uppercase tracking-[0.2em] text-subtle">
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Ingredient</th>
                <th className="px-6 py-4">Qty</th>
                <th className="px-6 py-4">Reason</th>
                <th className="px-6 py-4">Est. Loss</th>
                <th className="px-6 py-4">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center"><Loader text="Loading waste data..." /></td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-subtle italic">No waste records found for the selected period.</td></tr>
              ) : (
                filteredItems.map((item) => {
                  const unit = item.kitchenProductId?.unitId?.shortName || '';
                  const cost = item.kitchenProductId?.averageCost || 0;
                  const loss = cost * item.quantity;
                  return (
                    <tr key={item._id} className="hover:bg-surface-raised/30 transition-colors">
                      <td className="px-6 py-4 text-xs font-bold text-muted">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-foreground">
                        {item.kitchenProductId?.name}
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-primary">
                        {item.quantity} {unit}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-danger-soft text-danger text-[10px] font-black uppercase rounded-lg">
                          {getReasonText(item)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-danger">
                        {currencyCode} {loss.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-muted">
                        {item.createdBy?.name || 'System'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default KitchenWasteReport;
