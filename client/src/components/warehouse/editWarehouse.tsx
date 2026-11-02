import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Loader from '../common/Loader';
import { showSuccessToast, showErrorToast } from '../../utils/toast';

const EditWarehouse: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [location, setLocation] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  useEffect(() => {
    const fetchWarehouse = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${api}/warehouses/${id}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        const data = await res.json();
        
        if (!res.ok) {
          const errorMessage = data?.message || 'Failed to load warehouse';
          showErrorToast(errorMessage);
          navigate('/viewWarehouses');
          return;
        }
        
        const warehouse = data.data;
        setName(warehouse.name);
        setCountry(warehouse.country || '');
        setLocation(warehouse.location || '');
        setIsActive(warehouse.isActive);
      } catch (e) {
        const errorMessage = (e as Error).message || 'Network error occurred';
        showErrorToast(errorMessage);
        navigate('/viewWarehouses');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchWarehouse();
    }
  }, [id, navigate, api]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/warehouses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ 
          name, 
          country: country || undefined, 
          location: location || undefined, 
          isActive 
        })
      });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || data?.errors?.join(', ') || 'Failed to update warehouse';
        showErrorToast(errorMessage);
        return;
      }
      
      showSuccessToast(data.message || 'Warehouse updated successfully');
      navigate('/viewWarehouses');
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {loading && <Loader text="Loading warehouse" />}
      
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/viewWarehouses')}
              className="mr-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Edit Warehouse</h1>
              <p className="text-sm text-gray-600 mt-1">Update warehouse information</p>
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
                  Warehouse Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="Enter warehouse name"
                  className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366] focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    Country
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    placeholder="Enter country"
                    className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="Enter specific location"
                    className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366] focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  className="h-4 w-4 text-[#003366] focus:ring-[#003366] border-gray-300 rounded"
                />
                <label htmlFor="isActive" className="ml-2 block text-base text-gray-700">
                  Active warehouse
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => navigate('/viewWarehouses')}
                  className="px-4 py-2 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-base font-medium text-white bg-[#003366] rounded-lg hover:bg-[#004080] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] transition-colors duration-200"
                >
                  Update Warehouse
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditWarehouse;
