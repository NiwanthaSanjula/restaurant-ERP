import axios from 'axios';
import { ArrowLeft, Calendar, Loader2, Plus, Save, Trash2, Users, Warehouse, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { toBusinessDateInputValue } from '../../utils/date';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import SearchableDropdown from '../common/SearchableDropdown';
import { blockInvalidNumericKeys } from '../../utils/numericInput';

const EditPurchase = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currencyCode } = useCurrency();
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedWarehouseName, setSelectedWarehouseName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(toBusinessDateInputValue());
  
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPurchase, setLoadingPurchase] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  // System type for filtering products
  const [, setSystemType] = useState<'retail' | 'restaurant'>('retail');
  
  // Discount and Tax fields
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [tax, setTax] = useState<number>(0);
  const [taxType, setTaxType] = useState<'fixed' | 'percentage'>('fixed');
  
  // Payment fields
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Partial' | 'Unpaid'>('Unpaid');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [purchaseStatus, setPurchaseStatus] = useState('Ordered');

  const API_BASE = 'http://localhost:5000/api';
  
  // Payment method options
  const paymentMethods = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Mobile Payment', 'Other'];

  type ProductSearchOption = {
    id: string;
    name: string;
    price: number;
    cost: number;
    product: any;
    variation?: string;
    variationData?: any;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('accessToken'); 
        const config = { headers: { Authorization: `Bearer ${token}` } };
        
        // Get system type from localStorage
        const savedSystemType = localStorage.getItem('systemType') as 'retail' | 'restaurant' | null;
        if (savedSystemType) {
          setSystemType(savedSystemType);
        }
        
        const [supRes, warRes] = await Promise.all([
          axios.get(`${API_BASE}/suppliers`, config).catch(() => ({ data: { data: [] } })),
          axios.get(`${API_BASE}/warehouses`, config).catch(() => ({ data: { data: [] } }))
        ]);
        
        const suppliersData = supRes.data?.data || supRes.data || [];
        const warehousesData = warRes.data?.data || warRes.data || [];
        
        setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
        setWarehouses(Array.isArray(warehousesData) ? warehousesData : []);
        
        // Load purchase data if id exists
        if (id) {
          await fetchPurchase(id, config);
        } else {
          // If no id, we're done loading
          setLoadingPurchase(false);
        }
      } catch (err: any) { 
        console.error("Fetch error:", err);
        setLoadingPurchase(false);
      }
    };
    fetchData();
  }, [id]);

  const fetchPurchase = async (purchaseId: string, config: any) => {
    setLoadingPurchase(true);
    setLoadError('');
    try {
      const res = await axios.get(`${API_BASE}/purchases/${purchaseId}`, config);
      const purchase = res.data.data;
      
      if (purchase) {
        setSelectedSupplier(purchase.supplierId?._id || purchase.supplierId || '');
        setSelectedWarehouseId(purchase.warehouseId?._id || purchase.warehouseId || '');
        setSelectedWarehouseName(purchase.warehouseName || purchase.warehouseId?.name || '');
        setPurchaseDate(purchase.purchaseDate ? toBusinessDateInputValue(purchase.purchaseDate) : toBusinessDateInputValue());
        setDiscount(purchase.discount || 0);
        setDiscountType(purchase.discountType || 'fixed');
        setTax(purchase.tax || 0);
        setTaxType(purchase.taxType || 'fixed');
        setPaymentStatus(purchase.paymentStatus || 'Unpaid');
        setPaymentMethod(purchase.paymentMethod || '');
        setPurchaseStatus(purchase.purchaseStatus || 'Ordered');
        
        // Load items
        if (purchase.items && purchase.items.length > 0) {
          const loadedItems = purchase.items.map((item: any, idx: number) => ({
            id: Date.now() + idx,
            productId: item.productId,
            name: item.name || `Product ${idx + 1}`,
            variation: item.variation || undefined,
            stock: item.stockQtyAtPurchase || 0,
            qty: item.quantity || 0,
            cost: item.cost || 0,
            subTotal: item.subTotal || (item.quantity || 0) * (item.cost || 0)
          }));
          setItems(loadedItems);
        }
      }
    } catch (err: any) {
      console.error("Error fetching purchase:", err);
      setLoadError('Failed to load purchase. Please try again.');
      showErrorToast('Failed to load purchase. Please try again.');
    } finally {
      setLoadingPurchase(false);
    }
  };

  const handleWarehouseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const warehouseObj = warehouses.find(w => (w._id === id || w.id === id));
    setSelectedWarehouseId(id);
    setSelectedWarehouseName(warehouseObj ? warehouseObj.name : '');
  };

  const handleProductSearch = async (query: string): Promise<ProductSearchOption[]> => {
    if (!query || query.trim().length < 1) return [];
    
    if (!selectedWarehouseId) {
      return [];
    }
    
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const whId = String(selectedWarehouseId);
      
      const res = await axios.get(`${API_BASE}/products?q=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      let fetchedProds = res.data.data || res.data || [];
      if (!Array.isArray(fetchedProds)) {
        return [];
      }
      
      const getWh = (p: any, id: string) => {
        const wh = p.warehouse;
        if (!wh || typeof wh !== 'object') return undefined;
        if (wh[id]) return wh[id];
        const keys = Object.keys(wh);
        const match = keys.find(k => k === id || String(k) === id);
        return match ? wh[match] : undefined;
      };
      
      const filteredProducts = fetchedProds.filter((p: any) => getWh(p, whId) !== undefined);
      setProducts(filteredProducts);
      
      const results: ProductSearchOption[] = filteredProducts.flatMap((p: any) => {
        const whData = getWh(p, whId);
        if (p.ptype === 'Variation' && whData?.variationValues) {
          type VarEntry = [string, { productPrice?: number; productCost?: number; productQty?: number; totalProductWeight?: number }];
          const variations = whData.variationValues instanceof Map
            ? (Array.from(whData.variationValues.entries()) as VarEntry[])
            : (Object.entries(whData.variationValues) as VarEntry[]);
          return variations.map(([varName, varData]): ProductSearchOption => {
            const option: ProductSearchOption = {
              id: `${String(p._id)}_${varName}`,
              name: `${p.name ?? ''} - ${varName}`,
              price: Number(varData?.productPrice) || 0,
              cost: Number(varData?.productCost) || 0,
              product: p,
              variation: varName,
              variationData: varData
            };
            return option;
          });
        }
        return [{
          id: String(p._id ?? p.id ?? ''),
          name: p.name ?? '',
          price: 0,
          cost: 0,
          product: p
        }];
      });
      
      return results;
    } catch (err) { 
      console.error("Product search error:", err);
      return []; 
    }
  };

  const handleProductSelect = (index: number, selectedProduct: any) => {
    if (!selectedWarehouseId) {
      alert("Please select a warehouse first!");
      return;
    }
    
    const prod = selectedProduct?.product;
    if (!prod) return;

    const whIdStr = String(selectedWarehouseId);
    const whMap = prod.warehouse;
    const getWh = () => {
      if (!whMap || typeof whMap !== 'object') return undefined;
      if ((whMap as Record<string, any>)[whIdStr]) return (whMap as Record<string, any>)[whIdStr];
      const keys = Object.keys(whMap as Record<string, any>);
      const match = keys.find(k => k === whIdStr || String(k) === whIdStr);
      return match ? (whMap as Record<string, any>)[match] : undefined;
    };
    
    const warehouseData = getWh();
    if (!warehouseData) {
      alert("Product not found in selected warehouse!");
      return;
    }

    // Extract variation name first for duplicate check
    let variationName = '';
    if (selectedProduct.variation && selectedProduct.variationData) {
      variationName = selectedProduct.variation;
    }

    // Check for duplicate products BEFORE processing product data
    // For variation products: check if same productId with same variation already exists
    // For single products: check if same productId already exists
    const isDuplicate = items.some((item, idx) => {
      if (idx === index) return false; // Skip the current item being edited
      if (!item.productId) return false; // Skip empty items
      
      // Check if productId matches
      if (item.productId !== prod._id) return false;
      
      // For variation products, also check if variation matches
      if (variationName) {
        return item.variation === variationName;
      } else {
        // For single products, check if no variation is set (or variation is undefined/null)
        return !item.variation || item.variation === '';
      }
    });

    if (isDuplicate) {
      const duplicateMessage = variationName 
        ? `This product variation "${prod.name} - ${variationName}" is already added.`
        : `This product "${prod.name}" is already added.`;
      alert(duplicateMessage);
      
      // Clear the current row immediately and generate new ID to force component remount
      const updatedItems = [...items];
      updatedItems[index] = {
        id: Date.now(), // New ID forces SearchableDropdown to remount completely
        productId: '',
        name: '',
        variation: undefined,
        stock: 0,
        qty: 0,
        cost: 0,
        subTotal: 0
      };
      setItems(updatedItems);
      return; // Prevent adding duplicate - exit early
    }

    // Only process product data if NOT a duplicate
    let productCost = 0;
    let stock = 0;
    let displayName = prod.name; // Keep product name without variation appended
    
    if (selectedProduct.variation && selectedProduct.variationData) {
      // Variation product - variation will be shown separately in VARIATION column
      // Don't append variation to product name - keep them separate
      displayName = prod.name;
      const varData = selectedProduct.variationData;
      productCost = varData.productCost || 0;
      // Check if product is weight-based, then use totalProductWeight, otherwise use productQty
      const isWeight = prod.isWeight === true;
      stock = isWeight 
        ? (varData.totalProductWeight || varData.productQty || 0)
        : (varData.productQty || varData.totalProductWeight || 0);
      
      // Debug logging
      console.log('[EditPurchase] Variation stock data:', {
        variationName,
        varData,
        isWeight,
        productQty: varData.productQty,
        totalProductWeight: varData.totalProductWeight,
        calculatedStock: stock
      });
    } else {
      productCost = warehouseData.productCost || 0;
      const isWeight = prod.isWeight === true;
      stock = isWeight 
        ? (warehouseData.totalProductWeight || 0)
        : (warehouseData.productQty || 0);
    }

    const displayStock = Math.max(0, stock);

    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      productId: prod._id,
      name: displayName,
      variation: variationName || undefined,
      stock: displayStock,
      cost: productCost ? productCost.toFixed(2) : '0.00',
      subTotal: productCost * (parseFloat(String(updatedItems[index].qty)) || 0)
    };
    setItems(updatedItems);
  };

  const addItemRow = () => {
    setItems([...items, { id: Date.now(), productId: '', name: '', stock: 0, qty: 0, cost: 0, subTotal: 0 }]);
  };

  const handleQtyChange = (index: number, val: string) => {
    // Preserve the string value as-is to maintain decimal points during typing
    const updatedItems = [...items];
    
    // Prevent negative values - if user types negative, set to 0
    if (val === '' || val === '.') {
      updatedItems[index].qty = val as any;
      setItems(updatedItems);
      return;
    }
    
    const qtyNum = parseFloat(val) || 0;
    // Ensure quantity is never negative
    if (qtyNum < 0) {
      updatedItems[index].qty = 0;
      updatedItems[index].subTotal = 0;
    } else {
      // Store as string to preserve exact input (including decimals like 1.5 kg)
      updatedItems[index].qty = val as any;
      updatedItems[index].subTotal = qtyNum * updatedItems[index].cost;
    }
    setItems(updatedItems);
  };

  const handleCostChange = (index: number, val: string) => {
    // Preserve the string value as-is to maintain decimal points during typing
    const updatedItems = [...items];
    
    // Prevent negative values - if user types negative, set to 0
    if (val === '' || val === '.') {
      updatedItems[index].cost = val as any;
      setItems(updatedItems);
      return;
    }
    
    const costNum = parseFloat(val) || 0;
    // Ensure cost is never negative
    if (costNum < 0) {
      updatedItems[index].cost = '0.00';
      updatedItems[index].subTotal = 0;
    } else {
      // Store as string to preserve exact input (including decimals)
      updatedItems[index].cost = val as any;
      updatedItems[index].subTotal = (parseFloat(String(updatedItems[index].qty)) || 0) * costNum;
    }
    setItems(updatedItems);
  };

  const handleCostBlur = (index: number) => {
    // Format cost to 2 decimal places when user leaves the field
    const updatedItems = [...items];
    const costNum = parseFloat(String(updatedItems[index].cost)) || 0;
    updatedItems[index].cost = costNum.toFixed(2);
    updatedItems[index].subTotal = (parseFloat(String(updatedItems[index].qty)) || 0) * costNum;
    setItems(updatedItems);
  };


  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.subTotal, 0), [items]);
  
  const discountAmount = useMemo(() => {
    if (discountType === 'percentage') {
      return (subtotal * discount) / 100;
    }
    return discount;
  }, [subtotal, discount, discountType]);
  
  const taxAmount = useMemo(() => {
    const amountAfterDiscount = subtotal - discountAmount;
    if (taxType === 'percentage') {
      return (amountAfterDiscount * tax) / 100;
    }
    return tax;
  }, [subtotal, discountAmount, tax, taxType]);
  
  const grandTotal = useMemo(() => {
    return subtotal - discountAmount + taxAmount;
  }, [subtotal, discountAmount, taxAmount]);

  const isFormValid = useMemo(() => {
    if (discount < 0 || tax < 0) return false;
    if (discountType === 'percentage' && discount > 100) return false;
    if (taxType === 'percentage' && tax > 100) return false;
    if ((paymentStatus === 'Paid' || paymentStatus === 'Partial') && (!paymentMethod || paymentMethod.trim() === '')) {
      return false;
    }
    return true;
  }, [discount, tax, discountType, taxType, paymentStatus, paymentMethod]);

  const handleSubmitClick = () => {
    if (isLoading) return;

    if (!selectedSupplier || !selectedWarehouseId || items.length === 0) {
      alert("Please select Supplier, Warehouse, and add at least one item.");
      return;
    }
    
    const validItems = items.filter(i => i.productId && (parseFloat(String(i.qty)) || 0) > 0 && (i.cost || 0) > 0);
    if (validItems.length === 0) {
      alert("Each item must have a product, quantity greater than zero, and cost greater than zero.");
      return;
    }
    
    if (discount < 0 || tax < 0) {
      alert("Discount and tax cannot be negative.");
      return;
    }
    
    if ((paymentStatus === 'Paid' || paymentStatus === 'Partial') && !paymentMethod.trim()) {
      alert(`Payment Method is required when Payment Status is "${paymentStatus}".`);
      return;
    }
    
    if (discountType === 'percentage' && discount > 100) {
      alert("Discount percentage cannot exceed 100%.");
      return;
    }
    
    if (taxType === 'percentage' && tax > 100) {
      alert("Tax percentage cannot exceed 100%.");
      return;
    }
    
    setShowConfirmModal(true);
  };

  const handleSubmit = async () => {
    setShowConfirmModal(false);
    if (!id) return;

    const validItems = items.filter(i => i.productId && (parseFloat(String(i.qty)) || 0) > 0 && (i.cost || 0) > 0);
    if (validItems.length === 0) {
      alert("Each item must have a product, quantity greater than zero, and cost greater than zero.");
      return;
    }

    setIsLoading(true);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      if (!token) {
        alert("You must be logged in to update a purchase.");
        setIsLoading(false);
        return;
      }
      
      const payload = {
        supplierId: selectedSupplier,
        warehouseId: selectedWarehouseId,
        warehouseName: selectedWarehouseName,
        purchaseDate,
        subtotal,
        discount: discount || 0,
        discountType: discountType || 'fixed',
        tax: tax || 0,
        taxType: taxType || 'fixed',
        grandTotal,
        paymentStatus,
        paymentMethod: paymentMethod || undefined,
        purchaseStatus,
        items: validItems.map((i: any) => ({
          productId: i.productId,
          quantity: parseFloat(String(i.qty)) || 0,
          cost: i.cost || 0,
          subTotal: (parseFloat(String(i.qty)) || 0) * (i.cost || 0)
        }))
      };
      
      await axios.put(`${API_BASE}/purchases/${id}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      showSuccessToast('Purchase updated successfully');
      navigate('/purchases');
    } catch (err: any) {
      console.error('Purchase update error:', err);
      showErrorToast(err.response?.data?.message || 'Update failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingPurchase) {
    return (
      <div className="p-8 bg-canvas min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4" size={48} />
          <p className="text-muted font-bold">Loading purchase...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-8 bg-canvas min-h-screen">
        <div className="max-w-2xl mx-auto text-center bg-surface rounded-2xl border border-line p-8">
          <p className="text-muted font-bold mb-6">{loadError}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/purchases')}
              className="px-5 py-3 rounded-2xl border-2 border-line-strong text-primary font-black hover:bg-surface-raised transition"
            >
              Back to Purchases
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-3 rounded-2xl bg-primary text-on-primary font-black hover:bg-primary-hover transition"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-canvas min-h-screen">
      <div className="mb-8 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/purchases')}
          className="text-primary hover:text-primary transition p-1 rounded-lg hover:bg-surface-muted"
          title="Back to Purchases"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-3xl font-black text-foreground mb-0">Edit Purchase</h1>
      </div>
      
      {/* Header Fields */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-surface p-8 rounded-2xl border border-line mb-8">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-2"><Users size={14} /> Supplier</label>
          <select className="w-full p-4 border-2 border-line-strong rounded-2xl font-bold text-foreground" value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}>
            <option value="">{suppliers.length === 0 ? 'Loading suppliers...' : 'Select Supplier'}</option>
            {suppliers.map(s => <option key={s._id || s.id} value={s._id || s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-2"><Warehouse size={14} /> Warehouse</label>
          <select className="w-full p-4 border-2 border-line-strong rounded-2xl font-bold text-foreground" value={selectedWarehouseId} onChange={handleWarehouseChange}>
            <option value="">{warehouses.length === 0 ? 'Loading warehouses...' : 'Select Warehouse'}</option>
            {warehouses.map(w => <option key={w._id || w.id} value={w._id || w.id}>{w.name}</option>)}
          </select>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-2"><Calendar size={14} /> Date</label>
          <input type="date" className="w-full p-4 border-2 border-line-strong rounded-2xl font-bold text-foreground" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-surface rounded-2xl border border-line overflow-hidden mb-8">
        <table className="w-full text-left">
          <thead className="bg-surface-raised text-muted text-[10px] font-black uppercase tracking-widest border-b border-line">
            <tr>
              <th className="p-6">Product Info</th>
              <th className="p-6 text-center">Variation</th>
              <th className="p-6 text-center">Stock</th>
              <th className="p-6 text-center">Qty</th>
              <th className="p-6 text-center">Unit Cost</th>
              <th className="p-6 text-right">Sub Total</th>
              <th className="p-6 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((item, index) => (
              <tr key={item.id} className="hover:bg-surface-raised/50 transition-all">
                <td className="p-6 w-1/3">
                  <SearchableDropdown 
                    key={`${item.id}-${item.productId || 'empty'}`}
                    value={item.name} 
                    onChange={(val) => handleProductSelect(index, val)} 
                    onSearch={handleProductSearch} 
                    placeholder="Search product..." 
                  />
                </td>
                <td className="p-6 text-center text-muted font-medium">
                  {item.variation || '—'}
                </td>
                <td className="p-6 text-center text-primary font-black">
                  {Number((Math.max(0, item.stock || 0)).toFixed(2))}
                </td>
                <td className="p-6 text-center">
                  <input 
                    type="number" 
                    step="any" 
                    min="0" 
                    className="w-20 p-2 border border-line rounded-lg text-center"
                    value={typeof item.qty === 'string' ? item.qty : (item.qty || '')} 
                    onChange={(e) => handleQtyChange(index, e.target.value)}
                    onWheel={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget;
                      const cursorPos = input.selectionStart || 0;
                      const valueStr = String(item.qty || '0');
                      const decimalIndex = valueStr.indexOf('.');
                      let step = 1;
                      
                      if (decimalIndex !== -1 && cursorPos > decimalIndex) {
                        const decimalPlaces = cursorPos - decimalIndex - 1;
                        step = Math.pow(10, -decimalPlaces - 1);
                      }
                      
                      const currentNum = parseFloat(valueStr) || 0;
                      const newValue = e.deltaY < 0 
                        ? currentNum + step 
                        : Math.max(0, currentNum - step);
                      
                      const updatedItems = [...items];
                      updatedItems[index].qty = newValue;
                      updatedItems[index].subTotal = newValue * updatedItems[index].cost;
                      setItems(updatedItems);
                    }}
                    onKeyDown={(e) => {
                      // Block characters invalid for non-negative numeric fields (POS-167 / BUG-089)
                      blockInvalidNumericKeys(e);
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const input = e.currentTarget;
                        const cursorPos = input.selectionStart || 0;
                        const valueStr = String(item.qty || '0');
                        const decimalIndex = valueStr.indexOf('.');
                        let step = 1;
                        
                        if (decimalIndex !== -1 && cursorPos > decimalIndex) {
                          const decimalPlaces = cursorPos - decimalIndex - 1;
                          step = Math.pow(10, -decimalPlaces - 1);
                        }
                        
                        const currentNum = parseFloat(valueStr) || 0;
                        const newValue = e.key === 'ArrowUp'
                          ? currentNum + step 
                          : Math.max(0, currentNum - step);
                        
                        const updatedItems = [...items];
                        updatedItems[index].qty = newValue;
                        updatedItems[index].subTotal = newValue * updatedItems[index].cost;
                        setItems(updatedItems);
                      }
                    }}
                  />
                </td>
                <td className="p-6 text-center">
                  <input 
                    type="number" 
                    step="any" 
                    min="0" 
                    className="w-24 p-2 border border-line rounded-lg text-center"
                    value={typeof item.cost === 'string' && item.cost !== '' && item.cost !== '.' ? item.cost : (item.cost ? parseFloat(String(item.cost)).toFixed(2) : '0.00')} 
                    onChange={(e) => handleCostChange(index, e.target.value)}
                    onBlur={() => handleCostBlur(index)}
                    onWheel={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget;
                      const cursorPos = input.selectionStart || 0;
                      const valueStr = String(item.cost || '0');
                      const decimalIndex = valueStr.indexOf('.');
                      let step = 1;
                      
                      if (decimalIndex !== -1 && cursorPos > decimalIndex) {
                        const decimalPlaces = cursorPos - decimalIndex - 1;
                        step = Math.pow(10, -decimalPlaces - 1);
                      } else {
                        step = 0.01; // For cost, default to 0.01
                      }
                      
                      const currentNum = parseFloat(valueStr) || 0;
                      const newValue = e.deltaY < 0 
                        ? currentNum + step 
                        : Math.max(0, currentNum - step);
                      
                      const updatedItems = [...items];
                      updatedItems[index].cost = newValue.toFixed(2);
                      updatedItems[index].subTotal = (parseFloat(String(updatedItems[index].qty)) || 0) * newValue;
                      setItems(updatedItems);
                      
                      // Restore cursor position
                      setTimeout(() => {
                        input.focus();
                        const newValueStr = newValue.toFixed(2);
                        const newCursorPos = Math.min(cursorPos, newValueStr.length);
                        input.setSelectionRange(newCursorPos, newCursorPos);
                      }, 0);
                    }}
                    onKeyDown={(e) => {
                      // Block characters invalid for non-negative numeric fields (POS-167 / BUG-089)
                      blockInvalidNumericKeys(e);
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const input = e.currentTarget;
                        const cursorPos = input.selectionStart || 0;
                        const valueStr = String(item.cost || '0');
                        const decimalIndex = valueStr.indexOf('.');
                        let step = 1;
                        
                        if (decimalIndex !== -1 && cursorPos > decimalIndex) {
                          const decimalPlaces = cursorPos - decimalIndex - 1;
                          step = Math.pow(10, -decimalPlaces - 1);
                        } else {
                          step = 0.01; // For cost, default to 0.01
                        }
                        
                        const currentNum = parseFloat(valueStr) || 0;
                        const newValue = e.key === 'ArrowUp'
                          ? currentNum + step 
                          : Math.max(0, currentNum - step);
                        
                        const updatedItems = [...items];
                        updatedItems[index].cost = newValue.toFixed(2);
                        updatedItems[index].subTotal = (parseFloat(String(updatedItems[index].qty)) || 0) * newValue;
                        setItems(updatedItems);
                        
                        // Restore cursor position
                        setTimeout(() => {
                          input.focus();
                          const newValueStr = newValue.toFixed(2);
                          const newCursorPos = Math.min(cursorPos, newValueStr.length);
                          input.setSelectionRange(newCursorPos, newCursorPos);
                        }, 0);
                      }
                    }}
                  />
                </td>
                <td className="p-6 text-right font-black">{currencyCode} {item.subTotal.toLocaleString()}</td>
                <td className="p-6 text-center">
                  <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-danger hover:text-danger"><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-6">
          <button onClick={addItemRow} className="flex items-center gap-2 text-primary font-bold text-sm"><Plus size={16} /> Add Item</button>
        </div>
      </div>

      {/* Discount, Tax, and Payment Fields */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface rounded-2xl border border-line p-6">
          <h3 className="text-lg font-black text-foreground mb-4">Discount & Tax</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Discount Type</label>
                <select 
                  className="w-full p-3 border-2 border-line-strong rounded-xl font-bold text-foreground"
                  value={discountType} 
                  onChange={(e) => {
                    setDiscountType(e.target.value as 'fixed' | 'percentage');
                    if (e.target.value === 'percentage' && discount > 100) {
                      setDiscount(0);
                    }
                  }}
                >
                  <option value="fixed">Fixed</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Discount {discountType === 'percentage' && '(%)'}</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  max={discountType === 'percentage' ? 100 : undefined}
                  className="w-full p-3 border-2 border-line-strong rounded-xl font-bold text-foreground"
                  value={discount || ''} 
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    const maxVal = discountType === 'percentage' ? 100 : undefined;
                    setDiscount(maxVal ? Math.min(val, maxVal) : Math.max(0, val));
                  }} 
                  onKeyDown={blockInvalidNumericKeys}
                  placeholder={discountType === 'percentage' ? '0-100' : '0.00'}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Tax Type</label>
                <select 
                  className="w-full p-3 border-2 rounded-xl font-bold text-foreground border-line-strong"
                  value={taxType} 
                  onChange={(e) => {
                    setTaxType(e.target.value as 'fixed' | 'percentage');
                    if (e.target.value === 'percentage' && tax > 100) {
                      setTax(0);
                    }
                  }}
                >
                  <option value="fixed">Fixed</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Tax {taxType === 'percentage' && '(%)'}</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  max={taxType === 'percentage' ? 100 : undefined}
                  className="w-full p-3 border-2 border-line-strong rounded-xl font-bold text-foreground"
                  value={tax || ''} 
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    const maxVal = taxType === 'percentage' ? 100 : undefined;
                    setTax(maxVal ? Math.min(val, maxVal) : Math.max(0, val));
                  }} 
                  onKeyDown={blockInvalidNumericKeys}
                  placeholder={taxType === 'percentage' ? '0-100' : '0.00'}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-2xl border border-line p-6">
          <h3 className="text-lg font-black text-foreground mb-4">Payment Information</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Payment Status</label>
              <select className="w-full p-3 border-2 border-line-strong rounded-xl font-bold text-foreground" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as 'Paid' | 'Partial' | 'Unpaid')}>
                <option value="Unpaid">Unpaid</option>
                <option value="Partial">Partial</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">
                Payment Method 
                {(paymentStatus === 'Paid' || paymentStatus === 'Partial') && <span className="text-danger">*</span>}
              </label>
              <select
                className={`w-full p-3 border-2 rounded-xl font-bold text-foreground ${
                  (paymentStatus === 'Paid' || paymentStatus === 'Partial') && !paymentMethod.trim() 
                    ? 'border-danger-line bg-danger-soft'
                    : 'border-line-strong'
                }`}
                value={paymentMethod} 
                onChange={(e) => setPaymentMethod(e.target.value)}
                required={paymentStatus === 'Paid' || paymentStatus === 'Partial'}
              >
                <option value="">Select Payment Method</option>
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
              {(paymentStatus === 'Paid' || paymentStatus === 'Partial') && !paymentMethod.trim() && (
                <p className="text-xs text-danger mt-1">Payment method is required for {paymentStatus.toLowerCase()} payments</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Grand Total */}
      <div className="mt-8 flex justify-end">
        <div className="bg-primary p-8 rounded-2xl w-full md:w-1/3 text-on-primary shadow-elevated">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="opacity-60 text-xs font-bold uppercase tracking-widest">Subtotal</span>
              <span className="text-lg font-black">{currencyCode} {subtotal.toLocaleString()}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="opacity-60 text-xs font-bold uppercase tracking-widest">Discount</span>
                <span className="text-lg font-black">- {currencyCode} {discountAmount.toLocaleString()}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="opacity-60 text-xs font-bold uppercase tracking-widest">Tax</span>
                <span className="text-lg font-black">+ {currencyCode} {taxAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-line/20">
              <span className="opacity-60 text-xs font-bold uppercase tracking-widest">Grand Total</span>
              <span className="text-2xl font-black">{currencyCode} {grandTotal.toLocaleString()}</span>
            </div>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => navigate('/purchases')} 
              className="flex-1 py-3 bg-surface-muted hover:bg-surface-muted text-foreground rounded-xl font-bold transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmitClick} 
              disabled={isLoading || !isFormValid} 
              className={`flex-1 py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-all ${
                isLoading || !isFormValid
                  ? 'bg-surface-muted cursor-not-allowed opacity-50'
                  : 'bg-surface text-primary hover:bg-surface'
              }`}
            >
              {isLoading ? <Loader2 className="animate-spin" /> : <Save size={20} />} UPDATE PURCHASE
            </button>
          </div>
        </div>
      </div>

      {/* Review & Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-elevated max-w-2xl w-full p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-foreground">Review Purchase Updates</h3>
              <button onClick={() => setShowConfirmModal(false)} className="text-muted hover:text-primary">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4 mb-6 bg-surface-raised p-6 rounded-2xl border border-line">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Supplier</p>
                  <p className="text-lg font-black text-foreground">{suppliers.find(s => s._id === selectedSupplier)?.name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Warehouse</p>
                  <p className="text-lg font-black text-foreground">{selectedWarehouseName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Date</p>
                  <p className="text-lg font-black text-foreground">{purchaseDate}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Payment Status</p>
                  <p className="text-lg font-black text-foreground">{paymentStatus}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-line">
                <p className="text-xs font-black text-muted uppercase tracking-widest mb-3">Items ({items.filter(i => i.productId).length})</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {items.filter(i => i.productId).map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center bg-surface p-2 rounded-lg">
                      <span className="text-sm font-bold text-primary">{item.name} × {item.qty}</span>
                      <span className="text-sm font-black text-primary">{currencyCode} {item.subTotal.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-line space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-muted">Subtotal</span>
                  <span className="text-lg font-black text-primary">{currencyCode} {subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-muted">Discount</span>
                  <span className="text-lg font-black text-danger">- {currencyCode} {discountAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-muted">Tax</span>
                  <span className="text-lg font-black text-primary">+ {currencyCode} {taxAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-line">
                  <span className="text-lg font-black text-primary">Grand Total</span>
                  <span className="text-2xl font-black text-primary">{currencyCode} {grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 bg-surface-muted text-primary rounded-2xl font-bold hover:bg-surface-muted transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex-1 py-3 bg-primary text-on-primary rounded-2xl font-bold hover:bg-primary-hover transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="animate-spin" /> : <Save size={20} />} Confirm & Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditPurchase;
