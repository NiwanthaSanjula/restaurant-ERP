import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';
import SearchBar from '../common/SearchBar';

type CustomerRow = { 
  id: string; 
  name: string; 
  mobile: string; 
  NIC?: string; 
  address?: string; 
  createdAt: string 
};

const ViewCustomers: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const fetchCustomers = async (searchQuery: string = '') => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Session expired. Please log in again.');
      return;
    }
    setLoading(true);
    try {
      const searchParam = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`${api}/customers${searchParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to load');
      const rows: CustomerRow[] = data.data.map((c: any) => ({ 
        id: c._id, 
        name: c.name, 
        mobile: c.mobile, 
        NIC: c.NIC, 
        address: c.address, 
        createdAt: c.createdAt 
      }));
      setCustomers(rows);
    } catch (e) {
      showErrorToast((e as Error).message);
    } finally {
      setLoading(false);
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
  useEffect(() => { fetchCustomers(debouncedSearchQuery); }, [debouncedSearchQuery]);
  
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Session expired. Please log in again.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${api}/customers/${toDelete}`, { 
        method: 'DELETE', 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Delete failed');
      setToDelete(null);
      showSuccessToast(data?.message || 'Customer deleted successfully');
      fetchCustomers(debouncedSearchQuery);
    } catch (e) {
      showErrorToast((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <div>
      {loading && <Loader text="Loading" />}
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-semibold text-[#001F54]">Customers</div>
        <div className="flex gap-3">
          <PermissionGate component="manageCustomers" action="update">
            <Link 
              to="/importCustomer" 
              className="px-4 py-2 rounded bg-[#0066CC] text-white hover:bg-[#0052A3] transition-colors duration-200"
            >
              Import Customer
            </Link>
          </PermissionGate>
          <PermissionGate component="manageCustomers" action="create">
            <Link 
              to="/createCustomer" 
              className="px-4 py-2 rounded bg-[#003366] text-white hover:bg-[#004080] transition-colors duration-200"
            >
              Create Customer
            </Link>
          </PermissionGate>
        </div>
      </div>
      <div className="mb-4">
        <SearchBar 
          onSearch={handleSearch}
          placeholder="Search customers by name, phone, or NIC"
          className="max-w-md"
        />
      </div>
      <div className="bg-white border border-gray-200 rounded overflow-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-[#001F54] text-white">
            <tr>
              <th className="text-left px-6 py-4 text-sm font-semibold">Name</th>
              <th className="text-left px-6 py-4 text-sm font-semibold">Mobile</th>
              <th className="text-left px-6 py-4 text-sm font-semibold">NIC</th>
              <th className="text-left px-6 py-4 text-sm font-semibold">Address</th>
              <th className="text-right px-6 py-4 text-sm font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {customers.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors duration-150">
                <td className="px-6 py-5 text-base font-semibold text-gray-900">{c.name}</td>
                <td className="px-6 py-5 text-base text-gray-900">{c.mobile}</td>
                <td className="px-6 py-5 text-base text-gray-900">{c.NIC || '-'}</td>
                <td className="px-6 py-5 text-base text-gray-900">{c.address || '-'}</td>
                <td className="px-6 py-5 text-right space-x-3">
                  <PermissionGate component="manageCustomers" action="update">
                    <button
                      onClick={() => navigate(`/editCustomer/${c.id}`)}
                      className="inline-flex items-center justify-center p-2.5 rounded-lg border border-gray-300 text-[#001F54] hover:bg-gray-100 transition-colors duration-200"
                      title="Edit"
                      aria-label="Edit"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <path d="M12 20h9"/>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                      </svg>
                    </button>
                  </PermissionGate>
                  <PermissionGate component="manageCustomers" action="delete">
                    <button
                      onClick={() => setToDelete(c.id)}
                      className="inline-flex items-center justify-center p-2.5 rounded-lg border border-gray-300 text-red-600 hover:bg-gray-100 transition-colors duration-200"
                      title="Delete"
                      aria-label="Delete"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </PermissionGate>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-base text-gray-500">No customers found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {toDelete && (
        <DeleteConfirmModal onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
};

export default ViewCustomers;

