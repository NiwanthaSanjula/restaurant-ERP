import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';

const EditBrand: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [brandName, setBrandName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  useEffect(() => {
    if (id) {
      fetchBrand();
    }
  }, [id]);

  const fetchBrand = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/brands/${id}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || 'Failed to load brand';
        showErrorToast(errorMessage);
        navigate('/viewBrands');
        return;
      }
      
      const brandData = data.data;
      setBrandName(brandData.brandName);
      setDescription(brandData.description || '');
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
      navigate('/viewBrands');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/brands/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ brandName, description: description || undefined })
      });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || data?.errors?.join(', ') || 'Failed to update brand';
        showErrorToast(errorMessage);
        return;
      }
      
      showSuccessToast(data.message || 'Brand updated successfully');
      navigate('/viewBrands');
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PermissionGate
      component="manageBrands"
      action="update"
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-md text-center">
            <h2 className="text-xl font-semibold text-gray-900">Access denied</h2>
            <p className="text-gray-600 mt-2">You do not have permission to edit brands.</p>
            <button
              type="button"
              onClick={() => navigate('/viewBrands')}
              className="mt-4 px-4 py-2 text-base font-medium text-white bg-[#003366] rounded-lg hover:bg-[#004080] transition-colors duration-200"
            >
              Back to Brands
            </button>
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-gray-50">
        {loading && <Loader text="Loading brand" />}
        
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="px-6 py-4">
            <div className="flex items-center">
              <button
                onClick={() => navigate('/viewBrands')}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Edit Brand</h1>
                <p className="text-sm text-gray-600 mt-1">Update brand information</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 min-h-[calc(100vh-200px)] flex items-center justify-center">
          <div className="max-w-2xl w-full">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <form onSubmit={submit} className="space-y-6">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    Brand Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={e => setBrandName(e.target.value)}
                    required
                    placeholder="Enter brand name"
                    className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Enter brand description"
                    rows={4}
                    className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366] focus:border-transparent"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => navigate('/viewBrands')}
                    className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-base font-medium text-white bg-[#003366] rounded-lg hover:bg-[#004080] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
                  >
                    Update Brand
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </PermissionGate>
  );
};

export default EditBrand;
