import React, { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showErrorToast, showSuccessToast } from '../../utils/toast';

export type CreatedSupplier = { _id: string; name: string; companyName?: string; mobile?: string };
const CreateSupplier: React.FC<{ onCreated?: (supplier: CreatedSupplier) => void; onCancel?: () => void }> = ({ onCreated, onCancel }) => {
  const formId = useId();
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: name.trim(), companyName: companyName.trim(), mobile: mobile.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to create supplier');
      if (!data.data?._id || !data.data?.name) throw new Error('Supplier response could not be confirmed. Check the existing supplier list before retrying.');
      showSuccessToast(data.message || 'Supplier created successfully');
      if (onCreated) onCreated(data.data); else navigate('/viewSuppliers');
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={onCreated ? 'p-3 sm:p-6' : 'p-6 min-h-[calc(100vh-200px)] flex items-center justify-center'}>
      <div className="max-w-xl w-full bg-surface border border-line rounded-lg p-6">
        <h1 className="text-2xl font-bold text-foreground mb-4">{onCreated ? 'New Supplier' : 'Create Supplier'}</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor={`${formId}-name`} className="block text-base font-medium text-foreground mb-2">Name <span className="text-danger">*</span></label>
            <input id={`${formId}-name`} value={name} onChange={e => setName(e.target.value)} required className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          </div>
          <div>
            <label htmlFor={`${formId}-company`} className="block text-base font-medium text-foreground mb-2">Company Name</label>
            <input id={`${formId}-company`} value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          </div>
          <div>
            <label htmlFor={`${formId}-mobile`} className="block text-base font-medium text-foreground mb-2">Mobile</label>
            <input id={`${formId}-mobile`} value={mobile} onChange={e => setMobile(e.target.value)} className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" disabled={loading} onClick={() => onCancel ? onCancel() : navigate('/viewSuppliers')} className="px-4 py-2 text-base font-medium text-foreground bg-surface border border-line-strong rounded-lg hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200">Cancel</button>
            <button type="submit" className="px-4 py-2 text-base font-medium text-on-primary bg-primary rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200" disabled={loading}>{loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateSupplier;
