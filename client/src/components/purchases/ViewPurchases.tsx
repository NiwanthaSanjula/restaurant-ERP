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
import { formatPurchasePayment, purchasePaymentTotal } from '../../utils/purchasePayments';

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
  paid: number | null;
  due: number | null;
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
      case 'Received': return 'bg-secondary-soft text-secondary';
      case 'Pending': return 'bg-violet-soft text-violet-status';
      default: return 'bg-surface-muted text-foreground';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return 'bg-secondary-soft text-secondary';
      case 'Partial': return 'bg-warning-soft text-warning';
      case 'Unpaid': return 'bg-danger-soft text-danger';
      default: return 'bg-surface-muted text-foreground';
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

  const paginatedPurchases = purchases;

  const totalGrandTotal = purchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);
  const totalPaid = purchasePaymentTotal(purchases, 'paid');
  const totalDue = purchasePaymentTotal(purchases, 'due');

  return (
    <div className="p-8 bg-canvas min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-black text-foreground mb-2">Purchases</h1>
          <p className="text-muted font-bold">View all purchase transactions</p>
        </div>
        <div className="flex items-center gap-4">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="bg-danger text-on-danger px-6 py-3 rounded-lg hover:bg-danger-hover font-black flex items-center gap-2 transition"
            >
              <Trash2 size={20} /> Delete Multiple ({selectedIds.length})
            </button>
          )}
          <Link
            to="/createPurchase"
            className="bg-primary text-on-primary px-6 py-3 rounded-lg hover:bg-primary-hover font-black flex items-center gap-2 transition"
          >
            <Plus size={20} /> Create Purchase
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div>
          <label className="block text-sm font-black text-foreground mb-2">Search</label>
          <SearchBar onSearch={setSearchQuery} placeholder="Search purchases..." />
        </div>
        <div>
          <label className="block text-sm font-black text-foreground mb-2">Supplier</label>
          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s: any) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-black text-foreground mb-2">Warehouse</label>
          <select
            value={filterWarehouse}
            onChange={e => setFilterWarehouse(e.target.value)}
            className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
          >
            <option value="">All Warehouses</option>
            {warehouses.map((w: any) => (
              <option key={w._id} value={w._id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="date-dropdown-container relative">
          <label className="block text-sm font-black text-foreground mb-2">Select Date</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDateDropdown(!showDateDropdown)}
              className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface flex items-center justify-between text-left"
            >
              <span className={filterDate ? 'text-primary' : 'text-muted'}>
                {getDisplayDateText()}
              </span>
              <Calendar size={18} className="text-muted" />
            </button>
            {showDateDropdown && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-line rounded-lg min-w-[200px] py-2">
                <div className="before:absolute before:-top-2 before:left-6 before:w-4 before:h-4 before:bg-surface before:border-l before:border-t before:border-line before:rotate-45"></div>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('Today')}
                  className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('This Week')}
                  className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                >
                  This Week
                </button>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('Last Week')}
                  className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                >
                  Last Week
                </button>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('This Month')}
                  className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('Last Month')}
                  className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                >
                  Last Month
                </button>
                <div className="border-t border-line my-1"></div>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('Custom Range')}
                  className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                >
                  Custom Range
                </button>
                <div className="border-t border-line my-1"></div>
                <button
                  type="button"
                  onClick={() => handleDateRangeSelect('Reset')}
                  className="w-full px-4 py-2 text-center text-sm text-muted hover:bg-surface-raised font-medium"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
          {selectedDateRange === 'Custom Range' && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted mb-1">Start Date</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">End Date</label>
                <input
                  type="date"
                  value={filterDateEnd}
                  onChange={e => setFilterDateEnd(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Additional Filters */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div>
          <label className="block text-sm font-black text-foreground mb-2">Status</label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
          >
            <option value="">All Statuses</option>
            <option value="Received">Received</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-black text-foreground mb-2">Payment Status</label>
          <select
            value={filterPaymentStatus}
            onChange={e => setFilterPaymentStatus(e.target.value)}
            className="w-full px-4 py-2 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
          >
            <option value="">All Payment Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </div>
      </div>

      {/* Purchases Table */}
      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-surface-muted text-muted text-[10px] uppercase tracking-[0.2em] font-black">
            <tr>
              <th className="p-6">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-line-strong text-foreground focus:ring-primary focus:ring-2 cursor-pointer accent-primary"
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
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={12} className="p-6 text-center text-muted">Loading...</td>
              </tr>
            ) : paginatedPurchases.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-6 text-center text-muted italic">No purchases found</td>
              </tr>
            ) : (
              paginatedPurchases.map((purchase) => (
                <tr key={purchase._id} className="hover:bg-surface-raised/50 transition-colors">
                  <td className="p-6">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-line-strong text-foreground focus:ring-primary focus:ring-2 cursor-pointer accent-primary"
                      checked={selectedIds.includes(purchase._id)}
                      onChange={() => handleSelectItem(purchase._id)}
                    />
                  </td>
                  <td className="p-6">
                    <span className="font-bold text-primary bg-surface-muted px-3 py-1 rounded">
                      {purchase.purchaseId || purchase._id}
                    </span>
                  </td>
                  <td className="p-6 font-semibold text-foreground">
                    {purchase.supplierId?.name || 'N/A'}
                  </td>
                  <td className="p-6 font-semibold text-foreground">
                    {purchase.warehouseId?.name || 'N/A'}
                  </td>
                  <td className="p-6 text-center">
                    <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(purchase.purchaseStatus)}`}>
                      {purchase.purchaseStatus}
                    </span>
                  </td>
                  <td className="p-6 text-right font-black text-foreground">
                    {currencyCode} {(purchase.grandTotal || 0).toLocaleString()}
                  </td>
                  <td className="p-6 text-right font-black text-foreground">
                    {formatPurchasePayment(purchase.paid, currencyCode)}
                  </td>
                  <td className="p-6 text-right font-black text-foreground">
                    {formatPurchasePayment(purchase.due, currencyCode)}
                  </td>
                  <td className="p-6 text-center">
                    <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full ${getPaymentStatusColor(purchase.paymentStatus)}`}>
                      {purchase.paymentStatus}
                    </span>
                  </td>
                  <td className="p-6 text-muted font-medium">
                    {purchase.paymentMethod || '—'}
                  </td>
                  <td className="p-6 text-muted font-medium">
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
                          className="p-2 rounded-lg text-primary hover:bg-surface-muted font-bold transition"
                          title="Actions"
                        >
                          <MoreVertical size={20} />
                        </button>
                        {openActionId === purchase._id && (
                          <div className="absolute right-0 top-full mt-1 z-30 min-w-[200px] bg-surface border border-line rounded-lg py-1">
                            <button
                              type="button"
                              onClick={() => { fetchPurchaseDetails(purchase._id); setOpenActionId(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                            >
                              <Eye size={16} /> View Details
                            </button>
                            <button
                              type="button"
                              onClick={() => { navigate(`/editPurchase/${purchase._id}`); setOpenActionId(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit Purchase
                            </button>
                            <button
                              type="button"
                              onClick={() => { navigate(`/createPurchaseReturn?purchaseId=${purchase._id}`); setOpenActionId(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                            >
                              <RotateCcw size={16} /> Return to Supplier
                            </button>
                            <button
                              type="button"
                              onClick={() => { setToDelete(purchase._id); setOpenActionId(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-danger hover:bg-danger-soft"
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
            <tfoot className="bg-surface-raised border-t-2 border-line">
              <tr>
                <td colSpan={5} className="p-6 font-black text-foreground">Page total</td>
                <td className="p-6 text-right font-black text-foreground">
                  {currencyCode} {totalGrandTotal.toLocaleString()}
                </td>
                <td className="p-6 text-right font-black text-foreground">
                  {formatPurchasePayment(totalPaid, currencyCode)}
                </td>
                <td className="p-6 text-right font-black text-foreground">
                  {formatPurchasePayment(totalDue, currencyCode)}
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
            <span className="text-sm text-muted font-bold">Records per page:</span>
            <select
              value={pagination.limit}
              onChange={e => setPagination(prev => ({ ...prev, limit: Number(e.target.value), page: 1 }))}
              className="px-3 py-1 border border-line rounded-lg focus:outline-none focus:border-primary"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted font-bold">
              {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
              disabled={pagination.page === 1}
              className="px-3 py-1 border border-line rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-raised"
            >
              K
            </button>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
              className="px-3 py-1 border border-line rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-raised"
            >
              &lt;
            </button>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page * pagination.limit >= pagination.total}
              className="px-3 py-1 border border-line rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-raised"
            >
              &gt;
            </button>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: Math.ceil(pagination.total / pagination.limit) }))}
              disabled={pagination.page * pagination.limit >= pagination.total}
              className="px-3 py-1 border border-line rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-raised"
            >
              &gt;|
            </button>
          </div>
        </div>
      )}

      {/* View Purchase Details Modal */}
      {viewingPurchase && (
        <div className="fixed inset-0 bg-overlay flex items-start justify-center z-50 p-4 overflow-y-auto pt-8">
          <div className="bg-surface rounded-2xl shadow-elevated max-w-2xl w-full p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-foreground">Purchase Details</h3>
              <button onClick={() => setViewingPurchase(null)} className="text-muted hover:text-primary">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest">Purchase ID</p>
                  <p className="text-lg font-black text-foreground">{viewingPurchase.purchaseId}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest">Date</p>
                  <p className="text-lg font-black text-foreground">
                    {formatDate(viewingPurchase.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest">Supplier</p>
                  <p className="text-lg font-black text-foreground">{viewingPurchase.supplierId?.name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest">Warehouse</p>
                  <p className="text-lg font-black text-foreground">{viewingPurchase.warehouseId?.name || 'N/A'}</p>
                </div>
              </div>
              <div className="mt-6">
                <p className="text-xs font-black text-muted uppercase tracking-widest mb-4">Items</p>
                <div className="space-y-2">
                  {viewingPurchase.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center bg-surface-raised p-3 rounded-lg">
                      <div>
                        <p className="font-bold text-foreground">{item.productName || `Item ${idx + 1}`}</p>
                        {item.productCode && (
                          <p className="text-xs text-muted">Code: {item.productCode}</p>
                        )}
                        <p className="text-xs text-muted">Qty: {item.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{currencyCode} {(item.subTotal || 0).toLocaleString()}</p>
                        <p className="text-xs text-muted">@ {currencyCode} {(item.cost || 0).toLocaleString()}</p>
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
