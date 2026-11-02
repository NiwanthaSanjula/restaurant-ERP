import React, { useEffect, useMemo, useState } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import {
  type PosDenominations,
  emptyDenominations,
  totalFromDenominations,
  fetchRegisterReport,
  closePosSession,
  type RegisterReportData,
} from '../../services/posSessionService';

type Props = {
  sessionId: string;
  onCancel: () => void;
  onClosed: () => void;
};

const RegisterReportModal: React.FC<Props> = ({ sessionId, onCancel, onClosed }) => {
  const { selectedCurrency } = useCurrency();
  const [report, setReport] = useState<RegisterReportData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [closing, setClosing] = useState<PosDenominations>(emptyDenominations());
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await fetchRegisterReport(sessionId);
        if (!cancelled) {
          setReport(json.data);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message || 'Failed to load report');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const countedCash = useMemo(() => totalFromDenominations(closing), [closing]);

  const variance = useMemo(() => {
    if (!report) return 0;
    return report.openingCash + report.cashSalesForVariance - countedCash;
  }, [report, countedCash]);

  const bump = (key: keyof PosDenominations, delta: number) => {
    setClosing((prev) => {
      const next = { ...prev };
      next[key] = Math.max(0, (next[key] || 0) + delta);
      return next;
    });
  };

  const setCount = (key: keyof PosDenominations, raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    setClosing((prev) => ({ ...prev, [key]: n }));
  };

  const handleClosePos = async () => {
    setActionError(null);
    if (countedCash <= 0) {
      setActionError('Enter cash balancing amounts before closing the POS session.');
      return;
    }
    setSubmitting(true);
    try {
      await closePosSession(sessionId, closing);
      onClosed();
    } catch (e) {
      setActionError((e as Error).message || 'Failed to close');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n: number) => `${selectedCurrency?.symbol} ${Number(n).toFixed(2)}`;

  const DenomCell = ({ k }: { k: string }) => (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        type="button"
        onClick={() => bump(k as keyof PosDenominations, -1)}
        className="w-7 h-7 rounded border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        className="w-12 text-center border border-slate-200 rounded py-1 text-xs font-semibold"
        value={closing[k as keyof PosDenominations]}
        onChange={(e) => setCount(k as keyof PosDenominations, e.target.value)}
      />
      <button
        type="button"
        onClick={() => bump(k as keyof PosDenominations, 1)}
        className="w-7 h-7 rounded border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50"
      >
        +
      </button>
      <span className="text-xs text-slate-500">× {k}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-md" aria-hidden />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1e293b]">Register Report</h2>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2" aria-label="Close">
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loadError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</div>
          )}
          {actionError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{actionError}</div>
          )}

          {report && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
                  <div className="text-[10px] font-bold text-rose-800 uppercase">Open time</div>
                  <div className="font-semibold text-slate-800">{new Date(report.openTime).toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Cashier</div>
                  <div className="font-semibold text-slate-800">{report.cashierName}</div>
                </div>
                <div className="rounded-lg border border-slate-100 px-3 py-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Cash hand in</div>
                  <div className="font-semibold text-[#2563eb]">{fmt(report.openingCash)}</div>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                  <div className="text-[10px] font-bold text-emerald-800 uppercase">Your sale (without cash hand)</div>
                  <div className="font-semibold text-slate-800">{fmt(report.userSalesWithoutOpeningCash)}</div>
                </div>
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 sm:col-span-2">
                  <div className="text-[10px] font-bold text-emerald-800 uppercase">Today total sale (without cash hand)</div>
                  <div className="font-semibold text-slate-800">{fmt(report.todayTotalSalesWithoutOpeningCash)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['Total discount', report.totalDiscount],
                  ['Cash', report.cashPayments],
                  ['Card', report.cardPayments],
                  ['Bank transfer', report.bankTransferPayments],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase">{label}</div>
                    <div className="text-sm font-bold text-slate-800">{fmt(val as number)}</div>
                  </div>
                ))}
              </div>

              <div className="border-2 border-dashed border-slate-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-slate-700 mb-3">Handle cash balancing</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid grid-cols-1 gap-2">
                    {['20', '100', '1000', '1', '5'].map((k) => (
                      <DenomCell key={k} k={k} />
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {['50', '500', '5000', '2', '10'].map((k) => (
                      <DenomCell key={k} k={k} />
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
                    <div className="text-xs font-semibold text-slate-600">Total cash</div>
                    <div className="text-lg font-bold text-slate-900">{fmt(countedCash)}</div>
                    {countedCash === 0 && <p className="text-xs text-red-600 mt-1">No cash detected</p>}
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-600">Cash variance</div>
                      <div className="text-lg font-bold text-slate-900">{fmt(variance)}</div>
                      {variance !== 0 && <p className="text-xs text-red-600 mt-1">Variance detected</p>}
                      {variance === 0 && countedCash > 0 && (
                        <p className="text-xs text-emerald-600 mt-1">Register balanced</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || countedCash <= 0}
                  onClick={handleClosePos}
                  className="px-6 py-2.5 rounded-xl bg-[#1e3a5f] text-white font-bold text-sm hover:bg-[#152a45] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Closing…' : 'Close the POS'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterReportModal;
