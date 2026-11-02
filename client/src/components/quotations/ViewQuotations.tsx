import {
  ArrowRight, Download,
  Edit2,
  Eye,
  Plus, Search,
  Trash2,
  X
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { bulkDeleteQuotations, deleteQuotation, getQuotations, updateQuotationStatus } from '../../services/quotationService';
import { toBusinessDateInputValue } from '../../utils/date';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import { formatDate } from '../../utils/date.ts';

const ViewQuotations: React.FC = () => {
  const navigate = useNavigate();
  const { currencyCode } = useCurrency();
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useState(false);
  const [viewingQuotation, setViewingQuotation] = useState<any | null>(null);

  // Filters
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getQuotations({ q, status, startDate, endDate });
      setQuotations(data.data || []);
      setSelectedIds([]);
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, status, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    if (!toDelete) return;
    setLoading(true);
    try {
      await deleteQuotation(toDelete);
      showSuccessToast('Quotation deleted successfully');
      setToDelete(null);
      fetchData();
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} quotations?`)) return;
    
    setLoading(true);
    try {
      await bulkDeleteQuotations(selectedIds);
      showSuccessToast(`${selectedIds.length} quotations deleted successfully`);
      setSelectedIds([]);
      fetchData();
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === quotations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(quotations.map(q => q._id));
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      await updateQuotationStatus(id, newStatus);
      showSuccessToast(`Status updated to ${newStatus}`);
      fetchData();
      if (viewingQuotation && viewingQuotation._id === id) {
        setViewingQuotation({ ...viewingQuotation, status: newStatus });
      }
    } catch (e: any) {
      showErrorToast(e.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-gray-100 text-gray-600';
      case 'Sent': return 'bg-blue-100 text-blue-600';
      case 'Approved': return 'bg-green-100 text-green-600';
      case 'Rejected': return 'bg-red-100 text-red-600';
      case 'Expired': return 'bg-orange-100 text-orange-600';
      case 'Converted': return 'bg-purple-100 text-purple-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const buildQuotationPrintHtml = (quotation: any) => {
    const itemsHtml = quotation.items
      .map((item: any) => `
        <tr>
          <td style="padding:12px; border:1px solid #e2e8f0; vertical-align:middle;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:60px; height:60px; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden; background:#f8fafc; display:flex; align-items:center; justify-content:center;">
                ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.productName)}" style="width:100%; height:100%; object-fit:cover;"/>` : `<span style="font-size:10px; color:#64748b;">No Image</span>`}
              </div>
              <div>
                <div style="font-weight:700; color:#0f172a;">${escapeHtml(item.productName)}</div>
                <div style="font-size:12px; color:#475569;">${escapeHtml(item.productCode || 'N/A')}</div>
              </div>
            </div>
          </td>
          <td style="padding:12px; border:1px solid #e2e8f0; text-align:center;">${escapeHtml(String(item.qty))}</td>
          <td style="padding:12px; border:1px solid #e2e8f0; text-align:center;">${escapeHtml(currencyCode)} ${escapeHtml(Number(item.price).toFixed(2))}</td>
          <td style="padding:12px; border:1px solid #e2e8f0; text-align:right;">${escapeHtml(currencyCode)} ${escapeHtml(Number(item.subtotal).toFixed(2))}</td>
        </tr>
      `)
      .join('');

    const subtotal = quotation.items.reduce((sum: number, item: any) => sum + Number(item.subtotal || 0), 0);
    const discount = Number(quotation.discountValue || 0);
    const tax = Number(quotation.taxValue || 0);
    const shipping = Number(quotation.shippingCost || 0);
    const total = Number(quotation.total || 0);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quotation ${escapeHtml(quotation.quotationId)}</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
    .page { max-width: 900px; margin: 0 auto; }
    h1 { margin: 0 0 8px 0; font-size: 28px; }
    .meta { color: #475569; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 20px; padding: 16px; }
    .label { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
    .value { font-size: 15px; font-weight: 700; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #e2e8f0; padding: 12px; }
    th { background: #f1f5f9; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    .text-right { text-align: right; }
    .summary { display: flex; flex-wrap: wrap; gap: 16px; justify-content: flex-end; }
    .summary-row { display: flex; justify-content: space-between; width: 100%; max-width: 320px; font-size: 14px; color: #334155; }
    .summary-row.total { font-weight: 800; font-size: 18px; color: #0f172a; }
    .footer { margin-top: 32px; font-size: 12px; color: #64748b; }
    @media print { body { margin: 0; padding: 0; } .page { box-shadow: none; margin: 0; } }
  </style>
</head>
<body>
  <div class="page">
    <h1>Quotation ${escapeHtml(quotation.quotationId)}</h1>
    <div class="meta">Generated on ${escapeHtml(new Date().toLocaleString())}</div>

    <div class="grid">
      <div class="card">
        <div class="label">Customer</div>
        <div class="value">${escapeHtml(quotation.customerName || quotation.customerId || 'Walk-in Customer')}</div>
        <div style="margin-top:8px; color:#475569;">Ref: ${escapeHtml(quotation.referenceNumber || 'N/A')}</div>
      </div>
      <div class="card">
        <div class="label">Validity</div>
        <div class="value">${escapeHtml(formatDate(quotation.validUntil))}</div>
        <div style="margin-top:8px; color:#475569;">Created: ${escapeHtml(formatDate(quotation.date))}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:center;">Unit Price</th>
          <th style="text-align:right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="summary">
      <div class="summary-row"><span>Subtotal</span><span>${escapeHtml(currencyCode)} ${escapeHtml(subtotal.toFixed(2))}</span></div>
      <div class="summary-row"><span>Discount</span><span>-${escapeHtml(currencyCode)} ${escapeHtml(discount.toFixed(2))}</span></div>
      <div class="summary-row"><span>Tax</span><span>+ ${escapeHtml(currencyCode)} ${escapeHtml(tax.toFixed(2))}</span></div>
      <div class="summary-row"><span>Shipping</span><span>${escapeHtml(currencyCode)} ${escapeHtml(shipping.toFixed(2))}</span></div>
      <div class="summary-row total"><span>Total</span><span>${escapeHtml(currencyCode)} ${escapeHtml(total.toFixed(2))}</span></div>
    </div>

    <div class="card" style="margin-top:24px;">
      <div class="label">Notes</div>
      <div style="color:#334155; line-height:1.6;">${escapeHtml(quotation.notes || 'No notes provided.')}</div>
    </div>

    <div class="footer">Printed from ServeSmart</div>
  </div>
</body>
</html>`;
  };

  const printQuotation = (quotation: any) => {
    const html = buildQuotationPrintHtml(quotation);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const doprint = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      const cleanup = () => { if (document.body.contains(iframe)) document.body.removeChild(iframe); };
      iframe.contentWindow?.addEventListener('afterprint', cleanup);
      setTimeout(cleanup, 3000);
    };

    const tryPrint = () => {
      const images = Array.from(doc.images);
      if (images.length === 0) {
        setTimeout(doprint, 100);
        return;
      }
      let loaded = 0;
      const check = () => { if (++loaded >= images.length) setTimeout(doprint, 50); };
      images.forEach((img) => {
        if (img.complete) check();
        else { img.onload = check; img.onerror = check; }
      });
    };

    setTimeout(tryPrint, 150);
  };

  return (
    <div className="p-6 bg-[#F8FAFC] min-h-screen">
      {loading && <Loader text="Loading..." />}
      
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-black text-[#001F54] mb-2 uppercase tracking-tight">Quotations</h1>
            <p className="text-[#64748B] font-bold">Manage and track your customer price offers</p>
          </div>
          <Link 
            to="/createQuotation"
            className="bg-[#001F54] text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-[#003366] transition-all shadow-lg shadow-[#001F54]/10"
          >
            <Plus size={24} /> NEW QUOTATION
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 mb-8">
          <div className="flex flex-col md:flex-row gap-6 items-end">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 w-full">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Search</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B]" size={18} />
                  <input 
                    type="text" 
                    placeholder="ID, Reference..." 
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl font-bold text-[#1A3E73] focus:ring-2 focus:ring-[#3B82F6] outline-none"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Status</label>
                <select 
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-[#1A3E73] focus:ring-2 focus:ring-[#3B82F6] outline-none"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="Draft">Draft</option>
                  <option value="Sent">Sent</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Expired">Expired</option>
                  <option value="Converted">Converted to Sale</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">From Date</label>
                <input 
                  type="date" 
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-[#1A3E73] focus:ring-2 focus:ring-[#3B82F6] outline-none"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">To Date</label>
                <input 
                  type="date" 
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-[#1A3E73] focus:ring-2 focus:ring-[#3B82F6] outline-none"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {selectedIds.length > 0 && (
              <button 
                onClick={handleBulkDelete}
                className="bg-[#EF4444] text-white px-8 py-4 rounded-2xl font-black hover:bg-[#DC2626] transition-all shadow-lg shadow-[#EF4444]/20 flex items-center gap-2 whitespace-nowrap"
              >
                <Trash2 size={18} /> DELETE MULTIPLES
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[#F8FAFC] text-[#64748B] text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="p-6 w-10">
                  <input 
                    type="checkbox" 
                    className="w-5 h-5 rounded-lg border-2 border-slate-300 text-[#3B82F6] focus:ring-[#3B82F6] cursor-pointer"
                    checked={quotations.length > 0 && selectedIds.length === quotations.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-6">REFERENCE</th>
                <th className="p-6">CUSTOMER</th>
                <th className="p-6">WAREHOUSE</th>
                <th className="p-6">STATUS</th>
                <th className="p-6">GRAND TOTAL</th>
                <th className="p-6">CREATED ON</th>
                <th className="p-6 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {quotations.map((qtn) => (
                <tr key={qtn._id} className="hover:bg-slate-50/50 transition-all group">
                  <td className="p-6">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 rounded-lg border-2 border-slate-300 text-[#3B82F6] focus:ring-[#3B82F6] cursor-pointer"
                      checked={selectedIds.includes(qtn._id)}
                      onChange={() => toggleSelect(qtn._id)}
                    />
                  </td>
                  <td className="p-6">
                    <span className="px-3 py-1 bg-red-50 text-[#EF4444] text-[11px] font-bold rounded-lg uppercase tracking-wider">
                      {qtn.quotationId}
                    </span>
                  </td>
                  <td className="p-6 font-bold text-[#1A3E73]">
                    {qtn.customerName || 'walk-in-customer'}
                  </td>
                  <td className="p-6 font-bold text-[#64748B]">
                    {qtn.warehouseName || 'warehouse'}
                  </td>
                  <td className="p-6">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(qtn.status)}`}>
                      {qtn.status}
                    </span>
                  </td>
                  <td className="p-6 font-black text-[#001F54]">
                    {currencyCode} {qtn.total.toFixed(2)}
                  </td>
                  <td className="p-6">
                    <div className="text-[11px] font-bold text-[#3B82F6] bg-blue-50 px-3 py-1 rounded-lg inline-block text-center">
                      <div>{new Date(qtn.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      <div>{toBusinessDateInputValue(qtn.date)}</div>
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setViewingQuotation(qtn)}
                        className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                        title="View Details"
                      >
                        <Eye size={18} />
                      </button>
                      {qtn.status !== 'Converted' && (
                        <button 
                          onClick={() => navigate(`/editQuotation/${qtn._id}`)}
                          className="p-3 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                      )}
                      <button 
                        onClick={() => setToDelete(qtn._id)}
                        className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {quotations.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-20 text-center text-[#64748B] font-bold italic">
                    No quotations found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation */}
      {toDelete && (
        <DeleteConfirmModal 
          onCancel={() => setToDelete(null)} 
          onConfirm={handleDelete} 
        />
      )}

      {/* Detail View Modal */}
      {viewingQuotation && (
        <div className="fixed inset-0 bg-[#001F54]/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-[#F8FAFC]">
              <div>
                <div className="flex items-center gap-4 mb-1">
                  <h2 className="text-2xl font-black text-[#001F54] uppercase tracking-tight">{viewingQuotation.quotationId}</h2>
                  <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(viewingQuotation.status)}`}>
                    {viewingQuotation.status}
                  </span>
                </div>
                <p className="text-[#64748B] font-bold">Created on {formatDate(viewingQuotation.date)}</p>
              </div>
              <button onClick={() => setViewingQuotation(null)} className="p-3 bg-white text-[#64748B] rounded-2xl hover:bg-slate-50 border border-slate-200 transition-all">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest mb-2">Customer</p>
                  <p className="font-black text-[#1A3E73] text-lg">{viewingQuotation.customerName || viewingQuotation.customerId}</p>
                  <p className="text-xs text-[#64748B] font-bold mt-1">Ref: {viewingQuotation.referenceNumber || 'N/A'}</p>
                </div>
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest mb-2">Validity</p>
                  <p className="font-black text-[#1A3E73] text-lg">{formatDate(viewingQuotation.validUntil)}</p>
                  <p className="text-xs text-[#64748B] font-bold mt-1">Expires in {Math.ceil((new Date(viewingQuotation.validUntil).getTime() - new Date().getTime()) / (1000 * 3600 * 24))} days</p>
                </div>
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest mb-2">Warehouse</p>
                  <p className="font-black text-[#1A3E73] text-lg">{viewingQuotation.warehouseName || viewingQuotation.warehouseId}</p>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-[#001F54] uppercase tracking-widest">Quoted Items</h3>
                <div className="border border-slate-100 rounded-[32px] overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-[#F8FAFC] text-[#64748B] text-[10px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="p-6">Product</th>
                        <th className="p-6 text-center">Qty</th>
                        <th className="p-6 text-center">Price</th>
                        <th className="p-6 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {viewingQuotation.items.map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-6 font-bold text-[#1A3E73]">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                                {item.image ? (
                                  <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-[10px] font-black uppercase text-slate-500">No Image</span>
                                )}
                              </div>
                              <div>
                                <div>{item.productName}</div>
                                <div className="text-[11px] font-bold text-[#64748B]">{item.productCode || 'N/A'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-6 text-center font-bold text-[#64748B]">{item.qty}</td>
                          <td className="p-6 text-center font-bold text-[#64748B]">{currencyCode} {item.price.toLocaleString()}</td>
                          <td className="p-6 text-right font-black text-[#001F54]">{currencyCode} {item.subtotal.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer Calculations */}
              <div className="flex flex-col md:flex-row justify-between gap-8 pt-8 border-t border-slate-100">
                <div className="flex-1 space-y-4">
                  <h3 className="text-sm font-black text-[#001F54] uppercase tracking-widest">Notes</h3>
                  <p className="text-sm text-[#64748B] leading-relaxed bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    {viewingQuotation.notes || 'No notes provided for this quotation.'}
                  </p>
                </div>
                <div className="w-full md:w-80 space-y-4">
                  <div className="flex justify-between items-center text-sm font-bold text-[#64748B]">
                    <span>Subtotal</span>
                    <span>{currencyCode} {viewingQuotation.items.reduce((sum: number, i: any) => sum + i.subtotal, 0).toLocaleString()}</span>
                  </div>
                  {viewingQuotation.discountValue > 0 && (
                    <div className="flex justify-between items-center text-sm font-bold text-red-500">
                      <span>Discount</span>
                      <span>- {currencyCode} {viewingQuotation.discountValue.toLocaleString()}</span>
                    </div>
                  )}
                  {viewingQuotation.taxValue > 0 && (
                    <div className="flex justify-between items-center text-sm font-bold text-[#1A3E73]">
                      <span>Tax</span>
                      <span>+ {currencyCode} {viewingQuotation.taxValue.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                    <span className="text-lg font-black text-[#001F54] uppercase tracking-tight">Total</span>
                    <span className="text-2xl font-black text-[#3B82F6]">{currencyCode} {viewingQuotation.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 bg-[#F8FAFC] border-t border-slate-100 flex flex-wrap gap-4">
              <div className="flex-1 flex gap-2">
                {viewingQuotation.status === 'Draft' && (
                  <button 
                    onClick={() => handleStatusUpdate(viewingQuotation._id, 'Sent')}
                    className="px-6 py-3 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition-all flex items-center gap-2"
                  >
                    MARK AS SENT
                  </button>
                )}
                {viewingQuotation.status === 'Sent' && (
                  <>
                    <button 
                      onClick={() => handleStatusUpdate(viewingQuotation._id, 'Approved')}
                      className="px-6 py-3 bg-green-600 text-white font-black rounded-2xl hover:bg-green-700 transition-all flex items-center gap-2"
                    >
                      APPROVE
                    </button>
                    <button 
                      onClick={() => handleStatusUpdate(viewingQuotation._id, 'Rejected')}
                      className="px-6 py-3 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 transition-all flex items-center gap-2"
                    >
                      REJECT
                    </button>
                  </>
                )}
                {viewingQuotation.status === 'Approved' && (
                  <button 
                    onClick={() => navigate(`/createSale?quotationId=${viewingQuotation._id}`)}
                    className="px-6 py-3 bg-purple-600 text-white font-black rounded-2xl hover:bg-purple-700 transition-all flex items-center gap-2"
                  >
                    CONVERT TO SALE <ArrowRight size={18} />
                  </button>
                )}
              </div>
              <button 
                onClick={() => viewingQuotation && printQuotation(viewingQuotation)}
                className="px-6 py-3 bg-white text-[#001F54] font-black rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                <Download size={20} /> PRINT / PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewQuotations;
