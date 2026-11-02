import axios from 'axios';
import { Edit2, Minus, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { createQuotation } from '../../services/quotationService';
import { toBusinessDateInputValue } from '../../utils/date';
import { showErrorToast, showSuccessToast, showWarningToast } from '../../utils/toast';
import Loader from '../common/Loader';
import SearchableDropdown from '../common/SearchableDropdown';

interface QuotationItem {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  stock: number;
  unit: string;
  qty: number;
  price: number;
  discount: number;
  discountType: 'fixed' | 'percentage';
  tax: number;
  subtotal: number;
  image?: string;
}

const CreateQuotation: React.FC = () => {
  const navigate = useNavigate();
  const { currencyCode } = useCurrency();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedWarehouseName, setSelectedWarehouseName] = useState('');
  
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  const [date, setDate] = useState(toBusinessDateInputValue());
  // Today's date string (YYYY-MM-DD) — used as the min for the expiry date picker
  // so users cannot select a past date, regardless of what quotation date is set to.
  const todayStr = toBusinessDateInputValue(new Date());
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return toBusinessDateInputValue(d);
  });

  const [items, setItems] = useState<QuotationItem[]>([]);
  const [discountValue, setDiscountValue] = useState(0);
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [taxValue, setTaxValue] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('Draft');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const [warRes] = await Promise.all([
        axios.get(`${api}/warehouses`, config)
      ]);
      setWarehouses(warRes.data.data || []);
      
      const defaultWarehouse = warRes.data.data?.find((w: any) => w.isActive) || warRes.data.data?.[0];
      if (defaultWarehouse) {
        setSelectedWarehouseId(defaultWarehouse._id);
        setSelectedWarehouseName(defaultWarehouse.name);
      }
    } catch (e) {
      showErrorToast('Failed to load initial data');
    }
  };

  const handleProductSearch = async (query: string): Promise<any[]> => {
    if (!query || query.trim().length < 1) return [];
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${api}/products?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const fetchedProds = res.data.data || [];

      return fetchedProds.map((p: any) => {
        // Prefer data for the currently selected warehouse if available
        let whData: any | undefined;
        if (p.warehouse) {
          const asObj = p.warehouse instanceof Map ? Object.fromEntries(p.warehouse) : p.warehouse;
          if (selectedWarehouseId && asObj[selectedWarehouseId]) {
            whData = asObj[selectedWarehouseId];
          } else {
            const firstKey = Object.keys(asObj)[0];
            whData = asObj[firstKey];
          }
        }

        // Derive price from warehouse data / variationValues when possible
        let price = 0;
        if (whData) {
          if (whData.variationValues) {
            const vv = whData.variationValues instanceof Map
              ? Object.fromEntries(whData.variationValues)
              : whData.variationValues;
            const prices: number[] = [];
            Object.values(vv || {}).forEach((val: any) => {
              if (val && val.productPrice != null) {
                prices.push(Number(val.productPrice));
              }
            });
            if (prices.length > 0) {
              price = Math.min(...prices);
            }
          } else if (whData.productPrice != null) {
            price = Number(whData.productPrice);
          }
        }
        if (!price && p.sellingPrice != null) {
          price = Number(p.sellingPrice);
        }

        // Derive stock from warehouse data / variationValues
        let stock = 0;
        if (whData) {
          if (whData.variationValues) {
            const vv = whData.variationValues instanceof Map
              ? Object.fromEntries(whData.variationValues)
              : whData.variationValues;
            Object.values(vv || {}).forEach((val: any) => {
              if (val && val.productQty != null) {
                stock += Number(val.productQty);
              }
            });
          } else if (whData.productQty != null) {
            stock = Number(whData.productQty);
          }
        } else if (p.stock != null) {
          stock = Number(p.stock);
        }

        return {
          id: p._id,
          name: p.name,
          price,
          stock,
          code: p.code || 'N/A',
          unit: p.unit?.name || 'pcs',
          image: p.image || '',
          product: p
        };
      });
    } catch (err) {
      return [];
    }
  };

  const handleProductSelect = (selected: any) => {
    const prod = selected.product;
    if (!prod) return;

    const unitPrice = typeof selected.price === 'number' ? selected.price : (prod.sellingPrice || 0);
    const stockQty = typeof selected.stock === 'number' ? selected.stock : (prod.stock || 0);

    const newRow: QuotationItem = {
      id: Date.now().toString(),
      productId: prod._id,
      productName: prod.name,
      productCode: prod.code || 'N/A',
      stock: stockQty,
      unit: prod.unit?.name || 'pcs',
      price: unitPrice,
      qty: 1,
      discount: 0,
      discountType: 'fixed',
      tax: 0,
      subtotal: unitPrice,
      image: prod.image || selected.image || ''
    };

    // Zero-stock warning (POS-157 / BUG-079): quotations can still be created
    // for out-of-stock items, but the user must be informed.
    if (stockQty <= 0) {
      showWarningToast(
        `"${prod.name}" has no stock available in the selected warehouse. Verify inventory before fulfilling this quotation.`
      );
    }

    setItems([...items, newRow]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof QuotationItem, value: any) => {
    const updatedItems = [...items];
    const item = { ...updatedItems[index], [field]: value };
    
    let sub = item.qty * item.price;
    if (item.discountType === 'fixed') {
      sub -= item.discount;
    } else {
      sub -= (sub * item.discount / 100);
    }
    sub += (sub * item.tax / 100);
    
    item.subtotal = Math.max(0, sub);
    updatedItems[index] = item;
    setItems(updatedItems);
  };

  const searchCustomers = async (q: string) => {
    if (!q) return [];
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${api}/customers?q=${q}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data.data || [];
    } catch (e) {
      return [];
    }
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
    const totalQty = items.reduce((sum, i) => sum + Number(i.qty || 0), 0);
    const orderTaxAmount = (subtotal * taxValue / 100);
    const orderDiscountAmount = discountType === 'fixed'
      ? discountValue * totalQty
      : (subtotal * discountValue / 100);
    
    const grandTotal = subtotal + orderTaxAmount - orderDiscountAmount + Number(shippingCost);
    
    return {
      subtotal,
      orderTaxAmount,
      orderDiscountAmount,
      total: Math.max(0, grandTotal)
    };
  }, [items, discountValue, discountType, taxValue, shippingCost]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouseId) return showErrorToast('Please select a warehouse');
    if (!selectedCustomerId) return showErrorToast('Please select a customer');
    if (items.length === 0) return showErrorToast('Please add at least one item');
    
    // Validate expiry date is not in the past (BUG-075)
    const expiryDate = new Date(validUntil);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expiryDate < today) {
      return showErrorToast('Expiry date cannot be in the past');
    }
    // Validate that quotation date is not later than expiry date
    const quotationDate = new Date(date);
    if (quotationDate > expiryDate) {
      return showErrorToast('Quotation created date cannot be later than the expiry date');
    }

    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      await createQuotation({
        warehouseId: selectedWarehouseId,
        warehouseName: selectedWarehouseName,
        customerId: selectedCustomerId,
        customerName: customerSearch,
        date,
        validUntil,
        items: items.map(i => ({
          productId: i.productId,
          productName: i.productName,
          productCode: i.productCode,
          unit: i.unit,
          qty: i.qty,
          price: i.price,
          discount: i.discount,
          discountType: i.discountType,
          tax: i.tax,
          subtotal: i.subtotal,
          image: i.image || ''
        })),
        discountValue,
        discountType,
        taxValue,
        shippingCost,
        total: totals.total,
        notes,
        referenceNumber,
        createdBy: user.id || user._id || 'admin',
        status
      });
      showSuccessToast('Quotation created successfully');
      navigate('/quotations');
    } catch (err: any) {
      showErrorToast(err.message || 'Failed to create quotation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-[#F8FAFC] min-h-screen">
      {loading && <Loader text="Saving Quotation..." />}
      
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-[#1e293b]">Create Quotation</h1>
          <button 
            onClick={() => navigate('/quotations')}
            className="bg-[#3B82F610] text-[#3B82F6] px-6 py-2 rounded-xl font-bold border border-[#3B82F630] hover:bg-[#3B82F620] transition-all flex items-center gap-2"
          >
            Back
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date:*</label>
              <input 
                type="date" 
                className="w-full p-3 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:border-[#3B82F6]"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Expiry Date:*</label>
              <input 
                type="date" 
                className="w-full p-3 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:border-[#3B82F6]"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                min={todayStr}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Warehouse:*</label>
              <select 
                className="w-full p-3 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:border-[#3B82F6] appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22currentColor%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_1rem_center] bg-no-repeat"
                value={selectedWarehouseId}
                onChange={(e) => {
                  setSelectedWarehouseId(e.target.value);
                  setSelectedWarehouseName(warehouses.find(w => w._id === e.target.value)?.name || '');
                }}
                required
              >
                <option value="">Select Warehouse</option>
                {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Customer:*</label>
              <SearchableDropdown 
                value={customerSearch}
                onChange={(c) => {
                  setSelectedCustomerId(c._id);
                  setCustomerSearch(c.name);
                }}
                onSearch={searchCustomers}
                placeholder="Search Customer..."
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product:</label>
            <SearchableDropdown 
              value=""
              onChange={handleProductSelect}
              onSearch={handleProductSearch}
              placeholder="Search Product by Code Name"
            />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F8FAFC] text-slate-500 text-[10px] font-bold uppercase tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">PRODUCT</th>
                  <th className="px-6 py-4 text-center">NET UNIT PRICE</th>
                  <th className="px-6 py-4 text-center">STOCK</th>
                  <th className="px-6 py-4 text-center">QTY</th>
                  <th className="px-6 py-4 text-center">DISCOUNT</th>
                  <th className="px-6 py-4 text-center">TAX</th>
                  <th className="px-6 py-4 text-center">SUBTOTAL</th>
                  <th className="px-6 py-4 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, index) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-all">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                          {item.image ? (
                            <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-black uppercase text-slate-500">No Image</span>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-slate-700">{item.productName}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-2 py-0.5 bg-[#E2F1FF] text-[#3B82F6] text-[10px] font-bold rounded-lg uppercase tracking-wider">
                              {item.productCode}
                            </span>
                            <Edit2 size={12} className="text-[#3B82F6] cursor-pointer" />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="relative inline-block w-24">
                        <input 
                          type="number" 
                          className="w-full p-2 border border-slate-200 rounded-lg text-center font-bold text-slate-600 outline-none focus:border-[#3B82F6]"
                          value={item.price}
                          onChange={(e) => updateItem(index, 'price', Number(e.target.value))}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">{currencyCode}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.stock <= 0 ? (
                        <span className="px-3 py-1 bg-red-50 text-red-500 text-[11px] font-bold rounded-full border border-red-100">
                          Out of Stock
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-[#FFF7ED] text-[#F97316] text-[11px] font-bold rounded-full">
                          {item.stock} {item.unit}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center">
                        <button 
                          type="button"
                          onClick={() => updateItem(index, 'qty', Math.max(1, item.qty - 1))}
                          className="w-8 h-8 flex items-center justify-center bg-[#6366F1] text-white rounded-l-lg hover:bg-[#4F46E5] transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <input 
                          type="text" 
                          readOnly 
                          className="w-10 h-8 border-y border-slate-200 text-center font-bold text-slate-700 outline-none" 
                          value={item.qty} 
                        />
                        <button 
                          type="button"
                          onClick={() => updateItem(index, 'qty', item.qty + 1)}
                          className="w-8 h-8 flex items-center justify-center bg-[#6366F1] text-white rounded-r-lg hover:bg-[#4F46E5] transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="relative inline-block w-24">
                        <input 
                          type="number" 
                          className="w-full p-2 border border-slate-200 rounded-lg text-center font-bold text-slate-600 outline-none focus:border-[#3B82F6]"
                          value={item.discount}
                          onChange={(e) => updateItem(index, 'discount', Number(e.target.value))}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">{currencyCode}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="relative inline-block w-20">
                        <input 
                          type="number" 
                          className="w-full p-2 border border-slate-200 rounded-lg text-center font-bold text-slate-600 outline-none focus:border-[#3B82F6]"
                          value={item.tax}
                          onChange={(e) => updateItem(index, 'tax', Number(e.target.value))}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-600">
                      {currencyCode} {item.subtotal.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button type="button" onClick={() => removeItem(index)} className="text-[#EF4444] hover:text-[#DC2626] transition-colors">
                        <Trash2 size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="p-6 border-t border-slate-100 flex justify-end">
              <div className="w-80 space-y-3 bg-[#F8FAFC] p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center text-sm font-bold text-slate-500">
                  <span>Order Tax</span>
                  <span>{currencyCode} {totals.orderTaxAmount.toFixed(2)} ({taxValue.toFixed(2)}) %</span>
                </div>
                <div className="flex justify-between items-center text-sm font-bold text-slate-500 border-t border-slate-200 pt-3">
                  <span>Discount</span>
                  <span>{currencyCode} {totals.orderDiscountAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-bold text-slate-500 border-t border-slate-200 pt-3">
                  <span>Shipping</span>
                  <span>{currencyCode} {Number(shippingCost).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-lg font-black text-[#6366F1] border-t-2 border-slate-200 pt-3">
                  <span>Grand Total</span>
                  <span>{currencyCode} {totals.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Order Tax:</label>
              <div className="relative">
                <input 
                  type="number" 
                  className="w-full p-3 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none pr-8"
                  value={taxValue}
                  onChange={(e) => setTaxValue(Number(e.target.value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Discount:</label>
              <div className="relative">
                <input 
                  type="number" 
                  className="w-full p-3 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none pr-8"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{currencyCode}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shipping:</label>
              <div className="relative">
                <input 
                  type="number" 
                  className="w-full p-3 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none pr-8"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(Number(e.target.value))}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{currencyCode}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reference No:</label>
              <input 
                type="text" 
                className="w-full p-3 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none pr-8"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Reference No"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status:*</label>
              <select 
                className="w-full p-3 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22currentColor%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_1rem_center] bg-no-repeat"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                required
              >
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div className="md:col-span-3 space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Note:</label>
              <textarea 
                className="w-full p-3 border border-slate-200 rounded-xl font-medium text-slate-700 outline-none h-24"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter Note"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pb-6">
             <button 
              type="submit"
              className="bg-[#6366F1] text-white px-8 py-2.5 rounded-xl font-bold hover:bg-[#4F46E5] transition-all shadow-lg shadow-indigo-100"
            >
              Save
            </button>
            <button 
              type="button"
              onClick={() => navigate('/quotations')}
              className="bg-[#E2E8F0] text-[#475569] px-8 py-2.5 rounded-xl font-bold hover:bg-[#CBD5E1] transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateQuotation;
