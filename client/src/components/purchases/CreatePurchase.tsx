import axios from 'axios';
import { ArrowLeft, Calendar, Loader2, PackagePlus, Plus, Save, Trash2, Users, Warehouse, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { toBusinessDateInputValue } from '../../utils/date';
import SearchableDropdown from '../common/SearchableDropdown';
import { showErrorToast, showInfoToast, showSuccessToast } from '../../utils/toast';
import { blockInvalidNumericKeys } from '../../utils/numericInput';

const CreatePurchase = () => {
  const navigate = useNavigate();
  const { currencyCode } = useCurrency();
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedWarehouseName, setSelectedWarehouseName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(toBusinessDateInputValue());
  
  const [items, setItems] = useState<any[]>([{ id: Date.now(), productId: '', name: '', stock: 0, qty: 0, cost: 0, subTotal: 0 }]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [submittedPurchase, setSubmittedPurchase] = useState<any>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Quick product (Create Purchase shortcut only — uses POST /purchases/quick-product)
  const [showQuickProductModal, setShowQuickProductModal] = useState(false);
  const [quickProductSaving, setQuickProductSaving] = useState(false);
  const [categoriesForQuickProduct, setCategoriesForQuickProduct] = useState<any[]>([]);
  const [unitsForQuickProduct, setUnitsForQuickProduct] = useState<any[]>([]);
  const [qpName, setQpName] = useState('');
  const [qpCode, setQpCode] = useState('');
  const [qpCategory, setQpCategory] = useState('');
  const [qpUnit, setQpUnit] = useState('');
  const [qpCost, setQpCost] = useState('');
  const [qpPrice, setQpPrice] = useState('');
  const [qpProductType, setQpProductType] = useState<'Single' | 'Variation'>('Single');
  const variationAttributeOptions = ['Flavor', 'Size', 'Color', 'Material', 'Portion Type', 'Weight'];
  const [qpVariationAttributes, setQpVariationAttributes] = useState<string[]>(['Size']);
  const createEmptyVariationRow = (id: number = Date.now()) => ({
    id,
    name: '',
    cost: '',
    price: '',
    stockAlert: '0',
    quantity: '0',
    discount: '0',
    code: '',
    productProfit: '0.00',
    profitMargin: '0.00',
  });
  const [qpVariations, setQpVariations] = useState<Array<{ id: number; name: string; cost: string; price: string; stockAlert: string; quantity: string; discount: string; code: string; productProfit: string; profitMargin: string }>>([
    createEmptyVariationRow(),
  ]);
  const [qpErrors, setQpErrors] = useState<Record<string, string>>({});

  const [purchaseStatus, setPurchaseStatus] = useState<'Received' | 'Ordered' | 'Pending' | 'Draft'>('Received');
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const [supplierHistory, setSupplierHistory] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

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

  const API_BASE = 'http://localhost:5000/api';
  
  // Payment method options
  const paymentMethods = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Mobile Payment', 'Other'];

  type ProductSearchOption = {
    id: string;
    name: string;
    price: number;
    cost: number;
    code?: string;
    stock?: number;
    image?: string;
    product: any;
    variation?: string;
    variationData?: any;
  };

  useEffect(() => {
    if (showHistorySidebar && selectedSupplier) {
      const fetchHistory = async () => {
        setIsHistoryLoading(true);
        try {
          const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
          const res = await axios.get(`${API_BASE}/purchases?supplierId=${selectedSupplier}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSupplierHistory(res.data?.data || []);
        } catch (err) {
          console.error("History fetch error:", err);
        } finally {
          setIsHistoryLoading(false);
        }
      };
      fetchHistory();
    }
  }, [showHistorySidebar, selectedSupplier]);

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
      } catch (err: any) { 
        console.error("Fetch error:", err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!showQuickProductModal) return;
    setQpName('');
    setQpCode('');
    setQpCategory('');
    setQpUnit('');
    setQpCost('');
    setQpPrice('');
    setQpProductType('Single');
    setQpVariationAttributes(['Size']);
    setQpVariations([createEmptyVariationRow()]);
    setQpErrors({});
    const loadInitialData = async () => {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
        const config = { headers: token ? { Authorization: `Bearer ${token}` } : {} };
        
        const [catRes, unitRes] = await Promise.all([
          axios.get(`${API_BASE}/categories`, config).catch(() => ({ data: { data: [] } })),
          axios.get(`${API_BASE}/units`, config).catch(() => ({ data: { data: [] } }))
        ]);
        
        const catRaw = catRes.data?.data ?? catRes.data ?? [];
        const unitRaw = unitRes.data?.data ?? unitRes.data ?? [];
        
        setCategoriesForQuickProduct(Array.isArray(catRaw) ? catRaw : []);
        setUnitsForQuickProduct(Array.isArray(unitRaw) ? unitRaw : []);
      } catch {
        setCategoriesForQuickProduct([]);
        setUnitsForQuickProduct([]);
      }
    };
    loadInitialData();
  }, [showQuickProductModal]);

  const openQuickProductModal = () => {
    if (!selectedWarehouseId) {
      showInfoToast('Select a warehouse first.');
      return;
    }
    setShowQuickProductModal(true);
  };

  const updateVariationField = (id: number, field: string, value: string) => {
    setQpVariations((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const next = { ...v, [field]: value } as any;
        const cost = parseFloat(String(next.cost)) || 0;
        const price = parseFloat(String(next.price)) || 0;
        const discount = parseFloat(String(next.discount)) || 0;
        const netRevenue = Math.max(0, price - discount);
        const profit = netRevenue - cost;
        const margin = netRevenue > 0 ? (profit / netRevenue) * 100 : 0;
        next.productProfit = profit.toFixed(2);
        next.profitMargin = margin.toFixed(2);
        return next;
      })
    );
  };

  const clearVariationRow = (id: number) => {
    setQpVariations((prev) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              name: '',
              cost: '',
              price: '',
              stockAlert: '0',
              quantity: '0',
              discount: '0',
              code: '',
              productProfit: '0.00',
              profitMargin: '0.00',
            }
          : x
      )
    );
    setQpErrors((prev) => ({ ...prev, variationRows: 'Fill variation name, cost, and price.' }));
    showInfoToast('Combination cleared.');
  };

  const handleQuickProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!selectedWarehouseId) {
      showErrorToast('Select a warehouse first.');
      return;
    }
    if (!qpName.trim()) nextErrors.name = 'Name is required';
    if (!qpCode.trim()) nextErrors.code = 'Code is required';
    if (!qpCategory.trim()) nextErrors.category = 'Category is required';
    if (!qpUnit.trim()) nextErrors.unit = 'Unit is required';
    const costNum = parseFloat(String(qpCost)) || 0;
    const priceNum = qpPrice.trim() === '' ? costNum : parseFloat(String(qpPrice)) || 0;
    if (qpProductType === 'Single') {
      if (costNum < 0 || priceNum < 0) {
        nextErrors.cost = 'Cost and price must be 0 or more';
      }
    } else {
      const validVariations = qpVariations
        .map(v => ({
          name: v.name.trim(),
          cost: parseFloat(String(v.cost)) || 0,
          price: v.price.trim() === '' ? (parseFloat(String(v.cost)) || 0) : (parseFloat(String(v.price)) || 0),
          stockAlert: parseFloat(String(v.stockAlert)) || 0,
          quantity: parseFloat(String(v.quantity)) || 0,
        }))
        .filter(v => v.name);

      if (qpVariationAttributes.length === 0) {
        nextErrors.variationAttributes = 'Select at least one attribute';
      }
      if (validVariations.length === 0) {
        nextErrors.variationRows = 'Add at least one variation';
      }
      const names = validVariations.map(v => v.name.toLowerCase());
      if (new Set(names).size !== names.length) {
        nextErrors.variationRows = 'Variation names must be unique';
      }
      if (validVariations.some(v => v.cost < 0 || v.price < 0)) {
        nextErrors.variationRows = 'Variation cost/price must be 0 or more';
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setQpErrors(nextErrors);
      showErrorToast('Please fix highlighted fields.');
      return;
    }
    setQpErrors({});
    const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
    if (!token) {
      showErrorToast('Please log in.');
      return;
    }
    setQuickProductSaving(true);
    try {
      const res = await axios.post(
        `${API_BASE}/purchases/quick-product`,
        {
          name: qpName.trim(),
          code: qpCode.trim(),
          category: qpCategory.trim(),
          unit: qpUnit.trim() || 'pcs',
          ptype: qpProductType,
          variationAttributes: qpVariationAttributes,
          variationType: qpVariationAttributes[0] || 'Size',
          variations: qpVariations
            .map(v => ({
              name: v.name.trim(),
              productCost: parseFloat(String(v.cost)) || 0,
              productPrice: v.price.trim() === '' ? (parseFloat(String(v.cost)) || 0) : (parseFloat(String(v.price)) || 0),
              stockAlert: parseFloat(String(v.stockAlert)) || 0,
              productQty: parseFloat(String(v.quantity)) || 0,
              discount: parseFloat(String(v.discount)) || 0,
              code: v.code?.trim() || undefined,
              productProfit: parseFloat(String(v.productProfit)) || 0,
              profitMargin: parseFloat(String(v.profitMargin)) || 0,
            }))
            .filter(v => v.name),
          warehouseId: selectedWarehouseId,
          warehouseName: selectedWarehouseName,
          productCost: costNum,
          productPrice: priceNum,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const prod = res.data?.data;
      if (!prod) {
        showInfoToast('Product created. Please search and select it.');
        setShowQuickProductModal(false);
        return;
      }
      const whIdStr = String(selectedWarehouseId);
      const whMap = prod.warehouse;
      const getWh = () => {
        if (!whMap || typeof whMap !== 'object') return undefined;
        const rec = whMap as Record<string, any>;
        if (rec[whIdStr]) return rec[whIdStr];
        const keys = Object.keys(rec);
        const match = keys.find((k) => k === whIdStr || String(k) === whIdStr);
        return match ? rec[match] : undefined;
      };
      const warehouseData = getWh();
      if (!warehouseData) {
        showInfoToast('Saved, but not visible yet. Refresh and search.');
        setShowQuickProductModal(false);
        return;
      }
      const productCost = Number(warehouseData.productCost) || 0;
      const isWeight = prod.isWeight === true;
      const stock = isWeight
        ? warehouseData.totalProductWeight || 0
        : warehouseData.productQty || 0;
      const displayStock = Math.max(0, stock);
      const firstVariationName =
        qpProductType === 'Variation'
          ? qpVariations.find(v => v.name.trim())?.name.trim()
          : undefined;
      const firstVariationData =
        firstVariationName && warehouseData?.variationValues
          ? (warehouseData.variationValues[firstVariationName] || undefined)
          : undefined;
      const pickedCost =
        qpProductType === 'Variation'
          ? (Number(firstVariationData?.productCost) || productCost || 0)
          : productCost;
      setItems((prev) => {
        let idx = prev.findIndex((i) => !i.productId);
        const next = [...prev];
        if (idx === -1) {
          next.push({ id: Date.now(), productId: '', name: '', stock: 0, qty: 0, cost: 0, subTotal: 0 });
          idx = next.length - 1;
        }
        const row = next[idx];
        next[idx] = {
          ...row,
          productId: String(prod._id ?? prod.id ?? ''),
          name: prod.name ?? '',
          variation: qpProductType === 'Variation' ? firstVariationName : undefined,
          stock: displayStock,
          cost: pickedCost ? pickedCost.toFixed(2) : '0.00',
          subTotal: pickedCost * (parseFloat(String(row.qty)) || 0),
        };
        return next;
      });
      showSuccessToast('Product added.');
      setShowQuickProductModal(false);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to create product';
      showErrorToast(String(msg));
    } finally {
      setQuickProductSaving(false);
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
    
    // Require warehouse selection first
    if (!selectedWarehouseId) {
      return [];
    }
    
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const whId = String(selectedWarehouseId);
      
      // Fetch products by search query only (no systemType filter so both retail and restaurant products show)
      const res = await axios.get(`${API_BASE}/products?q=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      let fetchedProds = res.data.data || res.data || [];
      if (!Array.isArray(fetchedProds)) {
        return [];
      }
      
      // Filter products that exist in the selected warehouse (check both id and string forms)
      const filteredProducts = fetchedProds.filter((p: any) => {
        if (!p.warehouse || typeof p.warehouse !== 'object') return false;
        const wh = p.warehouse;
        const getWh = (id: string) => {
          if (wh[id]) return wh[id];
          const keys = Object.keys(wh);
          const match = keys.find(k => k === id || String(k) === id);
          return match ? wh[match] : undefined;
        };
        return getWh(whId) !== undefined;
      });
      
      setProducts(filteredProducts);
      
      const getWhData = (p: any) => {
        const wh = p.warehouse;
        if (!wh || typeof wh !== 'object') return undefined;
        if (wh[whId]) return wh[whId];
        const keys = Object.keys(wh);
        const match = keys.find(k => k === whId || String(k) === whId);
        return match ? wh[match] : undefined;
      };
      
      // Support Single and Variation products
      const results: ProductSearchOption[] = filteredProducts.flatMap((p: any) => {
        const whData = getWhData(p);
        if (p.ptype === 'Variation' && whData?.variationValues) {
          type VarEntry = [string, { productPrice?: number; productCost?: number; productQty?: number; totalProductWeight?: number }];
          const variations = whData.variationValues instanceof Map
            ? Array.from(whData.variationValues.entries()) as VarEntry[]
            : (Object.entries(whData.variationValues) as VarEntry[]);
          return variations.map(([varName, varData]): ProductSearchOption => {
            const isWeight = p.isWeight === true;
            const stock = isWeight ? (varData.totalProductWeight || 0) : (varData.productQty || 0);
            
            const option: ProductSearchOption = {
              id: `${String(p._id)}_${varName}`,
              name: `${p.name ?? ''} - ${varName}`,
              price: Number(varData?.productPrice) || 0,
              cost: Number(varData?.productCost) || 0,
              code: p.code,
              stock: stock,
              image: p.image,
              product: p,
              variation: varName,
              variationData: varData
            };
            return option;
          });
        }
        // Single product - extract cost and price from warehouse data
        const productCost = whData?.productCost ?? 0;
        const productPrice = whData?.productPrice ?? 0;
        const isWeight = p.isWeight === true;
        const stock = isWeight ? (whData?.totalProductWeight || 0) : (whData?.productQty || 0);

        return [{
          id: String(p._id ?? p.id ?? ''),
          name: p.name ?? '',
          price: Number(productPrice) || 0,
          cost: Number(productCost) || 0,
          code: p.code,
          stock: stock,
          image: p.image,
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
      showErrorToast("Select a warehouse first.");
      return;
    }
    
    const prod = selectedProduct?.product;
    if (!prod) return;

    // Get warehouse data for the selected warehouse (match key or string key)
    const whMap = prod.warehouse;
    const whIdStr = String(selectedWarehouseId);
    const getWh = () => {
      if (!whMap || typeof whMap !== 'object') return undefined;
      if ((whMap as Record<string, any>)[whIdStr]) return (whMap as Record<string, any>)[whIdStr];
      const keys = Object.keys(whMap as Record<string, any>);
      const match = keys.find(k => k === whIdStr || String(k) === whIdStr);
      return match ? (whMap as Record<string, any>)[match] : undefined;
    };
    
    const warehouseData = getWh();
    if (!warehouseData) {
      showErrorToast("Product not found in this warehouse.");
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
      showInfoToast(duplicateMessage);
      
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
    // Handle variations for retail products
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
      console.log('[CreatePurchase] Variation stock data:', {
        variationName,
        varData,
        isWeight,
        productQty: varData.productQty,
        totalProductWeight: varData.totalProductWeight,
        calculatedStock: stock
      });
    } else {
      // Single product - get from warehouse data
      productCost = warehouseData.productCost || 0;
      const isWeight = prod.isWeight === true;
      stock = isWeight 
        ? (warehouseData.totalProductWeight || 0)
        : (warehouseData.productQty || 0);
    }

    // Ensure stock is never negative
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

  // Calculate subtotal (sum of all items)
  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.subTotal, 0), [items]);
  
  // Calculate discount amount
  const discountAmount = useMemo(() => {
    if (discountType === 'percentage') {
      return (subtotal * discount) / 100;
    }
    return discount;
  }, [subtotal, discount, discountType]);
  
  // Calculate tax amount
  const taxAmount = useMemo(() => {
    const amountAfterDiscount = subtotal - discountAmount;
    if (taxType === 'percentage') {
      return (amountAfterDiscount * tax) / 100;
    }
    return tax;
  }, [subtotal, discountAmount, tax, taxType]);
  
  // Calculate grand total
  const grandTotal = useMemo(() => {
    return subtotal - discountAmount + taxAmount;
  }, [subtotal, discountAmount, taxAmount]);
  
  // Validation state
  const isFormValid = useMemo(() => {
    // Check if discount and tax are valid
    if (discount < 0 || tax < 0) return false;
    
    // Check percentage limits
    if (discountType === 'percentage' && discount > 100) return false;
    if (taxType === 'percentage' && tax > 100) return false;
    
    // Check payment method requirement
    if ((paymentStatus === 'Paid' || paymentStatus === 'Partial') && (!paymentMethod || paymentMethod.trim() === '')) {
      return false;
    }
    
    return true;
  }, [discount, tax, discountType, taxType, paymentStatus, paymentMethod]);

  // Show confirmation modal before submitting
  const handleSubmitClick = () => {
    // Prevent duplicate submissions
    if (isLoading) {
      return;
    }

    if (!selectedSupplier || !selectedWarehouseId || items.length === 0) {
      showErrorToast("Select supplier, warehouse, and item.");
      return;
    }
    
    const validItems = items.filter(i => i.productId && (parseFloat(String(i.qty)) || 0) > 0 && (i.cost || 0) > 0);
    if (validItems.length === 0) {
      showErrorToast("Each item needs product, qty, and cost.");
      return;
    }
    
    // Validate Discount & Tax fields
    if (discount < 0) {
      showErrorToast("Discount cannot be negative.");
      return;
    }
    
    if (tax < 0) {
      showErrorToast("Tax cannot be negative.");
      return;
    }
    
    // Validate Payment Information
    if (paymentStatus === 'Paid' || paymentStatus === 'Partial') {
      if (!paymentMethod || paymentMethod.trim() === '') {
        showErrorToast(`Select payment method for ${paymentStatus}.`);
        return;
      }
    }
    
    // Additional validation: If discount type is percentage, ensure discount is between 0-100
    if (discountType === 'percentage' && discount > 100) {
      showErrorToast("Discount cannot exceed 100%.");
      return;
    }
    
    // Additional validation: If tax type is percentage, ensure tax is between 0-100
    if (taxType === 'percentage' && tax > 100) {
      showErrorToast("Tax cannot exceed 100%.");
      return;
    }
    
    // Show confirmation modal
    setShowConfirmModal(true);
  };

  // 4. Submit purchase to API (after confirmation)
  const handleSubmit = async () => {
    setShowConfirmModal(false);

    // Recompute valid items here as well (used to build payload)
    const validItems = items.filter(i => i.productId && (parseFloat(String(i.qty)) || 0) > 0 && (i.cost || 0) > 0);
    if (validItems.length === 0) {
      showErrorToast("Each item needs product, qty, and cost.");
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      if (!token) {
        showErrorToast("Please log in to continue.");
        setIsLoading(false);
        return;
      }
      
      const authUser = JSON.parse(localStorage.getItem('user') || '{}');
      const createdBy = authUser.id || authUser._id;
      
      if (!createdBy) {
        showErrorToast("User info missing. Log in again.");
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
        purchaseStatus, // Updated to use state
        createdBy,
        items: validItems.map((i: any) => ({
          productId: i.productId,
          quantity: parseFloat(String(i.qty)) || 0,
          cost: i.cost || 0,
          subTotal: (parseFloat(String(i.qty)) || 0) * (i.cost || 0)
        }))
      };
      
      const res = await axios.post(`${API_BASE}/purchases`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const created = res.data?.data || res.data;
      const supplierName = suppliers.find((s: any) => s._id === selectedSupplier)?.name || 'N/A';
      const warehouseNameForList = selectedWarehouseName || 'N/A';
      
      setSubmittedPurchase({
        purchaseId: created?.purchaseId || `PUR-${Date.now()}`,
        purchaseDate: purchaseDate,
        supplierName,
        warehouseName: warehouseNameForList,
        items: validItems.map((i: any) => ({ name: i.name, qty: i.qty, cost: i.cost, subTotal: (i.qty || 0) * (i.cost || 0) })),
        subtotal,
        discount: discountAmount,
        tax: taxAmount,
        grandTotal
      });
      showSuccessToast('Purchase saved.');
      
      // Reset form (but don't navigate automatically - let user choose via modal buttons)
      setItems([]);
      setSelectedSupplier('');
      setSelectedWarehouseId('');
      setSelectedWarehouseName('');
      setPurchaseDate(toBusinessDateInputValue());
      setDiscount(0);
      setDiscountType('fixed');
      setTax(0);
      setTaxType('fixed');
      setPaymentStatus('Unpaid');
      setPaymentMethod('');
    } catch (err: any) {
      console.error('Purchase submission error:', err);
      console.error('Error response:', err.response?.data);
      
      let errorMessage = "Failed to create purchase";
      const failedProducts = err.response?.data?.failedProducts;
      
      if (err.response?.data) {
        // Try multiple possible error message fields
        errorMessage = err.response.data.message || 
                      err.response.data.error || 
                      err.response.data.error?.message ||
                      JSON.stringify(err.response.data);
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      // Show detailed error message
      if (failedProducts && failedProducts.length > 0) {
        showErrorToast(`Failed products: ${failedProducts.join(', ')}`);
      } else {
        // Show full error details for debugging
        const fullError = err.response?.data ? JSON.stringify(err.response.data, null, 2) : errorMessage;
        showErrorToast(`${errorMessage}${fullError ? ' (see console for details)' : ''}`);
        if (fullError) console.error('Purchase error details:', fullError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewPurchase = () => {
    setSubmittedPurchase(null);
  };

  // Open a dedicated print window with only the receipt content
  const handlePrintReceipt = () => {
    if (!submittedPurchase) return;

    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) return;

    const itemsHtml = submittedPurchase.items
      .map(
        (item: any, idx: number) => `
          <tr>
            <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">${idx + 1}</td>
            <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">${item.name}</td>
            <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; text-align:center;">${item.qty}</td>
            <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; text-align:right;">${currencyCode} ${item.cost.toLocaleString()}</td>
            <td style="padding:8px 12px; border-bottom:1px solid #e5e7eb; text-align:right;">${currencyCode} ${item.subTotal.toLocaleString()}</td>
          </tr>
        `
      )
      .join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Purchase Receipt - ${submittedPurchase.purchaseId}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              margin: 0;
              padding: 24px;
              background: #e5e7eb;
            }
            .card {
              max-width: 700px;
              margin: 0 auto;
              background: white;
              border-radius: 20px;
              overflow: hidden;
              box-shadow: 0 12px 25px rgba(15, 23, 42, 0.15);
            }
            .card-header {
              background: linear-gradient(135deg, #1d4ed8, #0f172a);
              color: white;
              padding: 16px 24px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .card-header h1 {
              margin: 0;
              font-size: 18px;
              font-weight: 800;
              letter-spacing: 0.06em;
              text-transform: uppercase;
            }
            .badge {
              padding: 4px 10px;
              border-radius: 999px;
              background: rgba(34, 197, 94, 0.15);
              color: #bbf7d0;
              font-size: 11px;
              font-weight: 700;
              border: 1px solid rgba(34, 197, 94, 0.5);
            }
            .row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 6px;
              font-size: 13px;
            }
            .row span strong {
              color: #475569;
            }
            .body {
              padding: 20px 24px 12px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 16px;
              font-size: 12px;
            }
            th {
              text-align: left;
              padding: 8px 12px;
              border-bottom: 2px solid #e5e7eb;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              color: #64748b;
            }
            tfoot td {
              padding: 8px 12px;
              border-top: 1px solid #e5e7eb;
              font-weight: 700;
              font-size: 13px;
            }
            .totals-row td {
              padding-top: 4px;
            }
            .totals-row:last-child td {
              font-size: 15px;
              color: #1d4ed8;
            }
            .footer {
              padding: 10px 24px 14px;
              font-size: 11px;
              color: #9ca3af;
              text-align: center;
              border-top: 1px dashed #e5e7eb;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="card-header">
              <div>
                <h1>Purchase Receipt</h1>
                <div style="font-size:11px; opacity:0.85;">ServeSmart POS</div>
              </div>
              <div class="badge">Recorded</div>
            </div>
            <div class="body">
              <div class="row">
                <span><strong>Purchase ID:</strong> ${submittedPurchase.purchaseId}</span>
                <span><strong>Date:</strong> ${submittedPurchase.purchaseDate}</span>
              </div>
              <div class="row">
                <span><strong>Supplier:</strong> ${submittedPurchase.supplierName}</span>
                <span><strong>Warehouse:</strong> ${submittedPurchase.warehouseName}</span>
              </div>
              <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th style="text-align:center;">Qty</th>
                  <th style="text-align:right;">Unit Cost</th>
                  <th style="text-align:right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                <tr class="totals-row">
                  <td colspan="4" style="text-align:right;">Subtotal</td>
                  <td style="text-align:right;">${currencyCode} ${(submittedPurchase.subtotal || submittedPurchase.grandTotal).toLocaleString()}</td>
                </tr>
                ${submittedPurchase.discount > 0 ? `
                  <tr class="totals-row">
                    <td colspan="4" style="text-align:right;">Discount</td>
                    <td style="text-align:right; color:#dc2626;">- ${currencyCode} ${submittedPurchase.discount.toLocaleString()}</td>
                  </tr>
                ` : ''}
                ${submittedPurchase.tax > 0 ? `
                  <tr class="totals-row">
                    <td colspan="4" style="text-align:right;">Tax</td>
                    <td style="text-align:right;">+ ${currencyCode} ${submittedPurchase.tax.toLocaleString()}</td>
                  </tr>
                ` : ''}
                <tr class="totals-row">
                  <td colspan="4" style="text-align:right;">Grand Total</td>
                  <td style="text-align:right;">${currencyCode} ${submittedPurchase.grandTotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
            </div>
            <div class="footer">
              Generated by ServeSmart POS • ${new Date().toLocaleString()}
            </div>
          </div>
          <script>
            window.onload = function () {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };


  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      {showQuickProductModal && (
        <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center z-[60] p-2 sm:p-4">
          <div className="bg-white/95 rounded-2xl sm:rounded-[30px] shadow-[0_25px_60px_rgba(15,23,42,0.28)] w-[98vw] max-w-[760px] p-4 sm:p-6 md:p-7 relative border border-slate-200 animate-in fade-in zoom-in-95 duration-200 max-h-[95vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => !quickProductSaving && setShowQuickProductModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-[#1A3E73] hover:bg-slate-100 rounded-full p-1 transition-all"
              aria-label="Close"
            >
              <X size={22} />
            </button>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-[10px] font-black uppercase tracking-widest text-[#1A3E73] mb-3">
              <span className="w-2 h-2 rounded-full bg-[#3B82F6] animate-pulse" />
              Quick Create
            </div>
            <h2 className="text-2xl font-black text-[#1A3E73] mb-1 flex items-center gap-2">
              <PackagePlus size={22} className="text-[#3B82F6]" />
              New product
            </h2>
            <p className="text-xs font-bold text-[#64748B] mb-5 leading-5">
              Creates an inventory product in <span className="text-[#1A3E73]">{selectedWarehouseName || 'selected warehouse'}</span> and adds it to a line.
            </p>
            <form onSubmit={handleQuickProductSubmit} className="space-y-4 sm:space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Product type</label>
                <select
                  className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-[#1A3E73] bg-white shadow-sm focus:outline-none focus:ring-2 transition-all ${qpErrors.productType ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-[#B9D5F2] focus:ring-blue-200 focus:border-[#3B82F6]'}`}
                  value={qpProductType}
                  onChange={(e) => setQpProductType(e.target.value as 'Single' | 'Variation')}
                >
                  <option value="Single">Single</option>
                  <option value="Variation">Variation</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Name</label>
                <input
                  className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-[#1A3E73] bg-white shadow-sm focus:outline-none focus:ring-2 transition-all ${qpErrors.name ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-[#B9D5F2] focus:ring-blue-200 focus:border-[#3B82F6]'}`}
                  value={qpName}
                  onChange={(e) => setQpName(e.target.value)}
                  required
                  autoFocus
                />
                {qpErrors.name && <p className="mt-1 text-[11px] text-red-500 font-semibold">{qpErrors.name}</p>}
              </div>
              <div>
                <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Code</label>
                <input
                  className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-[#1A3E73] bg-white shadow-sm focus:outline-none focus:ring-2 transition-all ${qpErrors.code ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-[#B9D5F2] focus:ring-blue-200 focus:border-[#3B82F6]'}`}
                  value={qpCode}
                  onChange={(e) => setQpCode(e.target.value)}
                  required
                />
                {qpErrors.code && <p className="mt-1 text-[11px] text-red-500 font-semibold">{qpErrors.code}</p>}
              </div>
              <div>
                <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Category</label>
                {categoriesForQuickProduct.length > 0 ? (
                  <select
                    className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-[#1A3E73] bg-white shadow-sm focus:outline-none focus:ring-2 transition-all ${qpErrors.category ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-[#B9D5F2] focus:ring-blue-200 focus:border-[#3B82F6]'}`}
                    value={qpCategory}
                    onChange={(e) => setQpCategory(e.target.value)}
                    required
                  >
                    <option value="">Select category</option>
                    {categoriesForQuickProduct.map((c: any) => (
                      <option key={c._id || c.id} value={c.category || c.name}>
                        {c.category || c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-[#1A3E73] bg-white shadow-sm focus:outline-none focus:ring-2 transition-all ${qpErrors.category ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-[#B9D5F2] focus:ring-blue-200 focus:border-[#3B82F6]'}`}
                    placeholder="Category name"
                    value={qpCategory}
                    onChange={(e) => setQpCategory(e.target.value)}
                    required
                  />
                )}
                {qpErrors.category && <p className="mt-1 text-[11px] text-red-500 font-semibold">{qpErrors.category}</p>}
              </div>
              <div>
                <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Unit</label>
                {unitsForQuickProduct.length > 0 ? (
                  <select
                    className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-[#1A3E73] bg-white shadow-sm focus:outline-none focus:ring-2 transition-all ${qpErrors.unit ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-[#B9D5F2] focus:ring-blue-200 focus:border-[#3B82F6]'}`}
                    value={qpUnit}
                    onChange={(e) => setQpUnit(e.target.value)}
                    required
                  >
                    <option value="">Select unit</option>
                    {unitsForQuickProduct.map((u: any) => (
                      <option key={u._id || u.id} value={u.shortName || u.name}>
                        {u.name} ({u.shortName})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-[#1A3E73] bg-white shadow-sm focus:outline-none focus:ring-2 transition-all ${qpErrors.unit ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-[#B9D5F2] focus:ring-blue-200 focus:border-[#3B82F6]'}`}
                    value={qpUnit}
                    onChange={(e) => setQpUnit(e.target.value)}
                    required
                  />
                )}
                {qpErrors.unit && <p className="mt-1 text-[11px] text-red-500 font-semibold">{qpErrors.unit}</p>}
              </div>
              </div>
              {qpProductType === 'Single' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-slate-50/70 border border-slate-100 rounded-2xl p-3">
                    <div>
                      <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Cost (LKR)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-[#1A3E73] bg-white shadow-sm focus:outline-none focus:ring-2 transition-all ${qpErrors.cost ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-[#B9D5F2] focus:ring-blue-200 focus:border-[#3B82F6]'}`}
                        value={qpCost}
                        onChange={(e) => setQpCost(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Sale price (LKR)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-[#1A3E73] bg-white shadow-sm focus:outline-none focus:ring-2 transition-all ${qpErrors.cost ? 'border-red-300 focus:ring-red-100 focus:border-red-400' : 'border-[#B9D5F2] focus:ring-blue-200 focus:border-[#3B82F6]'}`}
                        value={qpPrice}
                        onChange={(e) => setQpPrice(e.target.value)}
                      />
                    </div>
                  </div>
                  {qpErrors.cost && <p className="mt-1 text-[11px] text-red-500 font-semibold">{qpErrors.cost}</p>}
                </>
              ) : (
                <div className="space-y-3 bg-slate-50/70 border border-slate-100 rounded-2xl p-3">
                  <div>
                    <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Variation Attributes</label>
                    <div className="mt-2 flex flex-wrap gap-2 pb-1">
                      {variationAttributeOptions.map((attr) => {
                        const active = qpVariationAttributes.includes(attr);
                        return (
                          <button
                            key={attr}
                            type="button"
                            onClick={() =>
                              setQpVariationAttributes((prev) =>
                                prev.includes(attr) ? prev.filter((a) => a !== attr) : [...prev, attr]
                              )
                            }
                            className={`px-2.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                              active
                                ? 'bg-[#1D4ED8] text-white border-[#1D4ED8] shadow-sm'
                                : 'bg-white text-[#64748B] border-slate-200 hover:border-blue-300 hover:text-[#1A3E73]'
                            }`}
                          >
                            {attr}
                          </button>
                        );
                      })}
                    </div>
                    {qpErrors.variationAttributes && <p className="mt-1 text-[11px] text-red-500 font-semibold">{qpErrors.variationAttributes}</p>}
                  </div>

                  <div className="border border-slate-300 rounded-xl bg-white p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-semibold text-[#0F172A]">{selectedWarehouseName || 'Main Kitchen'}</p>
                      <button
                        type="button"
                        className="text-red-500 hover:text-red-600 transition-colors"
                        title="Clear combinations"
                        onClick={() => setQpVariations([createEmptyVariationRow()])}
                      >
                        <X size={13} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">Variation Combinations</p>
                      <button
                        type="button"
                        className="h-7 px-3 rounded-md bg-[#0B3A75] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#0A2F5E] transition-colors whitespace-nowrap"
                        onClick={() =>
                          setQpVariations((prev) => [
                            ...prev,
                            createEmptyVariationRow(),
                          ])
                        }
                      >
                        Add Combination
                      </button>
                    </div>

                    {qpVariations.map((v, idx) => (
                      <div key={v.id} className="relative grid grid-cols-2 sm:grid-cols-8 lg:grid-cols-12 gap-2.5 items-end bg-white border border-slate-200 rounded-xl p-3 pr-10">
                        <button
                          type="button"
                          className="absolute top-2 right-2 h-5 w-5 rounded-full border border-red-300 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center"
                          title="Remove this combination"
                          onClick={() => setQpVariations((prev) => prev.filter((x) => x.id !== v.id))}
                        >
                          <X size={10} />
                        </button>
                      <div className="col-span-2 sm:col-span-3 lg:col-span-3">
                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">{idx === 0 ? 'Variation' : ' '}</label>
                        <input
                          className="w-full mt-1 px-2.5 py-2 border-2 border-[#B9D5F2] rounded-lg font-bold text-[#1A3E73] focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-[#3B82F6] transition-all"
                          value={v.name}
                          onChange={(e) => updateVariationField(v.id, 'name', e.target.value)}
                          placeholder="Medium"
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-1 lg:col-span-2">
                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">{idx === 0 ? 'Cost' : ' '}</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-full mt-1 px-2.5 py-2 border-2 border-[#B9D5F2] rounded-lg font-bold text-[#1A3E73] focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-[#3B82F6] transition-all"
                          value={v.cost}
                          onChange={(e) => updateVariationField(v.id, 'cost', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-1 lg:col-span-2">
                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">{idx === 0 ? 'Price' : ' '}</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-full mt-1 px-2.5 py-2 border-2 border-[#B9D5F2] rounded-lg font-bold text-[#1A3E73] focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-[#3B82F6] transition-all"
                          value={v.price}
                          onChange={(e) => updateVariationField(v.id, 'price', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-1 lg:col-span-2">
                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">{idx === 0 ? 'Stock Alert' : ' '}</label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          className="w-full mt-1 px-2.5 py-2 border-2 border-[#B9D5F2] rounded-lg font-bold text-[#1A3E73] focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-[#3B82F6] transition-all"
                          value={v.stockAlert}
                          onChange={(e) => updateVariationField(v.id, 'stockAlert', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-1 lg:col-span-2">
                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">{idx === 0 ? 'Qty' : ' '}</label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          className="w-full mt-1 px-2.5 py-2 border-2 border-[#B9D5F2] rounded-lg font-bold text-[#1A3E73] focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-[#3B82F6] transition-all"
                          value={v.quantity}
                          onChange={(e) => updateVariationField(v.id, 'quantity', e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 lg:col-span-1" />
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">{idx === 0 ? 'Discount' : ' '}</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-full mt-1 px-2.5 py-2 border-2 border-[#B9D5F2] rounded-lg font-bold text-[#1A3E73] focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-[#3B82F6] transition-all"
                          value={v.discount}
                          onChange={(e) => updateVariationField(v.id, 'discount', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">{idx === 0 ? 'Variation Code' : ' '}</label>
                        <input
                          className="w-full mt-1 px-2.5 py-2 border-2 border-[#B9D5F2] rounded-lg font-bold text-[#1A3E73] focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-[#3B82F6] transition-all"
                          value={v.code}
                          onChange={(e) => updateVariationField(v.id, 'code', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">{idx === 0 ? 'Product Profit' : ' '}</label>
                        <input
                          readOnly
                          className="w-full mt-1 px-2.5 py-2 border-2 border-slate-200 rounded-lg font-bold text-[#475569] bg-slate-100"
                          value={v.productProfit}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                        <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest">{idx === 0 ? 'Profit Margin (%)' : ' '}</label>
                        <input
                          readOnly
                          className="w-full mt-1 px-2.5 py-2 border-2 border-slate-200 rounded-lg font-bold text-[#475569] bg-slate-100"
                          value={v.profitMargin}
                        />
                      </div>
                        <div className="col-span-2 sm:col-span-8 lg:col-span-12 flex justify-end">
                          <button
                            type="button"
                            className="text-[12px] text-red-500 hover:text-red-600 font-medium"
                            onClick={() => clearVariationRow(v.id)}
                          >
                            Remove Combination
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {qpErrors.variationRows && <p className="mt-1 text-[11px] text-red-500 font-semibold">{qpErrors.variationRows}</p>}
                </div>
              )}
              <div className="mt-4 pt-3 border-t border-slate-100 bg-white flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowQuickProductModal(false)}
                  disabled={quickProductSaving}
                  className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl font-bold border-2 border-slate-300 bg-white text-[#475569] hover:bg-slate-100 hover:border-slate-400 transition-all flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickProductSaving}
                  className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl font-bold bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white hover:from-[#2563EB] hover:to-[#1D4ED8] shadow-lg shadow-blue-200/70 hover:shadow-blue-300/70 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                >
                  {quickProductSaving ? <Loader2 className="animate-spin" size={20} /> : null}
                  Create & add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Show Confirmation Screen After Successful Submission */}
      {submittedPurchase && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto pt-8">
          {/* This wrapper is used as the print area so only the receipt prints */}
          <div id="purchase-receipt" className="bg-white rounded-[32px] shadow-2xl max-w-2xl w-full p-8 relative">
            {/* Close Button */}
            <button
              onClick={handleNewPurchase}
              className="absolute top-6 right-6 text-[#64748B] hover:text-[#1A3E73] transition-colors"
              title="Close"
            >
              <X size={24} />
            </button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-[#1A3E73] mb-2">Purchase Recorded Successfully!</h2>
              <p className="text-[#64748B] font-bold">Your purchase has been saved to the system</p>
            </div>

            {/* Purchase Details */}
            <div className="space-y-4 mb-8 bg-[#F8FAFC] p-6 rounded-2xl border border-slate-100">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Purchase ID</p>
                  <p className="text-lg font-black text-[#1A3E73]">{submittedPurchase.purchaseId}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Date</p>
                  <p className="text-lg font-black text-[#1A3E73]">{submittedPurchase.purchaseDate}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Supplier</p>
                  <p className="text-lg font-black text-[#1A3E73]">{submittedPurchase.supplierName}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Warehouse</p>
                  <p className="text-lg font-black text-[#1A3E73]">{submittedPurchase.warehouseName}</p>
                </div>
              </div>

              {/* Items Summary */}
              <div className="mt-6">
                <p className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-4">Items Purchased</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {submittedPurchase.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-100">
                      <div>
                        <p className="font-bold text-[#1A3E73]">{item.name}</p>
                        <p className="text-xs text-[#64748B]">Qty: {item.qty}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[#3B82F6]">{currencyCode} {item.subTotal.toLocaleString()}</p>
                        <p className="text-xs text-[#64748B]">@ {currencyCode} {item.cost.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Breakdown */}
              <div className="border-t border-slate-200 pt-4 mt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-[#64748B]">Subtotal</span>
                  <span className="text-lg font-black text-[#1A3E73]">{currencyCode} {(submittedPurchase.subtotal || submittedPurchase.grandTotal).toLocaleString()}</span>
                </div>
                {submittedPurchase.discount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-[#64748B]">Discount</span>
                    <span className="text-lg font-black text-red-600">- {currencyCode} {submittedPurchase.discount.toLocaleString()}</span>
                  </div>
                )}
                {submittedPurchase.tax > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-[#64748B]">Tax</span>
                    <span className="text-lg font-black text-[#1A3E73]">+ {currencyCode} {submittedPurchase.tax.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                  <span className="text-lg font-black text-[#1A3E73]">Grand Total</span>
                  <span className="text-2xl font-black text-[#3B82F6]">{currencyCode} {submittedPurchase.grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons (hidden on print) */}
            <div className="flex flex-col gap-3 no-print">
              <p className="text-sm text-[#64748B] font-bold text-center">✓ Purchase saved successfully!</p>
              <div className="flex gap-4">
                <button
                  onClick={handlePrintReceipt}
                  className="flex-1 py-3 bg-[#E2E8F0] text-[#1A3E73] rounded-2xl font-bold hover:bg-[#CBD5E1] transition-all"
                >
                  🖨️ Print Receipt
                </button>
                <button
                  onClick={handleNewPurchase}
                  className="flex-1 py-3 bg-[#3B82F6] text-white rounded-2xl font-bold hover:bg-[#2563EB] transition-all"
                >
                  ➕ Create Another Purchase
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/purchases')}
          className="text-[#1A3E73] hover:text-[#0F2A55] transition p-1 rounded-lg hover:bg-slate-100"
          title="Back to Purchases"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-3xl font-black text-[#1A3E73] mb-0">Create Purchase</h1>
      </div>
      
      {/* Header Fields */}
      <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest flex items-center gap-2"><Users size={14} /> Supplier</label>
            <select className="w-full p-4 border-2 border-[#B9D5F2] rounded-2xl font-bold text-[#1A3E73]" value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}>
              <option value="">{suppliers.length === 0 ? 'Loading suppliers...' : 'Select Supplier'}</option>
              {suppliers.map(s => <option key={s._id || s.id} value={s._id || s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest flex items-center gap-2"><Warehouse size={14} /> Warehouse</label>
            <select className="w-full p-4 border-2 border-[#B9D5F2] rounded-2xl font-bold text-[#1A3E73]" value={selectedWarehouseId} onChange={handleWarehouseChange}>
              <option value="">{warehouses.length === 0 ? 'Loading warehouses...' : 'Select Warehouse'}</option>
              {warehouses.map(w => <option key={w._id || w.id} value={w._id || w.id}>{w.name}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest flex items-center gap-2"><Calendar size={14} /> Date</label>
            <input type="date" className="w-full p-4 border-2 border-[#B9D5F2] rounded-2xl font-bold text-[#1A3E73]" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-[#64748B] uppercase tracking-widest flex items-center gap-2">Status</label>
            <select 
              className="w-full p-4 border-2 border-[#B9D5F2] rounded-2xl font-bold text-[#1A3E73]" 
              value={purchaseStatus} 
              onChange={(e) => setPurchaseStatus(e.target.value as any)}
            >
              <option value="Received">Received</option>
              <option value="Ordered">Ordered</option>
              <option value="Pending">Pending</option>
              <option value="Draft">Draft</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-6 pt-6 border-t border-slate-50">
          {selectedSupplier && (
            <button
              type="button"
              onClick={() => setShowHistorySidebar(true)}
              className="flex items-center gap-2 bg-[#F1F5F9] text-[#475569] font-black text-[10px] uppercase tracking-widest rounded-xl px-6 py-4 hover:bg-[#E2E8F0] transition-all"
            >
              <Users size={16} /> View Supplier History
            </button>
          )}
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
          <h3 className="text-lg font-black text-[#1A3E73] flex items-center gap-2">
            <Warehouse size={20} className="text-[#3B82F6]" />
            Product Info
          </h3>
          <button
            type="button"
            onClick={openQuickProductModal}
            className="group relative flex items-center gap-2 bg-gradient-to-r from-[#0F766E] to-[#14B8A6] text-white font-black text-xs uppercase tracking-wider rounded-xl px-4 py-2.5 shadow-lg shadow-teal-200/50 hover:shadow-teal-300/60 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 overflow-hidden"
            title="Create a new product for this warehouse without leaving this page"
          >
            {/* Animated background shine */}
            <div className="absolute inset-0 w-1/2 h-full bg-white/20 skew-x-[-25deg] -translate-x-full group-hover:animate-[shine_1s_ease-in-out_infinite]" />
            
            <PackagePlus size={16} className="group-hover:scale-110 transition-transform duration-300" />
            <span>New product</span>
            
            {/* Pulse ring animation */}
            <div className="absolute inset-0 rounded-xl ring-2 ring-teal-400/50 animate-pulse group-hover:animate-none" />
          </button>
        </div>
        <table className="w-full text-left">
          <thead className="bg-[#F8FAFC] text-[#64748B] text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
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
          <tbody className="divide-y divide-slate-50">
            {items.map((item, index) => (
              <tr key={item.id} className="hover:bg-slate-50/50 transition-all">
                <td className="p-6 w-1/3">
                  <SearchableDropdown 
                    key={`${item.id}-${item.productId || 'empty'}`}
                    value={item.name} 
                    onChange={(val) => handleProductSelect(index, val)} 
                    onSearch={handleProductSearch} 
                    placeholder="Search product..." 
                  />
                </td>
                <td className="p-6 text-center text-[#64748B] font-medium">
                  {item.variation || '—'}
                </td>
                <td className="p-6 text-center text-[#3B82F6] font-black">
                  {Number((Math.max(0, item.stock || 0)).toFixed(2))}
                </td>
                <td className="p-6 text-center">
                  <input 
                    type="number" 
                    step="any" 
                    min="0" 
                    className="w-20 p-2 border border-slate-200 rounded-lg text-center" 
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
                    className="w-24 p-2 border border-slate-200 rounded-lg text-center" 
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
                  <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="text-red-400 hover:text-red-600"><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-6">
          <button type="button" onClick={addItemRow} className="flex items-center gap-2 text-[#3B82F6] font-bold text-sm">
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      {/* Discount, Tax, and Payment Fields */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-6">
          <h3 className="text-lg font-black text-[#1A3E73] mb-4">Discount & Tax</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-2 block">Discount Type</label>
                <select 
                  className={`w-full p-3 border-2 rounded-xl font-bold text-[#1A3E73] ${
                    discount < 0 ? 'border-red-300 bg-red-50' : 'border-[#B9D5F2]'
                  }`}
                  value={discountType} 
                  onChange={(e) => {
                    setDiscountType(e.target.value as 'fixed' | 'percentage');
                    // Reset discount if switching types to avoid invalid values
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
                <label className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-2 block">Discount {discountType === 'percentage' && '(%)'}</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  max={discountType === 'percentage' ? 100 : undefined}
                  className="w-full p-3 border-2 border-[#B9D5F2] rounded-xl font-bold text-[#1A3E73]" 
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
                <label className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-2 block">Tax Type</label>
                <select 
                  className={`w-full p-3 border-2 rounded-xl font-bold text-[#1A3E73] ${
                    tax < 0 ? 'border-red-300 bg-red-50' : 'border-[#B9D5F2]'
                  }`}
                  value={taxType} 
                  onChange={(e) => {
                    setTaxType(e.target.value as 'fixed' | 'percentage');
                    // Reset tax if switching types to avoid invalid values
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
                <label className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-2 block">Tax {taxType === 'percentage' && '(%)'}</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  max={taxType === 'percentage' ? 100 : undefined}
                  className="w-full p-3 border-2 border-[#B9D5F2] rounded-xl font-bold text-[#1A3E73]" 
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

        <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-6">
          <h3 className="text-lg font-black text-[#1A3E73] mb-4">Payment Information</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-2 block">Payment Status</label>
              <select className="w-full p-3 border-2 border-[#B9D5F2] rounded-xl font-bold text-[#1A3E73]" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as 'Paid' | 'Partial' | 'Unpaid')}>
                <option value="Unpaid">Unpaid</option>
                <option value="Partial">Partial</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-2 block">
                Payment Method 
                {(paymentStatus === 'Paid' || paymentStatus === 'Partial') && <span className="text-red-500">*</span>}
              </label>
              <select
                className={`w-full p-3 border-2 rounded-xl font-bold text-[#1A3E73] ${
                  (paymentStatus === 'Paid' || paymentStatus === 'Partial') && !paymentMethod.trim() 
                    ? 'border-red-300 bg-red-50' 
                    : 'border-[#B9D5F2]'
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
                <p className="text-xs text-red-500 mt-1">Payment method is required for {paymentStatus.toLowerCase()} payments</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Grand Total */}
      <div className="mt-8 flex justify-end">
        <div className="bg-[#1A3E73] p-8 rounded-[32px] w-full md:w-1/3 text-white shadow-2xl">
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
            <div className="border-t border-white/20 pt-3 flex justify-between items-center">
              <span className="opacity-60 text-xs font-bold uppercase tracking-widest">Grand Total</span>
              <span className="text-2xl font-black">{currencyCode} {grandTotal.toLocaleString()}</span>
            </div>
          </div>
          <button 
            onClick={handleSubmitClick} 
            disabled={isLoading || !isFormValid} 
            className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all ${
              isLoading || !isFormValid
                ? 'bg-gray-400 cursor-not-allowed opacity-50'
                : 'bg-[#3B82F6] hover:bg-white hover:text-[#3B82F6]'
            }`}
            title={
              !isFormValid
                ? (paymentStatus === 'Paid' || paymentStatus === 'Partial') && !paymentMethod.trim()
                  ? 'Payment method is required for paid/partial payments'
                  : discount < 0 || tax < 0
                  ? 'Discount and tax cannot be negative'
                  : discountType === 'percentage' && discount > 100
                  ? 'Discount percentage cannot exceed 100%'
                  : taxType === 'percentage' && tax > 100
                  ? 'Tax percentage cannot exceed 100%'
                  : 'Please fill all required fields correctly'
                : ''
            }
          >
            {isLoading ? <Loader2 className="animate-spin" /> : <Save size={20} />} SUBMIT PURCHASE
          </button>
          {!isFormValid && (
            <p className="text-xs text-yellow-300 mt-2 text-center">
              ⚠ Please fill all required fields correctly before submitting
            </p>
          )}
        </div>
      </div>


      {/* Review & Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[32px] shadow-2xl max-w-2xl w-full p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-[#1A3E73]">Review Purchase Details</h3>
              <button onClick={() => setShowConfirmModal(false)} className="text-[#64748B] hover:text-[#1A3E73]">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4 mb-6 bg-[#F8FAFC] p-6 rounded-2xl border border-slate-100">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-1">Supplier</p>
                  <p className="text-lg font-black text-[#1A3E73]">{suppliers.find(s => s._id === selectedSupplier)?.name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-1">Warehouse</p>
                  <p className="text-lg font-black text-[#1A3E73]">{selectedWarehouseName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-1">Date</p>
                  <p className="text-lg font-black text-[#1A3E73]">{purchaseDate}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-1">Payment Status</p>
                  <p className="text-lg font-black text-[#1A3E73]">{paymentStatus}</p>
                </div>
              </div>

              {/* Items Summary */}
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-3">Items ({items.filter(i => i.productId).length})</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {items.filter(i => i.productId).map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center bg-white p-2 rounded-lg">
                      <span className="text-sm font-bold text-[#1A3E73]">{item.name} × {item.qty}</span>
                      <span className="text-sm font-black text-[#3B82F6]">{currencyCode} {item.subTotal.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Summary */}
              <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-[#64748B]">Subtotal</span>
                  <span className="text-lg font-black text-[#1A3E73]">{currencyCode} {subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-[#64748B]">
                    Discount ({discountType === 'percentage' ? `${discount}%` : 'Fixed'})
                  </span>
                  <span className="text-lg font-black text-red-600">- {currencyCode} {discountAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-[#64748B]">
                    Tax ({taxType === 'percentage' ? `${tax}%` : 'Fixed'})
                  </span>
                  <span className="text-lg font-black text-[#1A3E73]">+ {currencyCode} {taxAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                  <span className="text-lg font-black text-[#1A3E73]">Grand Total</span>
                  <span className="text-2xl font-black text-[#3B82F6]">{currencyCode} {grandTotal.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment Information */}
              {paymentStatus !== 'Unpaid' && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-2">Payment Method</p>
                  <p className="text-lg font-black text-[#1A3E73]">{paymentMethod || 'Not specified'}</p>
                </div>
              )}

              {/* Warning for defaults */}
              {(discount === 0 && tax === 0 && paymentStatus === 'Unpaid' && !paymentMethod.trim()) && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-700 font-bold">
                    ℹ️ Note: No discount, tax, or payment method specified. Purchase will be recorded as unpaid with default values.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 bg-[#E2E8F0] text-[#1A3E73] rounded-2xl font-bold hover:bg-[#CBD5E1] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex-1 py-3 bg-[#3B82F6] text-white rounded-2xl font-bold hover:bg-[#2563EB] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="animate-spin" /> : <Save size={20} />} Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier History Sidebar */}
      {showHistorySidebar && (
        <div className="fixed inset-0 z-[100] overflow-hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowHistorySidebar(false)} />
          <div className="absolute inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-xl font-black text-[#1A3E73] flex items-center gap-2">
                  <Calendar size={22} className="text-[#3B82F6]" />
                  Purchase History
                </h2>
                <p className="text-xs font-bold text-[#64748B] mt-1">
                  Latest purchases from {suppliers.find(s => s._id === selectedSupplier)?.name}
                </p>
              </div>
              <button onClick={() => setShowHistorySidebar(false)} className="p-2 text-[#64748B] hover:bg-white rounded-xl transition-all">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isHistoryLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="animate-spin text-[#3B82F6]" size={32} />
                  <p className="text-sm font-bold text-[#64748B]">Loading history...</p>
                </div>
              ) : supplierHistory.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                  <p className="text-sm font-bold text-[#64748B]">No previous purchases found.</p>
                </div>
              ) : (
                supplierHistory.map((p: any) => (
                  <div key={p._id} className="bg-white border border-slate-100 rounded-[24px] p-5 hover:border-[#3B82F6] hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-xs font-black text-[#3B82F6] uppercase tracking-tighter mb-1">{p.purchaseId}</p>
                        <p className="text-sm font-bold text-[#1A3E73]">{new Date(p.purchaseDate).toLocaleDateString()}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        p.purchaseStatus === 'Received' ? 'bg-green-50 text-green-600 border border-green-100' : 
                        p.purchaseStatus === 'Draft' ? 'bg-slate-50 text-slate-500 border border-slate-100' :
                        'bg-blue-50 text-blue-600 border border-blue-100'
                      }`}>
                        {p.purchaseStatus}
                      </span>
                    </div>
                    
                    <div className="space-y-2 mb-3">
                      {p.items?.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-[#64748B] font-medium">{item.productId?.name || 'Product'} × {item.quantity}</span>
                          <span className="text-[#1A3E73] font-bold">LKR {item.cost.toLocaleString()}</span>
                        </div>
                      ))}
                      {p.items?.length > 3 && (
                        <p className="text-[10px] font-bold text-[#64748B] italic">+{p.items.length - 3} more items...</p>
                      )}
                    </div>
                    
                    <div className="pt-3 border-t border-slate-50 flex justify-between items-center">
                      <span className="text-xs font-bold text-[#64748B]">Total Amount</span>
                      <span className="text-lg font-black text-[#1A3E73]">LKR {p.grandTotal.toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatePurchase;
