import { ArrowLeft, Eye, Info, RotateCcw, ShoppingCart, Tag, Truck, Wallet } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

const PREFIX_MAX_LENGTH = 8;

type PrefixFormData = {
  salePrefix: string;
  saleReturnPrefix: string;
  purchasePrefix: string;
  purchaseReturnPrefix: string;
  expensePrefix: string;
};

type PrefixField = keyof PrefixFormData;

type PrefixSaveResponse = {
  success?: boolean;
  message?: string;
};

const normalizePrefix = (value: unknown, fallback: string) => {
  return typeof value === 'string' ? value.trim().slice(0, PREFIX_MAX_LENGTH) : fallback;
};

const PrefixSettings: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<PrefixFormData>({
    salePrefix: '',
    saleReturnPrefix: '',
    purchasePrefix: '',
    purchaseReturnPrefix: '',
    expensePrefix: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  const handlePrefixChange = (field: PrefixField, value: string) => {
    if (value.length > PREFIX_MAX_LENGTH) {
      toast.warn(`Prefix cannot exceed ${PREFIX_MAX_LENGTH} characters.`);
    }
    setFormData(prev => ({
      ...prev,
      [field]: value.slice(0, PREFIX_MAX_LENGTH)
    }));
  };

  const savePrefixes = async (): Promise<boolean> => {
    const payload = Object.fromEntries(
      Object.entries(formData).map(([key, value]) => [key, value.trim()])
    ) as PrefixFormData;

    if (Object.values(payload).some(value => value.length === 0)) {
      toast.error("All prefix fields are required.");
      return false;
    }

    if (Object.values(payload).some(value => value.length > PREFIX_MAX_LENGTH)) {
      toast.error(`Prefixes cannot exceed ${PREFIX_MAX_LENGTH} characters.`);
      return false;
    }

    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/settings/prefixes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: JSON.stringify(payload),
      });
      const result = await res.json().catch(() => null) as PrefixSaveResponse | null;

      if (!res.ok || result?.success !== true) {
        throw new Error(result?.message || "Failed to save settings");
      }

      setFormData(payload);
      toast.success("Prefix settings saved successfully!");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save settings";
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetch(`${apiBase}/settings/prefixes`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } })
      .then(async res => {
        if (!res.ok) return null;
        return res.json();
      })
      .then(data => {
        if (data && typeof data === 'object') {
          setFormData(prev => ({
            ...prev,
            salePrefix: normalizePrefix(data.salePrefix, prev.salePrefix),
            saleReturnPrefix: normalizePrefix(data.saleReturnPrefix, prev.saleReturnPrefix),
            purchasePrefix: normalizePrefix(data.purchasePrefix, prev.purchasePrefix),
            purchaseReturnPrefix: normalizePrefix(data.purchaseReturnPrefix, prev.purchaseReturnPrefix),
            expensePrefix: normalizePrefix(data.expensePrefix, prev.expensePrefix),
          }));
        }
        setLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load settings");
        setLoading(false);
      });
  }, [apiBase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await savePrefixes();
  };

  const handleSaveAndLogout = async () => {
    const saved = await savePrefixes();
    if (!saved) return;

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('requirePrefixSetup');
    toast.success('Prefixes saved. Please log in again.');
    navigate('/');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-10 h-10 border-4 border-line border-t-[#004080] rounded-full animate-spin"></div>
        <p className="text-muted font-medium text-sm">Loading prefix configurations...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-surface-muted rounded-xl text-foreground">
          <Tag size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Prefix Settings</h1>
          <p className="text-muted text-sm">Customize transaction ID formats for your records.</p>
        </div>
      </div>
      <div>
        <div className="p-0 max-w-4xl mx-auto">
           {/* Top Navigation / Back Button */}
            <div className="mb-6">
              <button 
                onClick={() => navigate('/SystemSettings')} 
                className="inline-flex items-center px-4 py-2 text-muted hover:text-primary transition-all"
                >
            <div className="p-1 rounded-lg group-hover:bg-surface border border-transparent group-hover:border-line transition-all">
                 <ArrowLeft size={18} />
            </div>
              <span className="text-sm font-semibold">Back to Settings</span>
            </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Section */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="bg-surface p-6 rounded-2xl border border-line space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Sale Prefix */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted flex items-center gap-2">
                  <ShoppingCart size={14} /> Sale Prefix
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 bg-surface-raised border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono"
                  value={formData.salePrefix}
                  onChange={(e) => handlePrefixChange('salePrefix', e.target.value)}
                  placeholder="e.g., SL"
                />
              </div>

              {/* Sale Return Prefix */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted flex items-center gap-2">
                  <RotateCcw size={14} /> Sale Return Prefix
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 bg-surface-raised border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono"
                  value={formData.saleReturnPrefix}
                  onChange={(e) => handlePrefixChange('saleReturnPrefix', e.target.value)}
                  placeholder="e.g., SLR"
                />
              </div>

              {/* Purchase Prefix */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted flex items-center gap-2">
                  <Truck size={14} /> Purchase Prefix
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 bg-surface-raised border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono"
                  value={formData.purchasePrefix}
                  onChange={(e) => handlePrefixChange('purchasePrefix', e.target.value)}
                  placeholder="e.g., PR"
                />
              </div>

              {/* Purchase Return Prefix */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-muted flex items-center gap-2">
                  <RotateCcw size={14} /> Purchase Return
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 bg-surface-raised border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono"
                  value={formData.purchaseReturnPrefix}
                  onChange={(e) => handlePrefixChange('purchaseReturnPrefix', e.target.value)}
                  placeholder="e.g., PRR"
                />
              </div>

              {/* Expense Prefix */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-sm font-semibold text-muted flex items-center gap-2">
                  <Wallet size={14} /> Expense Prefix
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2.5 bg-surface-raised border border-line rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono"
                  value={formData.expensePrefix}
                  onChange={(e) => handlePrefixChange('expensePrefix', e.target.value)}
                  placeholder="e.g., EX"
                />
              </div>
            </div>

            <div className="pt-4 border-t flex justify-between">
              <button
                type="button"
                onClick={() => navigate('/SystemSettings')}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted hover:text-primary hover:bg-surface-raised transition-all"
              >
                Cancel
              </button>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Save Prefixes'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveAndLogout}
                  className="bg-danger text-on-danger px-6 py-2.5 rounded-xl font-bold hover:bg-danger-hover transition-all disabled:opacity-50"
                >
                  Save & Logout
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Live Preview / Sidebar */}
        <div className="space-y-6">
          <div className="bg-primary text-on-primary p-6 rounded-2xl">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 opacity-80">
              <Eye size={16} /> Live Preview
            </h3>
            <div className="space-y-4">
              <div className="bg-surface-muted p-3 rounded-lg border border-line/10">
                <p className="text-[10px] text-foreground mb-1">New Sale Invoice</p>
                <p className="font-mono text-lg font-bold">{formData.salePrefix || '??'}-0001</p>
              </div>
              <div className="bg-surface-muted p-3 rounded-lg border border-line/10">
                <p className="text-[10px] text-foreground mb-1">Purchase Order</p>
                <p className="font-mono text-lg font-bold">{formData.purchasePrefix || '??'}-5420</p>
              </div>
              <div className="bg-surface-muted p-3 rounded-lg border border-line/10">
                <p className="text-[10px] text-foreground mb-1">Expense Voucher</p>
                <p className="font-mono text-lg font-bold">{formData.expensePrefix || '??'}-8821</p>
              </div>
            </div>
          </div>

          <div className="bg-warning-soft border border-warning-line p-4 rounded-xl flex gap-3">
            <Info className="text-warning shrink-0" size={20} />
            <p className="text-xs text-warning leading-relaxed">
              Prefixes can be up to {PREFIX_MAX_LENGTH} characters. Avoid using special characters besides hyphens or underscores.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrefixSettings;
