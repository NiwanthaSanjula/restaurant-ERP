import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../common/Loader';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import { showSuccessToast, showErrorToast } from '../../utils/toast';
import { getExpenseCategories, deleteExpenseCategory, checkExpenseCategoryInUse } from '../../services/expenseService';
import { formatDate } from '../../utils/date.ts';

interface Category {
  _id: string;
  name: string;
  description?: string;
  createdAt: string;
}

const ViewExpenseCategories: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  
  const navigate = useNavigate();

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const data = await getExpenseCategories();
      setCategories(data.data);
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleDelete = async () => {
    if (!toDelete) return;
    setLoading(true);
    try {
      await deleteExpenseCategory(toDelete);
      showSuccessToast('Category deleted successfully');
      setToDelete(null);
      fetchCategories();
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Pre-delete guard: check if the category is still linked to expenses
  // before opening the confirmation modal (POS-162 / BUG-084).
  const handleDeleteRequest = async (id: string) => {
    setChecking(true);
    try {
      const result = await checkExpenseCategoryInUse(id);
      if (result.isInUse) {
        const hint = result.expenseTitle
          ? ` (e.g. "${result.expenseTitle}")`
          : '';
        showErrorToast(
          `Cannot delete: this category is assigned to one or more expenses${hint}. Reassign them first.`
        );
        return;
      }
      // Safe to delete — open confirmation modal
      setToDelete(id);
    } catch (e: any) {
      showErrorToast(e.message || 'Could not verify category usage. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="p-6">
      {(loading || checking) && <Loader text={checking ? 'Checking...' : 'Loading...'} />}
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expense Categories</h1>
          <p className="text-muted text-sm">Organize your expenses efficiently</p>
        </div>
        <button 
          onClick={() => navigate('/createExpenseCategory')}
          className="bg-primary text-on-primary px-6 py-2 rounded-lg font-semibold hover:bg-primary-hover transition-colors"
        >
          Create Category
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {categories.map((category) => (
          <div key={category._id} className="bg-surface p-6 rounded-2xl border border-line transition-shadow relative group">
            <div className="flex items-center space-x-4 mb-4">
              <div className="p-3 bg-surface-raised rounded-xl">
                <svg className="w-6 h-6 text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground uppercase">{category.name}</h3>
                <p className="text-xs text-subtle uppercase">{category.name}</p>
              </div>
            </div>
            
            <p className="text-sm text-muted mb-6 min-h-[40px]">{category.description || 'No description'}</p>
            
            <div className="flex items-center justify-between pt-4 border-t border-line">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-primary"></span>
                <span className="text-[10px] font-bold text-primary uppercase">Active</span>
              </div>
              <span className="text-[10px] text-subtle">{formatDate(category.createdAt)}</span>
            </div>

            <div className="absolute top-4 right-4 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => navigate(`/editExpenseCategory/${category._id}`)}
                className="p-1.5 text-primary hover:bg-primary-soft rounded-lg transition-colors"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button 
                onClick={() => handleDeleteRequest(category._id)}
                className="p-1.5 text-danger hover:bg-danger-soft rounded-lg transition-colors"
                title="Delete"
                disabled={checking}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <div className="col-span-full py-12 text-center text-subtle">
            No expense categories found.
          </div>
        )}
      </div>

      {toDelete && (
        <DeleteConfirmModal 
          onCancel={() => setToDelete(null)} 
          onConfirm={handleDelete} 
        />
      )}
    </div>
  );
};

export default ViewExpenseCategories;
