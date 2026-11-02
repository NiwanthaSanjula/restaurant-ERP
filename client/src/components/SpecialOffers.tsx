import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Tag, Plus, Trash2, Edit, Calendar, Percent, Loader2, X,ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDate, toBusinessDateInputValue } from '../utils/date.ts';

const SpecialOffers: React.FC = () => {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    offerName: '',
    percentage: '',
    endDate: ''
  });

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  const fetchOffers = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${apiBase}/special-offers`);
      if (!res.ok) throw new Error('Failed to fetch');
      const result = await res.json();
      if (result.success) {
        setOffers(result.data.filter((offer: any) => offer.status !== 'Disabled'));
      }
    } catch (err) {
      setError(true);
      toast.error("Failed to fetch offers!");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOffers(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(formData.percentage) < 0 || Number(formData.percentage) > 100) {
      return toast.error("Percentage must be between 0 and 100!");
    }

    setSaving(true);
    try {
      const url = editId ? `${apiBase}/special-offers/${editId}` : `${apiBase}/special-offers`;
      const method = editId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await res.json();
      
      if (result.success) {
        toast.success(result.message);
        resetForm();
        fetchOffers();
      }
    } catch (err) {
      toast.error("Process failed!");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ offerName: '', percentage: '', endDate: '' });
    setShowForm(false);
    setEditId(null);
  };

  const handleEdit = (offer: any) => {
    setFormData({
      offerName: offer.offerName,
      percentage: offer.percentage.toString(),
      endDate: offer.endDate ? toBusinessDateInputValue(offer.endDate) : ''
    });
    setEditId(offer._id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this offer? This action cannot be undone.")) return;
    try {
      const res = await fetch(`${apiBase}/special-offers/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        toast.success("Offer deleted successfully!");
        fetchOffers();
      }
    } catch (err) {
      toast.error("Error occurred!");
    }
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <Loader2 className="animate-spin text-[#001F54]" size={40} />
    </div>
  );

  if (error) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
      <p className="text-slate-600 font-semibold">Failed to load offers</p>
      <button 
        onClick={fetchOffers}
        className="bg-[#001F54] text-white px-6 py-2 rounded-xl font-bold hover:bg-[#002147] transition-all active:scale-95 shadow-md"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-[#001F54] rounded-2xl text-white shadow-lg">
          <Tag size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#001F54]">Special Offers</h1>
          <p className="text-slate-500 text-sm">Manage promotional discounts and seasonal offers.</p>
        </div>
      </div>
      <div>
              <div className="p-0 max-w-4xl mx-auto">
                 {/* Top Navigation / Back Button */}
                  <div className="mb-6">
                    <button 
                      onClick={() => navigate(-1)} 
                      className="inline-flex items-center px-4 py-2 text-slate-500 hover:text-[#004080] transition-all"
                      >
                  <div className="p-1 rounded-lg group-hover:bg-white group-hover:shadow-sm border border-transparent group-hover:border-slate-200 transition-all">
                       <ArrowLeft size={18} />
                  </div>
                    <span className="text-sm font-semibold">Back</span>
                  </button>
                  </div>
                </div>
              </div>
      </div>

      <div className="max-w-6xl">
        {/* Offers Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500 mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-5 text-xs font-bold uppercase text-slate-500 tracking-wider">Offer Details</th>
                  <th className="p-5 text-xs font-bold uppercase text-slate-500 tracking-wider">Expiry</th>
                  <th className="p-5 text-xs font-bold uppercase text-slate-500 tracking-wider">Status</th>
                  <th className="p-5 text-xs font-bold uppercase text-slate-500 tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {offers.length === 0 ? (
                  <tr><td colSpan={4} className="p-10 text-center text-slate-400 font-medium">No offers found.</td></tr>
                ) : (
                  offers.map((offer: any) => (
                    <tr key={offer._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-5">
                        <div className="font-bold text-slate-800">{offer.offerName}</div>
                        <div className="text-[#001F54] text-sm font-mono font-bold mt-1 flex items-center gap-1">
                          <Percent size={12} /> {offer.percentage}% Off
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                          <Calendar size={14} />
                          {offer.endDate ? formatDate(offer.endDate) : 'No Expiry'}
                        </div>
                      </td>
                      <td className="p-5">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                          offer.status === 'Active' ? 'bg-emerald-100 text-emerald-600' : 
                          offer.status === 'Expired' ? 'bg-amber-100 text-amber-600' : 
                          'bg-rose-100 text-rose-600'
                        }`}>
                          {offer.status}
                        </span>
                      </td>
                      <td className="p-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleEdit(offer)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                            <Edit size={18} />
                          </button>
                          <button onClick={() => handleDelete(offer._id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* BUTTON AT THE BOTTOM RIGHT OF TABLE */}
        {!showForm && (
          <div className="flex justify-end">
            <button 
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-[#001F54] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#002147] transition-all shadow-md active:scale-95"
            >
              <Plus size={18} />
              Create New Offer
            </button>
          </div>
        )}
      </div>

      {/* MODAL FORM OVERLAY */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-[#001F54] p-6 text-white flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Tag size={20} /> {editId ? 'Update Offer' : 'New Offer'}
              </h3>
              <button onClick={resetForm} className="hover:bg-white/20 p-2 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-600 uppercase">Offer Name *</label>
                <input 
                  type="text" required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#001F54] outline-none"
                  value={formData.offerName}
                  onChange={(e) => setFormData({...formData, offerName: e.target.value})}
                  placeholder="e.g. Summer Sale"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-600 uppercase">Discount % *</label>
                  <input 
                    type="number" required min="0" max="100"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#001F54] outline-none"
                    value={formData.percentage}
                    onChange={(e) => setFormData({...formData, percentage: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-600 uppercase">Expiry Date</label>
                  <input 
                    type="date"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#001F54] outline-none"
                    value={formData.endDate}
                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                  />
                </div>
              </div>

              <button 
                type="submit" disabled={saving}
                className="w-full bg-[#001F54] text-white py-4 rounded-2xl font-bold hover:bg-[#002147] transition-all disabled:opacity-50 shadow-lg shadow-blue-900/20"
              >
                {saving ? 'Processing...' : (editId ? 'Update Offer' : 'Save Offer')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpecialOffers;
