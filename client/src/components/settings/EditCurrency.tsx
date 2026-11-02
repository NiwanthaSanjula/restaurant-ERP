import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useCurrency } from '../../contexts/CurrencyContext';
import { currencyService } from '../../services/currencyService';

const EditCurrency: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { currencies, refreshCurrencies } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currencyDraft, setCurrencyDraft] = useState({ name: '', code: '', symbol: '' });
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!currencies.length) {
        await refreshCurrencies().catch(() => undefined);
      }
      setLoading(false);
    };
    load();
  }, [currencies.length, refreshCurrencies]);

  useEffect(() => {
    if (!id) return;
    const found = currencies.find((c) => c._id === id);
    if (found) {
      setCurrencyDraft({ name: found.name, code: found.code, symbol: found.symbol });
      setNotFound(false);
    } else if (currencies.length) {
      setNotFound(true);
    }
  }, [currencies, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    const name = currencyDraft.name.trim();
    const code = currencyDraft.code.trim().toUpperCase();
    const symbol = currencyDraft.symbol.trim();

    if (!name) {
      toast.error('Currency name cannot be empty');
      return;
    }
    if (!code) {
      toast.error('Currency code cannot be empty');
      return;
    }
    if (!symbol) {
      toast.error('Currency symbol cannot be empty');
      return;
    }

    setSaving(true);
    try {
      await currencyService.updateCurrency(id, { name, code, symbol });
      await refreshCurrencies();
      toast.success('Currency updated successfully');
      navigate('/SystemSettings');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to update currency');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#004080]"></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-800">Currency not found</h1>
          <p className="mt-2 text-sm text-slate-600">The requested currency could not be found. Please return to settings and try again.</p>
          <button
            onClick={() => navigate('/SystemSettings')}
            className="mt-4 inline-flex items-center px-4 py-2 rounded-xl bg-[#004080] text-white hover:bg-[#003060] transition"
          >
            Back to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 min-h-screen bg-slate-50">
      <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Update Currency</h1>
            <p className="text-sm text-slate-500">Edit the selected currency details and save your changes.</p>
          </div>
          <button
            onClick={() => navigate('/SystemSettings')}
            className="inline-flex items-center px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Currency Name</label>
            <input
              value={currencyDraft.name}
              onChange={(e) => setCurrencyDraft((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#004080] focus:ring-2 focus:ring-[#004080]/20"
              placeholder="e.g. Sri Lankan Rupee"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Currency Code</label>
            <input
              value={currencyDraft.code}
              onChange={(e) => setCurrencyDraft((prev) => ({ ...prev, code: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#004080] focus:ring-2 focus:ring-[#004080]/20"
              placeholder="e.g. LKR"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Currency Symbol</label>
            <input
              value={currencyDraft.symbol}
              onChange={(e) => setCurrencyDraft((prev) => ({ ...prev, symbol: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#004080] focus:ring-2 focus:ring-[#004080]/20"
              placeholder="e.g. Rs"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate('/SystemSettings')}
              className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#004080] text-white font-semibold hover:bg-[#003060] transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Update Currency'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditCurrency;
