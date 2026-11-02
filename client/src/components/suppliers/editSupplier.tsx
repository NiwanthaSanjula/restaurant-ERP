import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { showErrorToast, showSuccessToast } from '../../utils/toast';

const EditSupplier: React.FC = () => {
  const { id } = useParams();
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const load = async () => {
    try {
      const res = await fetch(`${api}/suppliers/${id}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load supplier');
      setName(data.data.name || '');
      setCompanyName(data.data.companyName || '');
      setMobile(data.data.mobile || '');
    } catch (e: any) {
      showErrorToast(e.message);
    }
  };

  useEffect(() => { load(); }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await fetch(`${api}/suppliers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name, companyName, mobile })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to update supplier');
      showSuccessToast(data.message || 'Supplier updated successfully');
      navigate('/viewSuppliers');
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 min-h-[calc(100vh-200px)] flex items-center justify-center">
      <div className="max-w-xl w-full bg-surface border border-line rounded-lg p-6">
        <h1 className="text-2xl font-bold text-foreground mb-4">Edit Supplier</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-base font-medium text-foreground mb-2">Name <span className="text-danger">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} required className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          </div>
          <div>
            <label className="block text-base font-medium text-foreground mb-2">Company Name</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          </div>
          <div>
            <label className="block text-base font-medium text-foreground mb-2">Mobile</label>
            <input value={mobile} onChange={e => setMobile(e.target.value)} className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => navigate('/viewSuppliers')} className="px-4 py-2 text-base font-medium text-foreground bg-surface border border-line-strong rounded-lg hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200">Cancel</button>
            <button type="submit" className="px-4 py-2 text-base font-medium text-on-primary bg-primary rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditSupplier;
