import {
    AlignLeft,
    ArrowLeft,
    ChevronDown,
    CreditCard,
    Eye,
    FileText,
    List,
    Plus,
    RotateCcw,
    Save,
    Settings2,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { usePermissions } from '../../contexts/PermissionContext';
import { readReceiptResult, receiptEditorPatch, receiptToEditor, type ReceiptConfig } from './receiptSettingsContract';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomMessage {
  enabled: boolean;
  text: string;
}

interface ProductColumns {
  product: boolean;
  productCode: boolean;
  size: boolean;
  quantity: boolean;
  discount: boolean;
  amount: boolean;
}

interface ReceiptSettingsData {
  general: {
    paperSize: '80mm' | 'A4' | 'A5' | 'Letter';
    fontSize: '12px' | '13px' | '14px';
    showSectionHeaders: boolean;
    compactMode: boolean;
  };
  header: {
    enabled: boolean;
    logoUrl: string;
    showLogo: boolean;
    showCompanyName: boolean;
    showAddress: boolean;
    showPhone: boolean;
    showEmail: boolean;
    showSalesman: boolean;
    showInvoiceNumber: boolean;
    showDateTime: boolean;
    showCustomer: boolean;
  };
  productsTable: {
    enabled: boolean;
    columns: ProductColumns;
  };
  summary: {
    showDiscountShipping: boolean;
    enabled: boolean;
    showDiscount: boolean;
    showSpecialDiscount: boolean;
    showTax: boolean;
    showShipping: boolean;
    showSubtotal: boolean;
    showPaidAmount: boolean;
    showBalance: boolean;
    showPaymentMethods: boolean;
  };
  footer: {
    showNote: boolean;
    note: string;
    enabled: boolean;
    showBarcode: boolean;
    showSystemCredit: boolean;
    customMessages: CustomMessage[];
  };
}

// ─── Default Settings ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: ReceiptSettingsData = {
  general: {
    paperSize: '80mm',
    fontSize: '12px',
    showSectionHeaders: false,
    compactMode: false,
  },
  header: {
    enabled: true,
    logoUrl: '',
    showLogo: true,
    showCompanyName: true,
    showAddress: true,
    showPhone: true,
    showEmail: false,
    showSalesman: true,
    showInvoiceNumber: true,
    showDateTime: true,
    showCustomer: true,
  },
  productsTable: {
    enabled: true,
    columns: {
      product: true,
      productCode: true,
      size: false,
      quantity: true,
      discount: true,
      amount: true,
    },
  },
  summary: {
    showDiscountShipping: true,
    enabled: true,
    showDiscount: true,
    showSpecialDiscount: true,
    showTax: true,
    showShipping: true,
    showSubtotal: true,
    showPaidAmount: true,
    showBalance: true,
    showPaymentMethods: true,
  },
  footer: {
    showNote: false,
    note: '',
    enabled: true,
    showBarcode: true,
    showSystemCredit: true,
    customMessages: [],
  },
};

// ─── Reusable Toggle Component ────────────────────────────────────────────────

const Toggle: React.FC<{
  value: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  label?: string;
}> = ({ value, onChange, disabled = false, label }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => !disabled && onChange(!value)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
      disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
    } ${value && !disabled ? 'bg-primary' : value && disabled ? 'bg-primary' : 'bg-surface-muted'}`}
    title={label}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
        value ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

// ─── Toggle Row ───────────────────────────────────────────────────────────────

const ToggleRow: React.FC<{
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}> = ({ label, sublabel, value, onChange, disabled }) => (
  <div className="flex items-center justify-between py-3 px-1 border-b border-line last:border-0">
    <div>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {sublabel && <p className="text-xs text-subtle mt-0.5">{sublabel}</p>}
    </div>
    <Toggle value={value} onChange={onChange} disabled={disabled} />
  </div>
);

// ─── Section Card ─────────────────────────────────────────────────────────────

const SectionCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  enabled?: boolean;
  onToggleEnabled?: (val: boolean) => void;
  children: React.ReactNode;
  unavailable?: boolean;
}> = ({ title, icon, enabled, onToggleEnabled, children, unavailable = false }) => (
  <div className="bg-surface rounded-2xl border border-line overflow-hidden">
    <div className="flex items-center justify-between px-5 py-4 border-b border-line">
      <div className="flex items-center gap-3">
        <span className="text-primary">{icon}</span>
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      </div>
      {onToggleEnabled !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Section visibility unavailable</span>
          <Toggle value={enabled ?? true} onChange={onToggleEnabled} disabled />
        </div>
      )}
    </div>
    <fieldset disabled={unavailable} className={`px-5 py-4 ${unavailable || enabled === false ? 'opacity-50' : ''}`}>
      {children}
    </fieldset>
  </div>
);

// ─── Tab Definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'general', label: 'General', icon: <Settings2 size={15} /> },
  { id: 'header', label: 'Header', icon: <FileText size={15} /> },
  { id: 'products', label: 'Products Table', icon: <List size={15} /> },
  { id: 'summary', label: 'Summary', icon: <CreditCard size={15} /> },
  { id: 'footer', label: 'Footer', icon: <AlignLeft size={15} /> },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ─── Main Component ───────────────────────────────────────────────────────────

const ReceiptSettings: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('manageSettings', 'edit_restaurant_settings');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [settings, setSettings] = useState<ReceiptSettingsData>(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<ReceiptConfig>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [colWarning, setColWarning] = useState(false);

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const token = localStorage.getItem('token');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // ── Load settings ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${apiBase}/settings/receipt-config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => readReceiptResult(r, 'load'))
      .then((saved) => {
        setSavedSettings(saved);
        setSettings(receiptToEditor(saved, DEFAULT_SETTINGS));
        setIsLoaded(true);
      })
      .catch(() => toast.error('Failed to load receipt settings'));
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const updateGeneral = (patch: Partial<ReceiptSettingsData['general']>) =>
    setSettings((prev) => ({ ...prev, general: { ...prev.general, ...patch } }));

  const updateHeader = (patch: Partial<ReceiptSettingsData['header']>) =>
    setSettings((prev) => ({ ...prev, header: { ...prev.header, ...patch } }));

  const updateSummary = (patch: Partial<ReceiptSettingsData['summary']>) =>
    setSettings((prev) => ({ ...prev, summary: { ...prev.summary, ...patch } }));

  const updateFooter = (patch: Partial<ReceiptSettingsData['footer']>) =>
    setSettings((prev) => ({ ...prev, footer: { ...prev.footer, ...patch } }));

  const countEnabledColumns = () =>
    Object.values(settings.productsTable.columns).filter(Boolean).length;

  const toggleColumn = (key: keyof ProductColumns, val: boolean) => {
    const current = countEnabledColumns();
    if (val && current >= 5) {
      setColWarning(true);
      setTimeout(() => setColWarning(false), 3000);
      return;
    }
    setSettings((prev) => ({
      ...prev,
      productsTable: {
        ...prev.productsTable,
        columns: { ...prev.productsTable.columns, [key]: val },
      },
    }));
  };

  // ── Logo upload ────────────────────────────────────────────────────────────

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('logo', file);
    setUploading(true);
    try {
      const res = await fetch(`${apiBase}/settings/receipt-logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.status === 'success') {
        updateHeader({ logoUrl: data.logoUrl });
        setSavedSettings((previous) => ({ ...previous, logoUrl: data.logoUrl }));
        toast.success('Logo uploaded successfully');
      } else {
        toast.error(data.message || 'Upload failed');
      }
    } catch {
      toast.error('Error uploading logo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const response = await fetch(`${apiBase}/settings/receipt-logo`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!response.ok) throw new Error('Error removing logo');
      updateHeader({ logoUrl: '' });
      setSavedSettings((previous) => ({ ...previous, logoUrl: '' }));
      toast.success('Logo removed');
    } catch {
      toast.error('Error removing logo');
    }
  };

  // ── Custom messages ────────────────────────────────────────────────────────

  const addCustomMessage = () => {
    updateFooter({
      customMessages: [...settings.footer.customMessages, { enabled: true, text: '' }],
    });
  };

  const removeCustomMessage = (idx: number) => {
    const updated = settings.footer.customMessages.filter((_, i) => i !== idx);
    updateFooter({ customMessages: updated });
  };

  const updateCustomMessage = (idx: number, patch: Partial<CustomMessage>) => {
    const updated = settings.footer.customMessages.map((m, i) =>
      i === idx ? { ...m, ...patch } : m
    );
    updateFooter({ customMessages: updated });
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const patch = receiptEditorPatch(settings, receiptToEditor(savedSettings, DEFAULT_SETTINGS));
      if (!Object.keys(patch).length) {
        toast.info('No supported settings have changed');
        return;
      }
      const res = await fetch(`${apiBase}/settings/receipt-config`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(patch),
      });
      const saved = await readReceiptResult(res, 'save');
      setSavedSettings(saved);
      setSettings(receiptToEditor(saved, DEFAULT_SETTINGS));
      toast.success('Receipt settings saved successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'An error occurred while saving');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSettings({ ...structuredClone(DEFAULT_SETTINGS), header: { ...DEFAULT_SETTINGS.header, logoUrl: settings.header.logoUrl }, footer: { ...DEFAULT_SETTINGS.footer, note: settings.footer.note } });
    toast.info('Supported options reset; save to apply');
  };

  // ─── Tab Panels ────────────────────────────────────────────────────────────

  const renderGeneral = () => (
    <div className="space-y-5">
      <SectionCard title="Page Layout" icon={<Settings2 size={18} />} unavailable>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">
              Paper Size
            </label>
            <div className="relative">
              <select
                value={settings.general.paperSize}
                onChange={(e) => updateGeneral({ paperSize: e.target.value as any })}
                className="w-full appearance-none border border-line rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 pr-9"
              >
                <option value="80mm">80mm (Thermal)</option>
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="Letter">Letter</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-subtle pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">
              Font Size
            </label>
            <div className="relative">
              <select
                value={settings.general.fontSize}
                onChange={(e) => updateGeneral({ fontSize: e.target.value as any })}
                className="w-full appearance-none border border-line rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 pr-9"
              >
                <option value="12px">12px (Small)</option>
                <option value="13px">13px (Medium)</option>
                <option value="14px">14px (Large)</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-subtle pointer-events-none" />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Display Options" icon={<Eye size={18} />} unavailable>
        <ToggleRow
          label="Show Section Headers"
          sublabel="Display bold section labels (ITEMS, PAYMENT) on the receipt"
          value={settings.general.showSectionHeaders}
          onChange={(v) => updateGeneral({ showSectionHeaders: v })}
        />
        <ToggleRow
          label="Compact Mode"
          sublabel="Reduce spacing between lines for shorter receipts"
          value={settings.general.compactMode}
          onChange={(v) => updateGeneral({ compactMode: v })}
        />
      </SectionCard>
    </div>
  );

  const renderHeader = () => (
    <div className="space-y-5">
      <SectionCard
        title="Header Section"
        icon={<FileText size={18} />}
        enabled={settings.header.enabled}
        onToggleEnabled={(v) => updateHeader({ enabled: v })}
      >
        <div className="mb-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Company Logo</p>
          <div className="flex items-center gap-3">
            {settings.header.logoUrl ? (
              <div className="relative shrink-0">
                <div className="h-16 w-16 rounded-full border-2 border-line overflow-hidden bg-surface flex items-center justify-center">
                  <img
                    src={settings.header.logoUrl}
                    alt="Receipt logo"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).parentElement!.classList.add('broken');
                    }}
                  />
                </div>
                <button
                  onClick={handleRemoveLogo}
                  className="absolute -top-1 -right-1 bg-danger text-on-danger rounded-full p-0.5 hover:bg-danger-hover transition shadow"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <div className="h-16 w-16 rounded-full border-2 border-dashed border-line-strong flex items-center justify-center text-subtle bg-surface-raised shrink-0">
                <Upload size={20} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-line-strong rounded-lg hover:bg-surface-raised transition text-muted disabled:opacity-50"
              >
                <Upload size={13} />
                {uploading ? 'Uploading...' : 'Upload Logo'}
              </button>
              {settings.header.logoUrl && (
                <button
                  onClick={handleRemoveLogo}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-danger-line rounded-lg hover:bg-danger-soft transition text-danger"
                >
                  <Trash2 size={13} /> Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-line pt-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Company Information</p>
          <ToggleRow label="Show Logo" value={settings.header.showLogo} onChange={(v) => updateHeader({ showLogo: v })} />
          <ToggleRow label="Company Name" value={settings.header.showCompanyName} onChange={(v) => updateHeader({ showCompanyName: v })} disabled />
          <ToggleRow label="Company Address" value={settings.header.showAddress} onChange={(v) => updateHeader({ showAddress: v })} />
          <ToggleRow label="Phone Number" value={settings.header.showPhone} onChange={(v) => updateHeader({ showPhone: v })} />
          <ToggleRow label="Email Address" value={settings.header.showEmail} onChange={(v) => updateHeader({ showEmail: v })} />
        </div>

        <div className="border-t border-line pt-3 mt-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Sale Information</p>
          <ToggleRow label="Salesman" value={settings.header.showSalesman} onChange={(v) => updateHeader({ showSalesman: v })} disabled />
          <ToggleRow label="Invoice Number" value={settings.header.showInvoiceNumber} onChange={(v) => updateHeader({ showInvoiceNumber: v })} disabled />
          <ToggleRow label="Date & Time" value={settings.header.showDateTime} onChange={(v) => updateHeader({ showDateTime: v })} disabled />
          <ToggleRow label="Customer Name" value={settings.header.showCustomer} onChange={(v) => updateHeader({ showCustomer: v })} />
        </div>
      </SectionCard>
    </div>
  );

  const renderProducts = () => {
    const enabled = countEnabledColumns();
    const columns: { key: keyof ProductColumns; label: string; desc: string }[] = [
      { key: 'product', label: 'Product', desc: 'Item name' },
      { key: 'productCode', label: 'Product Code', desc: 'SKU / barcode' },
      { key: 'size', label: 'Size / Variation', desc: 'Variant info' },
      { key: 'quantity', label: 'Quantity', desc: 'Qty column' },
      { key: 'discount', label: 'Discount', desc: 'Discount column' },
      { key: 'amount', label: 'Amount', desc: 'Line total' },
    ];

    return (
      <div className="space-y-5">
        <SectionCard
          title="Products Table"
          icon={<List size={18} />}
          enabled={settings.productsTable.enabled}
          onToggleEnabled={(v) =>
            setSettings((prev) => ({ ...prev, productsTable: { ...prev.productsTable, enabled: v } }))
          }
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Columns</p>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-sm font-bold ${enabled >= 5 ? 'text-warning' : 'text-primary'}`}
              >
                {enabled}
              </span>
              <span className="text-sm text-subtle">/ 5 enabled</span>
            </div>
          </div>

          {colWarning && (
            <div className="mb-3 px-3 py-2 bg-warning-soft border border-warning-line rounded-lg text-warning text-xs font-medium">
              Maximum 5 columns allowed. Disable a column before enabling another.
            </div>
          )}

          <div className="space-y-0">
            {columns.map(({ key, label, desc }) => (
              <ToggleRow
                key={key}
                label={label}
                sublabel={desc}
                value={settings.productsTable.columns[key]}
                onChange={(v) => toggleColumn(key, v)}
                disabled={key !== 'productCode' || (!settings.productsTable.columns[key] && enabled >= 5)}
              />
            ))}
          </div>
        </SectionCard>
      </div>
    );
  };

  const renderSummary = () => (
    <div className="space-y-5">
      <SectionCard
        title="Payment Summary"
        icon={<CreditCard size={18} />}
        enabled={settings.summary.enabled}
        onToggleEnabled={(v) => updateSummary({ enabled: v })}
      >
        <ToggleRow label="Subtotal" value={settings.summary.showSubtotal} onChange={(v) => updateSummary({ showSubtotal: v })} disabled />
        <ToggleRow label="Discount and Shipping" value={settings.summary.showDiscountShipping} onChange={(v) => updateSummary({ showDiscountShipping: v })} />
        <ToggleRow label="Discount (separate)" value={settings.summary.showDiscount} onChange={(v) => updateSummary({ showDiscount: v })} disabled />
        <ToggleRow label="Special Discount" sublabel="Product-level discounts" value={settings.summary.showSpecialDiscount} onChange={(v) => updateSummary({ showSpecialDiscount: v })} disabled />
        <ToggleRow label="Tax" value={settings.summary.showTax} onChange={(v) => updateSummary({ showTax: v })} />
        <ToggleRow label="Shipping (separate)" value={settings.summary.showShipping} onChange={(v) => updateSummary({ showShipping: v })} disabled />
        <ToggleRow label="Paid Amount" value={settings.summary.showPaidAmount} onChange={(v) => updateSummary({ showPaidAmount: v })} disabled />
        <ToggleRow label="Balance" value={settings.summary.showBalance} onChange={(v) => updateSummary({ showBalance: v })} disabled />
        <ToggleRow label="Payment Methods" sublabel="Cash / Card / Bank Transfer breakdown" value={settings.summary.showPaymentMethods} onChange={(v) => updateSummary({ showPaymentMethods: v })} disabled />
      </SectionCard>
    </div>
  );

  const renderFooter = () => (
    <div className="space-y-5">
      <SectionCard
        title="Footer Section"
        icon={<AlignLeft size={18} />}
        enabled={settings.footer.enabled}
        onToggleEnabled={(v) => updateFooter({ enabled: v })}
      >
        <ToggleRow label="Barcode" sublabel="Print invoice barcode at the bottom" value={settings.footer.showBarcode} onChange={(v) => updateFooter({ showBarcode: v })} />
        <ToggleRow label="System Credit Line" sublabel='"System by QDESK AI"' value={settings.footer.showSystemCredit} onChange={(v) => updateFooter({ showSystemCredit: v })} disabled />
        <ToggleRow label="Show Receipt Note" value={settings.footer.showNote} onChange={(v) => updateFooter({ showNote: v })} />
        <label className="block mt-3 text-sm font-medium text-foreground">
          Receipt Note
          <textarea value={settings.footer.note} onChange={(e) => updateFooter({ note: e.target.value })} className="mt-2 w-full rounded-lg border border-line p-3" />
        </label>
        <p className="mt-3 text-xs text-muted">One receipt note is supported. Multiple custom messages are not available yet.</p>

        <fieldset disabled className="mt-4 pt-4 border-t border-line opacity-50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Custom Messages</p>
            <button
              onClick={addCustomMessage}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary transition"
            >
              <Plus size={14} /> Add Message
            </button>
          </div>

          {settings.footer.customMessages.length === 0 && (
            <p className="text-xs text-subtle italic text-center py-3">
              Custom messages are unavailable. Use the receipt note above.
            </p>
          )}

          <div className="space-y-2">
            {settings.footer.customMessages.map((msg, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 bg-surface-raised rounded-xl p-3 border border-line"
              >
                <Toggle
                  value={msg.enabled}
                  onChange={(v) => updateCustomMessage(idx, { enabled: v })}
                />
                <input
                  type="text"
                  value={msg.text}
                  onChange={(e) => updateCustomMessage(idx, { text: e.target.value })}
                  placeholder="Enter message text..."
                  className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder-subtle"
                />
                <button
                  onClick={() => removeCustomMessage(idx)}
                  className="text-subtle hover:text-danger transition mt-0.5"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </fieldset>
      </SectionCard>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg text-on-primary shrink-0">
            <FileText size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Receipt Settings</h1>
            <p className="text-muted text-xs">Configure how your printed receipts look</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/SystemSettings')}
          className="inline-flex items-center gap-1 px-0 py-2 text-muted hover:text-primary transition"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-semibold">Back</span>
        </button>
      </div>

      {/* Tab Bar */}
      <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">Disabled options are not supported yet and cannot be saved. Supported options below retain your saved values.</p>
      <div className="flex gap-1 bg-surface-muted p-1 rounded-xl overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-surface text-primary'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <fieldset disabled={!canEdit || !isLoaded || loading || uploading}>
        {activeTab === 'general' && renderGeneral()}
        {activeTab === 'header' && renderHeader()}
        {activeTab === 'products' && renderProducts()}
        {activeTab === 'summary' && renderSummary()}
        {activeTab === 'footer' && renderFooter()}
      </fieldset>

      {/* Action Bar */}
      <div className="flex flex-col-reverse sm:flex-row justify-end items-center gap-3 pt-4 border-t border-line">
        <button
          onClick={handleReset}
          disabled={!canEdit || loading || uploading || !isLoaded}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-muted font-semibold hover:bg-surface-muted transition"
        >
          <RotateCcw size={16} />
          Reset Supported Options
        </button>
        <button
          onClick={handleSave}
          disabled={!canEdit || loading || uploading || !isLoaded}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary text-on-primary px-8 py-2.5 rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50"
        >
          <Save size={16} />
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default ReceiptSettings;
