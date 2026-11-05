import axios from 'axios';
import ProductSellingType from '../products/ProductSellingType';
import PermissionGate from '../common/PermissionGate';
import CreateSupplier from '../suppliers/createSupplier';
import { completePurchase, pendingPurchase, preparePurchase } from '../../services/purchaseSubmission';
import type { PurchaseSubmission } from '../../services/purchaseSubmission';
import { purchaseReorderDraft } from '../../services/purchaseReorder';
import { escapeBrandText, getBranding } from '../../services/branding';
import { ArrowLeft, Calendar, Loader2, PackagePlus, Plus, Save, Trash2, Users, Warehouse, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { toBusinessDateInputValue } from '../../utils/date';
import SearchableDropdown from '../common/SearchableDropdown';
import { showErrorToast, showInfoToast, showSuccessToast } from '../../utils/toast';
import { blockInvalidNumericKeys } from '../../utils/numericInput';

const CreatePurchase = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reorderProductId = searchParams.get('reorderProductId') || '';
  const reorderWarehouseId = searchParams.get('warehouseId') || '';
  const [reorderLoading, setReorderLoading] = useState(!!reorderProductId);
  const [reorderMessage, setReorderMessage] = useState('');
  const [reorderError, setReorderError] = useState('');
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
  const [purchaseRequestId, setPurchaseRequestId] = useState(() => crypto.randomUUID());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [saveAndReceive, setSaveAndReceive] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<PurchaseSubmission | null>(null);
  const [submissionError, setSubmissionError] = useState('');
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const supplierDialog = useRef<HTMLDialogElement>(null);
  const submissionInFlight = useRef(false);
  const quickQuantityFocus = useRef<number | null>(null);

  // Quick product (Create Purchase shortcut only — uses POST /purchases/quick-product)
  const [showQuickProductModal, setShowQuickProductModal] = useState(false);
  const [quickProductSaving, setQuickProductSaving] = useState(false);
  const [categoriesForQuickProduct, setCategoriesForQuickProduct] = useState<any[]>([]);
  const [unitsForQuickProduct, setUnitsForQuickProduct] = useState<any[]>([]);
  const [qpName, setQpName] = useState('');
  const [qpCode, setQpCode] = useState('');
  const [qpCategory, setQpCategory] = useState('');
  const [qpUnit, setQpUnit] = useState('');
  const [qpIsSellable, setQpIsSellable] = useState<boolean | null>(null);
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

  const [purchaseStatus, setPurchaseStatus] = useState<'Received' | 'Ordered' | 'Pending'>('Ordered');
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
  const actorId = (() => { try { const user = JSON.parse(localStorage.getItem('user') || '{}'); return String(user.id || user._id || ''); } catch { return ''; } })();
  useEffect(() => { if (actorId) { try { setPendingSubmission(pendingPurchase(localStorage, actorId)); } catch (error) { setSubmissionError((error as Error).message); } } }, [actorId]);
  useEffect(() => { if (showSupplierModal) supplierDialog.current?.showModal(); }, [showSupplierModal]);
  useEffect(() => {
    if (showQuickProductModal || quickQuantityFocus.current === null) return;
    document.getElementById(`purchase-quantity-${quickQuantityFocus.current}`)?.focus();
    quickQuantityFocus.current = null;
  }, [items, showQuickProductModal]);
  
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
    let cancelled = false;
    setReorderLoading(!!reorderProductId); setReorderError('');
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
        if (cancelled) return;
        
        setSuppliers(Array.isArray(suppliersData) ? suppliersData : []);
        setWarehouses(Array.isArray(warehousesData) ? warehousesData : []);
        if (reorderProductId) {
          // Existing durable purchase recovery takes precedence over a new reorder link.
          if (actorId && pendingPurchase(localStorage, actorId)) { setReorderMessage('A saved purchase is awaiting confirmation. Resolve that operation before starting this reorder.'); return; }
          const warehouse = Array.isArray(warehousesData) ? warehousesData.find((row: any) => String(row._id || row.id) === reorderWarehouseId) : null;
          if (!warehouse) throw new Error('The reorder location is unavailable. Return to warehouse stock and choose an available location.');
          const productResponse = await axios.get(`${API_BASE}/products/${encodeURIComponent(reorderProductId)}`, config);
          if (cancelled) return;
          const draft = purchaseReorderDraft(productResponse.data?.data, warehouse, Array.isArray(suppliersData) ? suppliersData : []);
          setSelectedWarehouseId(draft.warehouseId); setSelectedWarehouseName(draft.warehouseName); setSelectedSupplier(draft.supplierId);
          const rowId = Date.now(); quickQuantityFocus.current = rowId;
          setItems([{ id: rowId, ...draft.item }]); setPurchaseStatus('Ordered');
          setReorderMessage(`Reorder: ${draft.item.name} into ${draft.warehouseName}. Review purchase quantity and unit cost. ${draft.supplierNote}`);
        }
      } catch (err: any) { 
        if (reorderProductId && !cancelled) setReorderError(err.response?.data?.message || err.message || 'Could not prepare this reorder. No order was created.');
        else if (!reorderProductId) console.error("Fetch error:", err);
      } finally {
        if (!cancelled) setReorderLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [reorderProductId, reorderWarehouseId]);

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
    setQpIsSellable(null);
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
    if (qpIsSellable === null) { showErrorToast('Choose Sellable or Inventory only.'); return; }
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
    const priceNum = qpIsSellable === false ? 0 : qpPrice.trim() === '' ? costNum : parseFloat(String(qpPrice)) || 0;
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
          unit: qpUnit.trim(),
          isSellable: qpIsSellable,
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
        quickQuantityFocus.current = row.id;
        next[idx] = {
          ...row,
          productId: String(prod._id ?? prod.id ?? ''),
          name: prod.name ?? '',
          stockUnit: prod.unit,
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
      stockUnit: prod.unit,
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
  const handleSubmitClick = (receive: boolean) => {
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
    setSaveAndReceive(receive);
    setShowConfirmModal(true);
  };

  const finishSubmission = async () => {
    const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
    if (!token || !actorId) throw new Error('Please log in to continue.');
    const result = await completePurchase(localStorage, actorId, async (path, body) => {
      const response = await axios.post(API_BASE + path, body, { headers: { Authorization: 'Bearer ' + token } });
      return response.data?.data;
    });
    setSubmittedPurchase({ ...result.display, purchaseStatus: result.purchase.purchaseStatus, purchaseId: result.purchase.purchaseId, id: result.purchase._id });
    setPendingSubmission(null); setSubmissionError('');
    showSuccessToast(result.purchase.purchaseStatus === 'Received' ? 'Purchase saved and stock received in ' + String(result.display.warehouseName) + '.' : 'Order saved. No stock received yet.');
    setItems([]); setSelectedSupplier(''); setSelectedWarehouseId(''); setSelectedWarehouseName('');
    setPurchaseDate(toBusinessDateInputValue()); setDiscount(0); setDiscountType('fixed'); setTax(0); setTaxType('fixed');
    setPaymentStatus('Unpaid'); setPaymentMethod(''); setPurchaseStatus('Ordered');
  };
  const submissionFailed = (error: unknown) => {
    const failure = error as { response?: { data?: { message?: string } }; message?: string };
    const message = failure.response?.data?.message || failure.message || 'Purchase could not be confirmed. Retry the saved operation.';
    setSubmissionError(message); showErrorToast(message);
    try { setPendingSubmission(pendingPurchase(localStorage, actorId)); } catch { /* Preserve the existing recovery notice. */ }
  };
  // A saved order ID is checkpointed before receiving; retries cannot create another order.
  const handleSubmit = async () => {
    if (submissionInFlight.current) return;
    setShowConfirmModal(false);
    const validItems = items.filter(i => i.productId && (parseFloat(String(i.qty)) || 0) > 0 && (i.cost || 0) > 0);
    if (!validItems.length) { showErrorToast('Each item needs product, purchase quantity, and unit cost.'); return; }
    submissionInFlight.current = true; setIsLoading(true); setSubmissionError('');
    try {
      if (!actorId) throw new Error('User info missing. Log in again.');
      const payload = {
        createRequestId: purchaseRequestId, supplierId: selectedSupplier, warehouseId: selectedWarehouseId,
        warehouseName: selectedWarehouseName, purchaseDate, subtotal, discount: discount || 0,
        discountType, tax: tax || 0, taxType, grandTotal, paymentStatus, paymentMethod: paymentMethod || undefined,
        purchaseStatus: purchaseStatus === 'Pending' ? 'Pending' : 'Ordered', createdBy: actorId,
        items: validItems.map(i => ({ productId: i.productId, quantity: parseFloat(String(i.qty)), cost: Number(i.cost), subTotal: parseFloat(String(i.qty)) * Number(i.cost) }))
      };
      const display = {
        warehouseId: selectedWarehouseId, warehouseName: selectedWarehouseName,
        supplierName: suppliers.find(s => (s._id || s.id) === selectedSupplier)?.name || 'Not available', purchaseDate,
        items: validItems.map(i => ({ name: i.name, qty: i.qty, cost: i.cost, subTotal: Number(i.qty) * Number(i.cost) })),
        subtotal, discount: discountAmount, tax: taxAmount, grandTotal
      };
      setPendingSubmission(preparePurchase(localStorage, actorId, payload, saveAndReceive, display));
      await finishSubmission();
    } catch (error) { submissionFailed(error); }
    finally { submissionInFlight.current = false; setIsLoading(false); }
  };
  const retrySubmission = async () => {
    if (submissionInFlight.current) return;
    submissionInFlight.current = true; setIsLoading(true); setSubmissionError('');
    try { await finishSubmission(); } catch (error) { submissionFailed(error); }
    finally { submissionInFlight.current = false; setIsLoading(false); }
  };

  const handleNewPurchase = () => {
    if (reorderProductId) navigate('/createPurchase', { replace: true });
    setSubmittedPurchase(null);
    setPurchaseRequestId(crypto.randomUUID());
    setItems([{ id: Date.now(), productId: '', name: '', stock: 0, qty: 0, cost: 0, subTotal: 0 }]);
  };

  // Open a dedicated print window with only the receipt content
  const handlePrintReceipt = () => {
    if (!submittedPurchase) return;
    const documentTitle = submittedPurchase.purchaseStatus === 'Received' ? 'Purchase Receipt' : 'Purchase Order';

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
          <title>${documentTitle} - ${submittedPurchase.purchaseId}</title>
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
                <h1>${documentTitle}</h1>
                <div style="font-size:11px; opacity:0.85;">${escapeBrandText(getBranding().companyName)}</div>
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
              Generated by ${escapeBrandText(getBranding().companyName)} • ${new Date().toLocaleString()}
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
    <div className="p-8 bg-canvas min-h-screen">
      {showQuickProductModal && (
        <div className="fixed inset-0 bg-overlay backdrop-blur-[2px] flex items-center justify-center z-[60] p-2 sm:p-4">
          <div className="bg-surface rounded-2xl sm:rounded-[30px] shadow-[0_25px_60px_rgba(15,23,42,0.28)] w-[98vw] max-w-[760px] p-4 sm:p-6 md:p-7 relative border border-line animate-in fade-in zoom-in-95 duration-200 max-h-[95vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => !quickProductSaving && setShowQuickProductModal(false)}
              className="absolute top-4 right-4 text-muted hover:text-primary hover:bg-surface-muted rounded-full p-1 transition-all"
              aria-label="Close"
            >
              <X size={22} />
            </button>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-soft border border-primary-line text-[10px] font-black uppercase tracking-widest text-foreground mb-3">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Quick Create
            </div>
            <h2 className="text-2xl font-black text-foreground mb-1 flex items-center gap-2">
              <PackagePlus size={22} className="text-primary" />
              Create Item
            </h2>
            <p className="text-xs font-bold text-muted mb-5 leading-5">
              Creates an item record with zero stock in <span className="text-primary">{selectedWarehouseName || 'selected warehouse'}</span> and adds it to the order. Stock increases only when the purchase is received.
            </p>
            <form onSubmit={handleQuickProductSubmit} className="space-y-4 sm:space-y-5">
              <ProductSellingType value={qpIsSellable} onChange={setQpIsSellable} />
              <p className="text-sm text-muted">Choose the stock unit used by purchase quantities, for example bags or kilograms. Pack sizes are not inferred from item names and recipe conversion is not automatic.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="text-[10px] font-black text-muted uppercase tracking-widest">Product type</label>
                <select
                  className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-foreground bg-surface focus:outline-none focus:ring-2 transition-all ${qpErrors.productType ? 'border-danger-line focus:ring-danger-line focus:border-danger-line' : 'border-line-strong focus:ring-primary focus:border-primary'}`}
                  value={qpProductType}
                  onChange={(e) => setQpProductType(e.target.value as 'Single' | 'Variation')}
                >
                  <option value="Single">Single</option>
                  <option value="Variation" disabled>Variation (receipt identity support pending)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-muted uppercase tracking-widest">Name</label>
                <input
                  className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-foreground bg-surface focus:outline-none focus:ring-2 transition-all ${qpErrors.name ? 'border-danger-line focus:ring-danger-line focus:border-danger-line' : 'border-line-strong focus:ring-primary focus:border-primary'}`}
                  value={qpName}
                  onChange={(e) => setQpName(e.target.value)}
                  required
                  autoFocus
                />
                {qpErrors.name && <p className="mt-1 text-[11px] text-danger font-semibold">{qpErrors.name}</p>}
              </div>
              <div>
                <label className="text-[10px] font-black text-muted uppercase tracking-widest">Code</label>
                <input
                  className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-foreground bg-surface focus:outline-none focus:ring-2 transition-all ${qpErrors.code ? 'border-danger-line focus:ring-danger-line focus:border-danger-line' : 'border-line-strong focus:ring-primary focus:border-primary'}`}
                  value={qpCode}
                  onChange={(e) => setQpCode(e.target.value)}
                  required
                />
                {qpErrors.code && <p className="mt-1 text-[11px] text-danger font-semibold">{qpErrors.code}</p>}
              </div>
              <div>
                <label className="text-[10px] font-black text-muted uppercase tracking-widest">Category</label>
                {categoriesForQuickProduct.length > 0 ? (
                  <select
                    className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-foreground bg-surface focus:outline-none focus:ring-2 transition-all ${qpErrors.category ? 'border-danger-line focus:ring-danger-line focus:border-danger-line' : 'border-line-strong focus:ring-primary focus:border-primary'}`}
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
                    className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-foreground bg-surface focus:outline-none focus:ring-2 transition-all ${qpErrors.category ? 'border-danger-line focus:ring-danger-line focus:border-danger-line' : 'border-line-strong focus:ring-primary focus:border-primary'}`}
                    placeholder="Category name"
                    value={qpCategory}
                    onChange={(e) => setQpCategory(e.target.value)}
                    required
                  />
                )}
                {qpErrors.category && <p className="mt-1 text-[11px] text-danger font-semibold">{qpErrors.category}</p>}
              </div>
              <div>
                <label className="text-[10px] font-black text-muted uppercase tracking-widest">Stock unit</label>
                {unitsForQuickProduct.length > 0 ? (
                  <select
                    className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-foreground bg-surface focus:outline-none focus:ring-2 transition-all ${qpErrors.unit ? 'border-danger-line focus:ring-danger-line focus:border-danger-line' : 'border-line-strong focus:ring-primary focus:border-primary'}`}
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
                    className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-foreground bg-surface focus:outline-none focus:ring-2 transition-all ${qpErrors.unit ? 'border-danger-line focus:ring-danger-line focus:border-danger-line' : 'border-line-strong focus:ring-primary focus:border-primary'}`}
                    value={qpUnit}
                    onChange={(e) => setQpUnit(e.target.value)}
                    required
                  />
                )}
                {qpErrors.unit && <p className="mt-1 text-[11px] text-danger font-semibold">{qpErrors.unit}</p>}
              </div>
              </div>
              {qpProductType === 'Single' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-surface-raised/70 border border-line rounded-2xl p-3">
                    <div>
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">Unit Cost ({currencyCode})</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-foreground bg-surface focus:outline-none focus:ring-2 transition-all ${qpErrors.cost ? 'border-danger-line focus:ring-danger-line focus:border-danger-line' : 'border-line-strong focus:ring-primary focus:border-primary'}`}
                        value={qpCost}
                        onChange={(e) => setQpCost(e.target.value)}
                        required
                      />
                    </div>
                    {qpIsSellable !== false && <div>
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest">Sale price ({currencyCode})</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={`w-full mt-1 px-3 py-2.5 border-2 rounded-xl font-bold text-foreground bg-surface focus:outline-none focus:ring-2 transition-all ${qpErrors.cost ? 'border-danger-line focus:ring-danger-line focus:border-danger-line' : 'border-line-strong focus:ring-primary focus:border-primary'}`}
                        value={qpPrice}
                        onChange={(e) => setQpPrice(e.target.value)}
                      />
                    </div>}
                  </div>
                  {qpErrors.cost && <p className="mt-1 text-[11px] text-danger font-semibold">{qpErrors.cost}</p>}
                </>
              ) : (
                <div className="space-y-3 bg-surface-raised/70 border border-line rounded-2xl p-3">
                  <div>
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest">Variation Attributes</label>
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
                                ? 'bg-primary text-on-primary border-primary'
                                : 'bg-surface text-muted border-line hover:border-primary hover:text-primary'
                            }`}
                          >
                            {attr}
                          </button>
                        );
                      })}
                    </div>
                    {qpErrors.variationAttributes && <p className="mt-1 text-[11px] text-danger font-semibold">{qpErrors.variationAttributes}</p>}
                  </div>

                  <div className="border border-line-strong rounded-xl bg-surface p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-semibold text-foreground">{selectedWarehouseName || 'Main Kitchen'}</p>
                      <button
                        type="button"
                        className="text-danger hover:text-danger transition-colors"
                        title="Clear combinations"
                        onClick={() => setQpVariations([createEmptyVariationRow()])}
                      >
                        <X size={13} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black text-muted uppercase tracking-widest">Variation Combinations</p>
                      <button
                        type="button"
                        className="h-7 px-3 rounded-md bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary-hover transition-colors whitespace-nowrap"
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
                      <div key={v.id} className="relative grid grid-cols-2 sm:grid-cols-8 lg:grid-cols-12 gap-2.5 items-end bg-surface border border-line rounded-xl p-3 pr-10">
                        <button
                          type="button"
                          className="absolute top-2 right-2 h-5 w-5 rounded-full border border-danger-line text-danger hover:bg-danger-soft hover:text-danger transition-colors flex items-center justify-center"
                          title="Remove this combination"
                          onClick={() => setQpVariations((prev) => prev.filter((x) => x.id !== v.id))}
                        >
                          <X size={10} />
                        </button>
                      <div className="col-span-2 sm:col-span-3 lg:col-span-3">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest">{idx === 0 ? 'Variation' : ' '}</label>
                        <input
                          className="w-full mt-1 px-2.5 py-2 border-2 border-line-strong rounded-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          value={v.name}
                          onChange={(e) => updateVariationField(v.id, 'name', e.target.value)}
                          placeholder="Medium"
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-1 lg:col-span-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest">{idx === 0 ? 'Cost' : ' '}</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-full mt-1 px-2.5 py-2 border-2 border-line-strong rounded-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          value={v.cost}
                          onChange={(e) => updateVariationField(v.id, 'cost', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-1 lg:col-span-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest">{idx === 0 ? 'Price' : ' '}</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-full mt-1 px-2.5 py-2 border-2 border-line-strong rounded-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          value={v.price}
                          onChange={(e) => updateVariationField(v.id, 'price', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-1 lg:col-span-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest">{idx === 0 ? 'Stock Alert' : ' '}</label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          className="w-full mt-1 px-2.5 py-2 border-2 border-line-strong rounded-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          value={v.stockAlert}
                          onChange={(e) => updateVariationField(v.id, 'stockAlert', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-1 lg:col-span-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest">{idx === 0 ? 'Qty' : ' '}</label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          className="w-full mt-1 px-2.5 py-2 border-2 border-line-strong rounded-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          value={v.quantity}
                          onChange={(e) => updateVariationField(v.id, 'quantity', e.target.value)}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 lg:col-span-1" />
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest">{idx === 0 ? 'Discount' : ' '}</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-full mt-1 px-2.5 py-2 border-2 border-line-strong rounded-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          value={v.discount}
                          onChange={(e) => updateVariationField(v.id, 'discount', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest">{idx === 0 ? 'Variation Code' : ' '}</label>
                        <input
                          className="w-full mt-1 px-2.5 py-2 border-2 border-line-strong rounded-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                          value={v.code}
                          onChange={(e) => updateVariationField(v.id, 'code', e.target.value)}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest">{idx === 0 ? 'Product Profit' : ' '}</label>
                        <input
                          readOnly
                          className="w-full mt-1 px-2.5 py-2 border-2 border-line rounded-lg font-bold text-muted bg-surface-muted"
                          value={v.productProfit}
                        />
                      </div>
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest">{idx === 0 ? 'Profit Margin (%)' : ' '}</label>
                        <input
                          readOnly
                          className="w-full mt-1 px-2.5 py-2 border-2 border-line rounded-lg font-bold text-muted bg-surface-muted"
                          value={v.profitMargin}
                        />
                      </div>
                        <div className="col-span-2 sm:col-span-8 lg:col-span-12 flex justify-end">
                          <button
                            type="button"
                            className="text-[12px] text-danger hover:text-danger font-medium"
                            onClick={() => clearVariationRow(v.id)}
                          >
                            Remove Combination
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {qpErrors.variationRows && <p className="mt-1 text-[11px] text-danger font-semibold">{qpErrors.variationRows}</p>}
                </div>
              )}
              <div className="mt-4 pt-3 border-t border-line bg-surface flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowQuickProductModal(false)}
                  disabled={quickProductSaving}
                  className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl font-bold border-2 border-line-strong bg-surface text-muted hover:bg-surface-muted hover:border-line-strong transition-all flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickProductSaving}
                  className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl font-bold text-on-primary hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 bg-primary"
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
        <div className="fixed inset-0 bg-overlay flex items-start justify-center z-50 p-4 overflow-y-auto pt-8">
          {/* This wrapper is used as the print area so only the receipt prints */}
          <div id="purchase-receipt" className="bg-surface rounded-2xl shadow-elevated max-w-2xl w-full p-8 relative">
            {/* Close Button */}
            <button
              onClick={handleNewPurchase}
              className="absolute top-6 right-6 text-muted hover:text-primary transition-colors"
              title="Close"
            >
              <X size={24} />
            </button>
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto bg-secondary-soft rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-secondary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-foreground mb-2">Purchase Recorded Successfully!</h2>
              <p className="text-muted font-bold">Your purchase has been saved to the system</p>
            </div>

            {/* Purchase Details */}
            <div className="space-y-4 mb-8 bg-surface-raised p-6 rounded-2xl border border-line">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest">Purchase ID</p>
                  <p className="text-lg font-black text-foreground">{submittedPurchase.purchaseId}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest">Date</p>
                  <p className="text-lg font-black text-foreground">{submittedPurchase.purchaseDate}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest">Supplier</p>
                  <p className="text-lg font-black text-foreground">{submittedPurchase.supplierName}</p>
                </div>
                <div>
                  <p className="text-xs font-black text-muted uppercase tracking-widest">Warehouse</p>
                  <p className="text-lg font-black text-foreground">{submittedPurchase.warehouseName}</p>
                </div>
              </div>

              {/* Items Summary */}
              <div className="mt-6">
                <p className="text-xs font-black text-muted uppercase tracking-widest mb-4">Items Purchased</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {submittedPurchase.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center bg-surface p-3 rounded-lg border border-line">
                      <div>
                        <p className="font-bold text-foreground">{item.name}</p>
                        <p className="text-xs text-muted">Qty: {item.qty}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{currencyCode} {item.subTotal.toLocaleString()}</p>
                        <p className="text-xs text-muted">@ {currencyCode} {item.cost.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Breakdown */}
              <div className="border-t border-line pt-4 mt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-muted">Subtotal</span>
                  <span className="text-lg font-black text-primary">{currencyCode} {(submittedPurchase.subtotal || submittedPurchase.grandTotal).toLocaleString()}</span>
                </div>
                {submittedPurchase.discount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-muted">Discount</span>
                    <span className="text-lg font-black text-danger">- {currencyCode} {submittedPurchase.discount.toLocaleString()}</span>
                  </div>
                )}
                {submittedPurchase.tax > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-muted">Tax</span>
                    <span className="text-lg font-black text-primary">+ {currencyCode} {submittedPurchase.tax.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-line">
                  <span className="text-lg font-black text-primary">Grand Total</span>
                  <span className="text-2xl font-black text-primary">{currencyCode} {submittedPurchase.grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons (hidden on print) */}
            <div className="flex flex-col gap-3 no-print">
              <p className="text-sm text-muted text-center">{submittedPurchase.purchaseStatus === 'Received' ? 'Stock received in the purchase warehouse.' : 'Order only: no stock received yet. Use Receive Stock in Purchases.'}</p>
              <a href={`/purchases?warehouseId=${submittedPurchase.warehouseId}`} className="ss-button text-center">View Orders / Receive Stock</a>
              {submittedPurchase.purchaseStatus === 'Received' && <a href={`/warehouses/${submittedPurchase.warehouseId}/stock`} className="ss-button text-center">View Warehouse Stock</a>}
              <p className="text-sm text-muted font-bold text-center">✓ Purchase saved successfully!</p>
              <div className="flex gap-4">
                <button
                  onClick={handlePrintReceipt}
                  className="flex-1 py-3 bg-surface-muted text-primary rounded-2xl font-bold hover:bg-surface-muted transition-all"
                >
                  🖨️ Print Receipt
                </button>
                <button
                  onClick={handleNewPurchase}
                  className="flex-1 py-3 bg-primary text-on-primary rounded-2xl font-bold hover:bg-primary-hover transition-all"
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
          className="text-primary hover:text-primary transition p-1 rounded-lg hover:bg-surface-muted"
          title="Back to Purchases"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-3xl font-black text-foreground mb-0">Create Purchase</h1>
      </div>
      
      {/* Header Fields */}
      {reorderProductId && <section aria-label="Reorder setup" className="mb-5 rounded-xl border border-line bg-surface p-4 space-y-2">
        {reorderLoading ? <p role="status">Preparing reorder from saved stock details…</p> : reorderError ? <p role="alert" className="text-danger">{reorderError}</p> : <p>{reorderMessage}</p>}
        <p className="text-sm text-muted">Save Order increases Incoming only. On Hand changes only after Receive Stock.</p>
        <a href={`/warehouses/${encodeURIComponent(reorderWarehouseId)}/stock`} className="text-sm text-primary underline">Back to warehouse stock</a>
      </section>}
      {showSupplierModal && <dialog ref={supplierDialog} aria-label="New Supplier" onCancel={() => setShowSupplierModal(false)} className="m-auto w-[calc(100%-2rem)] max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-line bg-surface text-foreground p-0 backdrop:bg-black/50"><CreateSupplier onCancel={() => setShowSupplierModal(false)} onCreated={supplier => { setSuppliers(current => [...current.filter(item => item._id !== supplier._id), supplier]); setSelectedSupplier(supplier._id); setShowSupplierModal(false); }} /></dialog>}
      {submissionError && <p role="alert" className="mb-4 rounded-xl border border-danger-line bg-danger-soft p-4 text-sm">{submissionError}</p>}
      {pendingSubmission && <section aria-label="Purchase recovery" className="mb-5 rounded-xl border border-warning-line bg-warning-soft p-4 space-y-3"><h2 className="font-bold">{pendingSubmission.purchase ? `Order ${pendingSubmission.purchase.purchaseId} saved — receipt awaiting confirmation` : 'Purchase awaiting confirmation'}</h2><p className="text-sm">Destination: {String(pendingSubmission.display.warehouseName)}. {pendingSubmission.purchase ? 'Retry receiving this saved order. Do not create another purchase.' : 'Retry the original request to recover its result. The form is locked to preserve that request.'}</p><button type="button" className="ss-button" disabled={isLoading} onClick={retrySubmission}>{isLoading ? 'Confirming…' : pendingSubmission.purchase ? 'Retry Receive Stock' : 'Retry saved purchase'}</button><a className="ss-button ml-2" href={`/purchases?warehouseId=${String(pendingSubmission.display.warehouseId)}`}>View saved orders</a></section>}
      <fieldset disabled={isLoading || reorderLoading || !!reorderError || !!pendingSubmission || !!submittedPurchase} className="min-w-0">
      <div className="bg-surface p-8 rounded-2xl border border-line mb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2"><label htmlFor="purchase-supplier" className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-2"><Users size={14} /> Supplier</label><button type="button" className="text-sm font-semibold text-primary whitespace-nowrap" onClick={() => setShowSupplierModal(true)}>+ New Supplier</button></div>
            <select id="purchase-supplier" className="w-full p-4 border-2 border-line-strong rounded-2xl font-bold text-foreground" value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}>
              <option value="">{suppliers.length === 0 ? 'Loading suppliers...' : 'Select Supplier'}</option>
              {suppliers.map(s => <option key={s._id || s.id} value={s._id || s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            <label htmlFor="purchase-warehouse" className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-2"><Warehouse size={14} /> Warehouse</label>
            <select id="purchase-warehouse" className="w-full p-4 border-2 border-line-strong rounded-2xl font-bold text-foreground" value={selectedWarehouseId} onChange={handleWarehouseChange}>
              <option value="">{warehouses.length === 0 ? 'Loading warehouses...' : 'Select Warehouse'}</option>
              {warehouses.map(w => <option key={w._id || w.id} value={w._id || w.id}>{w.name}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-2"><Calendar size={14} /> Date</label>
            <input type="date" className="w-full p-4 border-2 border-line-strong rounded-2xl font-bold text-foreground" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-2">Status</label>
            <select 
              className="w-full p-4 border-2 border-line-strong rounded-2xl font-bold text-foreground"
              value={purchaseStatus} 
              onChange={(e) => setPurchaseStatus(e.target.value as any)}
            >
              <option value="Ordered">Ordered</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-6 pt-6 border-t border-line">
          {selectedSupplier && (
            <button
              type="button"
              onClick={() => setShowHistorySidebar(true)}
              className="flex items-center gap-2 bg-surface-muted text-muted font-black text-[10px] uppercase tracking-widest rounded-xl px-6 py-4 hover:bg-surface-muted transition-all"
            >
              <Users size={16} /> View Supplier History
            </button>
          )}
        </div>
      </div>

      {/* Product Table */}
      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        <div className="p-6 border-b border-line flex justify-between items-center bg-surface-raised/30">
          <h3 className="text-lg font-black text-foreground flex items-center gap-2">
            <Warehouse size={20} className="text-primary" />
            Product Info
          </h3>
          <PermissionGate component="manageProducts" action="create"><button
            type="button"
            onClick={openQuickProductModal}
            className="group relative flex items-center gap-2 text-on-primary font-black text-xs uppercase tracking-wider rounded-xl px-4 py-2.5 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 overflow-hidden bg-primary"
            title="Create an item with zero stock; receiving the purchase is separate"
          >
            {/* Animated background shine */}
            <div className="absolute inset-0 w-1/2 h-full bg-surface-muted skew-x-[-25deg] -translate-x-full group-hover:animate-[shine_1s_ease-in-out_infinite]" />
            
            <PackagePlus size={16} className="group-hover:scale-110 transition-transform duration-300" />
            <span>+ New Item</span>
            
            {/* Pulse ring animation */}
            <div className="absolute inset-0 rounded-xl ring-2 ring-primary/50 animate-pulse group-hover:animate-none" />
          </button></PermissionGate>
        </div>
        <div role="region" aria-label="Purchase items" tabIndex={0} className="overflow-x-auto custom-scrollbar"><table className="w-full min-w-[52rem] text-left">
          <thead className="bg-surface-raised text-muted text-[10px] font-black uppercase tracking-widest border-b border-line">
            <tr>
              <th className="p-6">Product Info</th>
              <th className="p-6 text-center">Variation</th>
              <th className="p-6 text-center">On Hand</th>
              <th className="p-6 text-center">Purchase Quantity</th>
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
                  {Number((Math.max(0, item.stock || 0)).toFixed(2))}<span className="block text-xs text-muted">{item.stockUnit || ''}</span>
                </td>
                <td className="p-6 text-center">
                  <input 
                    type="number" 
                    id={`purchase-quantity-${item.id}`}
                    aria-label={`Purchase quantity for ${item.name || 'new item'}`}
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
        </table></div>
        <div className="p-6">
          <button type="button" onClick={addItemRow} className="flex items-center gap-2 text-primary font-bold text-sm">
            <Plus size={16} /> Add Item
          </button>
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
                  className={`w-full p-3 border-2 rounded-xl font-bold text-foreground ${
                    discount < 0 ? 'border-danger-line bg-danger-soft' : 'border-line-strong'
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
                  className={`w-full p-3 border-2 rounded-xl font-bold text-foreground ${
                    tax < 0 ? 'border-danger-line bg-danger-soft' : 'border-line-strong'
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
            <div className="border-t border-line/20 pt-3 flex justify-between items-center">
              <span className="opacity-60 text-xs font-bold uppercase tracking-widest">Grand Total</span>
              <span className="text-2xl font-black">{currencyCode} {grandTotal.toLocaleString()}</span>
            </div>
          </div>
          <button 
            onClick={() => handleSubmitClick(false)}
            disabled={isLoading || !isFormValid} 
            className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all ${
              isLoading || !isFormValid
                ? 'bg-surface-muted cursor-not-allowed opacity-50'
                : 'bg-primary hover:bg-surface hover:text-primary'
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
            {isLoading ? <Loader2 className="animate-spin" /> : <Save size={20} />} Save Order
          </button>
          <button type="button" onClick={() => handleSubmitClick(true)} disabled={isLoading || !isFormValid} className="ss-button w-full mt-3 bg-secondary text-on-secondary disabled:opacity-50">Save &amp; Receive</button>
          <p className="mt-2 text-xs text-center">Save Order adds no stock. Save &amp; Receive saves the order, then posts stock into {selectedWarehouseName || 'the selected warehouse'}.</p>
          {!isFormValid && (
            <p className="text-xs text-warning mt-2 text-center">
              ⚠ Please fill all required fields correctly before submitting
            </p>
          )}
        </div>
      </div>


      </fieldset>
      {/* Review & Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-elevated max-w-2xl w-full p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-foreground">{saveAndReceive ? 'Save & Receive Purchase' : 'Save Purchase Order'}</h3>
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

              {/* Items Summary */}
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

              {/* Financial Summary */}
              <div className="mt-4 pt-4 border-t border-line space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-muted">Subtotal</span>
                  <span className="text-lg font-black text-primary">{currencyCode} {subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-muted">
                    Discount ({discountType === 'percentage' ? `${discount}%` : 'Fixed'})
                  </span>
                  <span className="text-lg font-black text-danger">- {currencyCode} {discountAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-muted">
                    Tax ({taxType === 'percentage' ? `${tax}%` : 'Fixed'})
                  </span>
                  <span className="text-lg font-black text-primary">+ {currencyCode} {taxAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-line">
                  <span className="text-lg font-black text-primary">Grand Total</span>
                  <span className="text-2xl font-black text-primary">{currencyCode} {grandTotal.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment Information */}
              {paymentStatus !== 'Unpaid' && (
                <div className="mt-4 pt-4 border-t border-line">
                  <p className="text-xs font-black text-muted uppercase tracking-widest mb-2">Payment Method</p>
                  <p className="text-lg font-black text-foreground">{paymentMethod || 'Not specified'}</p>
                </div>
              )}

              {/* Warning for defaults */}
              {(discount === 0 && tax === 0 && paymentStatus === 'Unpaid' && !paymentMethod.trim()) && (
                <div className="mt-4 p-3 bg-primary-soft border border-primary-line rounded-lg">
                  <p className="text-xs text-primary font-bold">
                    ℹ️ Note: No discount, tax, or payment method specified. Purchase will be recorded as unpaid with default values.
                  </p>
                </div>
              )}
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
                {isLoading ? <Loader2 className="animate-spin" /> : <Save size={20} />} {saveAndReceive ? 'Confirm Save & Receive' : 'Confirm Save Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier History Sidebar */}
      {showHistorySidebar && (
        <div className="fixed inset-0 z-[100] overflow-hidden">
          <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={() => setShowHistorySidebar(false)} />
          <div className="absolute inset-y-0 right-0 max-w-md w-full bg-surface shadow-elevated flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-line flex items-center justify-between bg-surface-raised/50">
              <div>
                <h2 className="text-xl font-black text-foreground flex items-center gap-2">
                  <Calendar size={22} className="text-primary" />
                  Purchase History
                </h2>
                <p className="text-xs font-bold text-muted mt-1">
                  Latest purchases from {suppliers.find(s => s._id === selectedSupplier)?.name}
                </p>
              </div>
              <button onClick={() => setShowHistorySidebar(false)} className="p-2 text-muted hover:bg-surface rounded-xl transition-all">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isHistoryLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="animate-spin text-primary" size={32} />
                  <p className="text-sm font-bold text-muted">Loading history...</p>
                </div>
              ) : supplierHistory.length === 0 ? (
                <div className="text-center py-20 bg-surface-raised rounded-3xl border border-dashed border-line">
                  <p className="text-sm font-bold text-muted">No previous purchases found.</p>
                </div>
              ) : (
                supplierHistory.map((p: any) => (
                  <div key={p._id} className="bg-surface border border-line rounded-2xl p-5 hover:border-primary transition-all group">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-xs font-black text-primary uppercase tracking-tighter mb-1">{p.purchaseId}</p>
                        <p className="text-sm font-bold text-foreground">{new Date(p.purchaseDate).toLocaleDateString()}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        p.purchaseStatus === 'Received' ? 'bg-secondary-soft text-secondary border border-secondary-line' :
                        p.purchaseStatus === 'Draft' ? 'bg-surface-raised text-muted border border-line' :
                        'bg-primary-soft text-primary border border-primary-line'
                      }`}>
                        {p.purchaseStatus}
                      </span>
                    </div>
                    
                    <div className="space-y-2 mb-3">
                      {p.items?.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-muted font-medium">{item.productId?.name || 'Product'} × {item.quantity}</span>
                          <span className="text-primary font-bold">LKR {item.cost.toLocaleString()}</span>
                        </div>
                      ))}
                      {p.items?.length > 3 && (
                        <p className="text-[10px] font-bold text-muted italic">+{p.items.length - 3} more items...</p>
                      )}
                    </div>
                    
                    <div className="pt-3 border-t border-line flex justify-between items-center">
                      <span className="text-xs font-bold text-muted">Total Amount</span>
                      <span className="text-lg font-black text-primary">LKR {p.grandTotal.toLocaleString()}</span>
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
