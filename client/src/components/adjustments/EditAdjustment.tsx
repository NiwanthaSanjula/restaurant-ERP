import axios from 'axios';
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import Loader from '../common/Loader';
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

// Reasons depend on Adjustment Type; backend accepts: damage | loss | stock_count | expired | other
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

const EditAdjustment: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currencyCode } = useCurrency();

  const [isLoading, setIsLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [selectedWarehouseName, setSelectedWarehouseName] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'Increase' | 'Decrease'>('Increase');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [status, setStatus] = useState<'Pending' | 'Approved' | 'Completed' | 'Cancelled'>('Pending');
  
  const [items, setItems] = useState<AdjustmentItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
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

  // Load adjustment and warehouses on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
        const config = { headers: { Authorization: `Bearer ${token}` } };

        // Load warehouses
        const warRes = await axios.get(`${API_BASE}/warehouses`, config).catch(() => ({ data: { data: [] } }));
        setWarehouses(warRes.data.data || []);

        // Load adjustment details
        if (id) {
          try {
            const adjRes = await axios.get(`${API_BASE}/adjustments/${id}`, config);
            const adjustment = adjRes.data.data;
            const whId = adjustment.warehouseId?._id ?? adjustment.warehouseId;

            setSelectedWarehouseId(whId);
            setSelectedWarehouseName(adjustment.warehouseName);
            setAdjustmentDate(adjustment.adjustmentDate?.split?.('T')[0] || '');
            setAdjustmentType(adjustment.adjustmentType);
            const loadReasons = adjustment.adjustmentType === 'Increase' ? REASONS_FOR_INCREASE : REASONS_FOR_DECREASE;
            setReason(loadReasons.find((r) => r.value === adjustment.reason)?.label ?? adjustment.reason ?? '');
            setNotes(adjustment.notes || '');
            setReferenceNumber(adjustment.referenceNumber || '');
            setStatus(adjustment.status || 'Pending');

            // Load full product data for each item to get batch/variation options
            const loadItemsWithProductData = async () => {
              const itemsWithData = await Promise.all(
                adjustment.items.map(async (item: any, idx: number) => {
                  const productId = item.productId?._id ?? item.productId;
                  let availableBatches: BatchOption[] | undefined;
                  let availableVariations: VariationOption[] | undefined;
                  
                  // Fetch full product to get batch/variation data
                  try {
                    const prodRes = await axios.get(`${API_BASE}/products/${productId}`, config);
                    const fullProduct = prodRes.data?.data || prodRes.data;
                    if (fullProduct && fullProduct.warehouse) {
                      const whData = getWarehouseData(fullProduct);
                      if (whData) {
                        const hasBatches = fullProduct.hasBatches === true && Array.isArray(whData.batches) && whData.batches.length > 0;
                        if (hasBatches) {
                          availableBatches = (whData.batches || []).map((b: any) => ({
                            batchNumber: b.batchNumber || '',
                            productQty: b.productQty,
                            productCost: b.productCost,
                            totalProductWeight: b.totalProductWeight,
                            expiryDate: b.expiryDate,
                            variationValues: b.variationValues
                          }));
                          // If variation product with batches, load variations from selected batch
                          if (fullProduct.ptype === 'Variation' && item.batchNumber && availableBatches) {
                            const batch = availableBatches.find(b => b.batchNumber === item.batchNumber);
                            if (batch && batch.variationValues) {
                              const entries: [string, any][] = batch.variationValues instanceof Map
                                ? Array.from(batch.variationValues.entries()) as [string, any][]
                                : Object.entries(batch.variationValues || {}) as [string, any][];
                              availableVariations = entries.map(([name, data]) => ({
                                name,
                                productQty: data?.productQty,
                                productCost: data?.productCost,
                                totalProductWeight: data?.totalProductWeight
                              }));
                            }
                          }
                        } else if (fullProduct.ptype === 'Variation' && whData.variationValues) {
                          const entries: [string, any][] = whData.variationValues instanceof Map
                            ? Array.from(whData.variationValues.entries()) as [string, any][]
                            : Object.entries(whData.variationValues || {}) as [string, any][];
                          availableVariations = entries.map(([name, data]) => ({
                            name,
                            productQty: data?.productQty,
                            productCost: data?.productCost,
                            totalProductWeight: data?.totalProductWeight
                          }));
                        }
                      }
                    }
                  } catch (err) {
                    console.error('Error loading product data:', err);
                  }
                  
                  return {
                    id: Date.now().toString() + idx,
                    productId,
                    name: item.productName,
                    code: item.productCode ?? item.code,
                    currentStock: item.currentStock ?? 0,
                    adjustmentQty: item.adjustmentQuantity ?? item.quantity ?? 0,
                    cost: item.productCost ?? item.cost ?? 0,
                    subTotal: item.subTotal ?? 0,
                    unit: item.unit,
                    isWeight: item.isWeight,
                    baseUnit: item.baseUnit,
                    isInventory: item.isInventory,
                    variationName: item.variationName,
                    batchNumber: item.batchNumber,
                    ptype: item.ptype,
                    availableBatches,
                    availableVariations,
                    hasBatches: !!availableBatches?.length
                  };
                })
              );
              setItems(itemsWithData);
            };
            
            await loadItemsWithProductData();
          } catch (adjErr) {
            // Try localStorage fallback
            const saved = localStorage.getItem('previousAdjustments');
            if (saved) {
              const found = JSON.parse(saved).find((a: any) => a._id === id);
              if (found) {
                setSelectedWarehouseId(found.warehouseId);
                setSelectedWarehouseName(found.warehouseName);
                setAdjustmentDate(found.adjustmentDate.split('T')[0]);
                setAdjustmentType(found.adjustmentType);
                const loadReasons = found.adjustmentType === 'Increase' ? REASONS_FOR_INCREASE : REASONS_FOR_DECREASE;
                setReason(loadReasons.find((r) => r.value === found.reason)?.label ?? found.reason ?? '');
                setNotes(found.notes || '');
                setReferenceNumber(found.referenceNumber || '');
                setStatus(found.status || 'Pending');

                const convertedItems: AdjustmentItem[] = found.items.map((item: any, idx: number) => ({
                  id: Date.now().toString() + idx,
                  productId: item.productId,
                  name: item.productName,
                  code: item.code,
                  currentStock: item.currentStock,
                  adjustmentQty: item.quantity,
                  cost: item.cost,
                  subTotal: item.subTotal,
                  unit: item.unit,
                  isWeight: item.isWeight,
                  baseUnit: item.baseUnit,
                  isInventory: item.isInventory,
                  variationName: item.variationName,
                  batchNumber: item.batchNumber,
                  ptype: item.ptype
                }));
                setItems(convertedItems);
              }
            }
          }
        }
      } catch (err: any) {
        console.error('Error loading data:', err);
        showErrorToast('Error loading adjustment details');
      } finally {
        setPageLoading(false);
      }
    };

    loadData();
  }, [id]);

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
  const getReasonValueForSubmit = (): string => {
    const r = reasonsForCurrentType.find((x) => x.label === reason);
    return r ? r.value : reason;
  };
  const displayUnit = (item: AdjustmentItem): string => {
    const u = (item.baseUnit || item.unit || '').trim();
    if (!u || u.length > 20 || /^[0-9a-f]{24}$/i.test(u)) return '';
    return u;
  };

  const getWarehouseData = (prod: any) => {
    const wh = prod.warehouse;
    if (!wh || typeof wh !== 'object') return undefined;
    const idStr = String(selectedWarehouseId);
    return wh[idStr] ?? wh[selectedWarehouseId] ?? Object.values(wh).find((w: any) => w?.warehouseName === selectedWarehouseName || String(w?.warehouseId) === idStr);
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

  // Product search - only inventory products that exist in the selected warehouse
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
      if (!Array.isArray(fetchedProds)) {
        return [];
      }

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

      const results = productsInWarehouse.map((p: any) => ({
        id: p._id || p.id,
        name: p.name || '',
        code: p.code || '',
        cost: p.costPrice || p.purchasePrice || 0,
        product: p,
        stockStatus: getStockStatus(p)
      }));

      return results;
    } catch (err) {
      console.error("Product search error:", err);
      showErrorToast("Error searching products");
      return [];
    }
  };

  // Auto-fill when product is selected (supports Single and Variation); fetches full product for current stock
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
      item.name && // Item must have a name
      !item.variationName && 
      !item.batchNumber &&
      (item.productId === productId || item.name === productNameToCheck)
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

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const res = await axios.get(`${API_BASE}/products/${productId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const fullProduct = res.data?.data || res.data;
      if (fullProduct && fullProduct.warehouse) prod = fullProduct;
    } catch {
      // use existing prod from search if fetch fails
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
        item.name && // Item must have a name (meaning it's been selected)
        !item.variationName && 
        !item.batchNumber &&
        (item.productId === productId || item.name === prod.name)
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

    const rawUnit = prod.baseUnit || (prod.isWeight && prod.baseUnit ? prod.baseUnit : '') || prod.unit || '';
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
    setItems(prevItems => {
      // Check for duplicates in the current state
      if (!productIsVariation && !hasBatches) {
        const finalDuplicateCheck = prevItems.findIndex((item, idx) => 
          idx !== index && 
          item.name && 
          !item.variationName && 
          !item.batchNumber &&
          (item.productId === productId || item.name === prod.name)
        );
        if (finalDuplicateCheck !== -1) {
          showErrorToast("This product is already added to the adjustment.");
          // Remove the duplicate row completely from the table
          return prevItems.filter((_, idx) => idx !== index);
        }
      }

      // No duplicate found - proceed with update
      const updatedItems = [...prevItems];
      const existing = updatedItems[index];
      updatedItems[index] = {
        ...existing,
        productId: prod._id || productId,
        name: prod.name,
        code: prod.code,
        currentStock,
        cost,
        subTotal: (existing.adjustmentQty || 0) * cost,
        unit: typeof prod.unit === 'string' && !/^[0-9a-f]{24}$/i.test((prod.unit || '').trim()) ? (prod.unit || '').trim() : '',
        isWeight: prod.isWeight || false,
        baseUnit: baseUnit || prod.unit || '',
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
      const entries = batch.variationValues instanceof Map
        ? Array.from(batch.variationValues.entries())
        : Object.entries(batch.variationValues || {});
      availableVariations = entries.map(([name, data]: [string, any]) => ({
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

  // Submit update
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');

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

      await axios.put(`${API_BASE}/adjustments/${id}`, {
        warehouseId: selectedWarehouseId,
        warehouseName: selectedWarehouseName,
        adjustmentDate: adjustmentDate,
        adjustmentType: adjustmentType,
        reason: getReasonValueForSubmit(),
        notes: notes,
        referenceNumber: referenceNumber,
        status: status,
        items: adjustmentItems
      }, { headers: { Authorization: `Bearer ${token}` } });

      // Update localStorage
      const saved = localStorage.getItem('previousAdjustments');
      if (saved) {
        const adjustments = JSON.parse(saved);
        const index = adjustments.findIndex((a: any) => a._id === id);
        if (index !== -1) {
          adjustments[index] = {
            ...adjustments[index],
            warehouseId: selectedWarehouseId,
            warehouseName: selectedWarehouseName,
            adjustmentDate: adjustmentDate,
            adjustmentType: adjustmentType,
            reason: getReasonValueForSubmit(),
            notes: notes,
            referenceNumber: referenceNumber,
            status: status,
            items: adjustmentItems,
            grandTotal: grandTotal
          };
          localStorage.setItem('previousAdjustments', JSON.stringify(adjustments));
        }
      }

      showSuccessToast("Adjustment updated successfully!");
      navigate(`/viewAdjustments?refresh=${Date.now()}`);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || "Update failed";
      showErrorToast("Error: " + errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  if (pageLoading) {
    return <Loader />;
  }

  return (
    <div className="p-8 bg-canvas min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => navigate('/viewAdjustments')}
            className="text-primary hover:text-primary transition"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-4xl font-black text-foreground mb-2">Edit Stock Adjustment</h1>
            <p className="text-muted font-bold">Update adjustment details and quantities</p>
          </div>
        </div>

        {/* Main Form Container */}
        <div className="grid grid-cols-3 gap-6">
          {/* Form Section */}
          <div className="col-span-2">
            <div className="bg-surface rounded-2xl border border-line p-6 space-y-6">
              {/* Warehouse Selection */}
              <div>
                <label className="block text-sm font-black text-foreground mb-3">Warehouse *</label>
                <select
                  value={selectedWarehouseId}
                  onChange={handleWarehouseChange}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
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
                  <label className="block text-sm font-black text-foreground mb-3">Adjustment Type *</label>
                  <select
                    value={adjustmentType}
                    onChange={handleAdjustmentTypeChange}
                    className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
                  >
                    <option value="Increase">Increase Stock</option>
                    <option value="Decrease">Decrease Stock</option>
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-black text-foreground mb-3">Adjustment Date</label>
                  <input
                    type="date"
                    value={adjustmentDate}
                    onChange={(e) => setAdjustmentDate(e.target.value)}
                    className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Reason - native select so selected value is correctly bound and persists */}
              <div>
                <label className="block text-sm font-black text-foreground mb-3">Reason for Adjustment *</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
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
                <label className="block text-sm font-black text-foreground mb-3">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'Pending' | 'Approved' | 'Completed' | 'Cancelled')}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary bg-surface"
                >
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {/* Reference Number - read-only on edit; cannot be changed */}
              <div>
                <label className="block text-sm font-black text-foreground mb-3">Reference Number</label>
                <input
                  type="text"
                  value={referenceNumber}
                  readOnly
                  className="w-full px-4 py-3 border border-line rounded-lg bg-surface-muted text-foreground cursor-not-allowed"
                  title="Reference number cannot be changed when editing"
                />
                <p className="mt-1 text-xs text-muted">Reference number cannot be changed when editing.</p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-black text-foreground mb-3">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes about this adjustment..."
                  rows={4}
                  className="w-full px-4 py-3 border border-line rounded-lg focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </div>
          </div>

          {/* Summary Card */}
          <div>
            <div className="bg-surface rounded-2xl border border-line p-6 sticky top-8">
              <h3 className="text-lg font-black text-foreground mb-6">Summary</h3>

              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-xs font-black text-muted uppercase mb-1">Warehouse</p>
                  <p className="font-bold text-foreground">{selectedWarehouseName || 'Not selected'}</p>
                </div>

                <div>
                  <p className="text-xs font-black text-muted uppercase mb-1">Type</p>
                  <p className={`font-bold ${adjustmentType === 'Increase' ? 'text-secondary' : 'text-danger'}`}>
                    {adjustmentType === 'Increase' ? '↑ Increase' : '↓ Decrease'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-black text-muted uppercase mb-1">Total Items</p>
                  <p className="font-bold text-foreground">{items.length}</p>
                </div>

                <div className="pt-4 border-t border-line">
                  <p className="text-xs font-black text-muted uppercase mb-2">Total Value</p>
                  <p className="text-2xl font-black text-foreground">{currencyCode} {grandTotal.toFixed(2)}</p>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={isLoading || items.length === 0 || !selectedWarehouseId}
                className="w-full bg-primary text-on-primary font-black py-3 rounded-lg hover:bg-primary-hover disabled:bg-surface-muted disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                {isLoading ? 'Updating...' : 'Update Adjustment'}
              </button>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="mt-8 bg-surface rounded-2xl border border-line overflow-hidden">
          <div className="p-6 border-b border-line">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-foreground">Adjustment Items</h3>
              <button
                onClick={addItemRow}
                className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-lg hover:bg-primary-hover font-bold"
              >
                <Plus size={20} /> Add Item
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="p-6 text-center text-muted">
              <p>No items added. Click "Add Item" to start adding products to adjust.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-raised border-b border-line">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Current Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Adjustment Qty</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-black text-muted uppercase">Subtotal</th>
                    <th className="px-6 py-3 text-center text-xs font-black text-muted uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className="border-b border-line hover:bg-surface-raised">
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
                              className="w-full px-3 py-2 border border-line rounded-lg focus:outline-none focus:border-primary text-sm"
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
                              className="w-full px-3 py-2 border border-line rounded-lg focus:outline-none focus:border-primary text-sm"
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
                        <p className="font-bold text-foreground">{item.currentStock}{displayUnit(item) ? ` ${displayUnit(item)}` : ''}</p>
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="number"
                          value={item.adjustmentQty}
                          onChange={(e) => handleAdjustmentQtyChange(idx, e.target.value)}
                          placeholder="0"
                          className="w-24 px-3 py-2 border border-line rounded-lg focus:outline-none focus:border-primary"
                          step="0.01"
                          min="0"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-foreground">{currencyCode} {item.cost.toFixed(2)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-foreground">{currencyCode} {item.subTotal.toFixed(2)}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-danger hover:text-danger font-bold"
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

export default EditAdjustment;
