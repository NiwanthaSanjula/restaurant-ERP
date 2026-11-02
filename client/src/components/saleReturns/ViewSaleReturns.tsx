import { ChevronDown, ChevronUp, Eye, FileDown, Filter, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import SearchBar from '../common/SearchBar';
import { formatDate } from '../../utils/date.ts';

interface ReturnRow {
  id: string;
  returnId: string;
  customerName: string;
  warehouseName: string;
  returnDate: string;
  reason: string;
  status: string;
  itemCount: number;
  totalReturnAmount: number;
  createdAt: string;
}

const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

const ViewSaleReturns: React.FC = () => {
  const { currencyCode } = useCurrency();
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCustomer] = useState('');
  const [filterWarehouse] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [, setCustomers] = useState<any[]>([]);
  const [, setWarehouses] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder,
        ...(searchQuery && { q: searchQuery }),
        ...(filterCustomer && { customer: filterCustomer }),
        ...(filterWarehouse && { warehouse: filterWarehouse }),
        ...(filterDate && { date: filterDate }),
        ...(filterStatus !== 'All' && { status: filterStatus }),
      });

      const res = await fetch(`${api}/sale-returns?${params}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        throw new Error('Failed to fetch sale returns');
      }

      const data = await res.json();
      const rows: ReturnRow[] = data.data?.map((item: any) => ({
        id: item._id,
        returnId: item.returnId || `SR-${item._id?.slice(-6)}`,
        customerName: item.customer?.name || 'N/A',
        warehouseName: item.warehouse?.name || 'N/A',
        returnDate: item.returnDate,
        reason: item.reason || 'N/A',
        status: item.status || 'Pending',
        itemCount: item.items?.length || 0,
        totalReturnAmount: item.totalReturnAmount || 0,
        createdAt: item.createdAt,
      })) || [];

      setReturns(rows);
      setPagination(prev => ({ ...prev, total: data.total || 0 }));
    } catch (error: any) {
      showErrorToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/customers`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      setCustomers(data.data || []);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/warehouses`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      setWarehouses(data.data || []);
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchWarehouses();
  }, []);

  useEffect(() => {
    fetchReturns();
  }, [pagination.page, sortBy, sortOrder, searchQuery, filterCustomer, filterWarehouse, filterDate, filterStatus]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? returns.map(r => r.id) : []);
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    setSelectedIds(prev =>
      checked ? [...prev, id] : prev.filter(itemId => itemId !== id)
    );
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/sale-returns/${toDelete}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Delete failed');
      showSuccessToast(data.message || 'Sale return deleted successfully');
      setToDelete(null);
      fetchReturns();
    } catch (error: any) {
      showErrorToast(error.message);
    }
  };

  const handleBulkDelete = async () => {
    try {
      const token = localStorage.getItem('token');
      const deletePromises = selectedIds.map(id =>
        fetch(`${api}/sale-returns/${id}`, {
          method: 'DELETE',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        })
      );

      await Promise.all(deletePromises);
      showSuccessToast(`${selectedIds.length} sale returns deleted successfully`);
      setSelectedIds([]);
      setShowBulkDeleteConfirm(false);
      fetchReturns();
    } catch (error: any) {
      showErrorToast('Failed to delete selected returns');
    }
  };

  const exportToCSV = () => {
    const headers = ['Return ID', 'Customer', 'Warehouse', 'Date', 'Reason', 'Status', 'Items', 'Total Amount'];
    const csvData = returns.map(r => [
      r.returnId,
      r.customerName,
      r.warehouseName,
      formatDate(r.returnDate),
      r.reason,
      r.status,
      r.itemCount,
      `${currencyCode} ${r.totalReturnAmount.toFixed(2)}`
    ]);

    const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sale-returns.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {loading && <Loader text="Loading sale returns" />}

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Sale Returns</h1>
              <p className="text-sm text-gray-600 mt-1">Manage customer sale returns</p>
            </div>
            <Link
              to="/createSaleReturn"
              className="inline-flex items-center px-4 py-2 bg-[#003366] text-white rounded-lg hover:bg-[#004080] transition-colors duration-200 font-medium"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Return
            </Link>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="p-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <SearchBar
              onSearch={handleSearch}
              placeholder="Search returns by ID, customer, or reason..."
              className="w-full max-w-md"
            />
          </div>
          <div className="flex gap-2">
            <div className="relative" ref={filterDropdownRef}>
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
                {showFilterDropdown ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
              </button>
              {showFilterDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="All">All Status</option>
                        <option value="Pending">Pending</option>
                        <option value="Approved">Approved</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={exportToCSV}
              className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Export
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedIds.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-800">
                {selectedIds.length} return{selectedIds.length > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 text-sm"
                >
                  Delete Selected
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={returns.length > 0 && selectedIds.length === returns.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider cursor-pointer" onClick={() => handleSort('returnId')}>
                    Return ID
                    {sortBy === 'returnId' && (
                      sortOrder === 'asc' ? <ChevronUp className="inline w-4 h-4 ml-1" /> : <ChevronDown className="inline w-4 h-4 ml-1" />
                    )}
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider cursor-pointer" onClick={() => handleSort('customerName')}>
                    Customer
                    {sortBy === 'customerName' && (
                      sortOrder === 'asc' ? <ChevronUp className="inline w-4 h-4 ml-1" /> : <ChevronDown className="inline w-4 h-4 ml-1" />
                    )}
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">Warehouse</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider cursor-pointer" onClick={() => handleSort('returnDate')}>
                    Date
                    {sortBy === 'returnDate' && (
                      sortOrder === 'asc' ? <ChevronUp className="inline w-4 h-4 ml-1" /> : <ChevronDown className="inline w-4 h-4 ml-1" />
                    )}
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">Reason</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider">Items</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 tracking-wider cursor-pointer" onClick={() => handleSort('totalReturnAmount')}>
                    Total Amount
                    {sortBy === 'totalReturnAmount' && (
                      sortOrder === 'asc' ? <ChevronUp className="inline w-4 h-4 ml-1" /> : <ChevronDown className="inline w-4 h-4 ml-1" />
                    )}
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700 tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {returns.map((returnItem) => (
                  <tr key={returnItem.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(returnItem.id)}
                        onChange={(e) => handleSelectItem(returnItem.id, e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {returnItem.returnId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {returnItem.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {returnItem.warehouseName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(returnItem.returnDate)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={returnItem.reason}>
                      {returnItem.reason}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        returnItem.status === 'Completed' ? 'bg-green-100 text-green-800' :
                        returnItem.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                        returnItem.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {returnItem.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {returnItem.itemCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {currencyCode} {returnItem.totalReturnAmount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="relative" ref={actionMenuRef}>
                        <button
                          onClick={() => setOpenActionId(openActionId === returnItem.id ? null : returnItem.id)}
                          className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        {openActionId === returnItem.id && (
                          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                            <div className="py-1">
                              <button
                                onClick={() => navigate(`/viewSaleReturn/${returnItem.id}`)}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </button>
                              <button
                                onClick={() => navigate(`/editSaleReturn/${returnItem.id}`)}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </button>
                              <button
                                onClick={() => setToDelete(returnItem.id)}
                                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {returns.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No sale returns found</h3>
                        <p className="text-gray-500 mb-4">Get started by creating your first sale return.</p>
                        <Link
                          to="/createSaleReturn"
                          className="inline-flex items-center px-4 py-2 bg-[#003366] text-white rounded-lg hover:bg-[#004080] transition-colors duration-200"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Create Return
                        </Link>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pagination.total > pagination.limit && (
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-gray-700">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page * pagination.limit >= pagination.total}
                className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {toDelete && (
        <DeleteConfirmModal
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Bulk Delete</h3>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete {selectedIds.length} selected sale return{selectedIds.length > 1 ? 's' : ''}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewSaleReturns;