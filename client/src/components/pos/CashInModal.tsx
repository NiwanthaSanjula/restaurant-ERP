import React, { useMemo, useState } from 'react';
import ThemeToggle from '../common/ThemeToggle';

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
      <label className="text-sm font-medium text-foreground leading-none w-14">{value} x</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          value={denominations[value]}
          onChange={(e) => setQty(value, parseNumericInput(e.target.value))}
          className="w-20 h-8 border border-line-strong rounded-md text-center text-sm text-foreground bg-surface focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
        />
        <button
          type="button"
          onClick={() => updateQty(value, -1)}
          className="w-8 h-8 rounded-md bg-surface-muted text-muted border border-line hover:bg-surface-muted active:scale-95 transition"
          aria-label={`Decrease ${value}`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => updateQty(value, 1)}
          className="w-8 h-8 rounded-md bg-surface-muted text-muted border border-line hover:bg-surface-muted active:scale-95 transition"
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
    <div className="fixed inset-0 bg-overlay backdrop-blur-[1px] flex items-center justify-center z-50 p-4">
      <div className="bg-surface w-full max-w-[620px] rounded-2xl border border-line-strong shadow-elevated px-6 py-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold text-foreground">POS Register</h2>
          <ThemeToggle />
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-full text-subtle hover:bg-surface-muted hover:text-primary transition"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        {error ? (
          <div className="w-full rounded-lg border border-danger-line bg-danger-soft text-danger text-sm text-center py-2 px-3 mb-4">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Cash In Hand</label>
          <input
            type="text"
            value={total}
            readOnly
            aria-readonly="true"
            className="w-full border border-line-strong rounded-lg px-3 py-2 text-base text-foreground mb-4 bg-surface-raised"
          />

          <div className="grid grid-cols-2 gap-8 mb-5">
            <div>
              <div className="text-base font-semibold text-foreground mb-2">Notes</div>
              {noteValues.map(renderRow)}
            </div>
            <div>
              <div className="text-base font-semibold text-foreground mb-2">Coins</div>
              {coinValues.map(renderRow)}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            {showUseExistingSession && onUseExistingSession ? (
              <button
                type="button"
                onClick={onUseExistingSession}
                className="px-4 py-2 rounded-lg text-on-primary text-sm font-medium hover:opacity-95 transition bg-primary"
              >
                Use Existing
              </button>
            ) : null}
            <button type="submit" className="px-5 py-2 rounded-lg text-on-primary text-sm font-semibold hover:opacity-95 transition bg-primary">
              Submit
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 rounded-lg bg-surface-muted text-primary text-sm font-medium border border-line-strong hover:bg-surface-muted transition"
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


