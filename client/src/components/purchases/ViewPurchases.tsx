import axios from 'axios';
import { Calendar, Eye, MoreVertical, Plus, RotateCcw, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { toBusinessDateInputValue } from '../../utils/date';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import SearchBar from '../common/SearchBar';
import { formatDate } from '../../utils/date.ts';

interface PurchaseRow {
  _id: string;
  purchaseId: string;
  supplierId: {
    _id: string;
    name: string;
  };
  warehouseId: {
    _id: string;
    name: string;
  };
  grandTotal: number;
  paid: number;
  due: number;
  paymentStatus: 'Paid' | 'Partial' | 'Unpaid';
  paymentMethod?: string;
  purchaseStatus: 'Received' | 'Pending';
  purchaseDate?: string;
  items: Array<{
    productId: string;
    quantity: number;
    cost: number;
    subTotal: number;
    productName?: string;
    productCode?: string;
  }>;
  createdAt: string;
}

const ViewPurchases: React.FC = () => {
  const { currencyCode } = useCurrency();
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<string>('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ _id: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  const getAuthToken = () =>
    localStorage.getItem('token') ||
    localStorage.getItem('accessToken') ||
    sessionStorage.getItem('token');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset to first page when search or filters change (so reference filter shows from start)
  useEffect(() => {
    setPagination(prev => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, [debouncedSearchQuery, filterDate, filterDateEnd, filterSupplier, filterWarehouse, filterStatus, filterPaymentStatus]);

  useEffect(() => {
    fetchPurchases();
    fetchSuppliers();
    fetchWarehouses();
  }, [debouncedSearchQuery, filterDate, filterDateEnd, filterSupplier, filterWarehouse, filterStatus, filterPaymentStatus, pagination.page]);

  // Handle click outside to close date dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showDateDropdown && !target.closest('.date-dropdown-container')) {
        setShowDateDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDateDropdown]);

  // Handle click outside to close action menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openActionId && actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openActionId]);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const params: any = {
        page: pagination.page,
        limit: pagination.limit
      };
      if (debouncedSearchQuery) params.q = debouncedSearchQuery;
      if (filterDate) params.startDate = filterDate;
      if (filterDateEnd) params.endDate = filterDateEnd;
      if (filterSupplier) params.supplierId = filterSupplier;
      if (filterWarehouse) params.warehouseId = filterWarehouse;
      if (filterStatus) params.purchaseStatus = filterStatus;
      if (filterPaymentStatus) params.paymentStatus = filterPaymentStatus;

      const res = await axios.get(`${api}/purchases`, {
        params,
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = res.data;
      
      if (data.status === 'success') {
        setPurchases(data.data || []);
        setPagination(prev => ({ 
          ...prev, 
          total: data.pagination?.total || (data.data || []).length 
        }));
        // Clear selected items when data changes
        setSelectedIds([]);
      }
    } catch (e) {
      console.error('Failed to fetch purchases:', e);
      showErrorToast('Failed to load purchases');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const token = getAuthToken();
      const res = await axios.get(`${api}/suppliers`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.data?.data) {
        setSuppliers(res.data.data);
      }
    } catch (e) {
      console.error('Failed to fetch suppliers:', e);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const token = getAuthToken();
      const res = await axios.get(`${api}/warehouses`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.data?.data) {
        setWarehouses(res.data.data);
      }
    } catch (e) {
      console.error('Failed to fetch warehouses:', e);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      const token = getAuthToken();
      await axios.delete(`${api}/purchases/${toDelete}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      showSuccessToast('Purchase deleted successfully');
      setToDelete(null);
      fetchPurchases();
    } catch (e: any) {
      showErrorToast(e.response?.data?.message || 'Failed to delete purchase');
    }
  };

  const handleSelectItem = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const fetchPurchaseDetails = async (purchaseId: string) => {
    try {
      const token = getAuthToken();
      const res = await axios.get(`${api}/purchases/${purchaseId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = res.data;
      
      if (data.status === 'success' && data.data) {
        setViewingPurchase(data.data);
      } else {
        showErrorToast(data?.message || 'Failed to load purchase details');
      }
    } catch (e: any) {
      console.error('Failed to fetch purchase details:', e);
      showErrorToast(e.response?.data?.message || 'Failed to load purchase details');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedPurchases.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedPurchases.map(p => p._id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      const token = getAuthToken();
      // Delete multiple purchases
      await Promise.all(
        selectedIds.map(id =>
          axios.delete(`${api}/purchases/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        )
      );
      showSuccessToast(`${selectedIds.length} purchase(s) deleted successfully`);
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
      fetchPurchases();
    } catch (e: any) {
      showErrorToast(e.response?.data?.message || 'Failed to delete purchases');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Received': return 'bg-green-100 text-green-800';
      case 'Pending': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return 'bg-green-100 text-green-800';
      case 'Partial': return 'bg-yellow-100 text-yellow-800';
      case 'Unpaid': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDateRangeSelect = (range: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate = '';
    let endDate = '';

    switch (range) {
      case 'Today':
        startDate = toBusinessDateInputValue(today);
        endDate = toBusinessDateInputValue(today);
        break;
      case 'This Week':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startDate = toBusinessDateInputValue(startOfWeek);
        endDate = toBusinessDateInputValue(today);
        break;
      case 'Last Week':
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        startDate = toBusinessDateInputValue(lastWeekStart);
        endDate = toBusinessDateInputValue(lastWeekEnd);
        break;
      case 'This Month':
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        startDate = toBusinessDateInputValue(startOfMonth);
        endDate = toBusinessDateInputValue(today);
        break;
      case 'Last Month':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        startDate = toBusinessDateInputValue(lastMonthStart);
        endDate = toBusinessDateInputValue(lastMonthEnd);
        break;
      case 'Custom Range':
        // Set selectedDateRange to show custom inputs, but don't set dates yet
        setSelectedDateRange('Custom Range');
        setShowDateDropdown(false);
        return;
      case 'Reset':
        setFilterDate('');
        setFilterDateEnd('');
        setSelectedDateRange('');
        setShowDateDropdown(false);
        return;
      default:
        return;
    }

    setFilterDate(startDate);
    setFilterDateEnd(endDate);
    setSelectedDateRange(range);
    setShowDateDropdown(false);
  };

  const getDisplayDateText = () => {
    if (!filterDate) return 'Select Date';
    if (filterDateEnd && filterDateEnd !== filterDate) {
      return `${filterDate} to ${filterDateEnd}`;
    }
    return filterDate;
  };

  const paginatedPurchases = purchases.slice(
    (pagination.page - 1) * pagination.limit,
    pagination.page * pagination.limit
  );

  const totalGrandTotal = purchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);
  const totalPaid = purchases.reduce((sum, p) => sum + (p.paid || 0), 0);
  const totalDue = purchases.reduce((sum, p) => sum + (p.due || 0), 0);

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-black text-[#1A3E73] mb-2">Purchases</h1>
          <p className="text-[#64748B] font-bold">View all purchase transactions</p>
        </div>
        <div className="flex items-center gap-4">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 font-black flex items-center gap-2 transition"
            >
              <Trash2 size={20} /> Delete Multiple ({selectedIds.length})
            </button>
          )}
          <Link
            to="/createPurchase"
            className="bg-[#1A3E73] text-white px-6 py-3 rounded-lg hover:bg-[#0F2A55] font-black flex items-center gap-2 transition"
          >
            <Plus size={20} /> Create Purchase
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div>
          <label className="block text-sm font-black text-[#1A3E73] mb-2">Search</label>
          <SearchBar onSearch={setSearchQuery} placeholder="Search purchases..." />
        </div>
        <div>
          <label className="block text-sm font-black text-[#1A3E73] mb-2">Supplier</label>
          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s: any) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-black text-[#1A3E73] mb-2">Warehouse</label>
          <select
            value={filterWarehouse}
            onChange={e => setFilterWarehouse(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
          >
            <option value="">All Warehouses</option>
            {warehouses.map((w: any) => (
              <option key={w._id} value={w._id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="date-dropdown-container relative">
          <label className="block text-sm font-black text-[#1A3E73] mb-2">Select Date</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDateDropdown(!showDateDropdown)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white flex items-center justify-between text-left"
            >
              <span className={filterDate ? 'text-[#1A3E73]' : 'text-[#64748B]'}>
                {getDisplayDateText()}
              </span>
              <Calendar size={18} className="text-[#64748B]" />
            </button>
            {showDateDropdown && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[200px] py-2">
                <div className="before:absolute before:-top-2 before:left-6 before:w-4 before:h-4 before:bg-white before:border-l before:border-t before:border-slate-200 before:rotate-45"></div>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('Today')}
                  className="w-full px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('This Week')}
                  className="w-full px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50"
                >
                  This Week
                </button>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('Last Week')}
                  className="w-full px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50"
                >
                  Last Week
                </button>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('This Month')}
                  className="w-full px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('Last Month')}
                  className="w-full px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50"
                >
                  Last Month
                </button>
                <div className="border-t border-slate-200 my-1"></div>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('Custom Range')}
                  className="w-full px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50"
                >
                  Custom Range
                </button>
                <div className="border-t border-slate-200 my-1"></div>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('Reset')}
                  className="w-full px-4 py-2 text-center text-sm text-[#64748B] hover:bg-slate-50 font-medium"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
          {selectedDateRange === 'Custom Range' && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[#64748B] mb-1">Start Date</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748B] mb-1">End Date</label>
                <input
                  type="date"
                  value={filterDateEnd}
                  onChange={e => setFilterDateEnd(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Additional Filters */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div>
          <label className="block text-sm font-black text-[#1A3E73] mb-2">Status</label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
          >
            <option value="">All Statuses</option>
            <option value="Received">Received</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-black text-[#1A3E73] mb-2">Payment Status</label>
          <select
            value={filterPaymentStatus}
            onChange={e => setFilterPaymentStatus(e.target.value)}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
          >
            <option value="">All Payment Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-white rounded-[28px] shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#F1F5F9] text-[#64748B] text-[10px] uppercase tracking-[0.2em] font-black">
            <tr>
              <th className="p-6">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-[#1A3E73] focus:ring-[#1A3E73] focus:ring-2 cursor-pointer accent-[#1A3E73]"
                  checked={paginatedPurchases.length > 0 && selectedIds.length === paginatedPurchases.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-6">Reference</th>
              <th className="p-6">Supplier</th>
              <th className="p-6">Warehouse</th>
              <th className="p-6 text-center">Status</th>
              <th className="p-6 text-right">Grand Total</th>
              <th className="p-6 text-right">Paid</th>
              <th className="p-6 text-right">Due</th>
              <th className="p-6 text-center">Payment Status</th>
              <th className="p-6">Payment Type</th>
              <th className="p-6">Created On</th>
              <th className="p-6 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr>
                <td colSpan={12} className="p-6 text-center text-[#64748B]">Loading...</td>
              </tr>
            ) : paginatedPurchases.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-6 text-center text-[#64748B] italic">No purchases found</td>
              </tr>
            ) : (
              paginatedPurchases.map((purchase) => (
                <tr key={purchase._id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-6">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-[#1A3E73] focus:ring-[#1A3E73] focus:ring-2 cursor-pointer accent-[#1A3E73]"
                      checked={selectedIds.includes(purchase._id)}
                      onChange={() => handleSelectItem(purchase._id)}
                    />
                  </td>
                  <td className="p-6">
                    <span className="font-bold text-[#55AAFF] bg-[#E0F2FE] px-3 py-1 rounded">
                      {purchase.purchaseId || purchase._id}
                    </span>
                  </td>
                  <td className="p-6 font-semibold text-[#1A3E73]">
                    {purchase.supplierId?.name || 'N/A'}
                  </td>
                  <td className="p-6 font-semibold text-[#1A3E73]">
                    {purchase.warehouseId?.name || 'N/A'}
                  </td>
                  <td className="p-6 text-center">
                    <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(purchase.purchaseStatus)}`}>
                      {purchase.purchaseStatus}
                    </span>
                  </td>
                  <td className="p-6 text-right font-black text-[#0B2C5D]">
                    {currencyCode} {(purchase.grandTotal || 0).toLocaleString()}
                  </td>
                  <td className="p-6 text-right font-black text-[#0B2C5D]">
                    {currencyCode} {(purchase.paid || 0).toLocaleString()}
                  </td>
                  <td className="p-6 text-right font-black text-[#0B2C5D]">
                    {currencyCode} {(purchase.due || 0).toLocaleString()}
                  </td>
                  <td className="p-6 text-center">
                    <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full ${getPaymentStatusColor(purchase.paymentStatus)}`}>
                      {purchase.paymentStatus}
                    </span>
                  </td>
                  <td className="p-6 text-[#64748B] font-medium">
                    {purchase.paymentMethod || '—'}
                  </td>
                  <td className="p-6 text-[#64748B] font-medium">
                    {new Date(purchase.createdAt).toLocaleString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit'
                    })}
                  </td>
                  <td className="p-6 text-center">
                    <div className="flex items-center justify-center">
                      <div
                        className="relative inline-block"
                        ref={openActionId === purchase._id ? actionMenuRef : null}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenActionId(prev => prev === purchase._id ? null : purchase._id)}
                          className="p-2 rounded-lg text-[#1A3E73] hover:bg-slate-100 font-bold transition"
                          title="Actions"
                        >
                          <MoreVertical size={20} />
                        </button>
                        {openActionId === purchase._id && (
                          <div className="absolute right-0 top-full mt-1 z-30 min-w-[200px] bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                            <button
                              type="button"
                              onClick={() => { fetchPurchaseDetails(purchase._id); setOpenActionId(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50"
                            >
                              <Eye size={16} /> View Details
                            </button>
                            <button
                              type="button"
                              onClick={() => { navigate(`/editPurchase/${purchase._id}`); setOpenActionId(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit Purchase
                            </button>
                            <button
                              type="button"
                              onClick={() => { navigate(`/createPurchaseReturn?purchaseId=${purchase._id}`); setOpenActionId(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50"
                            >
                              <RotateCcw size={16} /> Return to Supplier
                            </button>
                            <button
                              type="button"
                              onClick={() => { setToDelete(purchase._id); setOpenActionId(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={16} /> Delete Purchase
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {paginatedPurchases.length > 0 && (
            <tfoot className="bg-[#F8FAFC] border-t-2 border-slate-200">
              <tr>
                <td colSpan={5} className="p-6 font-black text-[#1A3E73]">Total</td>
                <td className="p-6 text-right font-black text-[#0B2C5D]">
                  {currencyCode} {totalGrandTotal.toLocaleString()}
                </td>
                <td className="p-6 text-right font-black text-[#0B2C5D]">
                  {currencyCode} {totalPaid.toLocaleString()}
                </td>
                <td className="p-6 text-right font-black text-[#0B2C5D]">
                  {currencyCode} {totalDue.toLocaleString()}
                </td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      {purchases.length > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#64748B] font-bold">Records per page:</span>
            <select
              value={pagination.limit}
              onChange={e => setPagination(prev => ({ ...prev, limit: Number(e.target.value), page: 1 }))}
              className="px-3 py-1 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73]"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#64748B] font-bold">
              {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
              disabled={pagination.page === 1}
              className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              K
            </button>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
              className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              &lt;
            </button>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page * pagination.limit >= pagination.total}
              className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              &gt;
            </button>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: Math.ceil(pagination.total / pagination.limit) }))}
              disabled={pagination.page * pagination.limit >= pagination.total}
              className="px-3 py-1 border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              &gt;|
            </button>
          </div>
        </div>
      )}

      {/* View Purchase Details Modal */}
      {viewingPurchase && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto pt-8">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-2xl w-full p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-[#1A3E73]">Purchase Details</h3>
              <button onClick={() => setViewingPurchase(null)} className="text-[#64748B] hover:text-[#1A3E73]">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Purchase ID</p>
                  <p className="text-lg font-black text-[#1A3E73]">{viewingPurchase.purchaseId}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Date</p>
                  <p className="text-lg font-black text-[#1A3E73]">
                    {formatDate(viewingPurchase.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Supplier</p>
                  <p className="text-lg font-black text-[#1A3E73]">{viewingPurchase.supplierId?.name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Warehouse</p>
                  <p className="text-lg font-black text-[#1A3E73]">{viewingPurchase.warehouseId?.name || 'N/A'}</p>
                </div>
              </div>
              <div className="mt-6">
                <p className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-4">Items</p>
                <div className="space-y-2">
                  {viewingPurchase.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center bg-[#F8FAFC] p-3 rounded-lg">
                      <div>
                        <p className="font-bold text-[#1A3E73]">{item.productName || `Item ${idx + 1}`}</p>
                        {item.productCode && (
                          <p className="text-xs text-[#64748B]">Code: {item.productCode}</p>
                        )}
                        <p className="text-xs text-[#64748B]">Qty: {item.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[#3B82F6]">{currencyCode} {(item.subTotal || 0).toLocaleString()}</p>
                        <p className="text-xs text-[#64748B]">@ {currencyCode} {(item.cost || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <DeleteConfirmModal
          onCancel={() => setToDelete(null)}
          onConfirm={handleDelete}
          title="Delete Purchase"
          message="Are you sure you want to delete this purchase? This action cannot be undone."
        />
      )}

      {showBulkDeleteConfirm && (
        <DeleteConfirmModal
          onCancel={() => setShowBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title="Delete Multiple Purchases"
          message={`Are you sure you want to delete ${selectedIds.length} selected purchase(s)? This action cannot be undone.`}
        />
      )}
    </div>
  );
};

export default ViewPurchases;
