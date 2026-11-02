import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import Loader from '../common/Loader';
import { showSuccessToast, showErrorToast } from '../../utils/toast';
import { createExpense, getExpenseCategories } from '../../services/expenseService';
import { getWarehouses } from '../../services/warehouseService';
import { toBusinessDateInputValue } from '../../utils/date';
import { blockInvalidNumericKeys } from '../../utils/numericInput';

const CreateExpense: React.FC = () => {
  const { currencySymbol } = useCurrency();
  const [date, setDate] = useState(toBusinessDateInputValue());
  const [title, setTitle] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [details, setDetails] = useState('');
  
  const [warehouses, setWarehouses] = useState<{_id: string, name: string}[]>([]);
  const [categories, setCategories] = useState<{_id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [wData, cData] = await Promise.all([
          getWarehouses(),
          getExpenseCategories()
        ]);
        setWarehouses(wData.data);
        setCategories(cData.data);
        
        // Auto-select the first warehouse if available
        if (wData.data && wData.data.length > 0) {
          setWarehouse(wData.data[0]._id);
        }
      } catch (e) {
        showErrorToast('Failed to load warehouses or categories');
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !title || !warehouse || !category || !amount) {
      showErrorToast('Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      await createExpense({ 
        date, 
        title, 
        warehouse, 
        category, 
        amount: Number(amount), 
        details 
      });
      
      showSuccessToast('Expense created successfully');
      navigate('/expenses');
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {loading && <Loader text="Saving..." />}
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Create Expenses</h1>
        </div>
        <button 
          onClick={() => navigate('/expenses')}
          className="bg-surface-muted text-foreground px-6 py-2 rounded-lg font-semibold hover:bg-surface-muted transition-colors"
        >
          Back
        </button>
      </div>

      <div className="bg-surface p-8 rounded-3xl border border-line">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">Date *</label>
              <input 
                type="date" 
                className="w-full bg-surface-raised border-none rounded-xl px-4 py-4 text-foreground focus:ring-2 focus:ring-primary"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">Title *</label>
              <input 
                type="text" 
                placeholder="For transport cost"
                className="w-full bg-surface-raised border-none rounded-xl px-4 py-4 text-foreground focus:ring-2 focus:ring-primary"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">Warehouse *</label>
              <select 
                className="w-full bg-surface-raised border-none rounded-xl px-4 py-4 text-foreground focus:ring-2 focus:ring-primary"
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
              >
                <option value="">Select a warehouse</option>
                {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">Expenses Category *</label>
              <select 
                className="w-full bg-surface-raised border-none rounded-xl px-4 py-4 text-foreground focus:ring-2 focus:ring-primary"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Select a Category</option>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">
                Amount ({currencySymbol}) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={`Enter amount in ${currencySymbol}`}
                className="w-full bg-surface-raised border-none rounded-xl px-4 py-4 text-foreground focus:ring-2 focus:ring-primary"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={blockInvalidNumericKeys}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-subtle uppercase block mb-2">Details</label>
            <textarea 
              rows={4}
              placeholder="Enter details"
              className="w-full bg-surface-raised border-none rounded-xl px-4 py-4 text-foreground focus:ring-2 focus:ring-primary"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>

          <div className="flex space-x-4 pt-4">
            <button 
              type="submit"
              className="bg-primary text-on-primary px-10 py-3 rounded-xl font-bold hover:bg-primary-hover transition-colors"
            >
              Save
            </button>
            <button 
              type="button"
              onClick={() => {
                setTitle(''); setAmount(''); setDetails(''); setWarehouse(''); setCategory('');
              }}
              className="bg-surface-muted text-foreground px-10 py-3 rounded-xl font-bold hover:bg-surface-muted transition-colors"
            >
              Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateExpense;
