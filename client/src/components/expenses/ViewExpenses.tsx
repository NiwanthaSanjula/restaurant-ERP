import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { deleteExpense, getExpenseCategories, getExpenses } from '../../services/expenseService';
import { getWarehouses } from '../../services/warehouseService';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import { formatDate } from '../../utils/date.ts';

interface Expense {
  _id: string;
  date: string;
  title: string;
  warehouse: { _id: string, name: string };
  category: { _id: string, name: string };
  amount: number;
  details?: string;
  reference: string;
}

interface Summary {
  totalExpenses: number;
  categoryBreakdown: Record<string, { amount: number, transactions: number }>;
}

const ViewExpenses: React.FC = () => {
  const { currencySymbol } = useCurrency();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<{_id: string, name: string}[]>([]);
  const [categories, setCategories] = useState<{_id: string, name: string}[]>([]);

  // Filters
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getExpenses({ 
        q, 
        category, 
        warehouse, 
        minAmount, 
        maxAmount, 
        startDate, 
        endDate 
      });
      
      setExpenses(data.data);
      setSummary(data.summary);
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, category, warehouse, minAmount, maxAmount, startDate, endDate]);

  const fetchFilters = useCallback(async () => {
    try {
      const [wData, cData] = await Promise.all([
        getWarehouses(),
        getExpenseCategories()
      ]);
      setWarehouses(wData.data);
      setCategories(cData.data);
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    if (!toDelete) return;
    setLoading(true);
    try {
      await deleteExpense(toDelete);
      showSuccessToast('Expense deleted successfully');
      setToDelete(null);
      fetchData();
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setQ('');
    setCategory('');
    setWarehouse('');
    setMinAmount('');
    setMaxAmount('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="p-6">
      {loading && <Loader text="Loading..." />}
      
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
            <p className="text-muted text-sm">Track and manage your business expenditures</p>
          </div>
          <button 
            onClick={() => navigate('/createExpense')}
            className="bg-primary text-on-primary px-6 py-2 rounded-lg font-semibold hover:bg-primary-hover transition-colors"
          >
            + Add New Expense
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-primary text-on-primary p-6 rounded-2xl col-span-1">
            <p className="text-sm opacity-80 mb-2">Total Expenses</p>
            <h2 className="text-3xl font-bold mb-4">{currencySymbol} {summary?.totalExpenses.toLocaleString() || '0.00'}</h2>
            <p className="text-xs opacity-60">Based on current filters</p>
          </div>
          
          <div className="md:col-span-3 bg-surface p-6 rounded-2xl border border-line">
            <h3 className="text-xs font-bold text-subtle uppercase tracking-wider mb-4">CATEGORY BREAKDOWN</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 overflow-x-auto">
              {summary && Object.entries(summary.categoryBreakdown).map(([name, data]) => (
                <div key={name} className="border-r last:border-0 pr-4">
                  <p className="text-[10px] text-subtle uppercase font-bold">{name}</p>
                  <p className="text-lg font-bold text-foreground">{currencySymbol} {data.amount.toLocaleString()}</p>
                  <p className="text-[10px] text-primary font-semibold">{data.transactions} Transactions</p>
                </div>
              ))}
              {(!summary || !summary.categoryBreakdown || Object.keys(summary.categoryBreakdown).length === 0) && (
                <p className="text-sm text-subtle">No data available</p>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-surface p-6 rounded-2xl border border-line mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">SEARCH</label>
              <input 
                type="text" 
                placeholder="Ref, Title..." 
                className="w-full bg-surface-raised border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">CATEGORY</label>
              <select 
                className="w-full bg-surface-raised border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">WAREHOUSE</label>
              <select 
                className="w-full bg-surface-raised border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary"
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
              >
                <option value="">All Warehouses</option>
                {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button 
                onClick={clearFilters}
                className="w-full bg-danger-soft text-danger py-2 rounded-lg font-semibold hover:bg-danger-soft transition-colors text-sm"
              >
                Clear All Filters
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">MIN AMOUNT</label>
              <input 
                type="number" 
                placeholder="0.00" 
                className="w-full bg-surface-raised border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">MAX AMOUNT</label>
              <input 
                type="number" 
                placeholder="999999" 
                className="w-full bg-surface-raised border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">START DATE</label>
              <input 
                type="date" 
                className="w-full bg-surface-raised border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-subtle uppercase block mb-2">END DATE</label>
              <input 
                type="date" 
                className="w-full bg-surface-raised border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Expenses Table */}
        <div className="bg-surface rounded-2xl border border-line overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-surface-raised border-b border-line">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-subtle uppercase">REFERENCE</th>
                <th className="px-6 py-4 text-[10px] font-bold text-subtle uppercase">EXPENSE DETAILS</th>
                <th className="px-6 py-4 text-[10px] font-bold text-subtle uppercase">WAREHOUSE</th>
                <th className="px-6 py-4 text-[10px] font-bold text-subtle uppercase">CATEGORY</th>
                <th className="px-6 py-4 text-[10px] font-bold text-subtle uppercase">AMOUNT</th>
                <th className="px-6 py-4 text-[10px] font-bold text-subtle uppercase text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {expenses.map((expense) => (
                <tr key={expense._id} className="hover:bg-surface-raised transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="bg-danger-soft text-danger px-2 py-1 rounded text-[10px] font-bold">
                      {expense.reference}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-foreground uppercase">{expense.title}</div>
                    <div className="text-[10px] text-subtle">{formatDate(expense.date)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-muted">{expense.warehouse?.name || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-primary-soft text-primary px-3 py-1 rounded text-[10px] font-bold uppercase">
                      {expense.category?.name || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-foreground">{currencySymbol} {expense.amount.toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <button 
                        onClick={() => navigate(`/editExpense/${expense._id}`)}
                        className="text-primary hover:bg-primary-soft p-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button 
                        onClick={() => setToDelete(expense._id)}
                        className="text-danger hover:bg-danger-soft p-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-subtle">
                    No expenses found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

export default ViewExpenses;
