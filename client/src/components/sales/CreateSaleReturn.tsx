import axios from 'axios';
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast, showSuccessToast } from '../../utils/toast';

interface ReturnItem {
  id: string;
  productId: string;
  productName: string;
  code?: string;
  variation?: string;
  batch?: string;
  soldQty: number;
  returnQty: number;
  unitPrice: number;
  subtotal: number;
  originalSubtotal: number;
}

interface Warehouse {
  _id: string;
  name: string;
}

interface Customer {
  _id: string;
  name: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const CREATE_SALE_RETURN_REASONS = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'customer_request', label: 'Customer Request' },
  { value: 'other', label: 'Other' }
];

const CreateSaleReturn: React.FC = () => {
  const navigate = useNavigate();
  const { currencyCode } = useCurrency();
  const [searchParams] = useSearchParams();
  const saleIdFromUrl = searchParams.get('saleId');

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedWarehouseName, setSelectedWarehouseName] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('damaged');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [submittedReturn, setSubmittedReturn] = useState<any>(null);
  const [prefillLoading, setPrefillLoading] = useState(!!saleIdFromUrl);
  const [saleStatus, setSaleStatus] = useState<string>('');
  const [isReturnBlocked, setIsReturnBlocked] = useState(false);

  useEffect(() => {
    const fetchInitial = async () => {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      try {
        const [warRes, custRes] = await Promise.all([
          axios.get(`${API_BASE}/warehouses`, config).catch(() => ({ data: { data: [] } })),
          axios.get(`${API_BASE}/customers`, config).catch(() => ({ data: { data: [] } }))
        ]);
        setWarehouses(warRes.data.data || []);
        setCustomers(custRes.data.data || []);
      } catch {
        showErrorToast('Error loading data');
      }
    };
    fetchInitial();
  }, []);

  useEffect(() => {
    if (!saleIdFromUrl) return;
    const loadSale = async () => {
      setPrefillLoading(true);
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      try {
        const res = await axios.get(`${API_BASE}/sales/${saleIdFromUrl}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const sale = res.data.data;
        const normalizedStatus = String(sale.status || '').toLowerCase();
        const blocked = normalizedStatus === 'returned' || normalizedStatus === 'cancelled';

        setSaleStatus(normalizedStatus);
        setIsReturnBlocked(blocked);

        if (blocked) {
          showErrorToast(`Sale return is not allowed because this sale is already ${normalizedStatus}.`);
          setItems([]);
          setPrefillLoading(false);
          return;
        }
        
        // Extract customer and warehouse info
        const custId = sale.customerId?._id ?? sale.customerId;
        const whId = sale.warehouseId?._id ?? sale.warehouseId;
        const whName = sale.warehouseId?.name ?? warehouses.find(w => w._id === whId)?.name ?? '';
        const custName = sale.customerId?.name ?? customers.find(c => c._id === custId)?.name ?? '';

        setSelectedCustomerId(custId);
        setCustomerName(custName);
        setSelectedWarehouseId(whId);
        setSelectedWarehouseName(whName);

        // Prefill items from sale products
        if (sale.products?.length) {
          const newItems: ReturnItem[] = sale.products.map((product: any) => ({
            id: String(Date.now() + Math.random()),
            productId: product.productId?._id ?? product.productId,
            productName: product.productName ?? product.name ?? 'Product',
            code: product.code ?? product.productCode,
            variation: product.variation,
            batch: product.batch,
            soldQty: Number(product.qty ?? product.quantity ?? 0),
            returnQty: 0,
            unitPrice: product.price ?? product.unitPrice ?? 0,
            subtotal: 0,
            originalSubtotal: product.subtotal ?? (product.quantity * product.price)
          }));
          setItems(newItems);
        }
      } catch {
        showErrorToast('Could not load sale details');
      } finally {
        setPrefillLoading(false);
      }
    };
    if (warehouses.length || customers.length) loadSale();
  }, [saleIdFromUrl, warehouses.length, customers.length]);

  const handleWarehouseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const w = warehouses.find(wh => wh._id === id);
    setSelectedWarehouseId(id);
    setSelectedWarehouseName(w ? w.name : '');
  };

  const handleCustomerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const c = customers.find(cust => cust._id === id);
    setSelectedCustomerId(id);
    setCustomerName(c ? c.name : '');
  };

  const handleReturnQtyChange = (index: number, val: string) => {
    if (val === '') {
      const updated = [...items];
      updated[index].returnQty = 0;
      updated[index].subtotal = 0;
      setItems(updated);
      return;
    }
    // Remove leading zeros and non-digits
    const cleaned = val.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '') || '0';
    const qty = Math.max(0, parseInt(cleaned, 10) || 0);
    const updated = [...items];
    updated[index].returnQty = qty;
    updated[index].subtotal = updated[index].returnQty * updated[index].unitPrice;
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotalBeforeOrderLevel = useMemo(() => items.reduce((sum, i) => sum + i.subtotal, 0), [items]);

  const validate = (): boolean => {
    if (isReturnBlocked) {
      showErrorToast(`Sale return is not allowed because this sale is already ${saleStatus || 'processed'}.`);
      return false;
    }
    if (!selectedCustomerId) {
      showErrorToast('Select a customer');
      return false;
    }
    if (!selectedWarehouseId) {
      showErrorToast('Select a warehouse');
      return false;
    }
    if (items.length === 0) {
      showErrorToast('Add at least one item');
      return false;
    }
    if (items.some(i => !i.productId || i.returnQty <= 0)) {
      showErrorToast('All items must have return quantity > 0');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const authUser = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = authUser.id || authUser._id || authUser.userId;

      const payload = {
        saleId: saleIdFromUrl || undefined,
        customerId: selectedCustomerId,
        customerName: customerName || customers.find(c => c._id === selectedCustomerId)?.name,
        warehouseId: selectedWarehouseId,
        warehouseName: selectedWarehouseName,
        returnDate,
        reason,
        notes: notes || undefined,
        createdBy: userId,
        items: items.map(i => ({
          productId: i.productId,
          variation: i.variation || undefined,
          batch: i.batch || undefined,
          returnQty: i.returnQty
        }))
      };

      const res = await axios.post(`${API_BASE}/sale-returns`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = res.data?.data || res.data;
      
      setSubmittedReturn({
        _id: data?._id,
        returnId: data?.returnId,
        customerName: payload.customerName,
        warehouseName: payload.warehouseName,
        returnDate: payload.returnDate,
        items: items.map(i => ({ ...i, quantity: i.returnQty })),
        refundAmount: data?.refundAmount ?? subtotalBeforeOrderLevel
      });
      
      showSuccessToast('Sale return created successfully');
      setItems([]);
      setSelectedCustomerId('');
      setCustomerName('');
      setSelectedWarehouseId('');
      setSelectedWarehouseName('');
      setReturnDate(new Date().toISOString().split('T')[0]);
      setNotes('');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to create return';
      showErrorToast('Error: ' + msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (prefillLoading) {
    return (
      <div className="p-8 bg-canvas min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (submittedReturn) {
    return (
      <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded-2xl shadow-elevated max-w-lg w-full p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto bg-secondary-soft rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-foreground mb-2">Sale Return Created</h2>
            <p className="text-muted font-bold">Return has been recorded and inventory updated.</p>
          </div>
          <div className="bg-surface-raised p-6 rounded-xl border border-line mb-6 space-y-2">
            <p><span className="text-muted font-bold">Return ID:</span> <span className="font-black text-primary">{submittedReturn.returnId}</span></p>
            <p><span className="text-muted font-bold">Customer:</span> {submittedReturn.customerName}</p>
            <p><span className="text-muted font-bold">Warehouse:</span> {submittedReturn.warehouseName}</p>
            <p><span className="text-muted font-bold">Refund Amount:</span> {currencyCode} {(submittedReturn.refundAmount ?? 0).toFixed(2)}</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setSubmittedReturn(null)}
              className="flex-1 bg-primary text-on-primary font-black py-3 rounded-xl hover:bg-primary-hover transition"
            >
              Create Another Return
            </button>
            <Link
              to="/viewSales"
              className="flex-1 bg-surface-muted text-foreground font-black py-3 rounded-xl hover:bg-surface-muted transition text-center"
            >
              View All Sales
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-canvas min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/viewSales')}
            className="text-primary hover:text-primary transition p-1 rounded-lg hover:bg-surface-muted"
            title="Back to Sales"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-4xl font-black text-foreground mb-0">Create Sale Return</h1>
        </div>

        {isReturnBlocked && (
          <div className="mb-6 rounded-2xl border border-warning-line bg-warning-soft px-6 py-4 text-warning">
            <p className="font-black">Sale return is blocked</p>
            <p className="font-medium mt-1">
              This sale is already {saleStatus || 'processed'}, so no new return can be created from it.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface rounded-2xl border border-line p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-black text-foreground mb-2">Date *</label>
                  <input
                    type="date"
                    value={returnDate}
                    disabled={isReturnBlocked}
                    onChange={e => setReturnDate(e.target.value)}
                    className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-sm font-black text-foreground mb-2">Warehouse *</label>
                  <select
                    value={selectedWarehouseId}
                    disabled={isReturnBlocked}
                    onChange={handleWarehouseChange}
                    className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
                  >
                    <option value="">Choose Warehouse</option>
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-black text-foreground mb-2">Customer *</label>
                  <select
                    value={selectedCustomerId}
                    disabled={isReturnBlocked}
                    onChange={handleCustomerChange}
                    className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
                  >
                    <option value="">Choose Customer</option>
                    {customers.map(c => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-black text-foreground mb-2">Reason *</label>
                <select
                  value={reason}
                  disabled={isReturnBlocked}
                  onChange={e => setReason(e.target.value)}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
                >
                  {CREATE_SALE_RETURN_REASONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-surface rounded-2xl border border-line overflow-hidden">
              <div className="px-6 py-4 border-b border-line">
                <h3 className="text-lg font-black text-foreground">Return Items *</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-raised border-b border-line">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Product</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Variation</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Unit Price</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Sold</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Return Qty</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Subtotal</th>
                      <th className="px-6 py-3 text-center text-xs font-black text-muted uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-muted font-medium">
                          No items from sale selected. Add items or prefill by opening from a sale.
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => (
                        <tr key={item.id} className="border-b border-line hover:bg-surface-raised">
                          <td className="px-6 py-4 font-bold text-foreground">{item.productName}</td>
                          <td className="px-6 py-4 text-sm text-muted">{item.variation || '-'}</td>
                          <td className="px-6 py-4">{currencyCode} {item.unitPrice.toFixed(2)}</td>
                          <td className="px-6 py-4">{item.soldQty}</td>
                          <td className="px-6 py-4">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              disabled={isReturnBlocked}
                              value={item.returnQty === 0 ? '' : item.returnQty}
                              onChange={e => handleReturnQtyChange(idx, e.target.value)}
                              onKeyDown={e => {
                                if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) {
                                  e.preventDefault();
                                }
                              }}
                              onBlur={e => {
                                if (e.target.value === '' || e.target.value === '0') {
                                  handleReturnQtyChange(idx, '0');
                                }
                              }}
                              className="w-20 px-3 py-2 border border-line rounded-lg focus:outline-none focus:border-primary text-center"
                            />
                          </td>
                          <td className="px-6 py-4 font-bold text-foreground">{currencyCode} {item.subtotal.toFixed(2)}</td>
                          <td className="px-6 py-4 text-center">
                            <button onClick={() => removeItem(idx)} disabled={isReturnBlocked} className="text-danger hover:text-danger font-bold disabled:opacity-40 disabled:cursor-not-allowed" title="Remove">
                              <Trash2 size={20} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-surface rounded-2xl border border-line p-6">
              <div>
                <label className="block text-sm font-black text-foreground mb-2">Notes:</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Enter any additional notes about this return"
                  rows={3}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface resize-none"
                />
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleSubmit}
                  disabled={isLoading || isReturnBlocked || items.length === 0 || !selectedCustomerId || !selectedWarehouseId}
                  className="bg-primary text-on-primary font-black py-3 px-8 rounded-lg hover:bg-primary-hover disabled:bg-surface-muted disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                  {isLoading ? 'Saving...' : 'Save'}
                </button>
                <Link
                  to="/viewSales"
                  className="bg-surface-muted text-foreground font-black py-3 px-8 rounded-lg hover:bg-surface-muted transition inline-flex items-center"
                >
                  Cancel
                </Link>
              </div>
            </div>
          </div>

          <div>
            <div className="bg-surface rounded-2xl border border-line p-6 sticky top-8">
              <h3 className="text-lg font-black text-foreground mb-4">Summary</h3>
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted font-bold">Subtotal</span>
                  <span className="font-bold text-primary">{currencyCode} {subtotalBeforeOrderLevel.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted font-bold">Items Count</span>
                  <span className="font-bold text-primary">{items.length}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-line">
                <div className="flex justify-between items-center">
                  <span className="text-muted font-black">Refund Amount</span>
                  <span className="text-xl font-black text-primary">{currencyCode} {subtotalBeforeOrderLevel.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateSaleReturn;
