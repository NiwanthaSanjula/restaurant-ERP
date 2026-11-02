import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';
import SearchBar from '../common/SearchBar';
import { formatDate } from '../../utils/date.ts';

type BrandRow = { 
  id: string; 
  brandName: string; 
  description?: string;
  createdAt: string;
};

const ViewBrands: React.FC = () => {
const [brands, setBrands] = useState<BrandRow[]>([]);
const [loading, setLoading] = useState(false);
const [toDelete, setToDelete] = useState<string | null>(null);
const [searchQuery, setSearchQuery] = useState('');

const [currentPage, setCurrentPage] = useState(1);
const [totalPages, setTotalPages] = useState(1);
const [totalResults, setTotalResults] = useState(0);
const [limit] = useState(10);

const navigate = useNavigate();
const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

const fetchBrands = async (query: string = '', page: number = 1) => {
  const token = localStorage.getItem('token');
  if (!token) {
    showErrorToast('Session expired. Please log in again.');
    return;
  }

  setLoading(true);
  try {
    const searchParam = query ? `&q=${encodeURIComponent(query)}` : '';

    const res = await fetch(
      `${api}/brands?page=${page}&limit=${limit}${searchParam}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const data = await res.json();

    if (!res.ok) {
      showErrorToast(data?.message || 'Failed to load brands');
      return;
    }

    const rows: BrandRow[] = data.data.map((b: any) => ({
      id: b._id,
      brandName: b.brandName,
      description: b.description,
      createdAt: b.createdAt
    }));

    setBrands(rows);
    setTotalPages(data.pagination?.pages || 1);
    setTotalResults(data.pagination?.total || 0);
  } catch (e) {
    showErrorToast((e as Error).message || 'Network error occurred');
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  fetchBrands(searchQuery, currentPage);
}, [searchQuery, currentPage]);
  
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1); // Reset to first page on search
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
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
      const res = await fetch(`${api}/brands/${toDelete}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || 'Failed to delete brand';
        showErrorToast(errorMessage);
        setLoading(false);
        return;
      }
      
      showSuccessToast(data.message || 'Brand deleted successfully');
      setToDelete(null);
      fetchBrands(searchQuery, currentPage);
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
              <h1 className="text-2xl font-bold text-gray-900">Brands</h1>
              <p className="text-sm text-gray-600 mt-1">Manage product brands</p>
            </div>
            <PermissionGate component="manageBrands" action="create">
              <Link 
                to="/createBrand" 
                className="inline-flex items-center px-4 py-2 bg-[#003366] text-white rounded-lg hover:bg-[#004080] transition-colors duration-200 font-medium"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Brand
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
            placeholder="Search brands by name..."
            className="max-w-md"
          />
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                 <tr>
                   <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">Brand</th>
                   <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">Description</th>
                   <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 uppercase tracking-wider">Created</th>
                   <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                 </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {brands.map(brand => (
                  <tr key={brand.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-14 w-14">
                          <div className="h-14 w-14 rounded-full bg-[#003366] flex items-center justify-center">
                            <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-base font-semibold text-gray-900">{brand.brandName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-base text-gray-900">{brand.description || '-'}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-base text-gray-900">
                        {formatDate(brand.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right text-base font-medium">
                      <div className="flex items-center justify-end space-x-3">
                        <PermissionGate component="manageBrands" action="update">
                          <button
                            onClick={() => navigate(`/editBrand/${brand.id}`)}
                            className="inline-flex items-center p-2.5 text-[#003366] hover:text-[#003366] hover:bg-gray-100 rounded-lg transition-colors duration-200"
                            title="Edit brand"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </PermissionGate>
                        <PermissionGate component="manageBrands" action="delete">
                          <button
                            onClick={() => setToDelete(brand.id)}
                            className="inline-flex items-center p-2.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors duration-200"
                            title="Delete brand"
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
                {brands.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No brands found</h3>
                        <p className="text-gray-500 mb-4">Get started by creating your first brand.</p>
                        <PermissionGate component="manageBrands" action="create">
                          <Link 
                            to="/createBrand" 
                            className="inline-flex items-center px-4 py-2 bg-[#003366] text-white rounded-lg hover:bg-[#004080] transition-colors duration-200"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Add Brand
                          </Link>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination UI */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
              <div className="flex justify-between flex-1 sm:hidden">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{totalResults === 0 ? 0 : (currentPage - 1) * limit + 1}</span> to <span className="font-medium">{Math.min(currentPage * limit, totalResults)}</span> of{' '}
                    <span className="font-medium">{totalResults}</span> results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Previous</span>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => handlePageChange(i + 1)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === i + 1
                            ? 'z-10 bg-[#003366] border-[#003366] text-white'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}

                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      <span className="sr-only">Next</span>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {toDelete && (
        <DeleteConfirmModal onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
};

export default ViewBrands;
