import { Calendar, ChevronDown, ChevronUp, Eye, FileDown, Filter, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { toBusinessDateInputValue } from '../../utils/date';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import SearchBar from '../common/SearchBar';
import { formatDate } from '../../utils/date.ts';

interface ReturnRow {
  id: string;
  returnId: string;
  supplierName: string;
  warehouseName: string;
  returnDate: string;
  reason: string;
  status: string;
  itemCount: number;
  totalReturnAmount: number;
  createdAt: string;
}

const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

const ViewPurchaseReturns: React.FC = () => {
  const { currencyCode } = useCurrency();
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSupplier] = useState('');
  const [filterWarehouse] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
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
      if (openActionId && actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openActionId]);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('page', String(pagination.page));
      params.append('limit', String(pagination.limit));
      if (filterSupplier) {
        params.append('supplierId', filterSupplier);
        const selectedSupplier = suppliers.find((s: any) => (s._id || s.id) === filterSupplier);
        if (selectedSupplier?.name) params.append('supplierName', selectedSupplier.name);
      }
      if (filterWarehouse) {
        params.append('warehouseId', filterWarehouse);
        const selectedWarehouse = warehouses.find((w: any) => (w._id || w.id) === filterWarehouse);
        if (selectedWarehouse?.name) params.append('warehouseName', selectedWarehouse.name);
      }
      if (searchQuery) params.append('q', searchQuery);
      if (filterDate) {
        params.append('startDate', filterDate);
        params.append('endDate', filterDate);
      }
      if (filterStatus && filterStatus !== 'All') {
        params.append('status', filterStatus);
      }
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      const url = `${api}/purchase-returns?${params}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Failed to load returns');
        return;
      }
      const list = data.data || [];
      const pag = data.pagination || {};
      setReturns(
        list.map((r: any) => ({
          id: r._id,
          returnId: r.returnId,
          supplierName: r.supplierName || r.supplierId?.name || '—',
          warehouseName: r.warehouseName || r.warehouseId?.name || '—',
          returnDate: r.returnDate,
          reason: r.reason,
          status: r.status || 'Completed',
          itemCount: r.items?.length || 0,
          totalReturnAmount: r.totalReturnAmount ?? 0,
          createdAt: r.createdAt
        }))
      );
      setPagination(prev => ({ ...prev, total: pag.total ?? prev.total }));
    } catch (e) {
      showErrorToast((e as Error).message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliersAndWarehouses = async () => {
    const token = localStorage.getItem('token');
    try {
      const [sRes, wRes] = await Promise.all([
        fetch(`${api}/suppliers`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
        fetch(`${api}/warehouses`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      ]);
      const sData = await sRes.json();
      const wData = await wRes.json();
      if (sRes.ok) setSuppliers(sData.data || []);
      if (wRes.ok) setWarehouses(wData.data || []);
    } catch (err) {
      showErrorToast('Failed to load suppliers or warehouses');
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      // Toggle order if clicking the same field
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field and default to descending
      setSortBy(field);
      setSortOrder('desc');
    }
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page when sorting
  };

  useEffect(() => {
    fetchReturns();
  }, [pagination.page, pagination.limit, filterSupplier, filterWarehouse, searchQuery, filterDate, filterStatus, sortBy, sortOrder]);

  useEffect(() => {
    fetchSuppliersAndWarehouses();
  }, []);

  const getStatusDisplay = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus.includes('complete')) return 'Received';
    return status;
  };

  const getStatusClassName = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus.includes('complete') || normalizedStatus.includes('receive')) return 'text-secondary font-bold';
    if (normalizedStatus.includes('pend')) return 'text-warning font-bold';
    if (normalizedStatus.includes('cancel')) return 'text-danger font-bold';
    if (normalizedStatus.includes('order')) return 'text-primary font-bold';
    return 'text-foreground font-bold';
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    if (selectedIds.length === returns.length) setSelectedIds([]);
    else setSelectedIds(returns.map(r => r.id));
  };

  const handleDeleteSingle = async () => {
    if (!toDelete) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/purchase-returns/${toDelete}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Failed to delete');
        return;
      }
      showSuccessToast('Purchase return deleted successfully');
      setToDelete(null);
      fetchReturns();
    } catch (e) {
      showErrorToast((e as Error).message || 'Failed to delete');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/purchase-returns/bulk-delete`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Failed to delete');
        return;
      }
      showSuccessToast(data?.message || `${data?.data?.deleted ?? 0} purchase return(s) deleted`);
      setShowBulkDeleteConfirm(false);
      setSelectedIds([]);
      fetchReturns();
    } catch (e) {
      showErrorToast((e as Error).message || 'Failed to delete');
    }
  };

  const getPrintHtml = (r: any) => {
    const name = (x: string) => (x || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<!DOCTYPE html><html><head><title>Purchase Return ${name(r.returnId)}</title><style>body{font-family:sans-serif;padding:24px;max-width:800px;margin:0 auto} table{border-collapse:collapse;width:100%;margin-top:12px} th,td{border:1px solid #ddd;padding:10px;text-align:left} th{background:#f5f5f5} @media print{body{padding:0}}</style></head><body>
    <h1>Purchase Return</h1>
    <p><strong>Reference:</strong> ${name(r.returnId)}</p>
    <p><strong>Date:</strong> ${formatDate(r.returnDate)}</p>
    <p><strong>Supplier:</strong> ${name(r.supplierName || r.supplierId?.name || '—')}</p>
    <p><strong>Warehouse:</strong> ${name(r.warehouseName || r.warehouseId?.name || '—')}</p>
    <p><strong>Status:</strong> ${name(r.status)}</p>
    <p><strong>Grand Total:</strong> ${currencyCode} ${(r.totalReturnAmount ?? 0).toFixed(2)}</p>
    <h2>Items</h2>
    <table><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Subtotal</th></tr>
    ${(r.items || []).map((i: any) => `<tr><td>${name(i.productName || '—')}</td><td>${i.returnQuantity}</td><td>${currencyCode} ${(i.productCost ?? 0).toFixed(2)}</td><td>${currencyCode} ${(i.subTotal ?? 0).toFixed(2)}</td></tr>`).join('')}
    </table>
    <p style="margin-top:24px;color:#666">Generated on ${new Date().toLocaleString()}</p>
    </body></html>`;
  };

  const printPurchaseReturn = (r: any) => {
    const content = getPrintHtml(r);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      showErrorToast('Could not open print');
      return;
    }
    doc.open();
    doc.write(content);
    doc.close();
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    const removeIframe = () => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    };
    iframe.contentWindow?.addEventListener('afterprint', removeIframe);
    setTimeout(removeIframe, 1000);
  };

  const handleDownloadPDF = async (id: string) => {
    setOpenActionId(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/purchase-returns/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok || !data.data) {
        showErrorToast('Could not load purchase return');
        return;
      }
      printPurchaseReturn(data.data);
    } catch (e) {
      showErrorToast((e as Error).message || 'Failed to generate PDF');
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit) || 1;
  const startRow = (pagination.page - 1) * pagination.limit + 1;
  const endRow = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="p-8 bg-canvas min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-black text-foreground mb-2">Purchase Returns</h1>
            <p className="text-muted font-bold">View all purchase return transactions</p>
          </div>
          <Link
            to="/createPurchaseReturn"
            className="bg-primary text-on-primary px-6 py-3 rounded-lg hover:bg-primary-hover font-black flex items-center gap-2 transition"
          >
            <Plus size={20} /> Create Purchase Return
          </Link>
        </div>

        {/* Top bar: Q Search, Filter dropdown, Select Date - single Create button in header above */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <SearchBar onSearch={setSearchQuery} placeholder="Q Search" />
          </div>
          <div className="relative" ref={filterDropdownRef}>
            <button
              type="button"
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-lg hover:bg-primary-hover font-bold transition"
            >
              <Filter size={18} />
              {filterStatus !== 'All' && (
                <span className="text-xs bg-surface text-primary px-1.5 py-0.5 rounded">
                  {filterStatus}
                </span>
              )}
              <ChevronDown size={16} className={showFilterDropdown ? 'rotate-180' : ''} />
            </button>
            {showFilterDropdown && (
              <div className="absolute top-full left-0 mt-2 z-20 bg-surface border border-line rounded-lg p-4 w-64">
                <p className="text-sm font-bold text-foreground mb-3">Status:</p>
                <div className="space-y-1">
                  {['All', 'Completed', 'Pending', 'Ordered', 'Cancelled'].map((status) => {
                    const isSelected = filterStatus === status;
                    const displayLabel = status === 'All' ? 'All' : getStatusDisplay(status);
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          setFilterStatus(status);
                          setPagination(p => ({ ...p, page: 1 }));
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md transition ${
                          isSelected
                            ? 'bg-primary text-on-primary font-bold'
                            : 'text-muted hover:bg-surface-muted'
                        }`}
                      >
                        {displayLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <input
              type="date"
              value={filterDate}
              onChange={e => { setFilterDate(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              className="px-4 py-2.5 pl-10 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
            />
            <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
          </div>
          {returns.length > 0 && selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="px-4 py-2.5 rounded-lg font-bold transition bg-danger text-on-danger hover:bg-danger-hover"
            >
              Delete Multiples
            </button>
          )}
        </div>

        <div className="bg-surface rounded-2xl border border-line overflow-hidden">
          {loading ? (
            <Loader />
          ) : returns.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-muted font-bold mb-4">No purchase returns found</p>
              <Link to="/createPurchaseReturn" className="bg-primary text-on-primary px-6 py-2 rounded-lg hover:bg-primary-hover font-bold inline-block">
                Create Purchase Return
              </Link>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-muted text-muted text-[10px] uppercase tracking-[0.2em] font-black">
                    <tr>
                      <th className="p-6">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-line-strong text-foreground focus:ring-primary focus:ring-2 cursor-pointer accent-primary"
                          checked={returns.length > 0 && selectedIds.length === returns.length}
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="p-6">Reference</th>
                      <th className="p-6">Supplier</th>
                      <th className="p-6">Warehouse</th>
                      <th className="p-6 text-center">Status</th>
                      <th 
                        className="p-6 text-right cursor-pointer hover:bg-surface-muted select-none"
                        onClick={() => handleSort('grandTotal')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Grand Total</span>
                          {sortBy === 'grandTotal' ? (
                            sortOrder === 'asc' ? (
                              <ChevronUp size={16} className="text-foreground" />
                            ) : (
                              <ChevronDown size={16} className="text-foreground" />
                            )
                          ) : (
                            <ChevronDown size={16} className="text-subtle opacity-50" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="p-6 cursor-pointer hover:bg-surface-muted select-none"
                        onClick={() => handleSort('createdAt')}
                      >
                        <div className="flex items-center gap-1">
                          <span>Created On</span>
                          {sortBy === 'createdAt' ? (
                            sortOrder === 'asc' ? (
                              <ChevronUp size={16} className="text-foreground" />
                            ) : (
                              <ChevronDown size={16} className="text-foreground" />
                            )
                          ) : (
                            <div className="flex flex-col">
                              <ChevronUp size={12} className="text-subtle opacity-50 -mb-1" />
                              <ChevronDown size={12} className="text-subtle opacity-50" />
                            </div>
                          )}
                        </div>
                      </th>
                      <th className="p-6 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {returns.map(r => (
                      <tr key={r.id} className="hover:bg-surface-raised/50 transition-colors">
                        <td className="p-6">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-line-strong text-foreground focus:ring-primary focus:ring-2 cursor-pointer accent-primary"
                            checked={selectedIds.includes(r.id)}
                            onChange={() => toggleSelect(r.id)}
                          />
                        </td>
                        <td className="p-6">
                          <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold border border-danger-line bg-danger-soft text-danger">
                            {r.returnId}
                          </span>
                        </td>
                        <td className="p-6 font-semibold text-foreground">{r.supplierName}</td>
                        <td className="p-6 font-semibold text-foreground">{r.warehouseName}</td>
                        <td className="p-6 text-center">
                          <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full ${getStatusClassName(r.status)}`}>
                            {getStatusDisplay(r.status)}
                          </span>
                        </td>
                        <td className="p-6 text-right font-black text-foreground">
                          {currencyCode} {(r.totalReturnAmount ?? 0).toFixed(2)}
                        </td>
                        <td className="p-6 text-muted font-medium">
                          <span className="block">{new Date(r.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                          <span className="block">{toBusinessDateInputValue(r.createdAt)}</span>
                        </td>
                        <td className="p-6 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div
                              className="relative inline-block"
                              ref={openActionId === r.id ? actionMenuRef : null}
                            >
                              <button
                                type="button"
                                onClick={() => setOpenActionId(prev => prev === r.id ? null : r.id)}
                                className="p-2 rounded-lg text-primary hover:bg-surface-muted font-bold"
                                title="Actions"
                              >
                                <MoreVertical size={20} />
                              </button>
                              {openActionId === r.id && (
                                <div className="absolute right-0 top-full mt-1 z-30 min-w-[200px] bg-surface border border-line rounded-lg py-1">
                                  <button
                                    type="button"
                                    onClick={() => { navigate(`/purchaseReturnDetails/${r.id}`); setOpenActionId(null); }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                                  >
                                    <Eye size={16} /> View Purchase Return
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadPDF(r.id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                                  >
                                    <FileDown size={16} /> Download PDF
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { navigate(`/editPurchaseReturn/${r.id}`); setOpenActionId(null); }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-primary hover:bg-surface-raised"
                                  >
                                    <Pencil size={16} /> Edit Purchase Return
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setToDelete(r.id); setOpenActionId(null); }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-danger hover:bg-danger-soft"
                                  >
                                    <Trash2 size={16} /> Delete Purchase Return
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.total > 0 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-line bg-surface-raised">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted font-bold">Records per page:</span>
                    <select
                      value={pagination.limit}
                      onChange={e => setPagination(prev => ({ ...prev, limit: Number(e.target.value), page: 1 }))}
                      className="px-3 py-1 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted font-bold">
                      {startRow}-{endRow} of {pagination.total}
                    </span>
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}
                      disabled={pagination.page === 1}
                      className="px-3 py-1 border border-line rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-raised bg-surface"
                    >
                      |&lt;
                    </button>
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      disabled={pagination.page === 1}
                      className="px-3 py-1 border border-line rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-raised bg-surface"
                    >
                      &lt;
                    </button>
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      disabled={pagination.page >= totalPages}
                      className="px-3 py-1 border border-line rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-raised bg-surface"
                    >
                      &gt;
                    </button>
                    <button
                      onClick={() => setPagination(prev => ({ ...prev, page: totalPages }))}
                      disabled={pagination.page >= totalPages}
                      className="px-3 py-1 border border-line rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-raised bg-surface"
                    >
                      &gt;|
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {toDelete && (
        <DeleteConfirmModal
          itemName="purchase return"
          onCancel={() => setToDelete(null)}
          onConfirm={handleDeleteSingle}
        />
      )}
      {showBulkDeleteConfirm && (
        <DeleteConfirmModal
          itemName={`${selectedIds.length} purchase return(s)`}
          onCancel={() => setShowBulkDeleteConfirm(false)}
          onConfirm={() => { handleBulkDelete(); }}
        />
      )}
    </div>
  );
};

export default ViewPurchaseReturns;
