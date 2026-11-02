import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useCurrency } from '../../contexts/CurrencyContext';
import { formatDate, toBusinessDateInputValue } from '../../utils/date.ts';
import {
  bulkDeleteZBills,
  deleteZBillBySessionId,
  getZBillBySessionId,
  getZBills,
  type ZBillDetails,
  type ZBillRow,
} from '../../services/posSessionService';

const ZBillReport: React.FC = () => {
  const { currencySymbol } = useCurrency();
  const today = useMemo(() => toBusinessDateInputValue(), []);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [rows, setRows] = useState<ZBillRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ZBillDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const money = (value: number) => `${currencySymbol} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const timeOnly = (value?: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  const dateOnly = (value?: string | null) => {
    if (!value) return '-';
    return formatDate(value);
  };
  const denominationOrder = ['5000', '1000', '500', '100', '50', '20', '10', '5', '2', '1'] as const;
  const printZBill = () => {
    if (!detail) return;
    window.print();
  };

  const loadRows = async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await getZBills({ fromDate, toDate });
      setRows(Array.isArray(json.data) ? json.data : []);
      setSelectedIds([]);
    } catch (e) {
      setError((e as Error).message || 'Failed to load z-bills');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const openView = async (sessionId: string) => {
    setActiveId(sessionId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const json = await getZBillBySessionId(sessionId);
      setDetail(json.data);
    } catch (e) {
      setDetailError((e as Error).message || 'Failed to load z-bill details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (sessionId: string) => {
    const ok = window.confirm('Are you sure you want to delete this Z-bill?');
    if (!ok) return;
    setDeletingId(sessionId);
    try {
      await deleteZBillBySessionId(sessionId);
      setRows((prev) => prev.filter((r) => r.sessionId !== sessionId));
      setSelectedIds((prev) => prev.filter((id) => id !== sessionId));
      toast.success('Z-bill deleted successfully');
    } catch (e) {
      toast.error((e as Error).message || 'Failed to delete z-bill');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelectOne = (sessionId: string) => {
    setSelectedIds((prev) => (prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId]));
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? rows.map((r) => r.sessionId) : []);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const ok = window.confirm(`Delete ${selectedIds.length} selected Z-bills?`);
    if (!ok) return;
    setBulkDeleting(true);
    try {
      await bulkDeleteZBills(selectedIds);
      setRows((prev) => prev.filter((r) => !selectedIds.includes(r.sessionId)));
      setSelectedIds([]);
      toast.success('Selected z-bills deleted');
    } catch (e) {
      toast.error((e as Error).message || 'Failed to delete selected z-bills');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 bg-slate-50 min-h-screen">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .zbill-print-area, .zbill-print-area * { visibility: visible !important; }
          .zbill-print-area {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: #fff !important;
            overflow: visible !important;
            padding: 12px !important;
          }
          .zbill-print-hide { display: none !important; }
        }
      `}</style>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[#1e3a5f]">Z-bill Report</h1>
          <p className="text-sm text-slate-500">POS session based sales summary</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 md:p-5 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">From date</label>
            <input value={fromDate} onChange={(e) => setFromDate(e.target.value)} type="date" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1e3a5f]/25 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">To date</label>
            <input value={toDate} onChange={(e) => setToDate(e.target.value)} type="date" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#1e3a5f]/25 focus:outline-none" />
          </div>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {bulkDeleting ? 'Deleting...' : 'Delete Multiples'}
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100/80 text-slate-600 uppercase text-[11px] tracking-wider">
              <tr>
                <th className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    aria-label="Select all z-bills"
                    checked={rows.length > 0 && selectedIds.length === rows.length}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    className="w-4 h-4 accent-[#1e3a5f]"
                  />
                </th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Open Time</th>
                <th className="px-4 py-3 text-left">Close Time</th>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-right">Cash hand in</th>
                <th className="px-4 py-3 text-right">Card payment</th>
                <th className="px-4 py-3 text-right">Cash payment</th>
                <th className="px-4 py-3 text-right">Bank transfer</th>
                <th className="px-4 py-3 text-right">Cash variance</th>
                <th className="px-4 py-3 text-right">Discount</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={14}>
                    Loading Z-bills...
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td className="px-4 py-6 text-center text-red-600" colSpan={14}>
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && rows.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={14}>
                    No sessions found for selected dates.
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                rows.map((item) => (
                  <tr key={item.sessionId} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.sessionId)}
                        onChange={() => toggleSelectOne(item.sessionId)}
                        aria-label={`Select z-bill ${item.sessionId}`}
                        className="w-4 h-4 accent-[#1e3a5f]"
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{dateOnly(item.openTime)}</td>
                    <td className="px-4 py-3 text-slate-700">{timeOnly(item.openTime)}</td>
                    <td className="px-4 py-3 text-slate-700">{timeOnly(item.closeTime)}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{item.username}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{money(item.cashHandIn)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{money(item.cardPayment)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{money(item.cashPayment)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{money(item.bankTransfer)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-700">{money(item.cashVariance)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{money(item.discount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{money(item.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openView(item.sessionId)}
                          className="w-8 h-8 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 inline-flex items-center justify-center"
                          aria-label="View z-bill"
                          title="View"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === item.sessionId}
                          onClick={() => handleDelete(item.sessionId)}
                          className="w-8 h-8 rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-60 inline-flex items-center justify-center"
                          aria-label="Delete z-bill"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {activeId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={() => setActiveId(null)} aria-hidden />
          <div className="zbill-print-area relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1e3a5f]">Z-bill View</h2>
              <button type="button" onClick={() => setActiveId(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1">
                x
              </button>
            </div>
            <div className="p-5 space-y-4">
              {detailLoading && <div className="text-sm text-slate-500">Loading details...</div>}
              {detailError && <div className="text-sm text-red-600">{detailError}</div>}
              {!detailLoading && !detailError && detail && (
                <>
                  {(() => {
                    const denoms = detail.closingDenominations || {};
                    const denominationRows = denominationOrder
                      .map((note) => {
                        const qty = Number(denoms[note] || 0);
                        if (qty <= 0) return null;
                        return {
                          note,
                          qty,
                          amount: Number(note) * qty,
                        };
                      })
                      .filter(Boolean) as Array<{ note: string; qty: number; amount: number }>;
                    return (
                      <>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="font-semibold text-slate-800 mb-3">Cashier: {detail.cashierName}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex justify-between">
                        <span className="text-slate-500">Open Date</span>
                        <span className="font-semibold text-slate-800">{dateOnly(detail.openTime)}</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex justify-between">
                        <span className="text-slate-500">Open Time</span>
                        <span className="font-semibold text-slate-800">{timeOnly(detail.openTime)}</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex justify-between">
                        <span className="text-slate-500">Close Date</span>
                        <span className="font-semibold text-slate-800">{dateOnly(detail.closeTime)}</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex justify-between">
                        <span className="text-slate-500">Close Time</span>
                        <span className="font-semibold text-slate-800">{timeOnly(detail.closeTime)}</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex justify-between">
                        <span className="text-slate-500">Cash Hand In</span>
                        <span className="font-semibold text-slate-800">{money(detail.openingCash)}</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex justify-between">
                        <span className="text-slate-500">Cash Payment</span>
                        <span className="font-semibold text-slate-800">{money(detail.cashPayments)}</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex justify-between">
                        <span className="text-slate-500">Card Payment</span>
                        <span className="font-semibold text-slate-800">{money(detail.cardPayments)}</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex justify-between">
                        <span className="text-slate-500">Bank Transfer</span>
                        <span className="font-semibold text-slate-800">{money(detail.bankTransferPayments)}</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex justify-between">
                        <span className="text-slate-500">Discount</span>
                        <span className="font-semibold text-slate-800">{money(detail.totalDiscount)}</span>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex justify-between">
                        <span className="text-slate-500">Cash Variance</span>
                        <span className={`font-semibold ${detail.cashVariance > 0 ? 'text-rose-700' : 'text-slate-800'}`}>{money(detail.cashVariance)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700">Denominations</div>
                    <table className="w-full text-sm">
                      <thead className="bg-white">
                        <tr className="border-b border-slate-100">
                          <th className="text-left px-4 py-2 text-slate-500">Note / Coin</th>
                          <th className="text-right px-4 py-2 text-slate-500">Quantity</th>
                          <th className="text-right px-4 py-2 text-slate-500">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {denominationRows.length === 0 ? (
                          <tr>
                            <td className="px-4 py-2 text-slate-500" colSpan={3}>No denomination data available.</td>
                          </tr>
                        ) : (
                          denominationRows.map((row) => (
                            <tr key={row.note} className="border-b border-slate-50">
                              <td className="px-4 py-2">{row.note}</td>
                              <td className="px-4 py-2 text-right">{row.qty}</td>
                              <td className="px-4 py-2 text-right font-medium">{money(row.amount)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-xl border border-[#1f3b63]/20 bg-[#e8f4fd] px-4 py-3 text-center">
                    <div className="text-xs uppercase font-bold text-[#1f3b63]">Total when close the POS by admin</div>
                    <div className="text-2xl font-bold text-[#1f3b63] mt-1">{money(detail.closingCash)}</div>
                  </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
            <div className="zbill-print-hide px-5 pb-5 pt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={printZBill}
                disabled={!detail || detailLoading || !!detailError}
                className="px-4 py-2 rounded-lg bg-[#1f3b63] text-white font-semibold hover:bg-[#243b53] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Print Z Bill
              </button>
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZBillReport;
