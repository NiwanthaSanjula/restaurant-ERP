type Props = {
  value: boolean | null;
  onChange: (sellable: boolean) => void;
  onSave?: () => void;
  saving?: boolean;
  disabled?: boolean;
};

export default function ProductSellingType({ value, onChange, onSave, saving = false, disabled = false }: Props) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4 space-y-2">
      <label htmlFor="product-selling-type" className="block text-sm font-semibold text-foreground">Selling type</label>
      <select id="product-selling-type" required value={value === null ? '' : String(value)} onChange={event => onChange(event.target.value === 'true')}
        disabled={disabled || saving} className="w-full border border-line-strong rounded-lg px-3 py-2 text-sm">
        <option value="" disabled>Choose selling type (required)</option>
        <option value="true">Sellable</option>
        <option value="false">Inventory only</option>
      </select>
      <p className="text-sm text-muted">Active, Sellable items with a price in the selected warehouse appear in POS. Inventory-only items remain available for purchases, stock operations and ingredient links. This setting is separate from stock tracking.</p>
      {onSave && (
        <button type="button" onClick={onSave} disabled={disabled || saving || value === null} className="ss-button disabled:opacity-50">
          {saving ? 'Saving selling type...' : 'Save selling type only'}
        </button>
      )}
      {onSave && <p className="text-xs text-muted">Saving only the selling type preserves stock balances and all other product details.</p>}
    </div>
  );
}
