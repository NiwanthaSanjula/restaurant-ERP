import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';

const EditCategory: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  useEffect(() => {
    if (id) {
      fetchCategory();
    }
  }, [id]);

  const fetchCategory = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/categories/${id}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || 'Failed to load category';
        showErrorToast(errorMessage);
        navigate('/viewCategories');
        return;
      }
      
      const categoryData = data.data;
      setCategory(categoryData.category);
      setDescription(categoryData.description || '');
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
      navigate('/viewCategories');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ category, description: description || undefined })
      });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || data?.errors?.join(', ') || 'Failed to update category';
        showErrorToast(errorMessage);
        return;
      }
      
      showSuccessToast(data.message || 'Category updated successfully');
      navigate('/viewCategories');
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PermissionGate
      component="manageCategories"
      action="update"
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-md text-center">
            <h2 className="text-xl font-semibold text-gray-900">Access denied</h2>
            <p className="text-gray-600 mt-2">You do not have permission to edit categories.</p>
            <button
              type="button"
              onClick={() => navigate('/viewCategories')}
              className="mt-4 px-4 py-2 text-base font-medium text-white bg-[#003366] rounded-lg hover:bg-[#004080] transition-colors duration-200"
            >
              Back to Categories
            </button>
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-gray-50">
        {loading && <Loader text="Loading category" />}
        
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="px-6 py-4">
            <div className="flex items-center">
              <button
                onClick={() => navigate('/viewCategories')}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Edit Category</h1>
                <p className="text-sm text-gray-600 mt-1">Update category information</p>
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
                    Category Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    required
                    placeholder="Enter category name"
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
                    placeholder="Enter category description"
                    rows={4}
                    className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366] focus:border-transparent"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => navigate('/viewCategories')}
                    className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-base font-medium text-white bg-[#003366] rounded-lg hover:bg-[#004080] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
                  >
                    Update Category
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

export default EditCategory;
