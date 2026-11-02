import { ArrowLeft, Building2, Calendar, Globe, Mail, MapPin, Phone, Plus, ShieldCheck, UploadCloud } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useCurrency } from '../../contexts/CurrencyContext';
import { currencyService } from '../../services/currencyService';
import { settingService } from '../../services/settingService';

const SystemSettings: React.FC = () => {
  const navigate = useNavigate();
  const { currencies, refreshCurrencies, setCurrencyById } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [originalData, setOriginalData] = useState<any>(null);
  const [isCurrencyModalOpen, setIsCurrencyModalOpen] = useState(false);
  const [currencyDraft, setCurrencyDraft] = useState({
    name: '',
    code: '',
    symbol: '',
  });
  const [creatingCurrency, setCreatingCurrency] = useState(false);
  const [formData, setFormData] = useState({
    companyLogo: '',
    defaultEmail: '',
    companyName: '',
    companyMobile: '',
    whatsappNumber: '',
    developedBy: 'Qdesk AI Pvt Ltd',
    currency: '',
    country: '',
    city: '',
    dateFormat: 'DD/MM/YYYY',
    postalCode: '',
    address: ''
  });

  useEffect(() => {
    fetchSettings();
    refreshCurrencies().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!currencies.length) return;
    if (!formData.currency) {
      const first = currencies[0];
      if (!first) return;
      setFormData((prev) => ({
     ...prev,
     currency: first._id ?? ''
      }));
      setOriginalData((prev: any) => (prev ? { ...prev, currency: first._id } : prev));
      return;
    }

    // If DB still stores currency code (legacy), map it to currencyId for the dropdown.
    const byId = currencies.find((c) => c._id === formData.currency);
    if (byId) return;

    const byCode = currencies.find((c) => c.code?.toUpperCase() === String(formData.currency).toUpperCase());
    if (!byCode) return;

    setFormData((prev) => ({
    ...prev,
    currency: byCode?._id ?? ''
     }));
    setOriginalData((prev: any) => (prev ? { ...prev, currency: byCode._id } : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencies]);

  const validateMobile = (number: string) => {
    const regex = /^(?:0\d{9}|\+94\d{9})$/;
    return regex.test(number);
  };

  const fetchSettings = async () => {
  try {
      const response = await settingService.getSettings();
    if (response.success && response.data?.system) {
      setFormData(response.data.system);
      setOriginalData(response.data.system);
      if (response.data.system.companyLogo) {
        setPreview(response.data.system.companyLogo);
      }
    }
  } catch (error) {
    toast.error('Failed to load settings');
  } finally {
    setLoading(false);
  }
};
  const handleDiscard = async () => {
  if (originalData) {
    try {
      setLoading(true);
      setFormData({ ...originalData });
      if (originalData.companyLogo) {
        setPreview(originalData.companyLogo);
      }
      setLogoFile(null);
      const response = await settingService.updateSettings({ system: originalData });

      if (response.success) {
        toast.success("Changes discarded and database synchronized!");
        setCurrencyById(originalData.currency);
      }
    } catch (error) {
      toast.error("Failed to sync discard with database");
    } finally {
      setLoading(false);
    }
  }
};
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateMobile(formData.companyMobile)) {
      toast.error('Invalid Mobile: Must be 0XXXXXXXXX (10 digits) or +94XXXXXXXXX');
      return;
    }
    if (formData.whatsappNumber && !validateMobile(formData.whatsappNumber)) {
      toast.error('Invalid WhatsApp: Must be 0XXXXXXXXX (10 digits) or +94XXXXXXXXX');
      return;
    }
    if (!formData.currency) {
      toast.error('Please select a currency');
      return;
    }

    setLoading(true);
    try {
      let logoUrl = formData.companyLogo;
      if (logoFile) {
        logoUrl = await settingService.uploadLogo(logoFile);
      }
      const payload = { system: { ...formData, companyLogo: logoUrl } };
      await settingService.updateSettings(payload);
      toast.success('System settings updated successfully!');
      setCurrencyById(formData.currency);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error updating settings');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCurrency = async (e: React.FormEvent) => {
    e.preventDefault();

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

    setCreatingCurrency(true);
    try {
      const created = await currencyService.createCurrency({ name, code, symbol });
      const createdCurrency = created?.data;
      if (!createdCurrency?._id) {
        throw new Error('Created currency id not found');
      }
      const nextCurrencyId = createdCurrency._id;
      const nextSystem = { ...formData, currency: nextCurrencyId };

      // Persist only currency to avoid failing validations on unrelated required fields.
      await settingService.updateSettings({ 'system.currency': nextCurrencyId });

      await refreshCurrencies();
      setFormData(nextSystem);
      setOriginalData((prev: any) => (prev ? { ...prev, currency: nextCurrencyId } : nextSystem));
      setCurrencyById(nextCurrencyId);

      setIsCurrencyModalOpen(false);
      setCurrencyDraft({ name: '', code: '', symbol: '' });
      toast.success('Currency created successfully');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to create currency. Please ensure backend server is running.');
    } finally {
      setCreatingCurrency(false);
    }
  };

  if (loading && !formData.companyName) {
    return (
      <div className="flex justify-center items-center h-screen text-[#004080]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#004080]"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 bg-slate-50 min-h-screen">
      {/* Header Section - Responsive Adjustment */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">System Configuration</h1>
          <p className="text-slate-500 text-sm md:text-base">Manage your organization's global settings and brand identity.</p>
        </div>
        
        <div className="order-first md:order-last">
          <button 
            onClick={() => navigate(-1)} 
            className="inline-flex items-center text-slate-500 hover:text-[#004080] transition-all group"
          >
            <div className="p-1 rounded-lg group-hover:bg-white group-hover:shadow-sm border border-transparent group-hover:border-slate-200 transition-all mr-2">
              <ArrowLeft size={18} />
            </div>
            <span className="text-sm font-semibold">Back to Settings</span>
          </button>
        </div>
      </div> 

      <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">

          
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <ShieldCheck size={20} className="text-[#004080]" /> Brand Identity
              </h3>
              
              <div className="flex flex-col items-center group">
                <div className="relative w-32 h-32 md:w-40 md:h-40 mb-4 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center bg-slate-50 overflow-hidden transition-all group-hover:border-[#004080]">
                  {preview ? (
                    <img src={preview} alt="Logo Preview" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="text-center text-slate-400">
                      <UploadCloud size={32} className="mx-auto mb-2" />
                      <span className="text-xs">Upload Logo</span>
                    </div>
                  )}
                  <input 
                    type="file" 
                    onChange={handleFileChange} 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    accept="image/*" 
                  />
                </div>
                <p className="text-[10px] md:text-xs text-slate-400 text-center px-4">Recommended: Square PNG or SVG (Max 2MB)</p>
              </div>
            </div>
          </div>

          {/* General Information */}
          <div className="lg:col-span-2">
            <div className="bg-white p-5 md:p-8 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-700 mb-6 flex items-center gap-2">
                <Building2 size={20} className="text-[#004080]" /> General Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">Company Legal Name</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                      name="companyName" 
                      value={formData.companyName} 
                      onChange={handleChange} 
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">System Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                      type="email" 
                      name="defaultEmail" 
                      value={formData.defaultEmail} 
                      onChange={handleChange} 
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">Mobile Contact</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                      name="companyMobile" 
                      value={formData.companyMobile} 
                      onChange={handleChange} 
                      maxLength={12} 
                      placeholder="0XXXXXXXXX or +94XXXXXXXXX" 
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600">WhatsApp Number (Optional)</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                      name="whatsappNumber" 
                      value={formData.whatsappNumber} 
                      onChange={handleChange} 
                      placeholder="+94 7X XXX XXXX"
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Location & Regional */}
        <div className="bg-white p-5 md:p-8 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-700 mb-6 flex items-center gap-2">
            <MapPin size={20} className="text-[#004080]" /> Location & Regional
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Country (Optional)</label>
              <input
                name="country"
                value={formData.country}
                onChange={handleChange}
                placeholder="e.g. Sri Lanka"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">City (Optional)</label>
              <input
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="e.g. Colombo"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Default Currency</label>
              <div className="relative">
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  className="w-full pl-4 pr-12 py-2.5 border border-slate-200 rounded-xl bg-white appearance-none focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
                >
                  <option value="" disabled>
                    {currencies.length ? 'Select currency' : 'Loading currencies...'}
                  </option>
                  {currencies.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.symbol})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsCurrencyModalOpen(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7  border-slate-200 bg-white text-[#004080] hover:bg-slate-50"
                  aria-label="Create new currency"
                  title="Create new currency"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Postal Code (Optional)</label>
              <input
                name="postalCode"
                value={formData.postalCode}
                onChange={handleChange}
                placeholder="e.g. 10100"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600">Date Format Preference</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 text-slate-400" size={18} />
                <select
                  name="dateFormat"
                  value={formData.dateFormat}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white appearance-none focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                </select>
              </div>
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-semibold text-slate-600">Full Physical Address</label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows={3}
                className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons - Mobile Responsive */}
        <div className="flex flex-col-reverse md:flex-row justify-end gap-3 md:gap-4 pt-2">
          <button
            type="button"
            onClick={handleDiscard}
            className="w-full md:w-auto px-6 py-3 md:py-2.5 rounded-xl text-slate-500 font-semibold hover:bg-slate-100 transition text-sm md:text-base"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={loading}
            className="w-full md:w-auto px-10 py-3 md:py-2.5 bg-[#004080] text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 hover:bg-[#003060] transition-all disabled:opacity-50 text-sm md:text-base"
          >
            {loading ? 'Processing...' : 'Save Configuration'}
          </button>
        </div>
      </form>

      {isCurrencyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIsCurrencyModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-lg w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Create New Currency</h3>
              <button
                type="button"
                onClick={() => setIsCurrencyModalOpen(false)}
                className="px-3 py-1 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreateCurrency} className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Currency Name</label>
                <input
                  value={currencyDraft.name}
                  onChange={(e) => setCurrencyDraft((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
                  placeholder="e.g. Sri Lankan Rupee"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Currency Code</label>
                <input
                  value={currencyDraft.code}
                  onChange={(e) => setCurrencyDraft((p) => ({ ...p, code: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
                  placeholder="e.g. LKR"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600">Currency Symbol</label>
                <input
                  value={currencyDraft.symbol}
                  onChange={(e) => setCurrencyDraft((p) => ({ ...p, symbol: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#004080]/20 focus:border-[#004080] outline-none transition-all text-sm md:text-base"
                  placeholder="e.g. Rs"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (formData.currency) {
                      navigate(`/editCurrency/${formData.currency}`);
                    }
                  }}
                  className="flex-1 px-4 py-2 rounded-xl text-[#004080] font-semibold border border-[#004080] hover:bg-[#f0f7ff] transition"
                  disabled={!formData.currency || creatingCurrency}
                >
                  Update Currency
                </button>
                <button
                  type="button"
                  onClick={() => setIsCurrencyModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl text-slate-600 font-semibold hover:bg-slate-100 transition"
                  disabled={creatingCurrency}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCurrency}
                  className="flex-1 px-4 py-2 rounded-xl bg-[#004080] text-white font-bold hover:bg-[#003060] transition disabled:opacity-50"
                >
                  {creatingCurrency ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemSettings;
