import { Edit2, Eye, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import { formatDate } from '../../utils/date';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import SearchBar from '../common/SearchBar';

interface AdjustmentRow {
  id: string;
  adjustmentId: string;
  referenceNumber?: string;
  warehouseName: string;
  adjustmentDate: string;
  adjustmentType: 'Increase' | 'Decrease';
  reason: string;
  status: string;
  itemCount: number;
  grandTotal: number;
  createdAt: string;
}

interface AdjustmentItem {
  productName: string;
  currentStock: number;
  adjustmentQuantity?: number;
  quantity?: number;
  newStock: number;
  productCost?: number;
  cost?: number;
  subTotal: number;
}

interface AdjustmentDetails {
  _id: string;
  adjustmentId: string;
  warehouseId: string;
  warehouseName: string;
  adjustmentDate: string;
  adjustmentType: 'Increase' | 'Decrease';
  reason: string;
  notes?: string;
  referenceNumber?: string;
  items: AdjustmentItem[];
  grandTotal?: number;
  totalAdjustmentValue?: number;
  status: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

const ViewAdjustments: React.FC = () => {
  const { currencyCode } = useCurrency();
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [viewingAdjustment, setViewingAdjustment] = useState<AdjustmentDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Increase' | 'Decrease'>('All');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const prevLocationKeyRef = useRef<string | undefined>(undefined);

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  // Fetch adjustments
  const fetchAdjustments = async (searchQuery: string = '') => {
    const token = localStorage.getItem('token');
    if (!token) {
      showErrorToast('Session expired. Please log in again.');
      return;
    }
    setLoading(true);
    try {
      let url = `${api}/adjustments`;

      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (filterType !== 'All') params.append('adjustmentType', filterType);
      if (filterWarehouse) params.append('warehouseId', filterWarehouse);
      if (filterStatus) params.append('status', filterStatus);
      if (filterStartDate) params.append('startDate', filterStartDate);
      if (filterEndDate) params.append('endDate', filterEndDate);

      if (params.toString()) {
        url += '?' + params.toString();
      }

      // Add cache-busting timestamp to ensure fresh data
      const urlWithCacheBust = url.includes('?') 
        ? `${url}&_t=${Date.now()}` 
        : `${url}?_t=${Date.now()}`;
      
      const res = await fetch(urlWithCacheBust, {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-cache'
      });
      const data = await res.json();

      if (!res.ok) {
        // If API fails, try localStorage
        const saved = localStorage.getItem('previousAdjustments');
        if (saved) {
          const rows: AdjustmentRow[] = JSON.parse(saved).map((a: any) => ({
            id: a._id,
            adjustmentId: a.adjustmentId,
            referenceNumber: a.referenceNumber,
            warehouseName: a.warehouseName,
            adjustmentDate: a.adjustmentDate,
            adjustmentType: a.adjustmentType,
            reason: a.reason,
            status: a.status,
            itemCount: a.items?.length || 0,
            grandTotal: a.totalAdjustmentValue ?? a.grandTotal ?? 0,
            createdAt: a.createdAt
          }));
          setAdjustments(rows);
        }
        return;
      }

      const rows: AdjustmentRow[] = (data.data || []).map((a: any) => ({
        id: a._id,
        adjustmentId: a.adjustmentId,
        referenceNumber: a.referenceNumber,
        warehouseName: a.warehouseName,
        adjustmentDate: a.adjustmentDate,
        adjustmentType: a.adjustmentType,
        reason: a.reason,
        status: a.status || 'Completed',
        itemCount: a.items?.length || 0,
        grandTotal: a.totalAdjustmentValue ?? a.grandTotal ?? 0,
        createdAt: a.createdAt
      }));
      setAdjustments(rows);
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Fetch warehouses for filter
  const fetchWarehouses = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/warehouses`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok) {
        setWarehouses(data.data || []);
      }
    } catch (e) {
      console.error('Error fetching warehouses:', e);
    }
  };

  // Load adjustment details
  const loadDetails = async (id: string) => {
    setLoadingDetails(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/adjustments/${id}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        // Try localStorage
        const saved = localStorage.getItem('previousAdjustments');
        if (saved) {
          const found = JSON.parse(saved).find((a: any) => a._id === id);
          if (found) {
            setViewingAdjustment(found);
            return;
          }
        }
        showErrorToast('Adjustment not found');
        return;
      }

      const data = await res.json();
      const raw = data.data;
      setViewingAdjustment(raw ? { ...raw, grandTotal: raw.totalAdjustmentValue ?? raw.grandTotal ?? 0 } : null);
    } catch (e) {
      showErrorToast('Error loading adjustment details');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Debounce search query updates
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Initial load and when filters change
  useEffect(() => {
    fetchAdjustments(debouncedSearchQuery);
    fetchWarehouses();
  }, [debouncedSearchQuery, filterType, filterWarehouse, filterStatus, filterStartDate, filterEndDate]);

  // Refresh data when navigating back to this page (e.g., after editing)
  // Watch for refresh query parameter in location.search (more reliable than searchParams)
  useEffect(() => {
    if (location.pathname === '/viewAdjustments') {
      const hasRefreshParam = location.search.includes('refresh=');
      
      if (hasRefreshParam) {
        // Refresh the data immediately
        fetchAdjustments(debouncedSearchQuery);
        
        // Remove the refresh query parameter to clean up the URL
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete('refresh');
        setSearchParams(newSearchParams, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.pathname]);

  // Also refresh when location.key changes (indicates navigation occurred)
  // This is a backup mechanism that always refreshes on navigation
  useEffect(() => {
    if (location.pathname === '/viewAdjustments') {
      // Check if location.key changed (indicates navigation occurred)
      const locationKeyChanged = prevLocationKeyRef.current !== undefined && 
                                 prevLocationKeyRef.current !== location.key;
      
      if (locationKeyChanged) {
        // Always refresh when navigating to this page (with a small delay to ensure navigation is complete)
        const timer = setTimeout(() => {
          fetchAdjustments(searchQuery);
        }, 300);
        
        return () => clearTimeout(timer);
      }
      
      // Update the ref to track the current location key
      prevLocationKeyRef.current = location.key;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.pathname]);

  // Also refresh when window regains focus (user might have edited in another tab/window)
  useEffect(() => {
    const handleFocus = () => {
      if (location.pathname === '/viewAdjustments') {
        fetchAdjustments(searchQuery);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && location.pathname === '/viewAdjustments') {
        fetchAdjustments(searchQuery);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const token = localStorage.getItem('token');
    if (!token) {
      showErrorToast('Session expired. Please log in again.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${api}/adjustments/${toDelete}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok) {
        showErrorToast(data?.message || 'Failed to delete adjustment');
        setLoading(false);
        return;
      }

      // Update localStorage
      const saved = localStorage.getItem('previousAdjustments');
      if (saved) {
        const updated = JSON.parse(saved).filter((a: any) => a._id !== toDelete);
        localStorage.setItem('previousAdjustments', JSON.stringify(updated));
      }

      setAdjustments(adjustments.filter(a => a.id !== toDelete));
      showSuccessToast('Adjustment deleted successfully');
      setToDelete(null);
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loadingDetails) return <Loader />;

  if (viewingAdjustment) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto pt-8">
        <div className="bg-white rounded-[32px] shadow-2xl max-w-4xl w-full p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black text-[#1A3E73]">Adjustment Details</h2>
            <button
              onClick={() => setViewingAdjustment(null)}
              className="text-[#64748B] hover:text-[#1A3E73]"
            >
              <X size={24} />
            </button>
          </div>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-6 bg-[#F8FAFC] p-6 rounded-xl border border-slate-200">
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase mb-2">Adjustment ID</p>
                <p className="text-lg font-bold text-[#1A3E73]">{viewingAdjustment.referenceNumber?.trim() || viewingAdjustment.adjustmentId}</p>
              </div>
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase mb-2">Date</p>
                <p className="text-lg font-bold text-[#1A3E73]">{formatDate(viewingAdjustment.adjustmentDate)}</p>
              </div>
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase mb-2">Type</p>
                <p className={`text-lg font-bold ${viewingAdjustment.adjustmentType === 'Increase' ? 'text-green-600' : 'text-red-600'}`}>
                  {viewingAdjustment.adjustmentType === 'Increase' ? '↑ Increase' : '↓ Decrease'}
                </p>
              </div>
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase mb-2">Warehouse</p>
                <p className="text-lg font-bold text-[#1A3E73]">{viewingAdjustment.warehouseName}</p>
              </div>
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase mb-2">Reason</p>
                <p className="text-lg font-bold text-[#1A3E73]">{viewingAdjustment.reason}</p>
              </div>
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase mb-2">Status</p>
                <p className="text-lg font-bold text-green-600">{viewingAdjustment.status}</p>
              </div>
            </div>

            {/* Items Table */}
            <div>
              <p className="text-xs font-black text-[#64748B] uppercase mb-4">Items Adjusted</p>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-[#F8FAFC] border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-black text-[#64748B]">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-black text-[#64748B]">Current Stock</th>
                      <th className="px-4 py-3 text-left text-xs font-black text-[#64748B]">Quantity</th>
                      <th className="px-4 py-3 text-left text-xs font-black text-[#64748B]">New Stock</th>
                      <th className="px-4 py-3 text-left text-xs font-black text-[#64748B]">Cost</th>
                      <th className="px-4 py-3 text-left text-xs font-black text-[#64748B]">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingAdjustment.items.map((item: AdjustmentItem, idx: number) => (
                      <tr key={idx} className="border-b border-slate-200 hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 font-bold text-[#1A3E73]">{item.productName}</td>
                        <td className="px-4 py-3 text-[#64748B]">{item.currentStock}</td>
                        <td className="px-4 py-3 font-bold text-[#1A3E73]">{item.adjustmentQuantity ?? item.quantity}</td>
                        <td className="px-4 py-3 font-bold text-[#1A3E73]">{item.newStock}</td>
                        <td className="px-4 py-3 text-[#64748B]">{currencyCode} {(item.productCost ?? item.cost ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-3 font-bold text-[#1A3E73]">{currencyCode} {(item.subTotal ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total */}
            <div className="flex justify-end">
              <div className="w-64 bg-[#F8FAFC] p-4 rounded-lg border border-slate-200">
                <div className="flex justify-between items-center">
                  <p className="font-black text-[#64748B]">Total Value</p>
                  <p className="text-2xl font-black text-[#1A3E73]">{currencyCode} {(viewingAdjustment.grandTotal ?? 0).toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Notes */}
            {viewingAdjustment.notes && (
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase mb-2">Notes</p>
                <p className="text-[#64748B] p-4 bg-[#F8FAFC] rounded-lg border border-slate-200">{viewingAdjustment.notes}</p>
              </div>
            )}

            {/* Reference Number */}
            {viewingAdjustment.referenceNumber && (
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase mb-2">Reference Number</p>
                <p className="text-[#1A3E73] font-bold">{viewingAdjustment.referenceNumber}</p>
              </div>
            )}
          </div>

          <div className="mt-8 flex gap-4">
            <button
              onClick={() => setViewingAdjustment(null)}
              className="flex-1 bg-slate-200 text-[#1A3E73] font-black py-3 rounded-lg hover:bg-slate-300 transition"
            >
              Close
            </button>
            <button
              onClick={() => navigate(`/editAdjustment/${viewingAdjustment._id}`)}
              className="flex-1 bg-[#1A3E73] text-white font-black py-3 rounded-lg hover:bg-[#0F2A55] transition flex items-center justify-center gap-2"
            >
              <Edit2 size={20} /> Edit Adjustment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-black text-[#1A3E73] mb-2">Stock Adjustments</h1>
            <p className="text-[#64748B] font-bold">View and manage all Stock Adjustments</p>
          </div>
          <Link
            to="/createAdjustment"
            className="bg-[#1A3E73] text-white px-6 py-3 rounded-lg hover:bg-[#0F2A55] font-black flex items-center gap-2 transition"
          >
            <Plus size={20} /> Create Adjustment
          </Link>
        </div>

        {/* Filters: date, warehouse, type, status */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-8">
          <div className="md:col-span-2">
            <label className="block text-sm font-black text-[#1A3E73] mb-2">Search</label>
            <SearchBar onSearch={handleSearch} placeholder="Search product" value={searchQuery} />
          </div>
          <div>
            <label className="block text-sm font-black text-[#1A3E73] mb-2">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'All' | 'Increase' | 'Decrease')}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
            >
              <option value="All">All Types</option>
              <option value="Increase">Increase</option>
              <option value="Decrease">Decrease</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-black text-[#1A3E73] mb-2">Warehouse</label>
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
            >
              <option value="">All Warehouses</option>
              {warehouses.map((w: any) => (
                <option key={w._id} value={w._id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-black text-[#1A3E73] mb-2">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-black text-[#1A3E73] mb-2">Start Date</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-black text-[#1A3E73] mb-2">End Date</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
            />
          </div>
          <div className="flex items-end justify-start md:justify-end">
            <button
              onClick={() => {
                setFilterType('All');
                setFilterWarehouse('');
                setFilterStatus('');
                setFilterStartDate('');
                setFilterEndDate('');
                setSearchQuery('');
              }}
              className="bg-slate-200 text-[#1A3E73] px-4 py-2 rounded-lg hover:bg-slate-300 font-bold transition whitespace-nowrap"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <Loader />
          ) : adjustments.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-[#64748B] font-bold mb-4">No adjustments found</p>
              <Link
                to="/createAdjustment"
                className="bg-[#1A3E73] text-white px-6 py-2 rounded-lg hover:bg-[#0F2A55] font-bold inline-block"
              >
                Create Your First Adjustment
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F8FAFC] border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-black text-[#64748B] uppercase">ID</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-[#64748B] uppercase">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-[#64748B] uppercase">Warehouse</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-[#64748B] uppercase">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-[#64748B] uppercase">Reason</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-[#64748B] uppercase">Items</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-[#64748B] uppercase">Value</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-[#64748B] uppercase">Status</th>
                    <th className="px-6 py-4 text-center text-xs font-black text-[#64748B] uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map(adjustment => (
                    <tr key={adjustment.id} className="border-b border-slate-200 hover:bg-[#F8FAFC] transition">
                      <td className="px-6 py-4 font-bold text-[#1A3E73]">{adjustment.referenceNumber?.trim() || adjustment.adjustmentId}</td>
                      <td className="px-6 py-4 text-[#64748B]">{formatDate(adjustment.adjustmentDate)}</td>
                      <td className="px-6 py-4 text-[#64748B]">{adjustment.warehouseName}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          adjustment.adjustmentType === 'Increase'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {adjustment.adjustmentType === 'Increase' ? '↑ Increase' : '↓ Decrease'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[#64748B]">{adjustment.reason}</td>
                      <td className="px-6 py-4 text-[#64748B]">{adjustment.itemCount}</td>
                      <td className="px-6 py-4 font-bold text-[#1A3E73]">{currencyCode} {(adjustment.grandTotal ?? 0).toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                          {adjustment.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-3">
                          <button
                            onClick={() => loadDetails(adjustment.id)}
                            className="text-[#1A3E73] hover:text-[#0F2A55] font-bold"
                            title="View Details"
                          >
                            <Eye size={20} />
                          </button>
                          <button
                            onClick={() => navigate(`/editAdjustment/${adjustment.id}`)}
                            className="text-blue-600 hover:text-blue-800 font-bold"
                            title="Edit"
                          >
                            <Edit2 size={20} />
                          </button>
                          <button
                            onClick={() => setToDelete(adjustment.id)}
                            className="text-red-600 hover:text-red-800 font-bold"
                            title="Delete"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {toDelete && (
        <DeleteConfirmModal
          title="Delete Adjustment"
          message="Are you sure you want to delete this adjustment? This action cannot be undone."
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
};

// X icon component
const X = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

export default ViewAdjustments;
