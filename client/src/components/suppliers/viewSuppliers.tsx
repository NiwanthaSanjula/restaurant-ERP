import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import SearchBar from '../common/SearchBar';

const ViewSuppliers: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const fetchSuppliers = async (searchQuery: string = '') => {
    if (!token) {
      showErrorToast('Session expired. Please log in again.');
      return;
    }
    try {
      setLoading(true);
      const searchParam = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`${api}/suppliers${searchParam}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to fetch suppliers');
      setSuppliers(data.data || []);
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this supplier?')) return;
    if (!token) {
      showErrorToast('Session expired. Please log in again.');
      return;
    }
    try {
      const res = await fetch(`${api}/suppliers/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to delete supplier');
      showSuccessToast(data.message || 'Deleted successfully');
      fetchSuppliers(debouncedSearchQuery);
    } catch (e: any) {
      showErrorToast(e.message);
    }
  };

  // Debounce search query updates
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch when debounced query changes
  useEffect(() => { fetchSuppliers(debouncedSearchQuery); }, [debouncedSearchQuery]);
  
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
        <button onClick={() => navigate('/createSupplier')} className="px-4 py-2 text-sm font-medium text-on-primary bg-primary rounded-lg hover:bg-primary-hover">Add Supplier</button>
      </div>
      <div className="mb-4">
        <SearchBar 
          onSearch={handleSearch}
          placeholder="Search suppliers by name or company name..."
          className="w-full max-w-md"
        />
      </div>
      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-surface-raised">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-foreground tracking-wider">Name</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-foreground tracking-wider">Company</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-foreground tracking-wider">Mobile</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-foreground tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-line">
            {suppliers.map((s) => (
              <tr key={s._id} className="hover:bg-surface-raised transition-colors duration-150">
                <td className="px-6 py-5 text-base font-semibold text-foreground">{s.name}</td>
                <td className="px-6 py-5 text-base text-foreground">{s.companyName || '-'}</td>
                <td className="px-6 py-5 text-base text-foreground">{s.mobile || '-'}</td>
                <td className="px-6 py-5 text-right">
                  <div className="inline-flex items-center gap-3">
                    <button onClick={() => navigate(`/editSupplier/${s._id}`)} className="inline-flex items-center p-2.5 text-primary hover:text-primary hover:bg-primary-soft rounded-lg transition-colors duration-200" title="Edit">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onClick={() => remove(s._id)} className="inline-flex items-center p-2.5 text-danger hover:text-danger hover:bg-danger-soft rounded-lg transition-colors duration-200" title="Delete">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!suppliers.length && (
              <tr><td className="px-6 py-12 text-center text-base text-muted" colSpan={4}>{loading ? 'Loading...' : 'No suppliers found'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ViewSuppliers;
