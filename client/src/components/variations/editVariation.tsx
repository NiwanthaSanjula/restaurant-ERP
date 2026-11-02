import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';

const EditVariation: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [variationName, setVariationName] = useState('');
  const [variationTypeInput, setVariationTypeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  useEffect(() => {
    const fetchVariation = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${api}/variations/${id}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
        const data = await res.json();
        if (!res.ok) {
          showErrorToast(data?.message || 'Failed to load variation');
          navigate('/viewVariations');
          return;
        }
        const v = data.data;
        setVariationName(v.variationName);
        setVariationTypeInput((v.variationType || []).join(', '));
      } catch (e) {
        showErrorToast((e as Error).message || 'Network error occurred');
        navigate('/viewVariations');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchVariation();
  }, [id, api, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const types = variationTypeInput.split(',').map(s => s.trim()).filter(Boolean);
      const res = await fetch(`${api}/variations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ variationName, variationType: types })
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || data?.errors?.map((e:any)=>e.msg).join(', ') || 'Failed to update variation');
        return;
      }
      showSuccessToast(data.message || 'Variation updated successfully');
      navigate('/viewVariations');
    } catch (e) {
      showErrorToast((e as Error).message || 'Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
  <PermissionGate
    component="manageVariations"
    action="update"
    fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-md text-center">
          <h2 className="text-xl font-semibold text-gray-900">Access denied</h2>
          <p className="text-gray-600 mt-2">You do not have permission to edit variations.</p>
          <button
            type="button"
            onClick={() => navigate('/viewVariations')}
            className="mt-4 px-4 py-2 text-base font-medium text-white bg-[#003366] rounded-lg hover:bg-[#004080]"
          >
            Back to Variations
          </button>
        </div>
      </div>
    }
  >
    <div className="min-h-screen bg-gray-50">
      {loading && <Loader text="Loading variation" />}

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4 flex items-center">
          <button
            onClick={() => navigate('/viewVariations')}
            className="mr-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Variation</h1>
            <p className="text-sm text-gray-600 mt-1">Update variation information</p>
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
                  Variation Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={variationName}
                  onChange={e => setVariationName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366]"
                />
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  Variation Type(s) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={variationTypeInput}
                  onChange={e => setVariationTypeInput(e.target.value)}
                  required
                  placeholder="Comma-separated values"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366]"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => navigate('/viewVariations')}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-[#003366] rounded-lg hover:bg-[#004080]"
                >
                  Update Variation
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

export default EditVariation;
