import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { showErrorToast, showInfoToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';
import SearchBar from '../common/SearchBar';

type WarehouseRow = { 
  id: string; 
  name: string; 
  country?: string; 
  location?: string; 
  isActive: boolean; 
  createdAt: string 
};

const ViewWarehouses: React.FC = () => {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [defaultWarehouse, setDefaultWarehouse] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  const navigate = useNavigate();

  const fetchWarehouses = async (searchQuery: string = '') => {
    const token = localStorage.getItem('token');
    if (!token) {
      showErrorToast('Session expired. Please log in again.');
      return;
    }
    setLoading(true);
    try {
      const searchParam = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`${api}/warehouses${searchParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || 'Failed to load warehouses';
        showErrorToast(errorMessage);
        return;
      }
      
      const rows: WarehouseRow[] = data.data.map((w: any) => ({ 
        id: w._id, 
        name: w.name, 
        country: w.country, 
        location: w.location, 
        isActive: w.isActive, 
        createdAt: w.createdAt 
      }));
      setWarehouses(rows);
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const setDefaultWarehouseHandler = (warehouseId: string) => {
    const warehouse = warehouses.find(w => w.id === warehouseId);
    const warehouseName = warehouse?.name || 'Unknown';
    
    // If clicking on the same warehouse that's already default, remove default status
    if (defaultWarehouse === warehouseId) {
      setDefaultWarehouse(null);
      localStorage.removeItem('defaultWarehouse');
      showInfoToast(`Removed default status from ${warehouseName}`);
    } else {
      // Set new default warehouse
      setDefaultWarehouse(warehouseId);
      localStorage.setItem('defaultWarehouse', warehouseId);
      showSuccessToast(`${warehouseName} set as default warehouse`);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => { 
    fetchWarehouses(debouncedSearchQuery); 
    const savedDefault = localStorage.getItem('defaultWarehouse');
    if (savedDefault) {
      setDefaultWarehouse(savedDefault);
    }
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
      const res = await fetch(`${api}/warehouses/${toDelete}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || 'Failed to delete warehouse';
        showErrorToast(errorMessage);
        setLoading(false);
        return;
      }
      
      showSuccessToast(data.message || 'Warehouse deleted successfully');
      setToDelete(null);
      fetchWarehouses(debouncedSearchQuery);
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {loading && <Loader text="Loading" />}
      
      {/* Header Section */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Warehouses</h1>
              <p className="text-sm text-gray-600 mt-1">Manage your warehouse locations</p>
              {defaultWarehouse ? (
                <div className="mt-2 flex items-center text-sm text-[#003366]">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Default: {warehouses.find(w => w.id === defaultWarehouse)?.name || 'Warehouse not found'}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-2">No default warehouse set</p>
              )}
            </div>
            <PermissionGate component="manageWarehouses" action="create">
            <Link 
              to="/createWarehouse" 
              className="inline-flex items-center px-4 py-2 bg-[#003366] text-white rounded-lg hover:bg-[#004080] transition-colors duration-200 font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Warehouse
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
            placeholder="Search warehouses by name or location..."
            className="w-full max-w-md"
          />
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">Warehouse</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">Location</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">
                    <div className="flex items-center">
                      <span>Default</span>
                      <span className="ml-1 text-xs text-gray-400">(One only)</span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {warehouses.map(warehouse => (
                  <tr key={warehouse.id} className={`hover:bg-gray-50 transition-colors duration-150 ${
                    defaultWarehouse === warehouse.id ? 'bg-blue-50' : ''
                  }`}>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-14 w-14">
                          <div className="h-14 w-14 rounded-full bg-[#003366] flex items-center justify-center">
                            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-base font-semibold text-gray-900">{warehouse.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-base text-gray-900">
                        {warehouse.country && warehouse.location 
                          ? `${warehouse.location}, ${warehouse.country}`
                          : warehouse.country || warehouse.location || 'Not specified'
                        }
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-sm font-semibold rounded-full ${
                        warehouse.isActive 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {warehouse.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <button
                        onClick={() => setDefaultWarehouseHandler(warehouse.id)}
                        className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 ${
                          defaultWarehouse === warehouse.id
                            ? 'bg-[#003366] text-white hover:bg-[#004080]'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        title={defaultWarehouse === warehouse.id ? 'Click to remove default status' : 'Click to set as default warehouse'}
                      >
                        {defaultWarehouse === warehouse.id ? (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Default
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Set Default
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right text-base font-medium">
                      <div className="flex items-center justify-end space-x-3">
                        <PermissionGate component="manageWarehouses" action="update">
                                  <button
                                    onClick={() => navigate(`/editWarehouse/${warehouse.id}`)}
                                    className="inline-flex items-center p-2.5 text-[#003366] hover:text-[#003366] hover:bg-gray-100 rounded-lg transition-colors duration-200"
                                    title="Edit warehouse"
                                  >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </PermissionGate>
                        <PermissionGate component="manageWarehouses" action="delete">
                                  <button
                                    onClick={() => setToDelete(warehouse.id)}
                                    className="inline-flex items-center p-2.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors duration-200"
                                    title="Delete warehouse"
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
                {warehouses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No warehouses found</h3>
                        <p className="text-gray-500 mb-4">Get started by creating your first warehouse.</p>
                        <PermissionGate component="manageWarehouses" action="create">
                          <Link 
                            to="/createWarehouse" 
                            className="inline-flex items-center px-4 py-2 bg-[#003366] text-white rounded-lg hover:bg-[#004080] transition-colors duration-200"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Add Warehouse
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
        
        {/* Help Text */}
        <div className="mt-4 p-4 sm:p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-blue-800">Default Warehouse</h4>
              <p className="text-sm text-blue-700 mt-1">
                Only one warehouse can be set as default at a time. Click on a warehouse's "Set Default" button to make it the default, or click on the current default warehouse to remove its default status.
              </p>
            </div>
          </div>
        </div>
      </div>

      {toDelete && (
        <DeleteConfirmModal onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
};

export default ViewWarehouses;
