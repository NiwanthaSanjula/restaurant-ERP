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
      const res = await fetch(`${apiBase}/special-offers`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
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
      const res = await fetch(`${apiBase}/special-offers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });
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
    <div className="h-screen flex items-center justify-center bg-surface-raised">
      <Loader2 className="animate-spin text-primary" size={40} />
    </div>
  );

  if (error) return (
    <div className="h-screen flex flex-col items-center justify-center bg-surface-raised gap-4">
      <p className="text-muted font-semibold">Failed to load offers</p>
      <button 
        onClick={fetchOffers}
        className="bg-primary text-on-primary px-6 py-2 rounded-xl font-bold hover:bg-primary-hover transition-all active:scale-95"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-8 bg-canvas min-h-screen">
      {/* Header Section */}
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-primary rounded-2xl text-on-primary">
          <Tag size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Special Offers</h1>
          <p className="text-muted text-sm">Manage promotional discounts and seasonal offers.</p>
        </div>
      </div>
      <div>
              <div className="p-0 max-w-4xl mx-auto">
                 {/* Top Navigation / Back Button */}
                  <div className="mb-6">
                    <button 
                      onClick={() => navigate(-1)} 
                      className="inline-flex items-center px-4 py-2 text-muted hover:text-primary transition-all"
                      >
                  <div className="p-1 rounded-lg group-hover:bg-surface border border-transparent group-hover:border-line transition-all">
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
        <div className="bg-surface rounded-3xl border border-line overflow-hidden animate-in fade-in duration-500 mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-raised border-b border-line">
                  <th className="p-5 text-xs font-bold uppercase text-muted tracking-wider">Offer Details</th>
                  <th className="p-5 text-xs font-bold uppercase text-muted tracking-wider">Expiry</th>
                  <th className="p-5 text-xs font-bold uppercase text-muted tracking-wider">Status</th>
                  <th className="p-5 text-xs font-bold uppercase text-muted tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {offers.length === 0 ? (
                  <tr><td colSpan={4} className="p-10 text-center text-subtle font-medium">No offers found.</td></tr>
                ) : (
                  offers.map((offer: any) => (
                    <tr key={offer._id} className="hover:bg-surface-raised/50 transition-colors">
                      <td className="p-5">
                        <div className="font-bold text-foreground">{offer.offerName}</div>
                        <div className="text-foreground text-sm font-mono font-bold mt-1 flex items-center gap-1">
                          <Percent size={12} /> {offer.percentage}% Off
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-2 text-muted text-sm">
                          <Calendar size={14} />
                          {offer.endDate ? formatDate(offer.endDate) : 'No Expiry'}
                        </div>
                      </td>
                      <td className="p-5">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                          offer.status === 'Active' ? 'bg-secondary-soft text-secondary' :
                          offer.status === 'Expired' ? 'bg-warning-soft text-warning' :
                          'bg-danger-soft text-danger'
                        }`}>
                          {offer.status}
                        </span>
                      </td>
                      <td className="p-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleEdit(offer)} className="p-2 text-primary hover:bg-primary-soft rounded-lg">
                            <Edit size={18} />
                          </button>
                          <button onClick={() => handleDelete(offer._id)} className="p-2 text-danger hover:bg-danger-soft rounded-lg">
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
              className="flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-bold hover:bg-primary-hover transition-all active:scale-95"
            >
              <Plus size={18} />
              Create New Offer
            </button>
          </div>
        )}
      </div>

      {/* MODAL FORM OVERLAY */}
      {showForm && (
        <div className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-3xl shadow-elevated overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-primary p-6 text-on-primary flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Tag size={20} /> {editId ? 'Update Offer' : 'New Offer'}
              </h3>
              <button onClick={resetForm} className="hover:bg-surface-muted p-2 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-muted uppercase">Offer Name *</label>
                <input 
                  type="text" required
                  className="w-full px-4 py-3 bg-surface-raised border border-line rounded-xl focus:border-primary outline-none"
                  value={formData.offerName}
                  onChange={(e) => setFormData({...formData, offerName: e.target.value})}
                  placeholder="e.g. Summer Sale"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-muted uppercase">Discount % *</label>
                  <input 
                    type="number" required min="0" max="100"
                    className="w-full px-4 py-3 bg-surface-raised border border-line rounded-xl focus:border-primary outline-none"
                    value={formData.percentage}
                    onChange={(e) => setFormData({...formData, percentage: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-muted uppercase">Expiry Date</label>
                  <input 
                    type="date"
                    className="w-full px-4 py-3 bg-surface-raised border border-line rounded-xl focus:border-primary outline-none"
                    value={formData.endDate}
                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                  />
                </div>
              </div>

              <button 
                type="submit" disabled={saving}
                className="w-full bg-primary text-on-primary py-4 rounded-2xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50"
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
