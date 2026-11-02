import axios from 'axios';
import { ArrowLeft, Loader2, Save, Search, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { toBusinessDateInputValue } from '../../utils/date';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import SearchableDropdown from '../common/SearchableDropdown';

interface ReturnItem {
  id: string;
  productId: string;
  name: string;
  code?: string;
  currentStock: number;
  returnQty: number;
  cost: number;
  discount: number;
  tax: number;
  subTotal: number;
  maxReturn?: number;
}

interface Warehouse {
  _id: string;
  name: string;
}

interface Supplier {
  _id: string;
  name: string;
}

interface Product {
  _id: string;
  name: string;
  code?: string;
  isInventory?: boolean;
  isWeight?: boolean;
  warehouse?: Record<string, any>;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const CreatePurchaseReturn: React.FC = () => {
  const navigate = useNavigate();
  const { currencyCode, currencySymbol } = useCurrency();
  const [searchParams] = useSearchParams();
  const purchaseIdFromUrl = searchParams.get('purchaseId');

  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedWarehouseName, setSelectedWarehouseName] = useState('');
  const [returnDate, setReturnDate] = useState(toBusinessDateInputValue());
  const [reason, setReason] = useState('other');
  const [notes, setNotes] = useState('');
  const [orderTax, setOrderTax] = useState(0);
  const [orderTaxInput, setOrderTaxInput] = useState('0');
  const [discount, setDiscount] = useState(0);
  const [discountInput, setDiscountInput] = useState('0');
  const [shipping, setShipping] = useState(0);
  const [shippingInput, setShippingInput] = useState('0');
  const [status, setStatus] = useState('Completed');
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [submittedReturn, setSubmittedReturn] = useState<any>(null);
  const [prefillLoading, setPrefillLoading] = useState(!!purchaseIdFromUrl);

  useEffect(() => {
    const fetchInitial = async () => {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      try {
        const [warRes, supRes] = await Promise.all([
          axios.get(`${API_BASE}/warehouses`, config).catch(() => ({ data: { data: [] } })),
          axios.get(`${API_BASE}/suppliers`, config).catch(() => ({ data: { data: [] } }))
        ]);
        setWarehouses(warRes.data.data || []);
        setSuppliers(supRes.data.data || []);
      } catch {
        showErrorToast('Error loading data');
      }
    };
    fetchInitial();
  }, []);

  useEffect(() => {
    if (!purchaseIdFromUrl) return;
    const loadPurchase = async () => {
      setPrefillLoading(true);
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      try {
        const res = await axios.get(`${API_BASE}/purchases/${purchaseIdFromUrl}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const purchase = res.data.data;
        const supId = purchase.supplierId?._id ?? purchase.supplierId;
        const whId = purchase.warehouseId?._id ?? purchase.warehouseId;
        const whName = purchase.warehouseId?.name ?? warehouses.find(w => w._id === whId)?.name ?? '';
        const supName = purchase.supplierId?.name ?? suppliers.find(s => s._id === supId)?.name ?? '';
        setSelectedSupplierId(supId);
        setSupplierName(supName);
        setSelectedWarehouseId(whId);
        setSelectedWarehouseName(whName);
        if (purchase.items?.length) {
          const token2 = localStorage.getItem('token') || localStorage.getItem('accessToken');
          await Promise.all(
            purchase.items.map(async (item: any) => {
              const pid = item.productId?._id ?? item.productId;
              let currentStock = 0;
              let productName = item.productName ?? item.name ?? 'Product';
              let productCode = item.productCode ?? item.code;
              let cost = item.cost ?? 0;
              try {
                const pRes = await axios.get(`${API_BASE}/products/${pid}`, {
                  headers: { Authorization: `Bearer ${token2}` }
                });
                const prod = pRes.data?.data ?? pRes.data;
                if (prod) {
                  productName = prod.name ?? productName;
                  productCode = prod.code ?? productCode;
                  const wh = prod.warehouse?.[whId] ?? Object.values(prod.warehouse || {}).find((w: any) => w.warehouseName === whName);
                  currentStock = prod.isWeight && wh?.totalProductWeight != null ? wh.totalProductWeight : (wh?.productQty ?? 0);
                  cost = wh?.productCost ?? cost;
                }
              } catch {}
              const purchasedQty = item.quantity ?? item.qty ?? 0;
              return {
                id: String(Date.now() + Math.random()),
                productId: pid,
                name: productName,
                code: productCode,
                currentStock,
                returnQty: 0,
                cost,
                discount: 0,
                tax: 0,
                subTotal: 0,
                maxReturn: Math.min(purchasedQty, currentStock)
              };
            })
          ).then(withStock => setItems(withStock));
        }
      } catch {
        showErrorToast('Could not load purchase details');
      } finally {
        setPrefillLoading(false);
      }
    };
    if (warehouses.length || suppliers.length) loadPurchase();
  }, [purchaseIdFromUrl, warehouses.length, suppliers.length]);

  const handleWarehouseChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const w = warehouses.find(wh => wh._id === id);
    setSelectedWarehouseId(id);
    setSelectedWarehouseName(w ? w.name : '');
    
    // Update existing items with new warehouse data
    if (id && items.length > 0) {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const updatedItems = await Promise.all(
        items.map(async (item) => {
          try {
            const res = await axios.get(`${API_BASE}/products/${item.productId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const prod = res.data?.data ?? res.data;
            if (!prod) return item;
            
            const wh = prod.warehouse instanceof Map
              ? prod.warehouse.get(id)
              : prod.warehouse?.[id] ?? Object.values(prod.warehouse || {}).find((w: any) => w.warehouseName === (w?.name || ''));
            
            if (!wh) return item;
            
            const currentStock = prod.isWeight && wh?.totalProductWeight != null ? wh.totalProductWeight : (wh?.productQty ?? 0);
            const cost = wh?.productCost ?? item.cost;
            
            return {
              ...item,
              currentStock,
              cost,
              subTotal: item.returnQty * cost
            };
          } catch {
            return item;
          }
        })
      );
      setItems(updatedItems);
    }
  };

  const handleSupplierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const s = suppliers.find(sup => sup._id === id);
    setSelectedSupplierId(id);
    setSupplierName(s ? s.name : '');
  };

  const handleProductSearch = async (query: string): Promise<any[]> => {
    if (!query?.trim()) return [];
    const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
    try {
      const res = await axios.get(`${API_BASE}/products?q=${query}`, {
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

  const handleProductSelectFromSearch = async (selected: any) => {
    if (!selectedWarehouseId) {
      showErrorToast('Select a warehouse first');
      return;
    }
    const prod = typeof selected === 'string' ? products.find(p => p.name === selected) : selected?.product;
    if (!prod) return;
    if (prod.isInventory === false) {
      showErrorToast('Only inventory products can be returned');
      return;
    }
    if (items.some(i => i.productId === prod._id)) {
      showErrorToast('Product already in list');
      return;
    }
    
    // Fetch full product details to ensure we have warehouse data
    let fullProduct = prod;
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const res = await axios.get(`${API_BASE}/products/${prod._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fullProduct = res.data?.data ?? res.data ?? prod;
    } catch (err) {
      console.warn('Could not fetch full product details, using search result');
    }
    
    // Get warehouse data - handle both Map and object formats
    const wh = fullProduct.warehouse instanceof Map
      ? fullProduct.warehouse.get(selectedWarehouseId)
      : fullProduct.warehouse?.[selectedWarehouseId] ?? Object.values(fullProduct.warehouse || {}).find((w: any) => w.warehouseName === selectedWarehouseName);
    
    // If product doesn't exist in selected warehouse, try to get cost from any warehouse, or use 0
    let currentStock = 0;
    let cost = 0;
    
    if (wh) {
      currentStock = fullProduct.isWeight && wh?.totalProductWeight != null ? wh.totalProductWeight : (wh?.productQty ?? 0);
      cost = wh?.productCost ?? 0;
    } else {
      // Product not in selected warehouse - try to get cost from any warehouse for reference
      const allWarehouses = fullProduct.warehouse instanceof Map
        ? Array.from(fullProduct.warehouse.values())
        : Object.values(fullProduct.warehouse || {});
      
      if (allWarehouses.length > 0) {
        const firstWh = allWarehouses[0] as any;
        cost = firstWh?.productCost ?? 0;
      }
      // Stock remains 0 since product is not in selected warehouse
    }
    
    const newItem: ReturnItem = {
      id: String(Date.now()),
      productId: fullProduct._id,
      name: fullProduct.name,
      code: fullProduct.code,
      currentStock,
      returnQty: 0,
      cost,
      discount: 0,
      tax: 0,
      subTotal: 0
    };
    setItems([...items, newItem]);
  };

  const handleReturnQtyChange = (index: number, val: string) => {
    if (val === '') {
      const updated = [...items];
      updated[index].returnQty = 0;
      updated[index].subTotal = 0;
      setItems(updated);
      return;
    }
    // Remove leading zeros and non-digits
    const cleaned = val.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '') || '0';
    const qty = Math.max(0, parseInt(cleaned, 10) || 0);
    const updated = [...items];
    const maxAllowed = updated[index].maxReturn ?? updated[index].currentStock;
    updated[index].returnQty = Math.min(qty, maxAllowed);
    updated[index].subTotal = updated[index].returnQty * updated[index].cost;
    setItems(updated);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotalBeforeOrderLevel = useMemo(() => items.reduce((sum, i) => sum + i.subTotal, 0), [items]);
  const grandTotal = useMemo(
    () => subtotalBeforeOrderLevel + (orderTax / 100) * subtotalBeforeOrderLevel - discount + shipping,
    [subtotalBeforeOrderLevel, orderTax, discount, shipping]
  );

  const handleOrderTaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    // Allow empty while typing
    if (value === '') {
      setOrderTax(0);
      setOrderTaxInput('');
      return;
    }
    // Keep only digits and optional single dot
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

  const validate = (): boolean => {
    if (!selectedSupplierId) {
      showErrorToast('Select a supplier');
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
    for (const i of items) {
      const max = i.maxReturn ?? i.currentStock;
      if (i.returnQty > max) {
        showErrorToast(`Return qty for ${i.name} cannot exceed ${max}`);
        return false;
      }
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
        purchaseId: purchaseIdFromUrl || undefined,
        supplierId: selectedSupplierId,
        supplierName: supplierName || suppliers.find(s => s._id === selectedSupplierId)?.name,
        warehouseId: selectedWarehouseId,
        warehouseName: selectedWarehouseName,
        returnDate,
        reason,
        notes: notes || undefined,
        status: status,
        createdBy: userId,
        items: items.map(i => ({ productId: i.productId, returnQuantity: i.returnQty }))
      };
      const res = await axios.post(`${API_BASE}/purchase-returns`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = res.data?.data || res.data;
      setSubmittedReturn({
        _id: data?._id,
        returnId: data?.returnId,
        supplierName: payload.supplierName,
        warehouseName: payload.warehouseName,
        returnDate: payload.returnDate,
        items: items.map(i => ({ ...i, quantity: i.returnQty })),
        totalReturnAmount: data?.totalReturnAmount ?? grandTotal
      });
      showSuccessToast('Purchase return created successfully');
      setItems([]);
      setSelectedSupplierId('');
      setSupplierName('');
      setSelectedWarehouseId('');
      setSelectedWarehouseName('');
      setReturnDate(toBusinessDateInputValue());
      setNotes('');
      setOrderTax(0);
      setOrderTaxInput('0');
      setDiscount(0);
      setDiscountInput('0');
      setShipping(0);
      setShippingInput('0');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to create return';
      showErrorToast('Error: ' + msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (prefillLoading) {
    return (
      <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#003366]" />
      </div>
    );
  }

  if (submittedReturn) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-[#003366] mb-2">Purchase Return Created</h2>
            <p className="text-[#64748B] font-bold">Return has been recorded and inventory updated.</p>
          </div>
          <div className="bg-[#F8FAFC] p-6 rounded-xl border border-slate-100 mb-6 space-y-2">
            <p><span className="text-[#64748B] font-bold">Return ID:</span> <span className="font-black text-[#003366]">{submittedReturn.returnId}</span></p>
            <p><span className="text-[#64748B] font-bold">Supplier:</span> {submittedReturn.supplierName}</p>
            <p><span className="text-[#64748B] font-bold">Warehouse:</span> {submittedReturn.warehouseName}</p>
            <p><span className="text-[#64748B] font-bold">Total:</span> {currencyCode} {(submittedReturn.totalReturnAmount ?? 0).toFixed(2)}</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setSubmittedReturn(null)}
              className="flex-1 bg-[#003366] text-white font-black py-3 rounded-xl hover:bg-[#004080] transition"
            >
              Create Another Return
            </button>
            <Link
              to="/viewPurchaseReturns"
              className="flex-1 bg-slate-200 text-[#003366] font-black py-3 rounded-xl hover:bg-slate-300 transition text-center"
            >
              View All Returns
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/viewPurchaseReturns')}
            className="text-[#003366] hover:text-[#002244] transition p-1 rounded-lg hover:bg-slate-100"
            title="Back to Purchase Returns"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-4xl font-black text-[#003366] mb-0">Create Purchase Return</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-black text-[#003366] mb-2">Date *</label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={e => setReturnDate(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-[#003366] bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-black text-[#003366] mb-2">Warehouse *</label>
                  <select
                    value={selectedWarehouseId}
                    onChange={handleWarehouseChange}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-[#003366] bg-white"
                  >
                    <option value="">Choose Warehouse</option>
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-black text-[#003366] mb-2">Supplier *</label>
                  <select
                    value={selectedSupplierId}
                    onChange={handleSupplierChange}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-[#003366] bg-white"
                  >
                    <option value="">Choose Supplier</option>
                    {suppliers.map(s => (
                      <option key={s._id} value={s._id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-black text-[#003366] mb-2">Product:</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Search size={20} />
                  </div>
                  <div className="pl-10">
                    <SearchableDropdown
                      onSearch={handleProductSearch}
                      onChange={handleProductSelectFromSearch}
                      placeholder="Search Product by Code Name"
                      value=""
                      clearOnSelect
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="text-lg font-black text-[#003366]">Order Items *</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#F8FAFC] border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Product</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Net Unit Cost</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Stock</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Qty</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Discount</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Tax</th>
                      <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Subtotal</th>
                      <th className="px-6 py-3 text-center text-xs font-black text-[#64748B] uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-[#64748B] font-medium">
                          No Data Available
                        </td>
                      </tr>
                    ) : (
                      items.map((item, idx) => (
                        <tr key={item.id} className="border-b border-slate-200 hover:bg-[#F8FAFC]">
                          <td className="px-6 py-4 font-bold text-[#003366]">{item.name}</td>
                          <td className="px-6 py-4">{currencyCode} {item.cost.toFixed(2)}</td>
                          <td className="px-6 py-4">{item.currentStock}</td>
                          <td className="px-6 py-4">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
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
                              className="w-20 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#003366] text-center"
                            />
                          </td>
                          <td className="px-6 py-4">{currencyCode} {(item.discount ?? 0).toFixed(2)}</td>
                          <td className="px-6 py-4">{currencyCode} {(item.tax ?? 0).toFixed(2)}</td>
                          <td className="px-6 py-4 font-bold text-[#003366]">{currencyCode} {item.subTotal.toFixed(2)}</td>
                          <td className="px-6 py-4 text-center">
                            <button onClick={() => removeItem(idx)} className="text-red-600 hover:text-red-800 font-bold" title="Remove">
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

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-black text-[#003366] mb-2">Order Tax:</label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      step="0.01"
                      value={orderTaxInput}
                      onChange={handleOrderTaxChange}
                      className="w-full px-4 py-3 border border-slate-200 rounded-l-lg focus:outline-none focus:border-[#003366] bg-white"
                    />
                    <span className="px-3 py-3 bg-slate-100 border border-l-0 border-slate-200 rounded-r-lg text-[#64748B] font-bold">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-black text-[#003366] mb-2">Discount:</label>
                  <div className="flex items-center">
                    <span className="px-3 py-3 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-[#64748B] font-bold">{currencySymbol}</span>
                    <input
                      type="text"
                      step="0.01"
                      value={discountInput}
                      onChange={handleDiscountChange}
                      className="w-full px-4 py-3 border border-slate-200 rounded-r-lg focus:outline-none focus:border-[#003366] bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-black text-[#003366] mb-2">Shipping:</label>
                  <div className="flex items-center">
                    <span className="px-3 py-3 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-[#64748B] font-bold">{currencySymbol}</span>
                    <input
                      type="text"
                      step="0.01"
                      value={shippingInput}
                      onChange={handleShippingChange}
                      className="w-full px-4 py-3 border border-slate-200 rounded-r-lg focus:outline-none focus:border-[#003366] bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-black text-[#003366] mb-2">Status *</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-[#003366] bg-white"
                  >
                    <option value="Completed">Received</option>
                    <option value="Pending">Pending</option>
                    <option value="Ordered">Ordered</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-black text-[#003366] mb-2">Note:</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Enter Note"
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-[#003366] bg-white resize-none"
                />
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleSubmit}
                  disabled={isLoading || items.length === 0 || !selectedSupplierId || !selectedWarehouseId}
                  className="bg-[#003366] text-white font-black py-3 px-8 rounded-lg hover:bg-[#004080] disabled:bg-slate-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                  {isLoading ? 'Saving...' : 'Save'}
                </button>
                <Link
                  to="/viewPurchaseReturns"
                  className="bg-slate-200 text-slate-700 font-black py-3 px-8 rounded-lg hover:bg-slate-300 transition inline-flex items-center"
                >
                  Cancel
                </Link>
              </div>
            </div>
          </div>

          <div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-8">
              <h3 className="text-lg font-black text-[#003366] mb-4">Summary</h3>
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B] font-bold">Order Tax</span>
                  <span className="font-bold text-[#003366]">{currencyCode} {(subtotalBeforeOrderLevel * (orderTax / 100)).toFixed(2)} ({orderTax.toFixed(2)}) %</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B] font-bold">Discount</span>
                  <span className="font-bold text-[#003366]">{currencyCode} {discount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B] font-bold">Shipping</span>
                  <span className="font-bold text-[#003366]">{currencyCode} {shipping.toFixed(2)}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-[#64748B] font-black">Grand Total</span>
                  <span className="text-xl font-black text-[#003366]">{currencyCode} {grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatePurchaseReturn;
