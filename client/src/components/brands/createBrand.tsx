import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';

const CreateBrand: React.FC = () => {
  const [brandName, setBrandName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/brands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ brandName, description: description || undefined })
      });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || data?.errors?.join(', ') || 'Failed to create brand';
        showErrorToast(errorMessage);
        return;
      }
      
      showSuccessToast(data.message || 'Brand created successfully');
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
      action="create"
      fallback={
        <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
          <div className="bg-surface rounded-lg border border-line p-6 max-w-md text-center">
            <h2 className="text-xl font-semibold text-foreground">Access denied</h2>
            <p className="text-muted mt-2">You do not have permission to create brands.</p>
            <button
              type="button"
              onClick={() => navigate('/viewBrands')}
              className="mt-4 px-4 py-2 text-base font-medium text-on-primary bg-primary rounded-lg hover:bg-primary-hover transition-colors duration-200"
            >
              Back to Brands
            </button>
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-canvas">
        {loading && <Loader text="Creating brand" />}
        
        {/* Header */}
        <div className="bg-surface border-b">
          <div className="px-6 py-4">
            <div className="flex items-center">
              <button
                onClick={() => navigate('/viewBrands')}
                className="mr-4 p-2 text-subtle hover:text-muted hover:bg-surface-muted rounded-lg transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Create Brand</h1>
                <p className="text-sm text-muted mt-1">Add a new product brand</p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 min-h-[calc(100vh-200px)] flex items-center justify-center">
          <div className="max-w-2xl w-full">
            <div className="bg-surface rounded-lg border border-line p-6">
              <form onSubmit={submit} className="space-y-6">
                <div>
                  <label className="block text-base font-medium text-foreground mb-2">
                    Brand Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={e => setBrandName(e.target.value)}
                    required
                    placeholder="Enter brand name"
                    className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-base font-medium text-foreground mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Enter brand description"
                    rows={4}
                    className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-6 border-t border-line">
                  <button
                    type="button"
                    onClick={() => navigate('/viewBrands')}
                    className="px-4 py-2 text-base font-medium text-foreground bg-surface border border-line-strong rounded-lg hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-base font-medium text-on-primary bg-primary rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200"
                  >
                    Create Brand
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

export default CreateBrand;
