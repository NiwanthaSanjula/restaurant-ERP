import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '../../utils/date.ts';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';
import SearchBar from '../common/SearchBar';

type BaseUnitRow = { 
  id: string; 
  BaseUnitName: string; 
  description: string;
  createdAt: string;
};

const ViewBaseUnits: React.FC = () => {
  const [baseUnits, setBaseUnits] = useState<BaseUnitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const fetchBaseUnits = async (searchQuery: string = '') => {
    const token = localStorage.getItem('token');
    if (!token) {
      showErrorToast('Session expired. Please log in again.');
      return;
    }
    setLoading(true);
    try {
      const searchParam = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`${api}/baseUnits${searchParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || 'Failed to load base units';
        showErrorToast(errorMessage);
        return;
      }
      
      const rows: BaseUnitRow[] = data.data.map((bu: any) => ({ 
        id: bu._id, 
        BaseUnitName: bu.BaseUnitName, 
        description: bu.description,
        createdAt: bu.createdAt 
      }));
      setBaseUnits(rows);
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => { 
    fetchBaseUnits(debouncedSearchQuery); 
  }, [debouncedSearchQuery]);
  
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const token = localStorage.getItem('token');
    if (!token) {
      showErrorToast('Session expired. Please log in again.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${api}/baseUnits/${toDelete}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || 'Failed to delete base unit';
        showErrorToast(errorMessage);
        setLoading(false);
        return;
      }
      
      showSuccessToast(data.message || 'Base unit deleted successfully');
      setToDelete(null);
      fetchBaseUnits(debouncedSearchQuery);
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      {loading && <Loader text="Loading" />}
      
      {/* Header Section */}
      <div className="bg-surface border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Base Units</h1>
              <p className="text-sm text-muted mt-1">Manage base units for restaurant products</p>
            </div>

            <PermissionGate component="manageBaseUnits" action="create">
              <Link 
                to="/createBaseUnit" 
                className="inline-flex items-center px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-hover transition-colors duration-200 font-medium"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Base Unit
              </Link>
            </PermissionGate>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <div className="mb-4">
          <SearchBar 
            onSearch={handleSearch}
            placeholder="Search base units by name..."
            className="max-w-md"
          />
        </div>
        <div className="bg-surface rounded-lg border border-line overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-raised">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground uppercase tracking-wider">Base Unit</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground uppercase tracking-wider">Description</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-foreground uppercase tracking-wider">Created</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-line">
                {baseUnits.map(baseUnit => (
                  <tr key={baseUnit.id} className="hover:bg-surface-raised transition-colors duration-150">
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-14 w-14">
                          <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center">
                            <svg className="h-8 w-8 text-on-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-base font-semibold text-foreground">{baseUnit.BaseUnitName}</div>
                          <div className="text-sm text-muted">ID: {baseUnit.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-base text-foreground">{baseUnit.description}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-base text-foreground">
                        {formatDate(baseUnit.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right text-base font-medium">
                      <div className="flex items-center justify-end space-x-3">
                        <PermissionGate component="manageBaseUnits" action="update">
                          <button
                            onClick={() => navigate(`/editBaseUnit/${baseUnit.id}`)}
                            className="inline-flex items-center p-2.5 text-primary hover:text-primary hover:bg-surface-muted rounded-lg transition-colors duration-200"
                            title="Edit base unit"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </PermissionGate>
                        <PermissionGate component="manageBaseUnits" action="delete">
                          <button
                            onClick={() => setToDelete(baseUnit.id)}
                            className="inline-flex items-center p-2.5 text-danger hover:text-danger hover:bg-danger-soft rounded-lg transition-colors duration-200"
                            title="Delete base unit"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                ))}
                {baseUnits.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="w-12 h-12 text-subtle mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        <h3 className="text-lg font-medium text-foreground mb-2">No base units found</h3>
                        <p className="text-muted mb-4">Get started by creating your first base unit.</p>
                        <PermissionGate component="manageBaseUnits" action="create">
                          <Link 
                            to="/createBaseUnit" 
                            className="inline-flex items-center px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-hover transition-colors duration-200"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Add Base Unit
                          </Link>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {toDelete && (
        <DeleteConfirmModal onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
};

export default ViewBaseUnits;
