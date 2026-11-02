import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Loader from '../common/Loader';
import { showSuccessToast, showErrorToast } from '../../utils/toast';
import { getExpenseCategoryById, updateExpenseCategory } from '../../services/expenseService';

const EditExpenseCategory: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCategory = async () => {
      setLoading(true);
      try {
        const data = await getExpenseCategoryById(id!);
        setName(data.data.name);
        setDescription(data.data.description || '');
      } catch (e: any) {
        showErrorToast(e.message || 'Failed to fetch category details');
        navigate('/expense-categories');
      } finally {
        setLoading(false);
      }
    };
    fetchCategory();
  }, [id, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      showErrorToast('Category name is required');
      return;
    }

    setLoading(true);
    try {
      await updateExpenseCategory(id!, { name, description });
      showSuccessToast('Category updated successfully');
      navigate('/expense-categories');
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {loading && <Loader text="Updating..." />}
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Edit Category</h1>
          <p className="text-muted text-sm">Organize your expenses efficiently</p>
        </div>
        <button 
          onClick={() => navigate('/expense-categories')}
          className="text-muted hover:text-foreground flex items-center"
        >
          <span className="mr-2">❮</span> Back to list
        </button>
      </div>

      <div className="bg-surface p-8 rounded-3xl border border-line">
        <form onSubmit={handleSubmit} className="space-y-8">
          <div>
            <label className="text-xs font-bold text-subtle uppercase block mb-2">CATEGORY NAME *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </span>
              <input 
                type="text" 
                placeholder="e.g. Utilities, Maintenance, Rent"
                className="w-full bg-surface-raised border-none rounded-xl pl-12 pr-4 py-4 text-foreground focus:ring-2 focus:ring-primary"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-subtle uppercase block mb-2">DESCRIPTION</label>
            <textarea 
              rows={4}
              placeholder="Optional details about this category..."
              className="w-full bg-surface-raised border-none rounded-xl px-4 py-4 text-foreground focus:ring-2 focus:ring-primary"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <button 
              type="submit"
              className="bg-primary text-on-primary px-12 py-4 rounded-xl font-bold uppercase tracking-widest hover:bg-primary-hover transition-colors flex-1 mr-4"
            >
              UPDATE CATEGORY
            </button>
            <button 
              type="button"
              onClick={() => navigate('/expense-categories')}
              className="text-subtle font-bold hover:text-muted px-4"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditExpenseCategory;
