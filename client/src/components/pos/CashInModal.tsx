import React, { useMemo, useState } from 'react';

type DenominationKey = '20' | '50' | '100' | '500' | '1000' | '5000' | '1' | '2' | '5' | '10';

type Denominations = Record<DenominationKey, number>;

interface Props {
  onSubmit: (amount: number, denominations: Denominations) => void;
  onCancel?: () => void;
  onUseExistingSession?: () => void;
  showUseExistingSession?: boolean;
}

const initialDenominations: Denominations = {
  '20': 0,
  '50': 0,
  '100': 0,
  '500': 0,
  '1000': 0,
  '5000': 0,
  '1': 0,
  '2': 0,
  '5': 0,
  '10': 0
};

const noteValues: DenominationKey[] = ['20', '50', '100', '500', '1000', '5000'];
const coinValues: DenominationKey[] = ['1', '2', '5', '10'];

const CashInModal: React.FC<Props> = ({ onSubmit, onCancel, onUseExistingSession, showUseExistingSession = false }) => {
  const [denominations, setDenominations] = useState<Denominations>(initialDenominations);
  const [error, setError] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);

  const total = useMemo(
    () => Object.entries(denominations).reduce((sum, [key, qty]) => sum + Number(key) * qty, 0),
    [denominations]
  );

  const setQty = (key: DenominationKey, value: number) => {
    const safeValue = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    setDenominations((prev) => ({ ...prev, [key]: safeValue }));
  };

  /** Parses a raw input string to a safe non-negative integer; returns 0 for empty/invalid. */
  const parseNumericInput = (raw: string): number => {
    if (raw === '' || raw === null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  };

  const updateQty = (key: DenominationKey, delta: number) => {
    setQty(key, (denominations[key] || 0) + delta);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (total <= 500) {
      setError('Cash in hand should be greater than 500.');
      return;
    }
    setError('');
    onSubmit(total, denominations);
  };

  // Clear the error once the total becomes valid after a submit attempt
  React.useEffect(() => {
    if (submitted && total > 500 && error) {
      setError('');
    } else if (submitted && total <= 500 && !error) {
      setError('Cash in hand should be greater than 500.');
    }
  }, [total, error, submitted]);

  const renderRow = (value: DenominationKey) => (
    <div key={value} className="flex items-center justify-between mb-2.5">
      <label className="text-sm font-medium text-[#374151] leading-none w-14">{value} x</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          value={denominations[value]}
          onChange={(e) => setQty(value, parseNumericInput(e.target.value))}
          className="w-20 h-8 border border-[#d1d5db] rounded-md text-center text-sm text-[#111827] bg-white focus:ring-2 focus:ring-[#818cf8]/40 focus:border-[#818cf8] outline-none"
        />
        <button
          type="button"
          onClick={() => updateQty(value, -1)}
          className="w-8 h-8 rounded-md bg-[#f3f4f6] text-[#6b7280] border border-[#e5e7eb] hover:bg-[#e5e7eb] active:scale-95 transition"
          aria-label={`Decrease ${value}`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => updateQty(value, 1)}
          className="w-8 h-8 rounded-md bg-[#f3f4f6] text-[#6b7280] border border-[#e5e7eb] hover:bg-[#e5e7eb] active:scale-95 transition"
          aria-label={`Increase ${value}`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-[1px] flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-[620px] rounded-2xl border border-[#dbe3ef] shadow-2xl px-6 py-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold text-[#111827]">POS Register</h2>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-full text-[#9ca3af] hover:bg-[#eef2f7] hover:text-[#1f3b63] transition"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        {error ? (
          <div className="w-full rounded-lg border border-[#f8d5d5] bg-[#fff5f5] text-[#b3261e] text-sm text-center py-2 px-3 mb-4">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-[#374151] mb-1.5 block">Cash In Hand</label>
          <input
            type="text"
            value={total}
            readOnly
            aria-readonly="true"
            className="w-full border border-[#d5dfeb] rounded-lg px-3 py-2 text-base text-[#111827] mb-4 bg-[#f7f9fc]"
          />

          <div className="grid grid-cols-2 gap-8 mb-5">
            <div>
              <div className="text-base font-semibold text-[#111827] mb-2">Notes</div>
              {noteValues.map(renderRow)}
            </div>
            <div>
              <div className="text-base font-semibold text-[#111827] mb-2">Coins</div>
              {coinValues.map(renderRow)}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            {showUseExistingSession && onUseExistingSession ? (
              <button
                type="button"
                onClick={onUseExistingSession}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#1f3b63] to-[#2b4d7a] text-white text-sm font-medium hover:opacity-95 transition"
              >
                Use Existing
              </button>
            ) : null}
            <button type="submit" className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#1f3b63] to-[#2b4d7a] text-white text-sm font-semibold hover:opacity-95 transition">
              Submit
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 rounded-lg bg-[#eef2f7] text-[#1f3b63] text-sm font-medium border border-[#d5dfeb] hover:bg-[#e1e9f5] transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CashInModal;


