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
    onClick={() => !disabled && onChange(!value)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
      disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
    } ${value && !disabled ? 'bg-[#1A3E73]' : value && disabled ? 'bg-[#1A3E73]' : 'bg-slate-300'}`}
    title={label}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
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
  <div className="flex items-center justify-between py-3 px-1 border-b border-slate-100 last:border-0">
    <div>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
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
}> = ({ title, icon, enabled, onToggleEnabled, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
      <div className="flex items-center gap-3">
        <span className="text-[#004080]">{icon}</span>
        <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
      </div>
      {onToggleEnabled !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{enabled ? 'Enabled' : 'Disabled'}</span>
          <Toggle value={enabled ?? true} onChange={onToggleEnabled} />
        </div>
      )}
    </div>
    <div className={`px-5 py-4 ${enabled === false ? 'opacity-50 pointer-events-none' : ''}`}>
      {children}
    </div>
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [settings, setSettings] = useState<ReceiptSettingsData>(DEFAULT_SETTINGS);
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
      .then((r) => r.json())
      .then((res) => {
        if (res?.data) {
          setSettings({ ...DEFAULT_SETTINGS, ...res.data });
        }
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
      await fetch(`${apiBase}/settings/receipt-logo`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      updateHeader({ logoUrl: '' });
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
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/settings/receipt-config`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast.success('Receipt settings saved successfully');
      } else {
        toast.error(data.message || 'Failed to save settings');
      }
    } catch {
      toast.error('An error occurred while saving');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    toast.info('Settings reset to defaults');
  };

  // ─── Tab Panels ────────────────────────────────────────────────────────────

  const renderGeneral = () => (
    <div className="space-y-5">
      <SectionCard title="Page Layout" icon={<Settings2 size={18} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              Paper Size
            </label>
            <div className="relative">
              <select
                value={settings.general.paperSize}
                onChange={(e) => updateGeneral({ paperSize: e.target.value as any })}
                className="w-full appearance-none border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#004080]/20 pr-9"
              >
                <option value="80mm">80mm (Thermal)</option>
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="Letter">Letter</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              Font Size
            </label>
            <div className="relative">
              <select
                value={settings.general.fontSize}
                onChange={(e) => updateGeneral({ fontSize: e.target.value as any })}
                className="w-full appearance-none border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#004080]/20 pr-9"
              >
                <option value="12px">12px (Small)</option>
                <option value="13px">13px (Medium)</option>
                <option value="14px">14px (Large)</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Display Options" icon={<Eye size={18} />}>
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
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Company Logo</p>
          <div className="flex items-center gap-3">
            {settings.header.logoUrl ? (
              <div className="relative shrink-0">
                <div className="h-16 w-16 rounded-full border-2 border-slate-200 overflow-hidden bg-white shadow-sm flex items-center justify-center">
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
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition shadow"
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <div className="h-16 w-16 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 bg-slate-50 shrink-0">
                <Upload size={20} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600 disabled:opacity-50"
              >
                <Upload size={13} />
                {uploading ? 'Uploading...' : 'Upload Logo'}
              </button>
              {settings.header.logoUrl && (
                <button
                  onClick={handleRemoveLogo}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 rounded-lg hover:bg-red-50 transition text-red-500"
                >
                  <Trash2 size={13} /> Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Company Information</p>
          <ToggleRow label="Show Logo" value={settings.header.showLogo} onChange={(v) => updateHeader({ showLogo: v })} />
          <ToggleRow label="Company Name" value={settings.header.showCompanyName} onChange={(v) => updateHeader({ showCompanyName: v })} />
          <ToggleRow label="Company Address" value={settings.header.showAddress} onChange={(v) => updateHeader({ showAddress: v })} />
          <ToggleRow label="Phone Number" value={settings.header.showPhone} onChange={(v) => updateHeader({ showPhone: v })} />
          <ToggleRow label="Email Address" value={settings.header.showEmail} onChange={(v) => updateHeader({ showEmail: v })} />
        </div>

        <div className="border-t border-slate-100 pt-3 mt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sale Information</p>
          <ToggleRow label="Salesman" value={settings.header.showSalesman} onChange={(v) => updateHeader({ showSalesman: v })} />
          <ToggleRow label="Invoice Number" value={settings.header.showInvoiceNumber} onChange={(v) => updateHeader({ showInvoiceNumber: v })} />
          <ToggleRow label="Date & Time" value={settings.header.showDateTime} onChange={(v) => updateHeader({ showDateTime: v })} />
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Columns</p>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-sm font-bold ${enabled >= 5 ? 'text-amber-600' : 'text-[#004080]'}`}
              >
                {enabled}
              </span>
              <span className="text-sm text-slate-400">/ 5 enabled</span>
            </div>
          </div>

          {colWarning && (
            <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs font-medium">
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
                disabled={!settings.productsTable.columns[key] && enabled >= 5}
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
        <ToggleRow label="Subtotal" value={settings.summary.showSubtotal} onChange={(v) => updateSummary({ showSubtotal: v })} />
        <ToggleRow label="Discount" value={settings.summary.showDiscount} onChange={(v) => updateSummary({ showDiscount: v })} />
        <ToggleRow label="Special Discount" sublabel="Product-level discounts" value={settings.summary.showSpecialDiscount} onChange={(v) => updateSummary({ showSpecialDiscount: v })} />
        <ToggleRow label="Tax" value={settings.summary.showTax} onChange={(v) => updateSummary({ showTax: v })} />
        <ToggleRow label="Shipping" value={settings.summary.showShipping} onChange={(v) => updateSummary({ showShipping: v })} />
        <ToggleRow label="Paid Amount" value={settings.summary.showPaidAmount} onChange={(v) => updateSummary({ showPaidAmount: v })} />
        <ToggleRow label="Balance" value={settings.summary.showBalance} onChange={(v) => updateSummary({ showBalance: v })} />
        <ToggleRow label="Payment Methods" sublabel="Cash / Card / Bank Transfer breakdown" value={settings.summary.showPaymentMethods} onChange={(v) => updateSummary({ showPaymentMethods: v })} />
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
        <ToggleRow label="System Credit Line" sublabel='"System by QDESK AI"' value={settings.footer.showSystemCredit} onChange={(v) => updateFooter({ showSystemCredit: v })} />

        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Custom Messages</p>
            <button
              onClick={addCustomMessage}
              className="flex items-center gap-1 text-xs font-medium text-[#004080] hover:text-[#002147] transition"
            >
              <Plus size={14} /> Add Message
            </button>
          </div>

          {settings.footer.customMessages.length === 0 && (
            <p className="text-xs text-slate-400 italic text-center py-3">
              No custom messages yet. Click "Add Message" to add one.
            </p>
          )}

          <div className="space-y-2">
            {settings.footer.customMessages.map((msg, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 bg-slate-50 rounded-xl p-3 border border-slate-200"
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
                  className="flex-1 text-sm bg-transparent border-none outline-none text-slate-700 placeholder-slate-400"
                />
                <button
                  onClick={() => removeCustomMessage(idx)}
                  className="text-slate-400 hover:text-red-500 transition mt-0.5"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#004080] rounded-lg text-white shrink-0">
            <FileText size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Receipt Settings</h1>
            <p className="text-slate-500 text-xs">Configure how your printed receipts look</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/SystemSettings')}
          className="inline-flex items-center gap-1 px-0 py-2 text-slate-500 hover:text-[#004080] transition"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-semibold">Back</span>
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-white text-[#004080] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'general' && renderGeneral()}
        {activeTab === 'header' && renderHeader()}
        {activeTab === 'products' && renderProducts()}
        {activeTab === 'summary' && renderSummary()}
        {activeTab === 'footer' && renderFooter()}
      </div>

      {/* Action Bar */}
      <div className="flex flex-col-reverse sm:flex-row justify-end items-center gap-3 pt-4 border-t border-slate-200">
        <button
          onClick={handleReset}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-slate-500 font-semibold hover:bg-slate-100 transition"
        >
          <RotateCcw size={16} />
          Reset Defaults
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#004080] text-white px-8 py-2.5 rounded-xl font-bold hover:bg-[#002147] transition-all shadow-lg shadow-blue-900/10 disabled:opacity-50"
        >
          <Save size={16} />
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default ReceiptSettings;
