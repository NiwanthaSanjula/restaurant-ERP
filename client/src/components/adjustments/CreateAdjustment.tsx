import axios from 'axios';
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { toBusinessDateInputValue } from '../../utils/date';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import SearchableDropdown from '../common/SearchableDropdown';
import { formatDate } from '../../utils/date.ts';

interface VariationOption {
  name: string;
  productQty?: number;
  productCost?: number;
  totalProductWeight?: number;
}

interface BatchOption {
  batchNumber: string;
  productQty?: number;
  productCost?: number;
  totalProductWeight?: number;
  expiryDate?: string;
  variationValues?: Map<string, VariationOption> | Record<string, VariationOption>;
}

interface AdjustmentItem {
  id: string;
  productId: string;
  name: string;
  code?: string;
  currentStock: number;
  adjustmentQty: number;
  cost: number;
  subTotal: number;
  unit?: string;
  isWeight?: boolean;
  baseUnit?: string;
  isInventory?: boolean;
  ptype?: 'Single' | 'Variation';
  variationName?: string;
  batchNumber?: string;
  availableVariations?: VariationOption[];
  availableBatches?: BatchOption[];
  hasBatches?: boolean;
}

interface Warehouse {
  _id: string;
  name: string;
  isActive: boolean;
}

interface Product {
  _id: string;
  id?: string;
  name: string;
  code?: string;
  isInventory?: boolean;
  isWeight?: boolean;
  baseUnit?: string;
  ptype?: 'Single' | 'Variation';
  hasBatches?: boolean;
  warehouse?: Record<string, any>;
}

// Reasons shown depend on Adjustment Type; backend accepts: damage | loss | stock_count | expired | other
const REASONS_FOR_INCREASE = [
  { label: 'Stock Count Discrepancy', value: 'stock_count' },
  { label: 'Inventory Correction', value: 'stock_count' },
  { label: 'Received / Restock', value: 'other' },
  { label: 'Returned Goods', value: 'other' },
  { label: 'Other', value: 'other' }
] as const;
const REASONS_FOR_DECREASE = [
  { label: 'Damaged Items', value: 'damage' },
  { label: 'Lost Items', value: 'loss' },
  { label: 'Expired Items', value: 'expired' },
  { label: 'Theft / Missing', value: 'loss' },
  { label: 'Quality Issues', value: 'other' },
  { label: 'Other', value: 'other' }
] as const;

const CreateAdjustment: React.FC = () => {
  const navigate = useNavigate();
  const { currencyCode } = useCurrency();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedWarehouseName, setSelectedWarehouseName] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState(toBusinessDateInputValue());
  const [adjustmentType, setAdjustmentType] = useState<'Increase' | 'Decrease'>('Increase');
  const [reason, setReason] = useState(''); // stored as selected label so dropdown retains exact choice; mapped to backend on submit
  const [notes, setNotes] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [referenceNumberExists, setReferenceNumberExists] = useState(false);
  const [status, setStatus] = useState<'Pending' | 'Approved' | 'Completed' | 'Cancelled'>('Pending');

  const [items, setItems] = useState<AdjustmentItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [submittedAdjustment, setSubmittedAdjustment] = useState<any>(null);
  const [previousAdjustments, setPreviousAdjustments] = useState<any[]>([]);
  const itemsHashRef = useRef<string>('');

  const API_BASE = 'http://localhost:5000/api';

  // Remove duplicate products automatically and clean up invalid rows
  useEffect(() => {
    if (items.length === 0) {
      itemsHashRef.current = '';
      return;
    }
    
    // Create a hash of current items to detect changes
    const currentHash = JSON.stringify(items.map(i => `${i.productId || i.name || ''}_${i.variationName || ''}_${i.batchNumber || ''}_${i.currentStock}_${i.cost}`));
    
    // Skip if items haven't actually changed (prevents infinite loops)
    if (currentHash === itemsHashRef.current) return;
    
    const seen = new Map<string, number>(); // Map of productId/name -> index
    const duplicatesToRemove: number[] = [];
    const invalidRowsToRemove: number[] = [];
    
    items.forEach((item, index) => {
      // Skip variation/batch products (they're checked separately in their handlers)
      if (item.variationName || item.batchNumber) return;
      
      // Remove invalid rows: have a name but no productId and zero values (incomplete duplicates)
      if (item.name && !item.productId && item.currentStock === 0 && item.cost === 0) {
        invalidRowsToRemove.push(index);
        return;
      }
      
      // Only check items that have a product selected (have productId or name)
      if (!item.productId && !item.name) return; // Skip completely empty rows
      
      // Create unique key from productId (preferred) or name
      const key = item.productId || item.name || '';
      if (key && seen.has(key)) {
        // Found duplicate - mark for removal (keep the first one with valid data, remove duplicates)
        const existingIndex = seen.get(key)!;
        const existingItem = items[existingIndex];
        // Keep the one with productId and valid data, remove the one without
        if (item.productId && existingItem.productId) {
          // Both have productId - keep first, remove this one
          duplicatesToRemove.push(index);
        } else if (item.productId && !existingItem.productId) {
          // This one has productId, existing doesn't - remove existing, keep this
          duplicatesToRemove.push(existingIndex);
          seen.set(key, index);
        } else {
          // Neither has productId but same name - remove this duplicate
          duplicatesToRemove.push(index);
        }
      } else if (key) {
        seen.set(key, index);
      }
    });
    
    // Combine duplicates and invalid rows to remove
    const allToRemove = [...new Set([...duplicatesToRemove, ...invalidRowsToRemove])];
    
    // Only update if we found items to remove
    if (allToRemove.length > 0) {
      const cleanedItems = items.filter((_, index) => !allToRemove.includes(index));
      // Only update if the array actually changed
      if (cleanedItems.length !== items.length) {
        itemsHashRef.current = JSON.stringify(cleanedItems.map(i => `${i.productId || i.name || ''}_${i.variationName || ''}_${i.batchNumber || ''}_${i.currentStock}_${i.cost}`));
        setItems(cleanedItems);
        if (duplicatesToRemove.length > 0 || invalidRowsToRemove.length > 0) {
          showErrorToast(`Removed ${allToRemove.length} duplicate/invalid product(s).`);
        }
        return;
      }
    }
    
    // Update hash ref to current state
    itemsHashRef.current = currentHash;
  }, [items]);

  // Fetch warehouses and previous adjustments
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
        const config = { headers: { Authorization: `Bearer ${token}` } };

        const [warRes, adjRes] = await Promise.all([
          axios.get(`${API_BASE}/warehouses`, config).catch((err: any) => {
            console.error("Warehouses fetch error:", err.message);
            return { data: { data: [] } };
          }),
          axios.get(`${API_BASE}/adjustments`, config).catch(() => {
            return { data: { data: [] } };
          })
        ]);

        setWarehouses(warRes.data.data || []);
        
        const fetchedAdjustments = adjRes.data.data || [];
        setPreviousAdjustments(fetchedAdjustments);
        localStorage.setItem('previousAdjustments', JSON.stringify(fetchedAdjustments));
      } catch (err: any) {
        showErrorToast("Error loading initial data");
      }
    };
    fetchData();
  }, []);

  const checkReferenceNumberExists = async (value: string) => {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      setReferenceNumberExists(false);
      return;
    }
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const res = await axios.get(
        `${API_BASE}/adjustments?referenceNumber=${encodeURIComponent(trimmed)}&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const list = res.data?.data || [];
      setReferenceNumberExists(Array.isArray(list) && list.length > 0);
    } catch {
      setReferenceNumberExists(false);
    }
  };

  const handleWarehouseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const warehouseId = e.target.value;
    const warehouseObj = warehouses.find(w => w._id === warehouseId);
    setSelectedWarehouseId(warehouseId);
    setSelectedWarehouseName(warehouseObj ? warehouseObj.name : '');
  };

  const reasonsForCurrentType = adjustmentType === 'Increase' ? REASONS_FOR_INCREASE : REASONS_FOR_DECREASE;
  const handleAdjustmentTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as 'Increase' | 'Decrease';
    setAdjustmentType(newType);
    const nextReasons = newType === 'Increase' ? REASONS_FOR_INCREASE : REASONS_FOR_DECREASE;
    const stillValid = nextReasons.some((r) => r.label === reason);
    if (!stillValid) setReason('');
  };

  /** Map selected label to backend reason value for API */
  const getReasonValueForSubmit = (): string => {
    const r = reasonsForCurrentType.find((x) => x.label === reason);
    return r ? r.value : reason;
  };

  const getReasonLabel = (value: string) => {
    if (reasonsForCurrentType.some((r) => r.label === value)) return value;
    const r = REASONS_FOR_INCREASE.find((x) => x.value === value) ?? REASONS_FOR_DECREASE.find((x) => x.value === value);
    return r?.label ?? value;
  };

  // Only show unit if it looks like a label (e.g. "pcs", "kg"), not an ObjectId
  const displayUnit = (item: AdjustmentItem): string => {
    const u = (item.baseUnit || item.unit || '').trim();
    if (!u || u.length > 20 || /^[0-9a-f]{24}$/i.test(u)) return '';
    return u;
  };

  const getStockStatus = (p: any): 'In Stock' | 'Out of Stock' => {
    if (!selectedWarehouseId || !p.warehouse) return 'Out of Stock';
    const wh = p.warehouse[selectedWarehouseId] ?? p.warehouse[String(selectedWarehouseId)] ?? Object.values(p.warehouse || {}).find((w: any) => w?.warehouseName === selectedWarehouseName);
    if (!wh) return 'Out of Stock';
    if (p.ptype === 'Variation' && wh.variationValues) {
      const entries = wh.variationValues instanceof Map ? Array.from(wh.variationValues.values()) : Object.values(wh.variationValues || {});
      const hasStock = entries.some((v: any) => (p.isWeight ? (v.totalProductWeight ?? 0) : (v.productQty ?? 0)) > 0);
      return hasStock ? 'In Stock' : 'Out of Stock';
    }
    const qty = p.isWeight ? (wh as any).totalProductWeight : (wh.productQty ?? (wh as any).qty);
    return (typeof qty === 'number' ? qty : parseFloat(String(qty)) || 0) > 0 ? 'In Stock' : 'Out of Stock';
  };

  // Product search: supports Retail and Restaurant POS products (no systemType filter); Single + Variation
  // Only shows products that exist in the selected warehouse
  const handleProductSearch = async (query: string): Promise<any[]> => {
    if (!query || query.trim().length < 1) return [];
    
    // If no warehouse is selected, don't show any products
    if (!selectedWarehouseId) {
      return [];
    }
    
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const res = await axios.get(`${API_BASE}/products?q=${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      let fetchedProds = res.data.data || res.data || [];
      if (!Array.isArray(fetchedProds)) return [];

      // Filter: only inventory products
      const inventoryItems = fetchedProds.filter((p: any) => p.isInventory === true);
      const productsToShow = inventoryItems.length > 0 ? inventoryItems : fetchedProds;
      
      // Filter: only products that exist in the selected warehouse AND have a valid cost
      const productsInWarehouse = productsToShow.filter((p: any) => {
        if (p.isInventory === false) return false;
        const whData = getWarehouseData(p);
        // Product must have warehouse data
        if (!whData || whData === null || whData === undefined) return false;
        
        // Check if product has a valid cost (> 0) in this warehouse
        // Handle different product types (Single, Variation, Batch)
        const isVariation = p.ptype === 'Variation';
        const hasBatches = p.hasBatches === true && Array.isArray(whData.batches) && whData.batches.length > 0;
        
        if (isVariation && hasBatches) {
          // Variation with batches - need to check if any batch has valid cost
          // For search, we'll allow it if warehouse has batches (user will select batch/variation later)
          return hasBatches;
        } else if (isVariation) {
          // Variation without batches - check if any variation has valid cost
          if (whData.variationValues) {
            const entries = whData.variationValues instanceof Map
              ? Array.from(whData.variationValues.values())
              : Object.values(whData.variationValues);
            return entries.some((v: any) => v?.productCost > 0);
          }
          return false;
        } else if (hasBatches) {
          // Single with batches - check if any batch has valid cost
          return whData.batches?.some((b: any) => b?.productCost > 0) || false;
        } else {
          // Simple product - check warehouse-level cost
          const cost = whData.productCost ?? 0;
          return cost > 0;
        }
      });
      
      setProducts(productsInWarehouse);

      return productsInWarehouse.map((p: any) => ({
        id: p._id || p.id,
        name: p.name || '',
        code: p.code || '',
        cost: p.costPrice || p.purchasePrice || 0,
        product: p,
        stockStatus: getStockStatus(p)
      }));
    } catch (err) {
      showErrorToast("Error searching products");
      return [];
    }
  };

  // Resolve warehouse data from product: warehouse map can be keyed by id (string or ObjectId)
  const getWarehouseData = (prod: any) => {
    const wh = prod.warehouse;
    if (!wh || typeof wh !== 'object') return undefined;
    const idStr = String(selectedWarehouseId);
    return wh[idStr] ?? wh[selectedWarehouseId] ?? Object.values(wh).find((w: any) => w?.warehouseName === selectedWarehouseName || String(w?.warehouseId) === idStr);
  };

  // Auto-fill logic when product is selected (supports Single and Variation products)
  const handleProductSelect = async (index: number, selectedProduct: any) => {
    if (!selectedWarehouseId) {
      showErrorToast("Please select a warehouse first!");
      return;
    }

    const productName = typeof selectedProduct === 'string' ? selectedProduct : selectedProduct?.name;
    let prod = typeof selectedProduct === 'string' ? products.find(p => p.name === productName) : selectedProduct?.product;

    if (!prod) {
      showErrorToast("Product not found");
      return;
    }

    const productId = prod._id || prod.id;
    if (!productId) return;

    // Early duplicate check by productId AND name (before fetching) to prevent race conditions
    // This catches duplicates even if the product data hasn't been fully loaded yet
    const productNameToCheck = prod.name || productName;
    const earlyDuplicateCheck = items.findIndex((item, idx) => 
      idx !== index && 
      !item.variationName && 
      !item.batchNumber &&
      (item.productId === productId || (item.name && item.name === productNameToCheck))
    );
    if (earlyDuplicateCheck !== -1) {
      showErrorToast("This product is already added to the adjustment.");
      // Remove the duplicate row completely from the table
      setItems(prevItems => {
        // Filter out the current row (the duplicate one being added)
        return prevItems.filter((_, idx) => idx !== index);
      });
      return;
    }

    // Fetch full product by ID so we have latest warehouse/stock (search response may omit or use different key shape)
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const res = await axios.get(`${API_BASE}/products/${productId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const fullProduct = res.data?.data || res.data;
      if (fullProduct && fullProduct.warehouse) prod = fullProduct;
    } catch {
      // Use existing prod from search if fetch fails
    }

    if (prod.isInventory === false) {
      showErrorToast("This product is non-stock and cannot be adjusted");
      return;
    }

    const warehouseData = getWarehouseData(prod);

    // Check for duplicate products/variations AFTER fetching full product data
    // For variation products, we need to wait until variation is selected, but we can check for duplicate product IDs
    // For single products, check if productId already exists
    // For variation products, we'll check when variation is selected in handleVariationSelect
    const productIsVariation = prod.ptype === 'Variation';
    const hasBatches = prod.hasBatches === true && Array.isArray(warehouseData?.batches) && warehouseData.batches.length > 0;
    
    // If it's a single product (no variations, no batches), check for duplicate productId
    // Check both by productId and by product name to catch duplicates even if productId is not set yet
    if (!productIsVariation && !hasBatches) {
      const duplicateIndex = items.findIndex((item, idx) => 
        idx !== index && 
        !item.variationName && 
        !item.batchNumber &&
        (item.productId === productId || (item.name && item.name === prod.name))
      );
      if (duplicateIndex !== -1) {
        showErrorToast("This product is already added to the adjustment.");
        // Remove the duplicate row completely from the table
        setItems(prevItems => {
          // Filter out the current row (the duplicate one being added)
          return prevItems.filter((_, idx) => idx !== index);
        });
        return;
      }
    }

    // Unit must be a label (e.g. "pcs", "kg"), not an ObjectId or other id
    const rawUnit = prod.isWeight && prod.baseUnit ? prod.baseUnit : (prod.unit || '');
    const baseUnit = typeof rawUnit === 'string' && /^[a-zA-Z0-9\s\-/]+$/.test(rawUnit) && rawUnit.length < 20 && !/^[0-9a-f]{24}$/i.test(rawUnit.trim())
      ? rawUnit.trim()
      : '';

    let currentStock = 0;
    let cost = 0;
    let availableVariations: VariationOption[] | undefined;
    let availableBatches: BatchOption[] | undefined;

    // Handle products with batches
    if (hasBatches) {
      availableBatches = (warehouseData.batches || []).map((b: any) => ({
        batchNumber: b.batchNumber || '',
        productQty: b.productQty,
        productCost: b.productCost,
        totalProductWeight: b.totalProductWeight,
        expiryDate: b.expiryDate,
        variationValues: b.variationValues
      }));
      // Leave currentStock/cost at 0 until user selects a batch
    } else if (productIsVariation && warehouseData?.variationValues) {
      // Variation product without batches
      const entries: [string, any][] = warehouseData.variationValues instanceof Map
        ? Array.from(warehouseData.variationValues.entries()) as [string, any][]
        : Object.entries(warehouseData.variationValues || {}) as [string, any][];
      availableVariations = entries.map(([name, data]) => ({
        name,
        productQty: data?.productQty,
        productCost: data?.productCost,
        totalProductWeight: data?.totalProductWeight
      }));
      // Leave currentStock/cost at 0 until user selects a variation
    } else {
      // Simple product without batches or variations
      const w = warehouseData as any;
      if (w) {
        if (prod.isWeight && typeof w.totalProductWeight === 'number') {
          currentStock = w.totalProductWeight;
        } else {
          const qty = w.productQty ?? w.qty;
          currentStock = typeof qty === 'number' ? qty : (typeof qty === 'string' ? parseFloat(qty) || 0 : 0);
        }
        const c = w.productCost ?? w.productPrice;
        cost = typeof c === 'number' ? c : (typeof c === 'string' ? parseFloat(c) || 0 : 0);
      }
    }

    // Final duplicate check right before updating - use functional update to get latest state
    // This is the most important check as it happens right before the state update
    setItems(prevItems => {
      // Check for duplicates in the current state using LATEST items
      if (!productIsVariation && !hasBatches) {
        const finalDuplicateCheck = prevItems.findIndex((item, idx) => 
          idx !== index && 
          !item.variationName && 
          !item.batchNumber &&
          (item.productId === productId || (item.name && item.name === prod.name))
        );
        if (finalDuplicateCheck !== -1) {
          showErrorToast("This product is already added to the adjustment.");
          // Remove the duplicate row completely from the table
          return prevItems.filter((_, idx) => idx !== index);
        }
      }

      // No duplicate found - proceed with update
      const updatedItems = [...prevItems];
      updatedItems[index] = {
        ...updatedItems[index],
        productId: prod._id || productId,
        name: prod.name,
        code: prod.code,
        currentStock,
        cost,
        subTotal: 0,
        unit: typeof prod.unit === 'string' && !/^[0-9a-f]{24}$/i.test((prod.unit || '').trim()) ? (prod.unit || '').trim() : '',
        isWeight: prod.isWeight || false,
        baseUnit,
        isInventory: prod.isInventory,
        ptype: prod.ptype,
        variationName: undefined,
        batchNumber: undefined,
        availableVariations,
        availableBatches,
        hasBatches: hasBatches || false
      };
      return updatedItems;
    });
  };

  // When user selects a batch for a product with batches
  const handleBatchSelect = (index: number, batchNumber: string) => {
    const item = items[index];
    if (!item?.availableBatches) return;
    const batch = item.availableBatches.find(b => b.batchNumber === batchNumber);
    if (!batch) return;

    // Check for duplicate product + batch combination (for single products with batches)
    if (item.ptype !== 'Variation') {
      const duplicateIndex = items.findIndex((existingItem, idx) => 
        idx !== index && 
        existingItem.productId === item.productId && 
        existingItem.batchNumber === batchNumber &&
        !existingItem.variationName
      );
      if (duplicateIndex !== -1) {
        showErrorToast("This product batch is already added to the adjustment.");
        return;
      }
    }

    const updatedItems = [...items];
    const isWeight = item.isWeight;
    let currentStock = 0;
    let cost = 0;
    let availableVariations: VariationOption[] | undefined;

    // If it's a variation product with batches, load variations from the batch
    if (item.ptype === 'Variation' && batch.variationValues) {
      const entries: [string, any][] = batch.variationValues instanceof Map
        ? Array.from(batch.variationValues.entries()) as [string, any][]
        : Object.entries(batch.variationValues || {}) as [string, any][];
      availableVariations = entries.map(([name, data]) => ({
        name,
        productQty: data?.productQty,
        productCost: data?.productCost,
        totalProductWeight: data?.totalProductWeight
      }));
      // Leave currentStock/cost at 0 until user selects a variation
    } else {
      // Single product with batch - use batch stock and cost
      currentStock = isWeight && typeof batch.totalProductWeight === 'number'
        ? batch.totalProductWeight
        : (batch.productQty ?? 0);
      cost = batch.productCost ?? 0;
    }

    updatedItems[index] = {
      ...item,
      batchNumber,
      currentStock,
      cost,
      availableVariations,
      variationName: undefined, // Reset variation when batch changes
      subTotal: (item.adjustmentQty || 0) * cost
    };
    setItems(updatedItems);
  };

  // When user selects a variation for a Variation product row
  const handleVariationSelect = (index: number, variationName: string) => {
    const item = items[index];
    if (!item?.availableVariations) return;
    const variation = item.availableVariations.find(v => v.name === variationName);
    if (!variation) return;
    
    // Check for duplicate product + variation combination
    const duplicateIndex = items.findIndex((existingItem, idx) => 
      idx !== index && 
      existingItem.productId === item.productId && 
      existingItem.variationName === variationName &&
      existingItem.batchNumber === item.batchNumber // Same batch if applicable
    );
    if (duplicateIndex !== -1) {
      showErrorToast("This product variation is already added to the adjustment.");
      return;
    }
    
    const isWeight = item.isWeight;
    const currentStock = isWeight && typeof variation.totalProductWeight === 'number'
      ? variation.totalProductWeight
      : (variation.productQty ?? 0);
    const cost = variation.productCost ?? 0;
    const updatedItems = [...items];
    updatedItems[index] = {
      ...item,
      variationName,
      currentStock,
      cost,
      subTotal: (item.adjustmentQty || 0) * cost
    };
    setItems(updatedItems);
  };

  const addItemRow = () => {
    setItems([...items, { 
      id: Date.now().toString(), 
      productId: '', 
      name: '', 
      currentStock: 0, 
      adjustmentQty: 0, 
      cost: 0, 
      subTotal: 0 
    }]);
  };

  const handleAdjustmentQtyChange = (index: number, val: string) => {
    const qty = parseFloat(val) || 0;
    const updatedItems = [...items];
    updatedItems[index].adjustmentQty = qty;
    updatedItems[index].subTotal = qty * updatedItems[index].cost;

    // For decrease adjustments, validate stock won't go negative
    if (adjustmentType === 'Decrease') {
      const currentStock = updatedItems[index].currentStock || 0;
      const newStock = currentStock - qty;
      if (newStock < 0) {
        showErrorToast(`Cannot decrease stock below zero. Current: ${currentStock}, Adjustment: ${qty}`);
        updatedItems[index].adjustmentQty = Math.max(0, currentStock);
        updatedItems[index].subTotal = Math.max(0, currentStock) * updatedItems[index].cost;
      }
    }

    setItems(updatedItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const grandTotal = useMemo(() => items.reduce((sum, i) => sum + i.subTotal, 0), [items]);

  // Form validation
  const validateForm = (): boolean => {
    if (!selectedWarehouseId) {
      showErrorToast("Please select a warehouse");
      return false;
    }
    if (!adjustmentType) {
      showErrorToast("Please select an adjustment type");
      return false;
    }
    const reasonValue = getReasonValueForSubmit();
    if (!reasonValue || !reason.trim()) {
      showErrorToast("Please select a reason");
      return false;
    }
    if (referenceNumberExists) {
      showErrorToast("This reference number already exists. Please use a different one.");
      return false;
    }
    if (items.length === 0) {
      showErrorToast("Please add at least one item");
      return false;
    }
    if (items.some(item => !item.productId || item.adjustmentQty <= 0)) {
      showErrorToast("Please ensure all items have valid products and quantities");
      return false;
    }
    // Check for batch selection requirement
    const batchItem = items.find(item => item.hasBatches && item.availableBatches?.length && !item.batchNumber);
    if (batchItem) {
      showErrorToast(`Please select a batch for "${batchItem.name}"`);
      return false;
    }
    // Check for variation selection requirement (after batch if applicable)
    const variationItem = items.find(item => {
      if (item.ptype !== 'Variation' || !item.availableVariations?.length) return false;
      // If product has batches, variation must be selected after batch
      if (item.hasBatches) {
        return item.batchNumber && !item.variationName;
      }
      // If no batches, variation must be selected
      return !item.variationName;
    });
    if (variationItem) {
      showErrorToast(`Please select a variation for "${variationItem.name}"`);
      return false;
    }
    // Validate that decrease adjustments won't result in negative stock
    if (adjustmentType === 'Decrease') {
      const negativeStockItem = items.find(item => {
        const currentStock = item.currentStock || 0;
        const adjustmentQty = item.adjustmentQty || 0;
        const newStock = currentStock - adjustmentQty;
        return newStock < 0;
      });
      if (negativeStockItem) {
        const currentStock = negativeStockItem.currentStock || 0;
        const adjustmentQty = negativeStockItem.adjustmentQty || 0;
        showErrorToast(`Cannot decrease stock below zero for "${negativeStockItem.name}". Current stock: ${currentStock}, Adjustment: ${adjustmentQty}`);
        return false;
      }
    }
    return true;
  };

  // Submit adjustment
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const authUser = JSON.parse(localStorage.getItem('user') || '{}');
      const adjustmentId = `ADJ-${Date.now()}`;

      // Prepare items for submission - backend expects adjustmentQuantity; use product cost for calculations
      const adjustmentItems = items.map(i => ({
        productId: i.productId,
        adjustmentQuantity: i.adjustmentQty,
        productName: i.name,
        productCode: i.code || '',
        cost: i.cost,
        subTotal: i.subTotal,
        currentStock: i.currentStock,
        newStock: adjustmentType === 'Increase'
          ? i.currentStock + i.adjustmentQty
          : i.currentStock - i.adjustmentQty,
        isWeight: i.isWeight,
        baseUnit: i.baseUnit,
        warehouseName: selectedWarehouseName,
        ...(i.variationName ? { variationName: i.variationName } : {}),
        ...(i.batchNumber ? { batchNumber: i.batchNumber } : {})
      }));

      const userId = authUser.id || authUser._id;
      const response = await axios.post(`${API_BASE}/adjustments`, {
        adjustmentId: adjustmentId,
        warehouseId: selectedWarehouseId,
        warehouseName: selectedWarehouseName,
        adjustmentDate: adjustmentDate,
        adjustmentType: adjustmentType,
        reason: getReasonValueForSubmit(),
        notes: notes,
        referenceNumber: referenceNumber,
        status,
        ...(userId ? { createdBy: userId } : {}),
        items: adjustmentItems,
        grandTotal: grandTotal
      }, { headers: { Authorization: `Bearer ${token}` } });

      const responseData = response.data?.data || response.data;
      const savedId = responseData?._id || adjustmentId;
      const savedStatus = responseData?.status || status;
      const savedTotal = responseData?.totalAdjustmentValue ?? grandTotal;

      // Create confirmation object (use backend response when available)
      const newAdjustment = {
        _id: savedId,
        adjustmentId: responseData?.adjustmentId || adjustmentId,
        warehouseId: selectedWarehouseId,
        warehouseName: selectedWarehouseName,
        adjustmentDate: adjustmentDate,
        adjustmentType: adjustmentType,
        reason: getReasonValueForSubmit(),
        notes: notes,
        referenceNumber: referenceNumber,
        items: adjustmentItems,
        grandTotal: savedTotal,
        totalAdjustmentValue: savedTotal,
        status: savedStatus,
        createdAt: (responseData?.createdAt && new Date(responseData.createdAt).toISOString()) || new Date().toISOString()
      };

      setSubmittedAdjustment(newAdjustment);

      // Add to previous adjustments
      setPreviousAdjustments([newAdjustment, ...previousAdjustments]);
      localStorage.setItem('previousAdjustments', JSON.stringify([newAdjustment, ...previousAdjustments]));

      // Clear form
      setItems([]);
      setSelectedWarehouseId('');
      setSelectedWarehouseName('');
      setAdjustmentDate(toBusinessDateInputValue());
      setAdjustmentType('Increase');
      setReason('');
      setNotes('');
      setReferenceNumber('');
      setReferenceNumberExists(false);
      setStatus('Pending');

      showSuccessToast("Adjustment created successfully!");
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || "Submission failed";
      showErrorToast("Error: " + errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewAdjustment = () => {
    setSubmittedAdjustment(null);
  };

  // Render success screen
  if (submittedAdjustment) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto pt-8">
        <div className="bg-white rounded-[32px] shadow-2xl max-w-2xl w-full p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-[#1A3E73] mb-2">Adjustment Created Successfully!</h2>
            <p className="text-[#64748B] font-bold">Your stock adjustment has been saved to the system</p>
          </div>

          {/* Adjustment Details */}
          <div className="space-y-4 mb-8 bg-[#F8FAFC] p-6 rounded-2xl border border-slate-100">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Adjustment ID</p>
                <p className="text-lg font-black text-[#1A3E73]">{submittedAdjustment.referenceNumber?.trim() || submittedAdjustment.adjustmentId}</p>
              </div>
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Date</p>
                <p className="text-lg font-black text-[#1A3E73]">{submittedAdjustment.adjustmentDate}</p>
              </div>
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Type</p>
                <p className="text-lg font-black text-[#1A3E73]">{submittedAdjustment.adjustmentType}</p>
              </div>
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Warehouse</p>
                <p className="text-lg font-black text-[#1A3E73]">{submittedAdjustment.warehouseName}</p>
              </div>
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Reason</p>
                <p className="text-lg font-black text-[#1A3E73]">
                  {getReasonLabel(submittedAdjustment.reason)}
                </p>
              </div>
              <div>
                <p className="text-xs font-black text-[#64748B] uppercase tracking-widest">Total Value</p>
                <p className="text-lg font-black text-[#1A3E73]">{currencyCode} {submittedAdjustment.grandTotal.toFixed(2)}</p>
              </div>
            </div>

            {/* Items Summary */}
            <div className="mt-6">
              <p className="text-xs font-black text-[#64748B] uppercase tracking-widest mb-4">Items Adjusted</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {submittedAdjustment.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-100">
                    <div>
                      <p className="font-bold text-[#1A3E73]">{item.productName}</p>
                      <p className="text-xs text-[#64748B]">Current: {item.currentStock} → New: {item.newStock}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#1A3E73]">Qty: {item.adjustmentQuantity ?? item.quantity}</p>
                      <p className="text-xs text-[#64748B]">{currencyCode} {(item.subTotal ?? 0).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Grand Total */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="flex justify-between items-center">
                <p className="text-sm font-black text-[#64748B] uppercase">Total Adjustment Value</p>
                <p className="text-2xl font-black text-[#1A3E73]">{currencyCode} {(submittedAdjustment.totalAdjustmentValue ?? submittedAdjustment.grandTotal ?? 0).toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleNewAdjustment}
              className="flex-1 bg-[#1A3E73] text-white font-black py-3 rounded-xl hover:bg-[#0F2A55] transition"
            >
              Create New Adjustment
            </button>
            <button
              onClick={() => navigate(`/viewAdjustments?refresh=${Date.now()}`)}
              className="flex-1 bg-slate-200 text-[#1A3E73] font-black py-3 rounded-xl hover:bg-slate-300 transition"
            >
              View All Adjustments
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(`/viewAdjustments?refresh=${Date.now()}`)}
            className="text-[#1A3E73] hover:text-[#0F2A55] transition p-1 rounded-lg hover:bg-slate-100"
            title="Back to Stock Adjustments"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-4xl font-black text-[#1A3E73] mb-2">Create Stock Adjustment</h1>
            <p className="text-[#64748B] font-bold">Adjust product stock quantities for your warehouse</p>
          </div>
        </div>

        {/* Main Form Container */}
        <div className="grid grid-cols-3 gap-6">
          {/* Form Section */}
          <div className="col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              {/* Warehouse Selection */}
              <div>
                <label className="block text-sm font-black text-[#1A3E73] mb-3">Warehouse *</label>
                <select
                  value={selectedWarehouseId}
                  onChange={handleWarehouseChange}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
                >
                  <option value="">Select Warehouse</option>
                  {warehouses.map(w => (
                    <option key={w._id} value={w._id}>{w.name}</option>
                  ))}
                </select>
              </div>

              {/* Adjustment Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-black text-[#1A3E73] mb-3">Adjustment Type *</label>
                  <select
                    value={adjustmentType}
                    onChange={handleAdjustmentTypeChange}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
                  >
                    <option value="Increase">Increase Stock</option>
                    <option value="Decrease">Decrease Stock</option>
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-black text-[#1A3E73] mb-3">Adjustment Date</label>
                  <input
                    type="date"
                    value={adjustmentDate}
                    onChange={(e) => setAdjustmentDate(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73]"
                  />
                </div>
              </div>

              {/* Reason - native select so selected value is correctly bound and persists */}
              <div>
                <label className="block text-sm font-black text-[#1A3E73] mb-3">Reason for Adjustment *</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
                  aria-label="Reason for Adjustment"
                >
                  <option value="">Select a reason...</option>
                  {reasonsForCurrentType.map((r) => (
                    <option key={r.label} value={r.label}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-black text-[#1A3E73] mb-3">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'Pending' | 'Approved' | 'Completed' | 'Cancelled')}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] bg-white"
                >
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {/* Reference Number - shown as ID in the adjustments list; must be unique */}
              <div>
                <label className="block text-sm font-black text-[#1A3E73] mb-3">Reference Number (ID)</label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => {
                    setReferenceNumber(e.target.value);
                    setReferenceNumberExists(false);
                  }}
                  onBlur={(e) => checkReferenceNumberExists(e.target.value)}
                  placeholder="Enter ID"
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:border-[#1A3E73] ${referenceNumberExists ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}
                />
                {referenceNumberExists && (
                  <p className="mt-1 text-sm font-bold text-red-600">This reference number already exists.</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-black text-[#1A3E73] mb-3">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes about this adjustment..."
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] resize-none"
                />
              </div>
            </div>
          </div>

          {/* Summary Card */}
          <div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-8">
              <h3 className="text-lg font-black text-[#1A3E73] mb-6">Summary</h3>

              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase mb-1">Warehouse</p>
                  <p className="font-bold text-[#1A3E73]">{selectedWarehouseName || 'Not selected'}</p>
                </div>

                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase mb-1">Type</p>
                  <p className={`font-bold ${adjustmentType === 'Increase' ? 'text-green-600' : 'text-red-600'}`}>
                    {adjustmentType === 'Increase' ? '↑ Increase' : '↓ Decrease'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-black text-[#64748B] uppercase mb-1">Total Items</p>
                  <p className="font-bold text-[#1A3E73]">{items.length}</p>
                </div>

                <div className="pt-4 border-t border-slate-200">
                  <p className="text-xs font-black text-[#64748B] uppercase mb-2">Total Value</p>
                  <p className="text-2xl font-black text-[#1A3E73]">{currencyCode} {grandTotal.toFixed(2)}</p>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={isLoading || items.length === 0 || !selectedWarehouseId}
                className="w-full bg-[#1A3E73] text-white font-black py-3 rounded-lg hover:bg-[#0F2A55] disabled:bg-slate-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                {isLoading ? 'Processing...' : 'Create Adjustment'}
              </button>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-[#1A3E73]">Adjustment Items</h3>
              <button
                onClick={addItemRow}
                className="flex items-center gap-2 bg-[#1A3E73] text-white px-4 py-2 rounded-lg hover:bg-[#0F2A55] font-bold"
              >
                <Plus size={20} /> Add Item
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="p-6 text-center text-[#64748B]">
              <p>No items added. Click "Add Item" to start adding products to adjust.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F8FAFC] border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Current Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Adjustment Qty</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-[#64748B] uppercase">Subtotal</th>
                    <th className="px-6 py-3 text-center text-xs font-black text-[#64748B] uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className="border-b border-slate-200 hover:bg-[#F8FAFC]">
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <SearchableDropdown
                            key={`${item.id}-${item.productId || 'empty'}`}
                            onSearch={handleProductSearch}
                            onChange={(prod: any) => handleProductSelect(idx, prod)}
                            placeholder="Search product..."
                            value={item.productId && item.name ? (item.batchNumber ? `${item.name} – Batch: ${item.batchNumber}` : (item.variationName ? `${item.name} – ${item.variationName}` : item.name)) : ''}
                          />
                          {item.hasBatches && item.availableBatches && item.availableBatches.length > 0 && (
                            <select
                              value={item.batchNumber || ''}
                              onChange={(e) => handleBatchSelect(idx, e.target.value)}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] text-sm"
                            >
                              <option value="">Select batch...</option>
                              {item.availableBatches.map((b) => {
                                const stock = item.isWeight ? (b.totalProductWeight ?? 0) : (b.productQty ?? 0);
                                const expiry = b.expiryDate ? formatDate(b.expiryDate) : '';
                                return (
                                  <option key={b.batchNumber} value={b.batchNumber}>
                                    {b.batchNumber} (Stock: {stock}{expiry ? `, Exp: ${expiry}` : ''})
                                  </option>
                                );
                              })}
                            </select>
                          )}
                          {item.ptype === 'Variation' && item.availableVariations && item.availableVariations.length > 0 && (
                            <select
                              value={item.variationName || ''}
                              onChange={(e) => handleVariationSelect(idx, e.target.value)}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73] text-sm"
                              disabled={item.hasBatches && !item.batchNumber}
                            >
                              <option value="">Select variation...</option>
                              {item.availableVariations.map((v) => (
                                <option key={v.name} value={v.name}>
                                  {v.name} (Stock: {item.isWeight ? (v.totalProductWeight ?? 0) : (v.productQty ?? 0)})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#1A3E73]">{item.currentStock}{displayUnit(item) ? ` ${displayUnit(item)}` : ''}</p>
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="number"
                          value={item.adjustmentQty}
                          onChange={(e) => handleAdjustmentQtyChange(idx, e.target.value)}
                          placeholder="0"
                          className="w-24 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#1A3E73]"
                          step="0.01"
                          min="0"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#1A3E73]">{currencyCode} {item.cost.toFixed(2)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#1A3E73]">{currencyCode} {item.subTotal.toFixed(2)}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-red-600 hover:text-red-800 font-bold"
                        >
                          <Trash2 size={20} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateAdjustment;
