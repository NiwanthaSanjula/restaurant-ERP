import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../common/Loader';
import { showSuccessToast, showErrorToast } from '../../utils/toast';

const CreateBaseUnit: React.FC = () => {
  const [BaseUnitName, setBaseUnitName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/baseUnits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ BaseUnitName, description })
      });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || data?.errors?.join(', ') || 'Failed to create base unit';
        showErrorToast(errorMessage);
        return;
      }
      
      showSuccessToast(data.message || 'Base unit created successfully');
      navigate('/viewBaseUnits');
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {loading && <Loader text="Creating base unit" />}
      
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/viewBaseUnits')}
              className="mr-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create Base Unit</h1>
              <p className="text-sm text-gray-600 mt-1">Add a new base unit for restaurant products</p>
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
                  Base Unit Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={BaseUnitName}
                  onChange={e => setBaseUnitName(e.target.value)}
                  required
                  placeholder="Enter base unit name"
                  className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  required
                  placeholder="Enter base unit description"
                  rows={4}
                  className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366] focus:border-transparent"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => navigate('/viewBaseUnits')}
                  className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-base font-medium text-white bg-[#003366] rounded-lg hover:bg-[#004080] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
                >
                  Create Base Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateBaseUnit;
