import axios from 'axios';
import { Loader2, Minus, Pencil, Plus, Save, Search, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import Loader from '../common/Loader';
import SearchableDropdown from '../common/SearchableDropdown';

const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

interface EditItem {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  productCost: number;
  currentStock: number;
  returnQty: number;
  discount: number;
  tax: number;
  taxType?: 'Exclusive' | 'Inclusive';
  discountType?: 'Percentage' | 'Fixed';
  subTotal: number;
}

const EditPurchaseReturn: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  useNavigate();
  const { currencyCode, currencySymbol } = useCurrency();
  const [returnData, setReturnData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [returnDate, setReturnDate] = useState('');
  const [status, setStatus] = useState('Completed');
  const [notes, setNotes] = useState('');
  const [orderTax, setOrderTax] = useState(0);
  const [orderTaxInput, setOrderTaxInput] = useState('0');
  const [discount, setDiscount] = useState(0);
  const [discountInput, setDiscountInput] = useState('0');
  const [shipping, setShipping] = useState(0);
  const [shippingInput, setShippingInput] = useState('0');
  const [items, setItems] = useState<EditItem[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [editingProductIndex, setEditingProductIndex] = useState<number | null>(null);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<{
    productCost: string;
    taxType: 'Exclusive' | 'Inclusive';
    orderTax: string;
    discountType: 'Percentage' | 'Fixed';
    discount: string;
  }>({
    productCost: '0',
    taxType: 'Exclusive',
    orderTax: '0',
    discountType: 'Percentage',
    discount: '0'
  });

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem('token');
    fetch(`${api}/purchase-returns/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => res.json())
      .then(data => {
        if (data.data) {
          const r = data.data;
          setReturnData(r);
          setReturnDate(r.returnDate ? new Date(r.returnDate).toISOString().split('T')[0] : '');
          setStatus(r.status || 'Completed');
          setNotes(r.notes || '');
          setItems(
            (r.items || []).map((i: any, idx: number) => ({
              id: `item-${idx}-${i.productId}`,
              productId: i.productId?._id || i.productId,
              productName: i.productName || '—',
              productCode: i.productCode || '',
              productCost: i.productCost ?? 0,
              currentStock: i.currentStock ?? 0,
              returnQty: i.returnQuantity ?? 0,
              discount: 0,
              tax: 0,
              taxType: 'Exclusive',
              discountType: 'Percentage',
              subTotal: i.subTotal ?? 0
            }))
          );
        } else {
          showErrorToast(data?.message || 'Purchase return not found');
        }
      })
      .catch(() => showErrorToast('Failed to load purchase return'))
      .finally(() => setLoading(false));
  }, [id]);

  const updateItemQty = (index: number, delta: number) => {
    setItems(prev => {
      const next = [...prev];
      const item = next[index];
      const maxAllowed = Math.floor(item.currentStock || 0);
      const currentQty = Math.floor(item.returnQty || 0);
      const newQty = Math.max(0, Math.min(maxAllowed, currentQty + Math.trunc(delta)));
      next[index] = {
        ...item,
        returnQty: newQty,
        subTotal: newQty * item.productCost
      };
      return next;
    });
  };

  const setItemQty = (index: number, value: string | number) => {
    let num: number;
    if (typeof value === 'string') {
      // Remove leading zeros and parse
      const cleaned = value.replace(/^0+(?=\d)/, '') || '0';
      num = Math.max(0, parseInt(cleaned, 10) || 0);
    } else {
      num = Math.max(0, Math.trunc(value));
    }
    setItems(prev => {
      const next = [...prev];
      const item = next[index];
      const maxAllowed = Math.floor(item.currentStock || 0);
      const finalQty = Math.min(num, maxAllowed);
      next[index] = {
        ...item,
        returnQty: finalQty,
        subTotal: finalQty * item.productCost
      };
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleProductSearch = async (query: string): Promise<any[]> => {
    if (!query?.trim()) return [];
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get(`${api}/products?q=${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      let list = res.data.data || res.data || [];
      if (!Array.isArray(list)) return [];
      list = list.filter((p: any) => p.isInventory === true);
      setProducts(list);
      return list.map((p: any) => ({
        id: p._id,
        name: p.name || '',
        code: p.code || '',
        product: p
      }));
    } catch {
      showErrorToast('Error searching products');
      return [];
    }
  };

  const openEditModal = (index: number) => {
    const item = items[index];
    setEditingItemIndex(index);
    setEditFormData({
      productCost: item.productCost.toString(),
      taxType: item.taxType || 'Exclusive',
      orderTax: item.tax.toString(),
      discountType: item.discountType || 'Percentage',
      discount: item.discount.toString()
    });
  };

  const closeEditModal = () => {
    setEditingItemIndex(null);
  };

  const handleSaveEditModal = () => {
    if (editingItemIndex === null) return;
    const item = items[editingItemIndex];
    const productCost = parseFloat(editFormData.productCost) || 0;
    const orderTax = parseFloat(editFormData.orderTax) || 0;
    const discount = parseFloat(editFormData.discount) || 0;
    
    // Calculate subtotal based on tax type and discount type
    let subtotal = item.returnQty * productCost;
    
    // Apply tax
    if (editFormData.taxType === 'Exclusive') {
      // Tax is added on top of the base cost
      subtotal = subtotal * (1 + orderTax / 100);
    }
    // For Inclusive, the cost already includes tax, so no adjustment needed
    
    // Apply discount
    if (editFormData.discountType === 'Percentage') {
      subtotal = subtotal * (1 - discount / 100);
    } else {
      // Fixed discount
      subtotal = subtotal - discount;
    }
    
    setItems(prev => {
      const next = [...prev];
      next[editingItemIndex] = {
        ...next[editingItemIndex],
        productCost,
        tax: orderTax,
        taxType: editFormData.taxType,
        discount,
        discountType: editFormData.discountType,
        subTotal: Math.max(0, subtotal)
      };
      return next;
    });
    
    closeEditModal();
  };

  const handleEditFormChange = (field: string, value: string) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const normalizeNumericInput = (value: string): string => {
    // Remove non-digit characters except decimal point
    let cleaned = value.replace(/[^\d.]/g, '');
    // Remove leading zeros
    cleaned = cleaned.replace(/^0+(?=\d)/, '');
    // Ensure only one decimal point
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    return cleaned;
  };

  const calculateItemTaxAmount = (item: EditItem): number => {
    const baseAmount = item.returnQty * item.productCost;
    if (item.taxType === 'Exclusive') {
      return baseAmount * (item.tax / 100);
    }
    // For Inclusive, tax is already included in cost
    return 0;
  };

  const calculateItemDiscountAmount = (item: EditItem): number => {
    const baseAmount = item.returnQty * item.productCost;
    let amountAfterTax = baseAmount;
    
    // Apply tax first
    if (item.taxType === 'Exclusive') {
      amountAfterTax = baseAmount * (1 + item.tax / 100);
    }
    
    // Calculate discount amount
    if (item.discountType === 'Percentage') {
      return amountAfterTax * (item.discount / 100);
    } else {
      return item.discount;
    }
  };

  const handleProductSelect = async (index: number, selected: any) => {
    if (!returnData) return;
    const prod = typeof selected === 'string' ? products.find(p => p.name === selected) : selected?.product;
    if (!prod) return;
    
    if (prod.isInventory === false) {
      showErrorToast('Only inventory products can be returned');
      return;
    }
    
    // Fetch full product details
    let fullProduct = prod;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${api}/products/${prod._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fullProduct = res.data?.data ?? res.data ?? prod;
    } catch (err) {
      console.warn('Could not fetch full product details');
    }
    
    const warehouseId = returnData.warehouseId?._id || returnData.warehouseId;
    const warehouseName = returnData.warehouseName || returnData.warehouseId?.name;
    
    // Get warehouse data
    const wh = fullProduct.warehouse instanceof Map
      ? fullProduct.warehouse.get(warehouseId?.toString())
      : fullProduct.warehouse?.[warehouseId?.toString()] ?? Object.values(fullProduct.warehouse || {}).find((w: any) => w.warehouseName === warehouseName);
    
    let currentStock = 0;
    let cost = 0;
    
    if (wh) {
      currentStock = fullProduct.isWeight && wh?.totalProductWeight != null ? wh.totalProductWeight : (wh?.productQty ?? 0);
      cost = wh?.productCost ?? 0;
    } else {
      // Try to get cost from any warehouse
      const allWarehouses = fullProduct.warehouse instanceof Map
        ? Array.from(fullProduct.warehouse.values())
        : Object.values(fullProduct.warehouse || {});
      if (allWarehouses.length > 0) {
        const firstWh = allWarehouses[0] as any;
        cost = firstWh?.productCost ?? 0;
      }
    }
    
    // Update the item
    setItems(prev => {
      const next = [...prev];
      const currentQty = next[index].returnQty;
      next[index] = {
        ...next[index],
        productId: fullProduct._id,
        productName: fullProduct.name,
        productCode: fullProduct.code || '',
        productCost: cost,
        currentStock,
        returnQty: currentQty,
        subTotal: currentQty * cost
      };
      return next;
    });
    
    setEditingProductIndex(null);
  };

  const subtotalBeforeOrderLevel = useMemo(() => items.reduce((sum, i) => sum + i.subTotal, 0), [items]);
  const grandTotal = useMemo(
    () => subtotalBeforeOrderLevel + (orderTax / 100) * subtotalBeforeOrderLevel - discount + shipping,
    [subtotalBeforeOrderLevel, orderTax, discount, shipping]
  );

  const handleOrderTaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (value === '') {
      setOrderTax(0);
      setOrderTaxInput('');
      return;
    }
    value = value.replace(/[^\d.]/g, '');
    const parts = value.split('.');
    if (parts.length > 2) {
      value = `${parts[0]}.${parts.slice(1).join('')}`;
    }
    const [intPart, decPart] = value.split('.');
    const normalizedInt = (intPart || '0').replace(/^0+(?=\d)/, '') || '0';
    const normalized = decPart !== undefined ? `${normalizedInt}.${decPart}` : normalizedInt;
    setOrderTaxInput(normalized);
    const num = parseFloat(normalized);
    setOrderTax(Number.isNaN(num) ? 0 : num);
  };

  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (value === '') {
      setDiscount(0);
      setDiscountInput('');
      return;
    }
    value = value.replace(/[^\d.]/g, '');
    const parts = value.split('.');
    if (parts.length > 2) {
      value = `${parts[0]}.${parts.slice(1).join('')}`;
    }
    const [intPart, decPart] = value.split('.');
    const normalizedInt = (intPart || '0').replace(/^0+(?=\d)/, '') || '0';
    const normalized = decPart !== undefined ? `${normalizedInt}.${decPart}` : normalizedInt;
    setDiscountInput(normalized);
    const num = parseFloat(normalized);
    setDiscount(Number.isNaN(num) ? 0 : num);
  };

  const handleShippingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (value === '') {
      setShipping(0);
      setShippingInput('');
      return;
    }
    value = value.replace(/[^\d.]/g, '');
    const parts = value.split('.');
    if (parts.length > 2) {
      value = `${parts[0]}.${parts.slice(1).join('')}`;
    }
    const [intPart, decPart] = value.split('.');
    const normalizedInt = (intPart || '0').replace(/^0+(?=\d)/, '') || '0';
    const normalized = decPart !== undefined ? `${normalizedInt}.${decPart}` : normalizedInt;
    setShippingInput(normalized);
    const num = parseFloat(normalized);
    setShipping(Number.isNaN(num) ? 0 : num);
  };

  const handleSave = async () => {
    if (!id || items.length === 0) {
      showErrorToast('At least one item is required');
      return;
    }
    if (items.some(i => i.returnQty <= 0)) {
      showErrorToast('All items must have quantity > 0');
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/purchase-returns/${id}`, {
        method: 'PUT',
        headers: token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          returnDate: returnDate || undefined,
          status: status,
          notes: notes || undefined,
          items: items.map(i => ({ productId: i.productId, returnQuantity: i.returnQty }))
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showErrorToast(data?.message || 'Failed to update');
        return;
      }
      showSuccessToast('Purchase return updated successfully');
      setReturnData(data.data);
    } catch (e) {
      showErrorToast((e as Error).message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader />;
  if (!returnData) {
    return (
      <div className="p-8 bg-canvas min-h-screen">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-muted font-bold mb-4">Purchase return not found</p>
          <Link to="/viewPurchaseReturns" className="text-foreground font-bold hover:underline">Back to list</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-canvas min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-4xl font-black text-foreground mb-0">Edit Purchase Return</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/viewPurchaseReturns"
              className="px-4 py-2 text-foreground font-bold border border-line-strong rounded-lg hover:bg-surface-muted"
            >
              Back
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface rounded-2xl border border-line p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-black text-foreground mb-2">Date *</label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={e => setReturnDate(e.target.value)}
                    className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-sm font-black text-foreground mb-2">Warehouse *</label>
                  <input
                    type="text"
                    readOnly
                    value={returnData.warehouseName || returnData.warehouseId?.name || ''}
                    className="w-full px-4 py-3 border border-line rounded-lg bg-surface-raised text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-black text-foreground mb-2">Supplier *</label>
                  <input
                    type="text"
                    readOnly
                    value={returnData.supplierName || returnData.supplierId?.name || ''}
                    className="w-full px-4 py-3 border border-line rounded-lg bg-surface-raised text-foreground"
                  />
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-2xl border border-line overflow-hidden">
              <div className="px-6 py-4 border-b border-line">
                <h3 className="text-lg font-black text-foreground">Order Items *</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-raised border-b border-line">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Product</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Net Unit Cost</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Stock</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Qty</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Discount</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Tax</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Subtotal</th>
                      <th className="px-6 py-3 text-center text-xs font-black text-muted uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-muted font-medium">No Data Available</td>
                      </tr>
                    ) : (
                      items.map((item, idx) => (
                        <tr key={item.id} className="border-b border-line hover:bg-surface-raised">
                          <td className="px-6 py-4">
                            {editingProductIndex === idx ? (
                              <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none z-10">
                                  <Search size={16} />
                                </div>
                                <div className="pl-8">
                                  <SearchableDropdown
                                    onSearch={handleProductSearch}
                                    onChange={(selected) => handleProductSelect(idx, selected)}
                                    placeholder="Search Product by Code Name"
                                    value=""
                                    clearOnSelect
                                    className="w-full"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setEditingProductIndex(null)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-muted"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2">
                                <div className="flex-1">
                                  <div className="font-bold text-foreground">{item.productName}</div>
                                  {item.productCode && (
                                    <div className="text-xs text-muted mt-1">
                                      {item.productCode}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">{currencyCode} {item.productCost.toFixed(2)}</td>
                          <td className="px-6 py-4">{item.currentStock}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateItemQty(idx, -1)}
                                className="p-1.5 rounded border border-line hover:bg-surface-muted text-primary"
                              >
                                <Minus size={16} />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={item.returnQty === 0 ? '' : item.returnQty}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (val === '') {
                                    setItemQty(idx, 0);
                                    return;
                                  }
                                  const cleaned = val.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '') || '0';
                                  setItemQty(idx, cleaned);
                                }}
                                onKeyDown={e => {
                                  if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) {
                                    e.preventDefault();
                                  }
                                }}
                                onBlur={e => {
                                  if (e.target.value === '' || e.target.value === '0') {
                                    setItemQty(idx, 0);
                                  }
                                }}
                                className="w-14 px-2 py-1.5 border border-line rounded text-center focus:outline-none focus:border-primary"
                              />
                              <button
                                type="button"
                                onClick={() => updateItemQty(idx, 1)}
                                className="p-1.5 rounded border border-line hover:bg-surface-muted text-primary"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">{currencyCode} {calculateItemDiscountAmount(item).toFixed(2)}</td>
                          <td className="px-6 py-4">{currencyCode} {calculateItemTaxAmount(item).toFixed(2)}</td>
                          <td className="px-6 py-4 font-bold text-foreground">{currencyCode} {item.subTotal.toFixed(2)}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                type="button" 
                                onClick={() => openEditModal(idx)} 
                                className="text-primary hover:text-primary font-bold"
                                title="Edit"
                              >
                                <Pencil size={18} />
                              </button>
                              <button type="button" onClick={() => removeItem(idx)} className="text-danger hover:text-danger font-bold" title="Remove">
                                <Trash2 size={20} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-surface rounded-2xl border border-line p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-black text-foreground mb-2">Order Tax:</label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      step="0.01"
                      value={orderTaxInput}
                      onChange={handleOrderTaxChange}
                      className="w-full px-4 py-3 border border-line rounded-l-lg focus:outline-none focus:border-primary bg-surface"
                    />
                    <span className="px-3 py-3 bg-surface-muted border border-l-0 border-line rounded-r-lg text-muted font-bold">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-black text-foreground mb-2">Discount:</label>
                  <div className="flex items-center">
                    <span className="px-3 py-3 bg-surface-muted border border-r-0 border-line rounded-l-lg text-muted font-bold">{currencySymbol}</span>
                    <input
                      type="text"
                      step="0.01"
                      value={discountInput}
                      onChange={handleDiscountChange}
                      className="w-full px-4 py-3 border border-line rounded-r-lg focus:outline-none focus:border-primary bg-surface"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-black text-foreground mb-2">Shipping:</label>
                  <div className="flex items-center">
                    <span className="px-3 py-3 bg-surface-muted border border-r-0 border-line rounded-l-lg text-muted font-bold">{currencySymbol}</span>
                    <input
                      type="text"
                      step="0.01"
                      value={shippingInput}
                      onChange={handleShippingChange}
                      className="w-full px-4 py-3 border border-line rounded-r-lg focus:outline-none focus:border-primary bg-surface"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-black text-foreground mb-2">Status *</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
                  >
                    <option value="Completed">Received</option>
                    <option value="Pending">Pending</option>
                    <option value="Ordered">Ordered</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-black text-foreground mb-2">Note:</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Enter Note"
                  rows={3}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface resize-none"
                />
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || items.length === 0}
                  className="bg-primary text-on-primary font-black py-3 px-8 rounded-lg hover:bg-primary-hover disabled:bg-surface-muted disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <Link
                  to="/viewPurchaseReturns"
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
                  <span className="text-muted font-bold">Order Tax</span>
                  <span className="font-bold text-primary">{currencyCode} {(subtotalBeforeOrderLevel * (orderTax / 100)).toFixed(2)} ({orderTax.toFixed(2)}) %</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted font-bold">Discount</span>
                  <span className="font-bold text-primary">{currencyCode} {discount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted font-bold">Shipping</span>
                  <span className="font-bold text-primary">{currencyCode} {shipping.toFixed(2)}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-line">
                <div className="flex justify-between items-center">
                  <span className="text-muted font-black">Grand Total</span>
                  <span className="text-xl font-black text-primary">{currencyCode} {grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Item Modal */}
      {editingItemIndex !== null && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-line">
              <h2 className="text-xl font-black text-foreground">
                {items[editingItemIndex]?.productName || 'Edit Item'}
              </h2>
              <button
                type="button"
                onClick={closeEditModal}
                className="text-subtle hover:text-muted text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-black text-foreground mb-2">
                  Product Cost: *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">{currencySymbol}</span>
                  <input
                    type="text"
                    value={editFormData.productCost}
                    onChange={(e) => {
                      const normalized = normalizeNumericInput(e.target.value);
                      handleEditFormChange('productCost', normalized);
                    }}
                    onBlur={(e) => {
                      if (!e.target.value || e.target.value === '0') {
                        handleEditFormChange('productCost', '0');
                      }
                    }}
                    className="w-full pl-16 pr-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-black text-foreground mb-2">
                  Tax Type: *
                </label>
                <select
                  value={editFormData.taxType}
                  onChange={(e) => handleEditFormChange('taxType', e.target.value)}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary"
                  required
                >
                  <option value="Exclusive">Exclusive</option>
                  <option value="Inclusive">Inclusive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-black text-foreground mb-2">
                  Order Tax:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={editFormData.orderTax}
                    onChange={(e) => {
                      const normalized = normalizeNumericInput(e.target.value);
                      handleEditFormChange('orderTax', normalized);
                    }}
                    onBlur={(e) => {
                      if (!e.target.value || e.target.value === '0') {
                        handleEditFormChange('orderTax', '0');
                      }
                    }}
                    className="w-full px-4 py-3 pr-8 border border-line rounded-lg focus:outline-none focus:border-primary"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">%</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-black text-foreground mb-2">
                  Discount Type: *
                </label>
                <select
                  value={editFormData.discountType}
                  onChange={(e) => handleEditFormChange('discountType', e.target.value)}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary"
                  required
                >
                  <option value="Percentage">Percentage</option>
                  <option value="Fixed">Fixed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-black text-foreground mb-2">
                  Discount: *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={editFormData.discount}
                    onChange={(e) => {
                      const normalized = normalizeNumericInput(e.target.value);
                      handleEditFormChange('discount', normalized);
                    }}
                    onBlur={(e) => {
                      if (!e.target.value || e.target.value === '0') {
                        handleEditFormChange('discount', '0');
                      }
                    }}
                    className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary"
                    required
                  />
                  {editFormData.discountType === 'Percentage' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">%</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-4 p-6 border-t border-line">
              <button
                type="button"
                onClick={closeEditModal}
                className="px-6 py-2 text-foreground bg-surface-muted rounded-lg hover:bg-surface-muted font-black transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditModal}
                className="px-6 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-hover font-black transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditPurchaseReturn;
