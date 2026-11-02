import { ArrowUpDown, Calendar, DollarSign, Download, Edit, Eye, FileText, Filter, MoreVertical, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { addPayment, cancelSale, deletePayment, deleteSale, getSaleById, getSales, updatePayment } from '../../services/saleService';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import SearchBar from '../common/SearchBar';
import { formatDate } from '../../utils/date.ts';

interface SalePayment {
  date: string | Date;
  reference?: string;
  paymentType: 'cash' | 'card' | 'bankTransfer';
  amount: number;
}

interface SaleRow {
  _id: string;
  invoiceId?: string;
  warehouseId: {
    _id: string;
    name: string;
  };
  customerId: {
    _id: string;
    name: string;
    mobile: string;
  };
  createdBy?: {
    _id: string;
    name: string;
    email?: string;
  };
  date: string;
  businessType: 'retail' | 'restaurant';
  status: 'draft' | 'completed' | 'cancelled' | 'returned';
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  total: number;
  balance: number;
  profit: number;
  cashAmount: number;
  cardAmount: number;
  bankTransferAmount: number;
  payments?: SalePayment[];
  createdAt: string;
}

const ViewSales: React.FC = () => {
  const { currencyCode, currencySymbol } = useCurrency();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<string>('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState({
    customerId: '',
    warehouseId: '',
    paymentStatus: '' as '' | 'paid' | 'partial' | 'unpaid',
    paymentType: '' as '' | 'cash' | 'card' | 'bankTransfer',
    businessType: '' as '' | 'retail' | 'restaurant',
    status: '' as '' | 'draft' | 'completed' | 'cancelled' | 'returned'
  });
  const [, setCustomers] = useState<Array<{ _id: string; name: string }>>([]);
  const [, setWarehouses] = useState<Array<{ _id: string; name: string }>>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 0 });
  const [sortBy, setSortBy] = useState<'total' | 'createdAt' | ''>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const menuRef = useRef<HTMLDivElement>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const dateMenuRef = useRef<HTMLDivElement>(null);
  const [dateMenuPosition, setDateMenuPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [filterMenuPosition, setFilterMenuPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const [showPaymentsSaleId, setShowPaymentsSaleId] = useState<string | null>(null);
  const [saleForPayments, setSaleForPayments] = useState<SaleRow | null>(null);
  const [createPaymentSale, setCreatePaymentSale] = useState<SaleRow | null>(null);
  const [paymentForm, setPaymentForm] = useState({ date: '', reference: '', paymentType: 'cash' as 'cash' | 'card' | 'bankTransfer', amount: 0 });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [editPaymentState, setEditPaymentState] = useState<{ saleId: string; index: number; amountToPay: number; form: { date: string; reference: string; paymentType: 'cash' | 'card' | 'bankTransfer'; amount: number } } | null>(null);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  useEffect(() => {
    fetchSales();
    fetchCustomers();
    fetchWarehouses();
  }, [filters, pagination.page, filterDate, filterDateEnd, searchQuery, sortBy, sortOrder]);

  // Position and show action menu (portal), and close when clicking outside
  useEffect(() => {
    if (!openActionId) {
      setActionMenuPosition(null);
      return;
    }
    const triggerButton = triggerRefs.current.get(openActionId);
    if (!triggerButton) {
      setActionMenuPosition(null);
      return;
    }
    const rect = triggerButton.getBoundingClientRect();
    const menuHeight = 320;
    const menuWidth = 200;
    const padding = 8;
    const openDown = rect.bottom + menuHeight + padding <= window.innerHeight - 20;
    if (openDown) {
      setActionMenuPosition({ top: rect.bottom + padding, left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 16) });
    } else {
      setActionMenuPosition({ bottom: window.innerHeight - rect.top + padding, left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 16) });
    }
  }, [openActionId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const triggerButton = openActionId ? triggerRefs.current.get(openActionId) : null;
      if (triggerButton?.contains(target) || menuRef.current?.contains(target)) return;
      setOpenActionId(null);
    };
    if (openActionId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openActionId]);

  // Date dropdown position (portal) and click-outside
  useEffect(() => {
    if (!showDateDropdown || !dateTriggerRef.current) {
      setDateMenuPosition(null);
      return;
    }
    const rect = dateTriggerRef.current.getBoundingClientRect();
    const menuHeight = 320;
    const menuWidth = 200;
    const padding = 8;
    const openDown = rect.bottom + menuHeight + padding <= window.innerHeight - 20;
    if (openDown) {
      setDateMenuPosition({ top: rect.bottom + padding, left: Math.min(rect.left, window.innerWidth - menuWidth - 16) });
    } else {
      setDateMenuPosition({ bottom: window.innerHeight - rect.top + padding, left: Math.min(rect.left, window.innerWidth - menuWidth - 16) });
    }
  }, [showDateDropdown]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dateTriggerRef.current?.contains(target) || dateMenuRef.current?.contains(target)) return;
      setShowDateDropdown(false);
    };
    if (showDateDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDateDropdown]);

  // Filter panel position (portal) - update on scroll and resize, positioned below button
  useEffect(() => {
    if (!showFilterModal || !filterTriggerRef.current) {
      setFilterMenuPosition(null);
      return;
    }
    const updatePosition = () => {
      if (!filterTriggerRef.current) return;
      const rect = filterTriggerRef.current.getBoundingClientRect();
      const menuHeight = 280;
      const menuWidth = 280;
      const padding = 8;
      // Try to position below the button first
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openDown = spaceBelow >= menuHeight + padding || spaceBelow > spaceAbove;
      
      if (openDown) {
        // Position below the button
        setFilterMenuPosition({ 
          top: rect.bottom + padding, 
          left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 16) 
        });
      } else {
        // Position above the button if not enough space below
        setFilterMenuPosition({ 
          bottom: window.innerHeight - rect.top + padding, 
          left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 16) 
        });
      }
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showFilterModal]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (filterTriggerRef.current?.contains(target) || filterMenuRef.current?.contains(target)) return;
      setShowFilterModal(false);
    };
    if (showFilterModal) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilterModal]);

  const fetchSales = async (overrides?: { page?: number }) => {
    setLoading(true);
    try {
      const result = await getSales({
        ...filters,
        date: filterDate || undefined,
        dateEnd: filterDateEnd || undefined,
        search: searchQuery || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder,
        page: overrides?.page ?? pagination.page,
        limit: pagination.limit
      });
      
      if (result.status === 'success') {
        setSales(result.data || []);
        if (result.pagination) {
          setPagination(result.pagination);
        }
      } else {
        setSales([]);
      }
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to fetch sales');
      setSales([]);
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
      if (res.ok && data.data) {
        setCustomers(data.data);
      }
    } catch (e) {
      console.error('Failed to fetch customers:', e);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/warehouses`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setWarehouses(data.data);
      }
    } catch (e) {
      console.error('Failed to fetch warehouses:', e);      
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const saleToDelete = sales.find(s => s._id === toDelete);
    if (saleToDelete?.status === 'completed') {
      showErrorToast('Completed sales cannot be deleted');
      setToDelete(null);
      return;
    }
    setLoading(true);
    try {
      await deleteSale(toDelete);
      showSuccessToast('Sale deleted successfully');
      setToDelete(null);
      fetchSales();
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to delete sale');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters({ ...filters, [key]: value });
    setPagination({ ...pagination, page: 1 });
  };

  // Format date as YYYY-MM-DD in local time (avoids UTC causing "yesterday" in some timezones)
  const toLocalDateString = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const handleDateRangeSelect = (range: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let startDate = '';
    let endDate = '';

    switch (range) {
      case 'Today':
        startDate = toLocalDateString(today);
        endDate = toLocalDateString(today);
        break;
      case 'This Week':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startDate = toLocalDateString(startOfWeek);
        endDate = toLocalDateString(today);
        break;
      case 'Last Week':
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        startDate = toLocalDateString(lastWeekStart);
        endDate = toLocalDateString(lastWeekEnd);
        break;
      case 'This Month':
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        startDate = toLocalDateString(startOfMonth);
        endDate = toLocalDateString(today);
        break;
      case 'Last Month':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        startDate = toLocalDateString(lastMonthStart);
        endDate = toLocalDateString(lastMonthEnd);
        break;
      case 'Custom Range':
        setSelectedDateRange('Custom Range');
        // Don't close dropdown, show custom range inputs inside
        return;
      case 'Reset':
        setFilterDate('');
        setFilterDateEnd('');
        setSelectedDateRange('');
        setPagination((prev) => ({ ...prev, page: 1 }));
        fetchSales({ page: 1 });
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

  const handleApplyCustomRange = () => {
    if (filterDate) {
      setSelectedDateRange('Custom Range');
      fetchSales({ page: 1 });
      setShowDateDropdown(false);
    }
  };

  const handleResetCustomRange = () => {
    setFilterDate('');
    setFilterDateEnd('');
    setSelectedDateRange('');
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchSales({ page: 1 });
    setShowDateDropdown(false);
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'unpaid':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentType = (sale: SaleRow): string => {
    const types = [];
    if (sale.cashAmount > 0) types.push('Cash');
    if (sale.cardAmount > 0) types.push('Card');
    if (sale.bankTransferAmount > 0) types.push('Bank Transfer');
    return types.join(', ') || '—';
  };

  const handleCancelSale = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel this sale? This will restore inventory if the sale was completed.')) {
      return;
    }
    setLoading(true);
    try {
      await cancelSale(id);
      showSuccessToast('Sale cancelled successfully');
      setOpenActionId(null);
      fetchSales();
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to cancel sale');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async (saleId: string) => {
    setOpenActionId(null);
    try {
      const sale = await getSaleById(saleId);
      if (!sale?.data) {
        showErrorToast('Could not load sale data');
        return;
      }
      
      const saleData = sale.data;
      const paymentTotal = (saleData.cashAmount || 0) + (saleData.cardAmount || 0) + (saleData.bankTransferAmount || 0);
      const paymentMethods = [];
      if (saleData.cashAmount > 0) paymentMethods.push(`Cash: ${currencySymbol}${saleData.cashAmount.toFixed(2)}`);
      if (saleData.cardAmount > 0) paymentMethods.push(`Card: ${currencySymbol}${saleData.cardAmount.toFixed(2)}`);
      if (saleData.bankTransferAmount > 0) paymentMethods.push(`Bank Transfer: ${currencySymbol}${saleData.bankTransferAmount.toFixed(2)}`);

      const subtotal = saleData.products?.reduce((sum: number, p: any) => sum + p.subtotal, 0) || 0;
      const specialOffer = saleData.specialOfferId && typeof saleData.specialOfferId === 'object'
        ? saleData.specialOfferId
        : null;
      const specialOfferDiscount = specialOffer
        ? (subtotal * specialOffer.percentage) / 100
        : 0;
      const subtotalAfterOffer = Math.max(0, subtotal - specialOfferDiscount);
      const discountAmount = saleData.saleDiscountType === 'percentage'
        ? subtotalAfterOffer * saleData.saleDiscountValue / 100
        : saleData.saleDiscountValue;
      const taxAmount = (subtotalAfterOffer - discountAmount) * saleData.saleTaxValue / 100;

      // Create PDF-ready HTML (Invoice format)
      const pdfHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Invoice - ${saleData.invoiceId || saleData._id}</title>
            <style>
              @media print {
                @page { margin: 1cm; }
                body { margin: 0; }
              }
              body {
                font-family: system-ui, -apple-system, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background: white;
                color: #333;
              }
              .header {
                border-bottom: 3px solid #1A3E73;
                padding-bottom: 20px;
                margin-bottom: 30px;
              }
              .header h1 {
                margin: 0 0 10px 0;
                font-size: 28px;
                font-weight: bold;
                color: #1A3E73;
              }
              .invoice-info {
                display: flex;
                justify-content: space-between;
                margin-bottom: 30px;
              }
              .info-box {
                flex: 1;
                padding: 15px;
                background: #f8f9fa;
                border-radius: 8px;
                margin: 0 10px;
              }
              .info-box h3 {
                margin: 0 0 10px 0;
                font-size: 14px;
                font-weight: 600;
                color: #64748B;
                text-transform: uppercase;
              }
              .info-box p {
                margin: 5px 0;
                font-size: 14px;
                color: #333;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
              }
              th {
                background-color: #1A3E73;
                color: white;
                padding: 12px;
                text-align: left;
                font-weight: 600;
                font-size: 12px;
                text-transform: uppercase;
              }
              td {
                padding: 10px 12px;
                border-bottom: 1px solid #e5e7eb;
                font-size: 14px;
              }
              .text-right {
                text-align: right;
              }
              .totals-section {
                margin-top: 30px;
                display: flex;
                justify-content: flex-end;
              }
              .totals-box {
                width: 300px;
                border: 2px solid #1A3E73;
                padding: 15px;
                border-radius: 8px;
              }
              .total-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                font-size: 14px;
              }
              .grand-total {
                font-size: 18px;
                font-weight: bold;
                margin-top: 10px;
                padding-top: 10px;
                border-top: 2px solid #1A3E73;
                color: #1A3E73;
              }
              .footer {
                text-align: center;
                margin-top: 40px;
                padding-top: 20px;
                border-top: 2px dashed #ddd;
                font-size: 12px;
                color: #666;
              }
              .status-badge {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 600;
              }
              .status-completed {
                background-color: #d1fae5;
                color: #065f46;
              }
              .status-draft {
                background-color: #f3f4f6;
                color: #374151;
              }
              .status-paid {
                background-color: #d1fae5;
                color: #065f46;
              }
              .status-partial {
                background-color: #fef3c7;
                color: #92400e;
              }
              .status-unpaid {
                background-color: #fee2e2;
                color: #991b1b;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>SALES INVOICE</h1>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <p style="margin: 5px 0;"><strong>Invoice ID:</strong> ${saleData.invoiceId || saleData._id}</p>
                  <p style="margin: 5px 0;"><strong>Date:</strong> ${formatDate(saleData.date)}</p>
                </div>
                <div style="text-align: right;">
                  <span class="status-badge status-${saleData.status.toLowerCase()}">${saleData.status.charAt(0).toUpperCase() + saleData.status.slice(1)}</span>
                </div>
              </div>
            </div>
            
            <div class="invoice-info">
              <div class="info-box">
                <h3>Bill To</h3>
                <p><strong>${saleData.customerId?.name || 'N/A'}</strong></p>
                ${saleData.customerId?.mobile ? `<p>Phone: ${saleData.customerId.mobile}</p>` : ''}
                ${saleData.customerId?.address ? `<p>${saleData.customerId.address}</p>` : ''}
              </div>
              <div class="info-box">
                <h3>Warehouse</h3>
                <p><strong>${saleData.warehouseId?.name || 'N/A'}</strong></p>
                <p>Payment Status: <span class="status-badge status-${saleData.paymentStatus.toLowerCase()}">${saleData.paymentStatus.charAt(0).toUpperCase() + saleData.paymentStatus.slice(1)}</span></p>
              </div>
            </div>
            
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th class="text-right">Quantity</th>
                  <th class="text-right">Unit Price</th>
                  <th class="text-right">Discount</th>
                  <th class="text-right">Tax</th>
                  <th class="text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${saleData.products?.map((p: any) => `
                  <tr>
                    <td>${p.productName}${p.variation ? `<br><small style="color: #666;">Variation: ${p.variation}</small>` : ''}</td>
                    <td class="text-right">${p.qty}</td>
                    <td class="text-right">${currencySymbol}${p.price.toFixed(2)}</td>
                    <td class="text-right">${p.discount > 0 ? `${p.discount}${p.discountType === 'percentage' ? '%' : ''}` : '0.00'}</td>
                    <td class="text-right">${p.tax > 0 ? `${p.tax}%` : '0.00'}</td>
                    <td class="text-right"><strong>${currencySymbol}${p.subtotal.toFixed(2)}</strong></td>
                  </tr>
                `).join('') || ''}
              </tbody>
            </table>
            
            <div class="totals-section">
              <div class="totals-box">
                <div class="total-row">
                  <span>Subtotal:</span>
                  <span>${currencySymbol}${subtotal.toFixed(2)}</span>
                </div>
                ${specialOfferDiscount > 0 ? `
                  <div class="total-row" style="color: #059669; font-weight: bold;">
                    <span>Special Offer (${specialOffer.offerName} - ${specialOffer.percentage}%):</span>
                    <span>-${currencySymbol}${specialOfferDiscount.toFixed(2)}</span>
                  </div>
                ` : ''}
                ${discountAmount > 0 ? `
                  <div class="total-row">
                    <span>Discount:</span>
                    <span>-${currencySymbol}${discountAmount.toFixed(2)}</span>
                  </div>
                ` : ''}
                ${taxAmount > 0 ? `
                  <div class="total-row">
                    <span>Tax (${saleData.saleTaxValue}%):</span>
                    <span>${currencySymbol}${taxAmount.toFixed(2)}</span>
                  </div>
                ` : ''}
                ${saleData.shippingCost > 0 ? `
                  <div class="total-row">
                    <span>Shipping:</span>
                    <span>${currencySymbol}${saleData.shippingCost.toFixed(2)}</span>
                  </div>
                ` : ''}
                <div class="total-row grand-total">
                  <span>Grand Total:</span>
                  <span>${currencySymbol}${saleData.total.toFixed(2)}</span>
                </div>
                ${paymentTotal > 0 ? `
                  <div class="total-row">
                    <span>Paid:</span>
                    <span style="color: #059669;">${currencySymbol}${paymentTotal.toFixed(2)}</span>
                  </div>
                  <div class="total-row">
                    <span>Payment Method:</span>
                    <span>${paymentMethods.join(', ') || 'N/A'}</span>
                  </div>
                ` : ''}
                ${saleData.balance > 0 ? `
                  <div class="total-row">
                    <span style="color: #dc2626;">Balance Due:</span>
                    <span style="color: #dc2626; font-weight: bold;">${currencySymbol}${saleData.balance.toFixed(2)}</span>
                  </div>
                ` : ''}
              </div>
            </div>
            
            <div class="footer">
              <p><strong>Thank you for your business!</strong></p>
              <p>Invoice generated on ${new Date(saleData.createdAt).toLocaleString()}</p>
            </div>
          </body>
        </html>
      `;

      // Create iframe and trigger print
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
        showErrorToast('Could not open print dialog');
        return;
      }
      
      doc.open();
      doc.write(pdfHtml);
      doc.close();
      
      // Wait for content to load, then print
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          // Clean up after print
          const removeIframe = () => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          };
          iframe.contentWindow?.addEventListener('afterprint', removeIframe);
          setTimeout(removeIframe, 1000);
        }, 250);
      };
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to generate PDF');
    }
  };

  const handleDownloadReceipt = async (saleId: string) => {
    setOpenActionId(null);
    try {
      const sale = await getSaleById(saleId);
      if (!sale?.data) {
        showErrorToast('Could not load sale data');
        return;
      }
      
      const saleData = sale.data;
      const paymentTotal = (saleData.cashAmount || 0) + (saleData.cardAmount || 0) + (saleData.bankTransferAmount || 0);
      const paymentMethods = [];
      if (saleData.cashAmount > 0) paymentMethods.push(`Cash: ${currencySymbol}${saleData.cashAmount.toFixed(2)}`);
      if (saleData.cardAmount > 0) paymentMethods.push(`Card: ${currencySymbol}${saleData.cardAmount.toFixed(2)}`);
      if (saleData.bankTransferAmount > 0) paymentMethods.push(`Bank Transfer: ${currencySymbol}${saleData.bankTransferAmount.toFixed(2)}`);

      const subtotal = saleData.products?.reduce((sum: number, p: any) => sum + p.subtotal, 0) || 0;
      const specialOffer = saleData.specialOfferId && typeof saleData.specialOfferId === 'object'
        ? saleData.specialOfferId
        : null;
      const specialOfferDiscount = specialOffer
        ? (subtotal * specialOffer.percentage) / 100
        : 0;
      const subtotalAfterOffer = Math.max(0, subtotal - specialOfferDiscount);
      const discountAmount = saleData.saleDiscountType === 'percentage'
        ? subtotalAfterOffer * saleData.saleDiscountValue / 100
        : saleData.saleDiscountValue;
      const taxAmount = (subtotalAfterOffer - discountAmount) * saleData.saleTaxValue / 100;

      // Create print-ready HTML
      const receiptHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt - ${saleData.invoiceId || saleData._id}</title>
            <style>
              @media print {
                @page { margin: 0.5cm; }
                body { margin: 0; }
              }
              body {
                font-family: system-ui, -apple-system, sans-serif;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background: white;
              }
              .header {
                text-align: center;
                border-bottom: 2px solid #000;
                padding-bottom: 15px;
                margin-bottom: 20px;
              }
              .header h1 {
                margin: 0 0 10px 0;
                font-size: 24px;
                font-weight: bold;
              }
              .info-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                font-size: 14px;
              }
              .info-row strong {
                font-weight: 600;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
              }
              th, td {
                padding: 8px;
                text-align: left;
                border-bottom: 1px solid #ddd;
              }
              th {
                background-color: #f5f5f5;
                font-weight: 600;
              }
              .text-right {
                text-align: right;
              }
              .totals {
                margin-top: 20px;
                border-top: 2px solid #000;
                padding-top: 10px;
              }
              .total-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 5px;
                font-size: 14px;
              }
              .grand-total {
                font-size: 18px;
                font-weight: bold;
                margin-top: 10px;
                padding-top: 10px;
                border-top: 2px solid #000;
              }
              .footer {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px dashed #ddd;
                font-size: 12px;
                color: #666;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>SALES RECEIPT</h1>
              <div class="info-row">
                <span><strong>Invoice ID:</strong> ${saleData.invoiceId || saleData._id}</span>
              </div>
              <div class="info-row">
                <span><strong>Date:</strong> ${formatDate(saleData.date)}</span>
              </div>
            </div>
            
            <div class="info-row">
              <span><strong>Customer:</strong> ${saleData.customerId?.name || 'N/A'}</span>
            </div>
            <div class="info-row">
              <span><strong>Warehouse:</strong> ${saleData.warehouseId?.name || 'N/A'}</span>
            </div>
            
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th class="text-right">Qty</th>
                  <th class="text-right">Price</th>
                  <th class="text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${saleData.products?.map((p: any) => `
                  <tr>
                    <td>${p.productName}${p.variation ? ` (${p.variation})` : ''}</td>
                    <td class="text-right">${p.qty}</td>
                    <td class="text-right">${currencySymbol}${p.price.toFixed(2)}</td>
                    <td class="text-right">${currencySymbol}${p.subtotal.toFixed(2)}</td>
                  </tr>
                `).join('') || ''}
              </tbody>
            </table>
            
            <div class="totals">
              <div class="total-row">
                <span>Subtotal:</span>
                <span>${currencySymbol}${subtotal.toFixed(2)}</span>
              </div>
              ${specialOfferDiscount > 0 ? `
                <div class="total-row" style="color: green; font-weight: bold;">
                  <span>Special Offer (${specialOffer.offerName} - ${specialOffer.percentage}%):</span>
                  <span>-${currencySymbol}${specialOfferDiscount.toFixed(2)}</span>
                </div>
              ` : ''}
              ${discountAmount > 0 ? `
                <div class="total-row">
                  <span>Discount:</span>
                  <span>-${currencySymbol}${discountAmount.toFixed(2)}</span>
                </div>
              ` : ''}
              ${taxAmount > 0 ? `
                <div class="total-row">
                  <span>Tax (${saleData.saleTaxValue}%):</span>
                  <span>${currencySymbol}${taxAmount.toFixed(2)}</span>
                </div>
              ` : ''}
              ${saleData.shippingCost > 0 ? `
                <div class="total-row">
                  <span>Shipping:</span>
                  <span>${currencySymbol}${saleData.shippingCost.toFixed(2)}</span>
                </div>
              ` : ''}
              <div class="total-row grand-total">
                <span>Grand Total:</span>
                <span>${currencySymbol}${saleData.total.toFixed(2)}</span>
              </div>
              ${paymentTotal > 0 ? `
                <div class="total-row">
                  <span>Paid:</span>
                  <span>${currencySymbol}${paymentTotal.toFixed(2)}</span>
                </div>
                <div class="total-row">
                  <span>Payment Method:</span>
                  <span>${paymentMethods.join(', ') || 'N/A'}</span>
                </div>
              ` : ''}
              ${saleData.balance > 0 ? `
                <div class="total-row">
                  <span style="color: red;">Balance Due:</span>
                  <span style="color: red;">${currencySymbol}${saleData.balance.toFixed(2)}</span>
                </div>
              ` : ''}
            </div>
            
            <div class="footer">
              <p>Thank you for your business!</p>
              <p>Status: ${saleData.status.toUpperCase()} | Payment: ${saleData.paymentStatus.toUpperCase()}</p>
            </div>
          </body>
        </html>
      `;

      // Create iframe and trigger print
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
        showErrorToast('Could not open print dialog');
        return;
      }
      
      doc.open();
      doc.write(receiptHtml);
      doc.close();
      
      // Wait for content to load, then print
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          // Clean up after print
          const removeIframe = () => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          };
          iframe.contentWindow?.addEventListener('afterprint', removeIframe);
          setTimeout(removeIframe, 1000);
        }, 250);
      };
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to generate receipt');
    }
  };

  useEffect(() => {
    if (!showPaymentsSaleId) {
      setSaleForPayments(null);
      return;
    }
    let cancelled = false;
    const fetchSaleData = async () => {
      try {
        setSaleForPayments(null); // Clear previous data while loading
        const res = await getSaleById(showPaymentsSaleId);
        if (!cancelled && res?.data) {
          // Ensure payments array exists and is properly formatted
          const saleData = res.data;
          
          // Debug: Log sale data to understand what we're receiving
          console.log('Sale data received:', {
            _id: saleData._id,
            total: saleData.total,
            cashAmount: saleData.cashAmount,
            cardAmount: saleData.cardAmount,
            bankTransferAmount: saleData.bankTransferAmount,
            payments: saleData.payments,
            paymentsLength: saleData.payments?.length
          });
          
          // Initialize payments array if it doesn't exist
          if (!saleData.payments || !Array.isArray(saleData.payments)) {
            saleData.payments = [];
          }
          
          // Normalize payment data - ensure all fields are present
          saleData.payments = saleData.payments.map((p: any) => {
            // Handle date - could be Date object, ISO string, or date string
            let paymentDate: Date | string;
            if (p.date instanceof Date) {
              paymentDate = p.date;
            } else if (typeof p.date === 'string') {
              paymentDate = p.date;
            } else {
              paymentDate = saleData.date || new Date();
            }
            
            return {
              date: paymentDate,
              reference: p.reference || '',
              paymentType: p.paymentType || 'cash',
              amount: Number(p.amount) || 0
            };
          });
          
          // If payments array is empty but we have payment amounts, create entries
          // Also check backend response - it might have already created payments
          if (saleData.payments.length === 0) {
            const cashAmount = Number(saleData.cashAmount) || 0;
            const cardAmount = Number(saleData.cardAmount) || 0;
            const bankAmount = Number(saleData.bankTransferAmount) || 0;
            const totalPaid = cashAmount + cardAmount + bankAmount;
            const saleDate = saleData.date ? new Date(saleData.date) : new Date();
            
            // Create payment entries from amounts if they exist
            if (cashAmount > 0) {
              saleData.payments.push({
                date: saleDate,
                reference: '',
                paymentType: 'cash',
                amount: cashAmount
              });
            }
            if (cardAmount > 0) {
              saleData.payments.push({
                date: saleDate,
                reference: '',
                paymentType: 'card',
                amount: cardAmount
              });
            }
            if (bankAmount > 0) {
              saleData.payments.push({
                date: saleDate,
                reference: '',
                paymentType: 'bankTransfer',
                amount: bankAmount
              });
            }
            
            // If backend created payments but they're not in the response, check again
            // This handles cases where backend might have created payments but they weren't returned
            if (saleData.payments.length === 0 && totalPaid === 0) {
              // No payments exist - this is fine, will show "No payment entries"
              console.log('Sale has no payments:', saleData._id);
            }
          }
          
          setSaleForPayments(saleData);
        }
      } catch (error: any) {
        if (!cancelled) {
          console.error('Error fetching sale data:', error);
          showErrorToast(error.message || 'Failed to fetch sale data');
          setSaleForPayments(null);
        }
      }
    };
    fetchSaleData();
    return () => { cancelled = true; };
  }, [showPaymentsSaleId]);

  const handleSavePayment = async () => {
    if (!createPaymentSale || paymentForm.amount <= 0 || paymentForm.amount > createPaymentSale.balance) {
      showErrorToast('Invalid paying amount');
      return;
    }
    setPaymentSubmitting(true);
    try {
      await addPayment(createPaymentSale._id, {
        date: paymentForm.date || undefined,
        reference: paymentForm.reference || undefined,
        paymentType: paymentForm.paymentType,
        amount: paymentForm.amount
      });
      showSuccessToast('Payment added successfully');
      setCreatePaymentSale(null);
      setPaymentForm({ date: '', reference: '', paymentType: 'cash', amount: 0 });
      // Refresh sale data if Show Payments modal is open for this sale
      if (showPaymentsSaleId === createPaymentSale._id) {
        const saleRes = await getSaleById(createPaymentSale._id);
        if (saleRes?.data) {
          const saleData = saleRes.data;
          if (!saleData.payments || !Array.isArray(saleData.payments)) {
            saleData.payments = [];
          }
          setSaleForPayments(saleData);
        }
      }
      fetchSales();
    } catch (e: any) {
      showErrorToast(e.message || 'Failed to add payment');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const handleDeletePayment = async (saleId: string, index: number) => {
    if (!window.confirm('Remove this payment record?')) return;
    try {
      await deletePayment(saleId, index);
      showSuccessToast('Payment removed');
      setEditPaymentState(null);
      // Refresh sale data if Show Payments modal is open for this sale
      if (showPaymentsSaleId === saleId) {
        const res = await getSaleById(saleId);
        if (res?.data) {
          const saleData = res.data;
          if (!saleData.payments || !Array.isArray(saleData.payments)) {
            saleData.payments = [];
          }
          setSaleForPayments(saleData);
        }
      }
      fetchSales();
    } catch (e: any) {
      showErrorToast(e.message || 'Failed to remove payment');
    }
  };

  const openEditPayment = (sale: SaleRow, index: number) => {
    const p = sale.payments?.[index];
    if (!p) return;
    const d = new Date(p.date);
    const dateStr = d.toISOString().slice(0, 10);
    const saleReference = (sale as any).invoiceId || sale._id;
    setEditPaymentState({
      saleId: sale._id,
      index,
      amountToPay: p.amount,
      form: {
        date: dateStr,
        reference: p.reference || saleReference,
        paymentType: p.paymentType,
        amount: p.amount
      }
    });
  };

  const handleSaveEditPayment = async () => {
    if (!editPaymentState || editPaymentState.form.amount <= 0) {
      showErrorToast('Paying amount is required');
      return;
    }
    const otherTotal = (saleForPayments?.payments || []).reduce((sum, pay, i) => (i === editPaymentState.index ? sum : sum + pay.amount), 0);
    if (editPaymentState.form.amount + otherTotal > (saleForPayments?.total ?? 0)) {
      showErrorToast('Total payments cannot exceed sale total');
      return;
    }
    setPaymentSubmitting(true);
    try {
      await updatePayment(editPaymentState.saleId, editPaymentState.index, {
        date: editPaymentState.form.date || undefined,
        reference: editPaymentState.form.reference || undefined,
        paymentType: editPaymentState.form.paymentType,
        amount: editPaymentState.form.amount
      });
      showSuccessToast('Payment updated');
      setEditPaymentState(null);
      // Refresh sale data if Show Payments modal is open for this sale
      if (showPaymentsSaleId === editPaymentState.saleId) {
        const res = await getSaleById(editPaymentState.saleId);
        if (res?.data) {
          const saleData = res.data;
          if (!saleData.payments || !Array.isArray(saleData.payments)) {
            saleData.payments = [];
          }
          setSaleForPayments(saleData);
        }
      }
      fetchSales();
    } catch (e: any) {
      showErrorToast(e.message || 'Failed to update payment');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const formatPaymentType = (t: string) => {
    if (t === 'bankTransfer') return 'Bank Transfer';
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  const formatCurrency = (amount: number) => {
    return `${currencyCode} ${amount.toFixed(2).replace('.', ',')}`;
  };

  const formatCreatedOn = (dateString: string) => {
    const d = new Date(dateString);
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    d.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/-/g, '-');
    return `${time} ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-slate-100 text-slate-700';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'returned': return 'bg-amber-100 text-amber-800';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selectedIds.length === sales.length) setSelectedIds([]);
    else setSelectedIds(sales.map(s => s._id));
  };

  const handleDeleteMultiples = async () => {
    if (selectedIds.length === 0) return;

    const completedSelected = sales.filter(
      (sale) => selectedIds.includes(sale._id) && sale.status === 'completed'
    );
    if (completedSelected.length > 0) {
      showErrorToast('Completed sales cannot be deleted');
      return;
    }

    if (!window.confirm(`Delete ${selectedIds.length} sale(s)? This cannot be undone.`)) return;
    setLoading(true);
    try {
      for (const id of selectedIds) {
        await deleteSale(id);
      }
      showSuccessToast(`${selectedIds.length} sale(s) deleted`);
      setSelectedIds([]);
      fetchSales();
    } catch (e: any) {
      showErrorToast(e.message || 'Failed to delete some sales');
    } finally {
      setLoading(false);
    }
  };

  const pageTotal = sales.reduce((acc, s) => ({
    total: acc.total + s.total,
    paid: acc.paid + (s.cashAmount + s.cardAmount + s.bankTransferAmount),
    due: acc.due + s.balance
  }), { total: 0, paid: 0, due: 0 });

  const startRecord = (pagination.page - 1) * pagination.limit + 1;
  const endRecord = Math.min(pagination.page * pagination.limit, pagination.total);

  const handleSort = (field: 'total' | 'createdAt') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const SortIcon = () => (
    <ArrowUpDown className="w-4 h-4 inline-block ml-1 text-slate-500" aria-hidden />
  );

  return (
    <div className="p-6 bg-[#F8FAFC] min-h-screen">
      <div className="mb-6">
        <h1 className="text-4xl font-black text-[#1A3E73] mb-2">SALES</h1>
        <p className="text-[#64748B] font-bold">View all sale transactions</p>
      </div>
      
      {/* Top bar: Search left, actions right-aligned */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 max-w-md">
          <SearchBar onSearch={setSearchQuery} placeholder="Search" />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteMultiples}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium text-sm"
            >
              Delete Multiples
            </button>
          )}
          <div className="relative">
            <button
              ref={filterTriggerRef}
              type="button"
              onClick={() => setShowFilterModal(!showFilterModal)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition text-white ${showFilterModal ? 'bg-[#0F2A55] ring-2 ring-[#1A3E73] ring-offset-2' : 'bg-[#1A3E73] hover:bg-[#0F2A55]'}`}
              title="Filter"
            >
              <Filter size={18} />
            </button>
            {showFilterModal && filterMenuPosition && createPortal(
              <div
                ref={filterMenuRef}
                className="bg-white rounded-lg shadow-xl border border-slate-200 p-4 z-[9999]"
                style={{
                  position: 'fixed',
                  left: filterMenuPosition.left,
                  width: '280px',
                  ...(filterMenuPosition.top !== undefined ? { top: filterMenuPosition.top } : {}),
                  ...(filterMenuPosition.bottom !== undefined ? { bottom: filterMenuPosition.bottom } : {}),
                }}
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Status:</label>
                    <select
                      value={filters.status}
                      onChange={(e) => {
                        handleFilterChange('status', e.target.value);
                        fetchSales({ page: 1 });
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white text-sm"
                    >
                      <option value="">All</option>
                      <option value="draft">Draft</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="returned">Returned</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Payment Status:</label>
                    <select
                      value={filters.paymentStatus}
                      onChange={(e) => {
                        handleFilterChange('paymentStatus', e.target.value);
                        fetchSales({ page: 1 });
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white text-sm"
                    >
                      <option value="">All</option>
                      <option value="paid">Paid</option>
                      <option value="partial">Partial</option>
                      <option value="unpaid">Unpaid</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Payment Type <span className="text-red-500">*</span>:</label>
                    <select
                      value={filters.paymentType}
                      onChange={(e) => {
                        handleFilterChange('paymentType', e.target.value);
                        fetchSales({ page: 1 });
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white text-sm"
                    >
                      <option value="">All</option>
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="bankTransfer">Bank Transfer</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setFilters({ customerId: '', warehouseId: '', paymentStatus: '', paymentType: '', businessType: '', status: '' });
                      setPagination((prev) => ({ ...prev, page: 1 }));
                      fetchSales({ page: 1 });
                      setShowFilterModal(false);
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 text-sm font-medium bg-slate-50"
                  >
                    Reset
                  </button>
                </div>
              </div>,
              document.body
            )}
          </div>
          <div className="relative">
            <button
              ref={dateTriggerRef}
              type="button"
              onClick={() => setShowDateDropdown(!showDateDropdown)}
              className="px-3 py-2 border border-slate-200 rounded-lg bg-white flex items-center gap-2 hover:bg-slate-50 text-sm text-slate-600"
            >
              <Calendar size={16} />
              <span className={filterDate ? 'text-[#1A3E73] font-medium' : ''}>{getDisplayDateText()}</span>
            </button>
            {showDateDropdown && dateMenuPosition && createPortal(
              <div
                ref={dateMenuRef}
                className="bg-white border border-slate-200 rounded-lg shadow-lg z-[9999]"
                style={{
                  position: 'fixed',
                  left: dateMenuPosition.left,
                  width: selectedDateRange === 'Custom Range' ? '320px' : '200px',
                  ...(dateMenuPosition.top !== undefined ? { top: dateMenuPosition.top } : {}),
                  ...(dateMenuPosition.bottom !== undefined ? { bottom: dateMenuPosition.bottom } : {}),
                }}
              >
                {selectedDateRange === 'Custom Range' ? (
                  <div className="p-4">
                    <div className="flex gap-2 mb-4">
                      <input
                        type="date"
                        value={filterDate}
                        onChange={e => setFilterDate(e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#1A3E73]"
                        placeholder="Start Date"
                      />
                      <input
                        type="date"
                        value={filterDateEnd}
                        onChange={e => setFilterDateEnd(e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-[#1A3E73]"
                        placeholder="End Date"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleApplyCustomRange}
                        className="flex-1 px-4 py-2 bg-[#1A3E73] text-white rounded-lg hover:bg-[#0F2A55] text-sm font-medium"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={handleResetCustomRange}
                        className="flex-1 px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 text-sm font-medium"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-2">
                    <button type="button" onClick={() => handleDateRangeSelect('Today')} className="w-full px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50">Today</button>
                    <button type="button" onClick={() => handleDateRangeSelect('This Week')} className="w-full px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50">This Week</button>
                    <button type="button" onClick={() => handleDateRangeSelect('Last Week')} className="w-full px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50">Last Week</button>
                    <button type="button" onClick={() => handleDateRangeSelect('This Month')} className="w-full px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50">This Month</button>
                    <button type="button" onClick={() => handleDateRangeSelect('Last Month')} className="w-full px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50">Last Month</button>
                    <div className="border-t border-slate-200 my-1" />
                    <button
                      type="button"
                      onClick={() => handleDateRangeSelect('Custom Range')}
                      className={`w-full px-4 py-2 text-left text-sm rounded-lg mx-2 ${
                        selectedDateRange === 'Custom Range'
                          ? 'bg-[#1A3E73] text-white'
                          : 'text-[#1A3E73] hover:bg-slate-50'
                      }`}
                    >
                      Custom Range
                    </button>
                    <div className="border-t border-slate-200 my-1" />
                    <button type="button" onClick={() => handleDateRangeSelect('Reset')} className="w-full px-4 py-2 text-center text-sm text-[#64748B] hover:bg-slate-50 font-medium">Reset</button>
                  </div>
                )}
              </div>,
              document.body
            )}
          </div>
          <Link
            to="/createSale"
            className="px-4 py-2 rounded-lg bg-[#1A3E73] text-white hover:bg-[#0F2A55] font-medium text-sm flex items-center gap-2"
          >
            <Plus size={18} /> Create Sale
          </Link>
        </div>
      </div>

      {/* Sales Table - match reference POS layout */}
      <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative ${loading ? 'opacity-75 pointer-events-none' : ''}`}>
        {loading && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 rounded-xl">
            <div className="text-slate-600 font-medium">Loading...</div>
          </div>
        )}
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600 text-xs font-semibold uppercase tracking-wider">
            <tr>
              <th className="p-3 w-10">
                <input type="checkbox" checked={sales.length > 0 && selectedIds.length === sales.length} onChange={selectAll} className="rounded border-slate-300 text-[#1A3E73] focus:ring-[#1A3E73]" />
              </th>
              <th className="p-3">REFERENCE</th>
              <th className="p-3">USER</th>
              <th className="p-3">CUSTOMER</th>
              <th className="p-3">WAREHOUSE</th>
              <th className="p-3">STATUS</th>
              <th className="p-3 text-right">
                <button type="button" onClick={() => handleSort('total')} className="inline-flex items-center text-slate-600 hover:text-[#1A3E73] font-semibold uppercase tracking-wider">
                  GRAND TOTAL
                  <SortIcon />
                </button>
              </th>
              <th className="p-3 text-right">PAID</th>
              <th className="p-3 text-right">DUE</th>
              <th className="p-3">PAYMENT STATUS</th>
              <th className="p-3">PAYMENT TYPE</th>
              <th className="p-3">
                <button type="button" onClick={() => handleSort('createdAt')} className="inline-flex items-center text-slate-600 hover:text-[#1A3E73] font-semibold uppercase tracking-wider">
                  CREATED ON
                  <SortIcon />
                </button>
              </th>
              <th className="p-3 text-center w-14">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={13} className="p-6 text-center text-slate-500">Loading...</td>
              </tr>
            ) : sales.length === 0 ? (
              <tr>
                <td colSpan={13} className="p-6 text-center text-slate-500 italic">No sales found</td>
              </tr>
            ) : (
              sales.map((sale, idx) => {
                const paymentTotal = sale.cashAmount + sale.cardAmount + sale.bankTransferAmount;
                return (
                  <tr key={sale._id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50 hover:bg-slate-100/50'}>
                    <td className="p-3">
                      <input type="checkbox" checked={selectedIds.includes(sale._id)} onChange={() => toggleSelect(sale._id)} className="rounded border-slate-300 text-[#1A3E73] focus:ring-[#1A3E73]" />
                    </td>
                    <td className="p-3">
                      <button type="button" onClick={() => navigate(`/saleInvoice/${sale._id}`)} className="text-[#1A3E73] font-medium hover:bg-red-50 hover:text-red-700 px-2 py-1 rounded transition">
                        {sale.invoiceId || sale._id}
                      </button>
                    </td>
                    <td className="p-3 text-slate-700">{sale.createdBy?.name ?? '—'}</td>
                    <td className="p-3 text-slate-700">{sale.customerId?.name ?? '—'}</td>
                    <td className="p-3 text-slate-700">{sale.warehouseId?.name ?? '—'}</td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(sale.status)}`}>
                        {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium text-slate-800">{formatCurrency(sale.total)}</td>
                    <td className="p-3 text-right font-medium text-slate-800">{formatCurrency(paymentTotal)}</td>
                    <td className="p-3 text-right font-medium text-slate-800">{formatCurrency(sale.balance)}</td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getPaymentStatusColor(sale.paymentStatus)}`}>
                        {sale.paymentStatus.charAt(0).toUpperCase() + sale.paymentStatus.slice(1)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                        {getPaymentType(sale)}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{formatCreatedOn(sale.createdAt)}</td>
                    <td className="p-3 text-center">
                      <button
                        ref={(el) => {
                          if (el) {
                            triggerRefs.current.set(sale._id, el);
                          } else {
                            triggerRefs.current.delete(sale._id);
                          }
                        }}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setOpenActionId(prev => prev === sale._id ? null : sale._id); }}
                        className="p-1.5 rounded text-slate-500 hover:bg-slate-200 transition"
                        title="Actions"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {!loading && sales.length > 0 && (
            <tfoot className="bg-slate-100 border-t-2 border-slate-200 text-sm font-semibold">
              <tr>
                <td colSpan={6} className="p-3 text-slate-600">Total</td>
                <td className="p-3 text-right text-slate-800">{formatCurrency(pageTotal.total)}</td>
                <td className="p-3 text-right text-slate-800">{formatCurrency(pageTotal.paid)}</td>
                <td className="p-3 text-right text-slate-800">{formatCurrency(pageTotal.due)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>

        {/* Actions menu portal (avoids overflow-hidden clipping) */}
        {openActionId && actionMenuPosition && (() => {
          const sale = sales.find(s => s._id === openActionId);
          if (!sale) return null;
          const style: React.CSSProperties = {
            position: 'fixed',
            left: actionMenuPosition.left,
            zIndex: 9999,
            minWidth: 200,
            ...(actionMenuPosition.top !== undefined ? { top: actionMenuPosition.top } : {}),
            ...(actionMenuPosition.bottom !== undefined ? { bottom: actionMenuPosition.bottom } : {}),
          };
          return createPortal(
            <div ref={menuRef} className="bg-white border border-slate-200 rounded-lg shadow-xl py-1" style={style}>
              {/* 1. View Sale */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate(`/saleInvoice/${sale._id}`); setOpenActionId(null); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50 transition"
              >
                <Eye size={16} /> View Sale
              </button>
              
              {/* 2. Download PDF */}
              <button 
                type="button" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  handleDownloadPDF(sale._id); 
                  setOpenActionId(null);
                }} 
                className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50 cursor-pointer transition"
              >
                <FileText size={16} /> Download PDF
              </button>
              
              {/* 3. Download Receipt */}
              <button 
                type="button" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  handleDownloadReceipt(sale._id); 
                }} 
                className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50 cursor-pointer transition"
              >
                <Download size={16} /> Download Receipt
              </button>
              
              {/* 4. Show Payments */}
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); setShowPaymentsSaleId(sale._id); setOpenActionId(null); }} 
                className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50 transition"
              >
                <DollarSign size={16} /> Show Payments
              </button>
              
              {/* 5. Create Sale Return */}
              <button 
                type="button" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  navigate(`/createSaleReturn?saleId=${sale._id}`);
                  setOpenActionId(null);
                }} 
                className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-[#1A3E73] hover:bg-slate-50 cursor-pointer transition"
              >
                <ShoppingCart size={16} /> Create Sale Return
              </button>
              
              {/* 6. Cancel Sale */}
              {sale.status !== 'cancelled' && sale.status !== 'returned' && (
                <button 
                  type="button" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    handleCancelSale(sale._id); 
                    setOpenActionId(null);
                  }} 
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-slate-50 cursor-pointer transition"
                >
                  <X size={16} /> Cancel Sale
                </button>
              )}
              
              {/* 7. Edit Sale */}
              <button 
                type="button" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (sale.status === 'cancelled' || sale.status === 'returned') {
                    showErrorToast(`Cannot edit a ${sale.status} sale`);
                    setOpenActionId(null);
                    return;
                  }
                  navigate(`/editSale/${sale._id}`); 
                  setOpenActionId(null);
                }} 
                className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition ${
                  sale.status === 'cancelled' || sale.status === 'returned'
                    ? 'text-slate-400 hover:bg-slate-50 cursor-pointer'
                    : 'text-[#1A3E73] hover:bg-slate-50 cursor-pointer'
                }`}
              >
                <Edit size={16} /> Edit Sale
              </button>
              
              {/* Divider */}
              <div className="border-t border-slate-200 my-1" />
              
              {/* 7. Delete Sale */}
              <button 
                type="button" 
                onClick={(e) => {
                  e.stopPropagation();
                  if (sale.status === 'completed') {
                    showErrorToast('Completed sales cannot be deleted');
                    setOpenActionId(null);
                    return;
                  }
                  setToDelete(sale._id);
                  setOpenActionId(null);
                }} 
                className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition ${
                  sale.status === 'completed'
                    ? 'text-slate-400 hover:bg-slate-50 cursor-not-allowed'
                    : 'text-red-600 hover:bg-slate-50'
                }`}
              >
                <Trash2 size={16} /> Delete Sale
              </button>
            </div>,
            document.body
          );
        })()}

        {/* Pagination - match reference: records per page, range, << < > >> */}
        <div className="bg-slate-100 px-4 py-3 flex items-center justify-between border-t border-slate-200 flex-wrap gap-2">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>Records per page</span>
            <select
              value={pagination.limit}
              onChange={(e) => setPagination({ ...pagination, limit: Number(e.target.value), page: 1 })}
              className="border border-slate-300 rounded px-2 py-1 bg-white text-slate-700"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>{pagination.total === 0 ? '0 of 0' : `${startRecord}-${endRecord} of ${pagination.total}`}</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPagination({ ...pagination, page: 1 })} disabled={pagination.page <= 1} className="p-2 rounded border border-slate-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600" title="First page">«</button>
            <button type="button" onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })} disabled={pagination.page <= 1} className="p-2 rounded border border-slate-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600" title="Previous">‹</button>
            <button type="button" onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })} disabled={pagination.page >= pagination.pages} className="p-2 rounded border border-slate-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600" title="Next">›</button>
            <button type="button" onClick={() => setPagination({ ...pagination, page: pagination.pages })} disabled={pagination.page >= pagination.pages} className="p-2 rounded border border-slate-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600" title="Last page">»</button>
          </div>
        </div>
      </div>


      {/* Show Payments modal */}
      {showPaymentsSaleId && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-modal="true" role="dialog">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPaymentsSaleId(null)} aria-hidden="true" />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-slate-200">
                <h3 className="text-lg font-bold text-[#1A3E73]">Show Payments</h3>
                <button type="button" onClick={() => setShowPaymentsSaleId(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-4">
                {!saleForPayments ? (
                  <div className="py-8 text-center text-slate-500">Loading...</div>
                ) : (() => {
                  // Get payments array - use same logic as sales table
                  // Sales table calculates: paymentTotal = sale.cashAmount + sale.cardAmount + sale.bankTransferAmount
                  let payments = Array.isArray(saleForPayments.payments) ? saleForPayments.payments : [];
                  
                  // Calculate payment total the same way as sales table
                  const cashAmount = Number(saleForPayments.cashAmount) || 0;
                  const cardAmount = Number(saleForPayments.cardAmount) || 0;
                  const bankAmount = Number(saleForPayments.bankTransferAmount) || 0;
                  const paymentTotal = cashAmount + cardAmount + bankAmount; // Same calculation as sales table
                  
                  // If payments array is empty but we have payment amounts, create entries
                  // This matches the backend logic in getSales/getSaleById
                  if (payments.length === 0 && paymentTotal > 0) {
                    const saleDate = saleForPayments.date ? new Date(saleForPayments.date) : new Date();
                    const saleReference = saleForPayments.invoiceId || saleForPayments._id;
                    
                    if (cashAmount > 0) {
                      payments.push({
                        date: saleDate,
                        reference: saleReference,
                        paymentType: 'cash',
                        amount: cashAmount
                      });
                    }
                    if (cardAmount > 0) {
                      payments.push({
                        date: saleDate,
                        reference: saleReference,
                        paymentType: 'card',
                        amount: cardAmount
                      });
                    }
                    if (bankAmount > 0) {
                      payments.push({
                        date: saleDate,
                        reference: saleReference,
                        paymentType: 'bankTransfer',
                        amount: bankAmount
                      });
                    }
                  }
                  
                  // Calculate totals from payments array (should match paymentTotal)
                  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                  const cashPaid = payments.filter(p => p.paymentType === 'cash').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                  const cardPaid = payments.filter(p => p.paymentType === 'card').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                  const bankPaid = payments.filter(p => p.paymentType === 'bankTransfer').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
                  
                  // Use balance from sale data (same as sales table) or calculate
                  const dueAmount = Number(saleForPayments.balance) || ((Number(saleForPayments.total) || 0) - totalPaid);
                  
                  return (
                    <>
                      <div className="mb-4 text-sm text-slate-600">
                        Sale total: {formatCurrency(saleForPayments.total)} · Paid: {formatCurrency(totalPaid)} · Due: {formatCurrency(dueAmount)}
                      </div>
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-[#1A3E73] text-white text-xs font-semibold uppercase tracking-wider">
                            <tr>
                              <th className="p-3">DATE</th>
                              <th className="p-3">REFERENCE</th>
                              <th className="p-3">AMOUNT</th>
                              <th className="p-3">PAID BY</th>
                              <th className="p-3 text-center">ACTION</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {payments.length > 0 ? (
                              payments.map((p, displayIdx) => {
                                // Handle date parsing - could be Date object, ISO string, or date string
                                let dateObj: Date;
                                if (p.date instanceof Date) {
                                  dateObj = p.date;
                                } else if (typeof p.date === 'string') {
                                  dateObj = new Date(p.date);
                                } else {
                                  dateObj = new Date();
                                }
                                // Validate date
                                if (isNaN(dateObj.getTime())) {
                                  dateObj = new Date();
                                }
                                const formattedDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                                
                                return (
                                  <tr key={`${displayIdx}-${p.amount}-${p.paymentType}-${p.date}`} className="hover:bg-slate-50">
                                    <td className="p-3 text-slate-700">{formattedDate}</td>
                                    <td className="p-3 text-slate-700">
                                      {p.reference || saleForPayments.invoiceId || saleForPayments._id}
                                    </td>
                                    <td className="p-3 font-medium text-slate-800">{formatCurrency(Number(p.amount) || 0)}</td>
                                    <td className="p-3 text-slate-700">{formatPaymentType(p.paymentType || 'cash')}</td>
                                    <td className="p-3 text-center">
                                      <span className="inline-flex items-center gap-2 justify-center">
                                        <button 
                                          type="button" 
                                          onClick={() => openEditPayment(saleForPayments, displayIdx)} 
                                          className="p-1.5 rounded border border-slate-300 hover:bg-slate-50 transition" 
                                          title="Edit payment"
                                        >
                                          <Edit size={16} className="text-green-600" />
                                        </button>
                                        <button 
                                          type="button" 
                                          onClick={() => handleDeletePayment(saleForPayments._id, displayIdx)} 
                                          className="p-1.5 rounded border border-slate-300 hover:bg-slate-50 transition" 
                                          title="Delete payment"
                                        >
                                          <Trash2 size={16} className="text-red-600" />
                                        </button>
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={5} className="p-4 text-center text-slate-500">
                                  <div className="space-y-2">
                                    <div className="font-medium">No payment entries found for this sale.</div>
                                    <div className="text-sm">
                                      Sale Reference: <span className="font-semibold">{saleForPayments.invoiceId || saleForPayments._id}</span>
                                    </div>
                                    <div className="text-sm">
                                      Total paid: {formatCurrency(totalPaid)} (Cash: {formatCurrency(cashPaid)}, Card: {formatCurrency(cardPaid)}, Bank: {formatCurrency(bankPaid)})
                                    </div>
                                    {dueAmount > 0 && (
                                      <div className="text-sm text-red-600 font-medium">
                                        Amount due: {formatCurrency(dueAmount)}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment modal */}
      {editPaymentState && (
        <div className="fixed inset-0 z-[60] overflow-y-auto" aria-modal="true" role="dialog">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditPaymentState(null)} aria-hidden="true" />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-slate-200">
                <h3 className="text-lg font-bold text-[#1A3E73]">Edit Payment</h3>
                <button type="button" onClick={() => setEditPaymentState(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date :</label>
                  <div className="relative">
                    <input type="date" value={editPaymentState.form.date} onChange={e => setEditPaymentState(s => s ? { ...s, form: { ...s.form, date: e.target.value } } : null)} className="w-full pl-3 pr-9 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73]" />
                    <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reference :</label>
                  <input
                    type="text"
                    value={editPaymentState.form.reference}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 cursor-not-allowed"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Type : <span className="text-red-500">*</span></label>
                  <select value={editPaymentState.form.paymentType} onChange={e => setEditPaymentState(s => s ? { ...s, form: { ...s.form, paymentType: e.target.value as 'cash' | 'card' | 'bankTransfer' } } : null)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73]">
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bankTransfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount To Pay :</label>
                  <input type="text" readOnly value={editPaymentState.amountToPay.toFixed(2)} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-600" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Paying Amount : <span className="text-red-500">*</span></label>
                  <input type="number" min={0.01} step={0.01} value={editPaymentState.form.amount || ''} onChange={e => setEditPaymentState(s => s ? { ...s, form: { ...s.form, amount: parseFloat(e.target.value) || 0 } } : null)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73]" />
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
                <button type="button" onClick={handleSaveEditPayment} disabled={paymentSubmitting || !editPaymentState.form.amount} className="px-4 py-2 rounded-lg bg-[#1A3E73] text-white hover:bg-[#0F2A55] font-medium disabled:opacity-50 disabled:cursor-not-allowed">Save</button>
                <button type="button" onClick={() => setEditPaymentState(null)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Payment modal */}
      {createPaymentSale && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-modal="true" role="dialog">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCreatePaymentSale(null)} aria-hidden="true" />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-slate-200">
                <h3 className="text-lg font-bold text-[#1A3E73]">Create Payment</h3>
                <button type="button" onClick={() => setCreatePaymentSale(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date : <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type="date" value={paymentForm.date} onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))} className="w-full pl-3 pr-9 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73]" />
                    <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reference :</label>
                  <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))} placeholder="N/A" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73]" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Type : <span className="text-red-500">*</span></label>
                  <select value={paymentForm.paymentType} onChange={e => setPaymentForm(f => ({ ...f, paymentType: e.target.value as 'cash' | 'card' | 'bankTransfer' }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73]">
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bankTransfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount To Pay :</label>
                  <input type="text" readOnly value={createPaymentSale.balance.toFixed(2)} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-600" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Paying Amount : <span className="text-red-500">*</span></label>
                  <input type="number" min={0.01} max={createPaymentSale.balance} step={0.01} value={paymentForm.amount || ''} onChange={e => setPaymentForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73]" />
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
                <button type="button" onClick={handleSavePayment} disabled={paymentSubmitting || !paymentForm.amount || paymentForm.amount > createPaymentSale.balance} className="px-4 py-2 rounded-lg bg-[#1A3E73] text-white hover:bg-[#0F2A55] font-medium disabled:opacity-50 disabled:cursor-not-allowed">Save</button>
                <button type="button" onClick={() => setCreatePaymentSale(null)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <DeleteConfirmModal
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
};

export default ViewSales;
