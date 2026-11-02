import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import Loader from '../common/Loader';
import SearchableDropdown from '../common/SearchableDropdown';

interface BatchData {
  batchNumber?: string;
  productCost?: number;
  productPrice?: number;
  stockAlert?: number;
  productQty?: number;
}

interface WarehouseData {
  warehouseName: string;
  productCost: number;
  productPrice: number;
  stockAlert: number;
  discount: number;
  productQty?: number;
  wholesaleEnabled?: boolean;
  wholesalePrice?: number;
  wholesaleMinQty?: number;
  batches?: BatchData[];
}

const EditProduct: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [systemType, setSystemType] = useState<'restaurant' | 'retail'>('restaurant');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [unit, setUnit] = useState('');
  const [saleUnit, setSaleUnit] = useState('');
  const [purchase, setPurchase] = useState('');
  const [ptype, setPtype] = useState<'Single' | 'Variation'>('Single');
  const [variation, setVariation] = useState('');
  const [variations, setVariations] = useState<Array<{ id: string; variationName: string; variationType: string[] }>>([]);
  const [selectedVariationIds, setSelectedVariationIds] = useState<string[]>([]);
  const [prefillVariationNames, setPrefillVariationNames] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [image, setImage] = useState('');
  const [barcode, setBarcode] = useState('');
  const [quantityLimit, setQuantityLimit] = useState<number | ''>('');
  const [weightLimitation, setWeightLimitation] = useState<number | ''>('');
  const [expiryDate, setExpiryDate] = useState('');
  
  // Restaurant-specific inventory flag (batches/weight removed)
  const [hasBatches, setHasBatches] = useState(false); // kept only to read old data but not used in UI
  const [, setIsWeight] = useState(false); // kept only to read old data but not used in UI
  const [isInventory, setIsInventory] = useState(true);
  const [batchNumber, setBatchNumber] = useState('');
  const [batchExpiryDate, setBatchExpiryDate] = useState('');
  
  // Retail-specific fields
  const [barcodeType, setBarcodeType] = useState<'128' | '39'>('128');
  const [isWholesale, setIsWholesale] = useState(false);
  const [wholesalePrice, setWholesalePrice] = useState<number | ''>('');
  const [wholesaleQuantity, setWholesaleQuantity] = useState<number | ''>('');
  const [warranty, setWarranty] = useState('');
  
  // Warehouse data
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [availableWarehouses, setAvailableWarehouses] = useState<any[]>([]);
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  
  const toUserFriendlyError = (message: string | undefined): string | undefined => {
    if (!message) return message;
    const normalized = String(message);
    if (/productqty|`productQty`|warehouse\./i.test(normalized) && /greater than 0|min(imum)? allowed value|less than/i.test(normalized)) {
      return 'Quantity must be greater than 0.';
    }
    return normalized;
  };

  useEffect(() => {
    if (id) {
      fetchProduct();
    }
    fetchWarehouses();
    fetchVariations();
  }, [id]);
  
  // Fetch variations again when prefillVariationNames changes (after product is loaded)
  useEffect(() => {
    if (prefillVariationNames.length > 0 && variations.length > 0) {
      const ids = variations
        .filter((o: { id: string; variationName: string }) => prefillVariationNames.includes(o.variationName))
        .map((o: { id: string }) => o.id);
      if (ids.length > 0 && JSON.stringify(ids) !== JSON.stringify(selectedVariationIds)) {
        setSelectedVariationIds(ids);
      }
    }
  }, [prefillVariationNames, variations]);

  const authHeader = (): Record<string, string> => {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {} as Record<string, string>;
  };

  const searchCategories = async (q: string): Promise<string[]> => {
    const res = await fetch(`${api}/categories?q=${encodeURIComponent(q)}`, { headers: authHeader() });
    const data = await res.json();
    return res.ok ? (data.data||[]).map((c: any) => c.category) : [];
  };
  const searchBrands = async (q: string): Promise<string[]> => {
    const res = await fetch(`${api}/brands?q=${encodeURIComponent(q)}`, { headers: authHeader() });
    const data = await res.json();
    return res.ok ? (data.data||[]).map((b: any) => b.brandName) : [];
  };
  const searchUnits = useCallback(async (q: string): Promise<string[]> => {
    const res = await fetch(`${api}/units?q=${encodeURIComponent(q)}&businessType=${systemType}`, { headers: authHeader() });
    const data = await res.json();
    return res.ok ? (data.data||[]).map((u: any) => u.unitName) : [];
  }, [systemType, api]);
  const searchSuppliers = async (q: string): Promise<string[]> => {
    const res = await fetch(`${api}/suppliers?q=${encodeURIComponent(q)}`, { headers: authHeader() });
    const data = await res.json();
    return res.ok ? (data.data||[]).map((s: any) => s.name) : [];
  };

  // Ensure a default combination card exists when Variation and attributes are selected
  useEffect(() => {
    if (ptype !== 'Variation') return;
    if (selectedVariationIds.length === 0) return;
    if (!warehouses.length) return;
    const updated = warehouses.map((w: any) => {
      if (w && (!w.combos || w.combos.length === 0)) {
        return {
          ...w,
          combos: [{
            valueMap: w.varValueMap || {},
            productCost: w.productCost || 0,
            productPrice: w.productPrice || 0,
            stockAlert: (systemType !== 'restaurant' || isInventory) ? (w.stockAlert || 0) : undefined,
            discount: w.discount || 0,
            code: '',
            productQty: (systemType === 'retail' || isInventory) ? (w.productQty || 0) : undefined
          }]
        };
      }
      return w;
    });
    if (JSON.stringify(updated) !== JSON.stringify(warehouses)) setWarehouses(updated as any);
  }, [ptype, selectedVariationIds, warehouses, systemType, isInventory]);

  const fetchProduct = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/products/${id}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || 'Failed to load product';
        showErrorToast(errorMessage);
        navigate('/viewProducts');
        return;
      }
      
      const product = data.data;
      setName(product.name);
      setCode(product.code);
      setBrand(product.brand || '');
      setCategory(product.category);
      setSupplier(product.supplier || '');
      setUnit(product.unit);
      setSaleUnit(product.saleUnit);
      setPurchase(product.purchase);
      setPtype(product.ptype);
      setVariation(product.variation || '');
      if (product.variation) {
        const names = String(product.variation).split('|').map((s: string) => s.trim()).filter(Boolean);
        setPrefillVariationNames(names);
      }
      
      // Need to wait for variations to be fetched before setting selectedVariationIds
      // This will be handled in fetchVariations useEffect
      setNote(product.note || '');
      setImage(product.image || '');
      setBarcode(product.barcode || '');
      setQuantityLimit(product.quantityLimit || '');
      setWeightLimitation(product.weightLimitation || '');
      setExpiryDate(product.expiryDate || '');
      const productSystemType =
        product.systemType === 'retail' || product.systemType === 'restaurant'
          ? product.systemType
          : 'restaurant';
      setSystemType(productSystemType);
      
      // Restaurant-specific fields
      const hasBatchesValue = product.hasBatches || false;
      const isWeightValue = product.isWeight || false;
      const isInventoryValue = product.isInventory !== undefined ? product.isInventory : true;
      const ptypeValue = product.ptype;
      
      setHasBatches(hasBatchesValue);
      setIsWeight(isWeightValue);
      setIsInventory(isInventoryValue);
      
      // Retail-specific fields
      setBarcodeType(product.barcodeType || '128');
      setIsWholesale(product.isWholesale || false);
      setWholesalePrice(product.wholesalePrice || '');
      setWholesaleQuantity(product.wholesaleQuantity || '');
      setWarranty(product.warranty || '');
      
      // Load warehouse data - check product attributes first to access correct structure
      if (product.warehouse) {
        const warehouseEntries = Object.entries(product.warehouse);
        const warehouseData: WarehouseData[] = [];
        const warehouseIds: string[] = [];
        
        warehouseEntries.forEach(([warehouseId, warehouseInfo]: [string, any]) => {
          const whData: any = {
            warehouseName: warehouseInfo.warehouseName || '',
            batches: warehouseInfo.batches || [],
            combos: []
          };
          
          // Check if product has batches
          if (hasBatchesValue) {
            // Data is in batches array
            if (ptypeValue === 'Single') {
              // Single product with batches - data is in first batch
              const firstBatch = (warehouseInfo.batches || [])[0];
              if (firstBatch) {
                whData.productCost = firstBatch.productCost || 0;
                whData.productPrice = firstBatch.productPrice || 0;
                whData.stockAlert = firstBatch.stockAlert || 0;
                whData.discount = firstBatch.discount || 0;
                whData.productQty = firstBatch.productQty || 0;
              } else {
                whData.productCost = 0;
                whData.productPrice = 0;
                whData.stockAlert = 0;
                whData.discount = 0;
                whData.productQty = 0;
              }
            } else if (ptypeValue === 'Variation') {
              // Variation product with batches - data is in batches with variationValues
              const firstBatch = (warehouseInfo.batches || [])[0];
              if (firstBatch && firstBatch.variationValues) {
                // Convert variationValues Map/Object to combos array
                const variationValues = firstBatch.variationValues instanceof Map 
                  ? Object.fromEntries(firstBatch.variationValues)
                  : firstBatch.variationValues;
                
                const combos: any[] = [];
                Object.entries(variationValues || {}).forEach(([key, varVal]: [string, any]) => {
                  const valueMap: Record<string, string> = {};
                  // Parse the key (e.g., "Size=Large|Color=Red")
                  key.split('|').forEach(kvp => {
                    const [attr, attrVal] = kvp.split('=');
                    if (attr) valueMap[attr] = attrVal || '';
                  });
                  
                  combos.push({
                    valueMap,
                    productCost: varVal.productCost || 0,
                    productPrice: varVal.productPrice || 0,
                    stockAlert: varVal.stockAlert || 0,
                    discount: varVal.discount || 0,
                    code: varVal.code || '',
                    productQty: varVal.productQty || 0
                  });
                });
                whData.combos = combos;
              }
            }
          } else {
            // Data is at warehouse level
            if (ptypeValue === 'Single') {
              // Single product without batches
              whData.productCost = warehouseInfo.productCost || 0;
              whData.productPrice = warehouseInfo.productPrice || 0;
              whData.stockAlert = warehouseInfo.stockAlert || 0;
              whData.discount = warehouseInfo.discount || 0;
              whData.productQty = warehouseInfo.productQty || 0;
            } else if (ptypeValue === 'Variation') {
              // Variation product without batches - data is in variationValues
              // Variation products should NOT have warehouse-level pricing fields
              // Only load if they exist (for backward compatibility or error cases)
              whData.productCost = warehouseInfo.productCost || 0;
              whData.productPrice = warehouseInfo.productPrice || 0;
              whData.stockAlert = warehouseInfo.stockAlert || 0;
              
              if (warehouseInfo.variationValues) {
                const variationValues = warehouseInfo.variationValues instanceof Map
                  ? Object.fromEntries(warehouseInfo.variationValues)
                  : warehouseInfo.variationValues;
                
                const combos: any[] = [];
                Object.entries(variationValues || {}).forEach(([key, varVal]: [string, any]) => {
                  const valueMap: Record<string, string> = {};
                  // Parse the key (e.g., "Size=Large|Color=Red")
                  key.split('|').forEach(kvp => {
                    const [attr, attrVal] = kvp.split('=');
                    if (attr) valueMap[attr] = attrVal || '';
                  });
                  
                  combos.push({
                    valueMap,
                    productCost: varVal.productCost || 0,
                    productPrice: varVal.productPrice || 0,
                    stockAlert: varVal.stockAlert || 0,
                    discount: varVal.discount || 0,
                    code: varVal.code || '',
                    productQty: varVal.productQty || 0
                  });
                });
                whData.combos = combos;
              }
            }
          }
          
          // Retail-specific wholesale fields
          if (productSystemType === 'retail') {
            whData.wholesaleEnabled = warehouseInfo.wholesaleEnabled || false;
            whData.wholesalePrice = warehouseInfo.wholesalePrice || 0;
            whData.wholesaleMinQty = warehouseInfo.wholesaleMinQty || 0;
          }
          
          warehouseData.push(whData);
          warehouseIds.push(warehouseId);
        });
        
        setWarehouses(warehouseData);
        setSelectedWarehouses(warehouseIds);

        // Prefill top-level batch fields from the first warehouse's first batch if present
        if (hasBatchesValue) {
          const firstWh: any = (warehouseEntries[0] || [])[1];
          const firstBatch = firstWh?.batches?.[0];
          if (firstBatch) {
            setBatchNumber(firstBatch.batchNumber || '');
            if (firstBatch.expiryDate) setBatchExpiryDate(String(firstBatch.expiryDate).slice(0,10));
          }
        }
      }
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
      navigate('/viewProducts');
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/warehouses`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      
      if (res.ok) {
        setAvailableWarehouses((data.data || []).filter((w: any) => w.isActive !== false));
      }
    } catch (e) {
      console.error('Error fetching warehouses:', e);
    }
  };

  const fetchVariations = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/variations`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      const data = await res.json();
      if (res.ok) {
        const opts = data.data.map((v: any) => ({ id: v._id, variationName: v.variationName, variationType: v.variationType || [] }));
        setVariations(opts);
        // If editing an existing product, pre-select attributes based on stored names
        if (prefillVariationNames.length > 0) {
          const ids = opts
            .filter((o: { id: string; variationName: string }) => prefillVariationNames.includes(o.variationName))
            .map((o: { id: string }) => o.id);
          if (ids.length > 0) setSelectedVariationIds(ids);
        }
      }
    } catch (e) {}
  };

  const addWarehouse = (warehouseId: string) => {
    if (!selectedWarehouses.includes(warehouseId)) {
      const warehouse = availableWarehouses.find(w => w._id === warehouseId);
      if (warehouse) {
        setSelectedWarehouses([...selectedWarehouses, warehouseId]);
        setWarehouses([...warehouses, {
          warehouseName: warehouse.name,
          productCost: 0,
          productPrice: 0,
          stockAlert: 0,
          discount: 0,
          productQty: 0,
          wholesaleEnabled: false,
          wholesalePrice: 0,
          wholesaleMinQty: 0
        }]);
      }
    }
  };

  const removeWarehouse = (index: number) => {
    const newWarehouses = warehouses.filter((_, i) => i !== index);
    const newSelectedWarehouses = selectedWarehouses.filter((_, i) => i !== index);
    setWarehouses(newWarehouses);
    setSelectedWarehouses(newSelectedWarehouses);
  };

  const updateWarehouseData = (index: number, field: keyof WarehouseData, value: any) => {
    const newWarehouses = [...warehouses];
    newWarehouses[index] = { ...newWarehouses[index], [field]: value };
    setWarehouses(newWarehouses);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isInventory) {
      const invalidQuantity = ptype === 'Variation'
        ? warehouses.some(warehouse => {
            const combos = (warehouse as any).combos || [];
            return combos.some((combo: any) => Number(combo.productQty) <= 0);
          })
        : warehouses.some(warehouse => Number(warehouse.productQty) <= 0);

      if (invalidQuantity) {
        showErrorToast('Quantity must be greater than 0.');
        return;
      }
    }

    setLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      
      // Prepare warehouse data
      const warehouseMap: any = {};
      warehouses.forEach((warehouse, index) => {
        const warehouseId = selectedWarehouses[index];
        const common: any = {
          warehouseName: warehouse.warehouseName
        };

        if (warehouse.discount && warehouse.discount !== 0) {
          common.discount = warehouse.discount;
        }

        if (ptype === 'Variation') {
          const attrNames = variations.filter(v => selectedVariationIds.includes(v.id)).map(v => v.variationName).sort();
          const combos = (warehouse as any).combos || [];
          const makeEntry = (combo: any) => {
            const entry: any = {
              productCost: combo.productCost !== undefined && combo.productCost !== null ? combo.productCost : 0,
              productPrice: combo.productPrice !== undefined && combo.productPrice !== null ? combo.productPrice : 0
            };
            // Always keep stockAlert when inventory tracking is enabled
            if (isInventory) {
              entry.stockAlert = combo.stockAlert !== undefined && combo.stockAlert !== null ? combo.stockAlert : 0;
            }
            if (combo.discount !== undefined && combo.discount !== 0) {
              entry.discount = combo.discount;
            }
            if (combo.code && String(combo.code).trim() !== '') {
              entry.code = String(combo.code).trim();
            }
            // Always keep productQty when inventory tracking is enabled
            if (isInventory) {
              entry.productQty = combo.productQty !== undefined && combo.productQty !== null ? combo.productQty : 0;
            }
            return entry;
          };

          const variationMap: any = {};
          const fallbackCombo: any = { 
            valueMap: (warehouse as any).varValueMap || {}, 
            productCost: warehouse.productCost !== undefined && warehouse.productCost !== null ? warehouse.productCost : 0, 
            productPrice: warehouse.productPrice !== undefined && warehouse.productPrice !== null ? warehouse.productPrice : 0 
          };
          if (isInventory) {
            fallbackCombo.stockAlert = warehouse.stockAlert !== undefined && warehouse.stockAlert !== null ? warehouse.stockAlert : 0;
            fallbackCombo.productQty = warehouse.productQty !== undefined && warehouse.productQty !== null ? warehouse.productQty : 0;
          }
          (combos.length ? combos : [fallbackCombo]).forEach((combo: any) => {
            const key = attrNames.map(a => `${a}=${combo.valueMap?.[a] || ''}`).join('|');
            variationMap[key] = makeEntry(combo);
          });
          common.variationValues = variationMap;
        } else {
          // Always set productCost and productPrice (default to 0 if undefined/null)
          common.productCost = warehouse.productCost !== undefined && warehouse.productCost !== null ? warehouse.productCost : 0;
          common.productPrice = warehouse.productPrice !== undefined && warehouse.productPrice !== null ? warehouse.productPrice : 0;
          
          // Always keep stockAlert when inventory tracking is enabled
          if (isInventory) {
            common.stockAlert = warehouse.stockAlert !== undefined && warehouse.stockAlert !== null ? warehouse.stockAlert : 0;
          }
          
          // Set discount if provided
          if (warehouse.discount !== undefined && warehouse.discount !== 0) {
            common.discount = warehouse.discount;
          }
          
          // Always keep productQty when inventory tracking is enabled
          if (isInventory) {
            common.productQty = warehouse.productQty !== undefined && warehouse.productQty !== null ? warehouse.productQty : 0;
          }
        }

        if (systemType === 'retail') {
          if (warehouse.wholesaleEnabled) common.wholesaleEnabled = true;
          if (warehouse.wholesalePrice !== undefined && warehouse.wholesalePrice !== 0) {
            common.wholesalePrice = warehouse.wholesalePrice;
          }
          if (warehouse.wholesaleMinQty !== undefined && warehouse.wholesaleMinQty !== 0) {
            common.wholesaleMinQty = warehouse.wholesaleMinQty;
          }
        }

        warehouseMap[warehouseId] = common;
      });

      const productData: any = {
        name,
        code,
        brand: brand || undefined,
        category,
        supplier: supplier || undefined,
        unit,
        saleUnit: systemType==='retail' ? (saleUnit || undefined) : undefined,
        purchase: systemType==='retail' ? (purchase || undefined) : undefined,
        ptype,
        variation: variation || undefined,
        note: note || undefined,
        image: image || undefined,
        barcode: barcode || undefined,
        quantityLimit: quantityLimit || undefined,
        weightLimitation: weightLimitation || undefined,
        expiryDate: expiryDate || undefined,
        systemType,
        warehouse: warehouseMap,
        ...(systemType === 'restaurant' && {
          isInventory
        }),
        ...(systemType === 'retail' && {
          barcodeType,
          isWholesale,
          wholesalePrice: wholesalePrice || undefined,
          wholesaleQuantity: wholesaleQuantity || undefined,
          warranty: warranty || undefined
        })
      };

      const res = await fetch(`${api}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(productData)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || data?.errors?.join(', ') || 'Failed to update product';
        showErrorToast(toUserFriendlyError(errorMessage) || 'Failed to update product');
        return;
      }
      
      showSuccessToast(data.message || 'Product updated successfully');
      navigate('/viewProducts');
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      {loading && <Loader text="Loading product" />}
      
      {/* Header */}
      <div className="bg-surface border-b">
        <div className="px-6 py-4">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/viewProducts')}
              className="mr-4 p-2 text-subtle hover:text-muted hover:bg-surface-muted rounded-lg transition-colors duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Edit Product</h1>
              <p className="text-sm text-muted mt-1">
                Update {systemType} product information
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-surface rounded-lg border border-line p-6">
            <form onSubmit={submit} className="space-y-8">
              <div className="space-y-4">
                <div className="flex flex-col">
                  <span className="block text-base font-medium text-foreground mb-1">
                    Is Inventory
                  </span>
                  <div className="flex items-center space-x-6">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name="isInventory"
                        checked={isInventory === true}
                        onChange={() => setIsInventory(true)}
                        className="h-4 w-4 text-foreground focus:ring-primary border-line-strong"
                      />
                      <span className="ml-2 text-sm text-foreground">Yes</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name="isInventory"
                        checked={isInventory === false}
                        onChange={() => setIsInventory(false)}
                        className="h-4 w-4 text-foreground focus:ring-primary border-line-strong"
                      />
                      <span className="ml-2 text-sm text-foreground">No</span>
                    </label>
                  </div>
                  <span className="block text-sm text-muted mt-2 leading-relaxed">
                    Controls whether the product is stock-tracked. Select Yes if this product maintains inventory quantities; select No for non-stocked items.
                  </span>
                </div>
              </div>
              {/* Basic Information */}
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-foreground border-b border-line pb-2">Basic Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-base font-medium text-foreground mb-2">
                      Product Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      placeholder="Enter product name"
                      className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-medium text-foreground mb-2">
                      Product Code <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      required
                      placeholder="Enter product code"
                      className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-base font-medium text-foreground mb-2">
                      Product Image
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          const result = reader.result;
                          if (typeof result === 'string') {
                            setImage(result);
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                      className="w-full px-3 py-2 text-base border border-line-strong rounded-lg font-normal text-foreground focus:ring-2 focus:ring-primary"
                    />
                    {image && (
                      <div className="mt-2 flex items-center gap-3">
                        <img
                          src={image}
                          alt="Product preview"
                          className="h-12 w-12 rounded-lg object-cover border border-line"
                        />
                        <button
                          type="button"
                          onClick={() => setImage('')}
                          className="px-2 py-1 text-xs font-medium text-danger bg-danger-soft border border-danger-line rounded-lg hover:bg-danger-soft"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  <SearchableDropdown
                    value={category}
                    onChange={setCategory}
                    onSearch={searchCategories}
                    placeholder="Search category"
                    required
                    label="Category"
                    showRequiredIndicator
                    labelClassName="block text-base font-medium text-foreground mb-2"
                    className="px-3 py-2 text-base border border-line-strong rounded-lg font-normal text-foreground focus:ring-2 focus:ring-primary"
                  />

                  <SearchableDropdown
                    value={brand}
                    onChange={setBrand}
                    onSearch={searchBrands}
                    placeholder="Search brand"
                    label="Brand"
                    labelClassName="block text-base font-medium text-foreground mb-2"
                    className="px-3 py-2 text-base border border-line-strong rounded-lg font-normal text-foreground focus:ring-2 focus:ring-primary"
                  />

                  <SearchableDropdown
                    value={unit}
                    onChange={setUnit}
                    onSearch={searchUnits}
                    placeholder="Search unit"
                    required
                    label="Unit"
                    showRequiredIndicator
                    labelClassName="block text-base font-medium text-foreground mb-2"
                    className="px-3 py-2 text-base border border-line-strong rounded-lg font-normal text-foreground focus:ring-2 focus:ring-primary"
                  />

                  <SearchableDropdown
                    value={supplier}
                    onChange={setSupplier}
                    onSearch={searchSuppliers}
                    placeholder="Search supplier"
                    label="Supplier"
                    labelClassName="block text-base font-medium text-foreground mb-2"
                    className="px-3 py-2 text-base border border-line-strong rounded-lg font-normal text-foreground focus:ring-2 focus:ring-primary"
                  />

                  <div>
                    <label className="block text-base font-medium text-foreground mb-2">
                      Product Type <span className="text-danger">*</span>
                    </label>
                    <select
                      value={ptype}
                      onChange={e => setPtype(e.target.value as 'Single' | 'Variation')}
                      required
                      className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="Single">Single</option>
                      <option value="Variation">Variation</option>
                    </select>
                  </div>
                </div>

                {ptype === 'Variation' && (
                  <div className="md:col-span-2">
                    <label className="block text-base font-medium text-foreground mb-2">Variation Attributes <span className="text-danger">*</span></label>
                    <div className="flex flex-wrap gap-2">
                      {variations.map(v => {
                        const checked = selectedVariationIds.includes(v.id);
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => {
                              const next = checked
                                ? selectedVariationIds.filter(id => id !== v.id)
                                : [...selectedVariationIds, v.id];
                              setSelectedVariationIds(next);
                              const names = variations.filter(x => next.includes(x.id)).map(x => x.variationName).sort();
                              setVariation(names.join('|'));
                            }}
                            className={`px-3 py-1 rounded-full border text-sm ${checked ? 'bg-primary text-on-primary border-primary' : 'bg-surface text-foreground border-line-strong hover:bg-surface-raised'}`}
                          >
                            {v.variationName}
                          </button>
                        );
                      })}
                    </div>
                    {selectedVariationIds.length === 0 && (
                      <p className="text-xs text-danger mt-1">Select at least one attribute</p>
                    )}
                    <input type="hidden" required value={selectedVariationIds.join(',')} readOnly />
                  </div>
                )}

                <div>
                  <label className="block text-base font-medium text-foreground mb-2">
                    Note
                  </label>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Enter product notes"
                    rows={3}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

              </div>

              {/* System Type Specific Fields */}
              {systemType === 'restaurant' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-foreground border-b border-line pb-2">Restaurant Settings</h3>
                  
                  {hasBatches && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="md:col-span-2">
                        <label className="block text-base font-medium text-foreground mb-2">
                          First Batch Number <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          value={batchNumber}
                          onChange={e => setBatchNumber(e.target.value)}
                          required
                          placeholder="Enter first batch number"
                          className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-base font-medium text-foreground mb-2">
                          First Batch Expiry Date
                        </label>
                        <input
                          type="date"
                          value={batchExpiryDate}
                          onChange={e => setBatchExpiryDate(e.target.value)}
                          className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {systemType === 'retail' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-foreground border-b border-line pb-2">Retail Settings</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-base font-medium text-foreground mb-2">
                        Barcode Type
                      </label>
                      <select
                        value={barcodeType}
                        onChange={e => setBarcodeType(e.target.value as '128' | '39')}
                        className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      >
                        <option value="128">128</option>
                        <option value="39">39</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-base font-medium text-foreground mb-2">
                        Warranty
                      </label>
                      <input
                        type="text"
                        value={warranty}
                        onChange={e => setWarranty(e.target.value)}
                        placeholder="Enter warranty period"
                        className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isWholesale"
                      checked={isWholesale}
                      onChange={e => setIsWholesale(e.target.checked)}
                      className="h-4 w-4 text-foreground focus:ring-primary border-line-strong rounded"
                    />
                    <label htmlFor="isWholesale" className="ml-2 block text-sm text-foreground">
                      Is Wholesale
                    </label>
                  </div>

                  {isWholesale && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-base font-medium text-foreground mb-2">
                          Wholesale Price
                        </label>
                        <input
                          type="number"
                          value={wholesalePrice}
                          onChange={e => setWholesalePrice(e.target.value ? Number(e.target.value) : '')}
                          placeholder="Enter wholesale price"
                          className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-base font-medium text-foreground mb-2">
                          Wholesale Quantity
                        </label>
                        <input
                          type="number"
                          value={wholesaleQuantity}
                          onChange={e => setWholesaleQuantity(e.target.value ? Number(e.target.value) : '')}
                          placeholder="Enter wholesale quantity"
                          className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Warehouse Selection */}
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-foreground border-b border-line pb-2">Warehouse Configuration</h3>
                
                <div>
                  <label className="block text-base font-medium text-foreground mb-2">
                    Add Warehouses
                  </label>
                  <select
                    onChange={e => {
                      if (e.target.value) {
                        addWarehouse(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="">Select warehouse to add</option>
                    {availableWarehouses
                      .filter(w => !selectedWarehouses.includes(w._id))
                      .map(warehouse => (
                        <option key={warehouse._id} value={warehouse._id}>
                          {warehouse.name}
                        </option>
                      ))}
                  </select>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={fetchWarehouses}
                      className="inline-flex items-center px-3 py-1 rounded text-xs bg-surface-muted text-foreground hover:bg-surface-muted"
                      title="Refresh warehouses"
                    >
                      Refresh Warehouses
                    </button>
                  </div>
                </div>

                {/* Warehouse Cards */}
                {warehouses.map((warehouse, index) => (
                  <div key={index} className="border border-line rounded-lg p-4 bg-surface-raised">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium text-foreground">{warehouse.warehouseName}</h4>
                      <button
                        type="button"
                        onClick={() => removeWarehouse(index)}
                        className="text-danger hover:text-danger"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {ptype !== 'Variation' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-base font-medium text-foreground mb-1">
                          Product Cost <span className="text-danger">*</span>
                        </label>
                        <input
                          type="number"
                          value={warehouse.productCost}
                          onChange={e => updateWarehouseData(index, 'productCost', Number(e.target.value))}
                          required
                          className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-base font-medium text-foreground mb-1">
                          Product Price <span className="text-danger">*</span>
                        </label>
                        <input
                          type="number"
                          value={warehouse.productPrice}
                          onChange={e => updateWarehouseData(index, 'productPrice', Number(e.target.value))}
                          required
                          className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>

                      {isInventory && (
                        <div>
                          <label className="block text-base font-medium text-foreground mb-1">
                            Stock Alert <span className="text-danger">*</span>
                          </label>
                          <input
                            type="number"
                            value={warehouse.stockAlert}
                            onChange={e => updateWarehouseData(index, 'stockAlert', Number(e.target.value))}
                            required
                            className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-base font-medium text-foreground mb-1">
                          Discount
                        </label>
                        <input
                          type="number"
                          value={warehouse.discount}
                          onChange={e => updateWarehouseData(index, 'discount', Number(e.target.value))}
                          className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                      </div>
                      {/* Calculated fields for single product */}
                      <div>
                        <label className="block text-base font-medium text-foreground mb-1">Product Profit</label>
                        <input
                          type="number"
                          readOnly
                          value={(() => {
                            const price = Number(warehouse.productPrice || 0);
                            const cost = Number(warehouse.productCost || 0);
                            const discountAmt = Number(warehouse.discount || 0);
                            const net = Math.max(0, price - discountAmt);
                            return (net - cost).toFixed(2);
                          })()}
                          className="w-full px-3 py-2 border border-line bg-surface-muted rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-base font-medium text-foreground mb-1">Profit Margin (%)</label>
                        <input
                          type="number"
                          readOnly
                          value={(() => {
                            const price = Number(warehouse.productPrice || 0);
                            const cost = Number(warehouse.productCost || 0);
                            const discountAmt = Number(warehouse.discount || 0);
                            const net = Math.max(0, price - discountAmt);
                            const profit = net - cost;
                            const margin = net > 0 ? (profit / net) * 100 : 0;
                            return margin.toFixed(2);
                          })()}
                          className="w-full px-3 py-2 border border-line bg-surface-muted rounded-lg"
                        />
                      </div>

                      {isInventory && (
                        <div>
                          <label className="block text-base font-medium text-foreground mb-1">
                            Quantity <span className="text-danger">*</span>
                          </label>
                          <input
                            type="number"
                            value={warehouse.productQty ?? ''}
                            onChange={e => updateWarehouseData(index, 'productQty', Number(e.target.value))}
                            required
                            className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                          />
                        </div>
                      )}

                      {systemType === 'retail' && (
                        <div>
                          <div className="flex items-center mb-2">
                            <input
                              type="checkbox"
                              checked={warehouse.wholesaleEnabled || false}
                              onChange={e => updateWarehouseData(index, 'wholesaleEnabled', e.target.checked)}
                              className="h-4 w-4 text-foreground focus:ring-primary border-line-strong rounded"
                            />
                            <label className="ml-2 block text-sm text-foreground">
                              Enable Wholesale
                            </label>
                          </div>
                        </div>
                      )}

                      {systemType === 'retail' && warehouse.wholesaleEnabled && (
                        <>
                          <div>
                            <label className="block text-base font-medium text-foreground mb-1">
                              Wholesale Price
                            </label>
                            <input
                              type="number"
                              value={warehouse.wholesalePrice || ''}
                              onChange={e => updateWarehouseData(index, 'wholesalePrice', Number(e.target.value))}
                              className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </div>

                          <div>
                            <label className="block text-base font-medium text-foreground mb-1">
                              Wholesale Min Qty
                            </label>
                            <input
                              type="number"
                              value={warehouse.wholesaleMinQty || ''}
                              onChange={e => updateWarehouseData(index, 'wholesaleMinQty', Number(e.target.value))}
                              className="w-full px-3 py-2 text-base border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </div>
                        </>
                      )}
                    </div>
                    )}

                    {ptype === 'Variation' && (
                      <div className="md:col-span-4 w-full">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium text-foreground">Variation Combinations</h5>
                          <button
                            type="button"
                            onClick={() => {
                              const combos = (warehouse as any).combos || [];
                              const newCombos = [...combos, { valueMap: {}, productCost: 0, productPrice: 0, stockAlert: (systemType!=='restaurant' || isInventory) ? 0 : undefined, discount: 0, code: '', productQty: (systemType==='retail'||isInventory)?0:undefined }];
                              updateWarehouseData(index, 'combos' as any, newCombos);
                            }}
                            className="inline-flex items-center px-3 py-1 rounded text-xs bg-primary text-on-primary hover:bg-primary-hover"
                          >Add Combination</button>
                        </div>
                        {(((warehouse as any).combos && (warehouse as any).combos.length ? (warehouse as any).combos : [{ valueMap: (warehouse as any).varValueMap || {}, productCost: warehouse.productCost || 0, productPrice: warehouse.productPrice || 0, stockAlert: (systemType!=='restaurant' || isInventory) ? (warehouse.stockAlert || 0) : undefined, discount: warehouse.discount || 0, code: '', productQty: (systemType==='retail'||isInventory)? (warehouse.productQty || 0): undefined }])).map((combo: any, ci: number) => (
                          <div key={ci} className="border rounded-lg p-3 mb-3 bg-surface">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                              {selectedVariationIds.map(vid => {
                                const attr = variations.find(v => v.id === vid);
                                const attrName = attr?.variationName || '';
                                return (
                                  <div key={vid}>
                                    <label className="block text-base font-medium text-foreground mb-1">{attrName}</label>
                                    <select
                                      value={combo.valueMap?.[attrName] || ''}
                                      onChange={e => {
                                        const combos=(warehouse as any).combos||[];const clone=[...combos];
                                        const vm={...(clone[ci]?.valueMap||{}),[attrName]:e.target.value};
                                        clone[ci] = { ...(clone[ci]||{}), valueMap: vm };
                                        updateWarehouseData(index,'combos' as any,clone);
                                      }}
                                      className="w-full px-3 py-2 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                      <option value="">Select {attrName}</option>
                                      {(attr?.variationType || []).map(val => (
                                        <option key={val} value={val}>{val}</option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              })}
                              <div>
                                <label className="block text-base font-medium text-foreground mb-1">Cost</label>
                                <input type="number" value={combo.productCost}
                                  onChange={e=>{const combos=(warehouse as any).combos||[];const clone=[...combos];clone[ci]={...clone[ci],productCost:Number(e.target.value)};updateWarehouseData(index,'combos' as any,clone);}}
                                  className="w-full px-3 py-2 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"/>
                              </div>
                              <div>
                                <label className="block text-base font-medium text-foreground mb-1">Price</label>
                                <input type="number" value={combo.productPrice}
                                  onChange={e=>{const combos=(warehouse as any).combos||[];const clone=[...combos];clone[ci]={...clone[ci],productPrice:Number(e.target.value)};updateWarehouseData(index,'combos' as any,clone);}}
                                  className="w-full px-3 py-2 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"/>
                              </div>
                              {(systemType !== 'restaurant' || isInventory) && (
                                <div>
                                  <label className="block text-base font-medium text-foreground mb-1">Stock Alert</label>
                                  <input type="number" value={combo.stockAlert}
                                    onChange={e=>{const combos=(warehouse as any).combos||[];const clone=[...combos];clone[ci]={...clone[ci],stockAlert:Number(e.target.value)};updateWarehouseData(index,'combos' as any,clone);}}
                                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"/>
                                </div>
                              )}
                              <div>
                                <label className="block text-base font-medium text-foreground mb-1">Discount</label>
                                <input type="number" value={combo.discount || ''}
                                  onChange={e=>{const combos=(warehouse as any).combos||[];const clone=[...combos];clone[ci]={...clone[ci],discount:Number(e.target.value)||0};updateWarehouseData(index,'combos' as any,clone);}}
                                  className="w-full px-3 py-2 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"/>
                              </div>
                              <div>
                                <label className="block text-base font-medium text-foreground mb-1">Variation Code</label>
                                <input type="text" value={combo.code || ''}
                                  onChange={e=>{const combos=(warehouse as any).combos||[];const clone=[...combos];clone[ci]={...clone[ci],code:e.target.value};updateWarehouseData(index,'combos' as any,clone);}}
                                  placeholder="Enter variation code"
                                  className="w-full px-3 py-2 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"/>
                              </div>
                              {/* Calculated fields for variation combo */}
                              <div>
                                <label className="block text-base font-medium text-foreground mb-1">Product Profit</label>
                                <input
                                  type="number"
                                  readOnly
                                  value={(() => {
                                    const price = Number(combo.productPrice || 0);
                                    const cost = Number(combo.productCost || 0);
                                    const discountAmt = Number(combo.discount || 0);
                                    const net = Math.max(0, price - discountAmt);
                                    return (net - cost).toFixed(2);
                                  })()}
                                  className="w-full px-3 py-2 border border-line bg-surface-muted rounded-lg"
                                />
                              </div>
                              <div>
                                <label className="block text-base font-medium text-foreground mb-1">Profit Margin (%)</label>
                                <input
                                  type="number"
                                  readOnly
                                  value={(() => {
                                    const price = Number(combo.productPrice || 0);
                                    const cost = Number(combo.productCost || 0);
                                    const discountAmt = Number(combo.discount || 0);
                                    const net = Math.max(0, price - discountAmt);
                                    const profit = net - cost;
                                    const margin = net > 0 ? (profit / net) * 100 : 0;
                                    return margin.toFixed(2);
                                  })()}
                                  className="w-full px-3 py-2 border border-line bg-surface-muted rounded-lg"
                                />
                              </div>
                              {isInventory && (
                                <div>
                                  <label className="block text-base font-medium text-foreground mb-1">Quantity <span className="text-danger">*</span></label>
                                  <input type="number" value={combo.productQty ?? ''}
                                    onChange={e=>{const combos=(warehouse as any).combos||[];const clone=[...combos];clone[ci]={...clone[ci],productQty:Number(e.target.value)};updateWarehouseData(index,'combos' as any,clone);}}
                                    required
                                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"/>
                                </div>
                              )}
                            </div>
                            <div className="mt-2 text-right">
                              <button type="button" onClick={()=>{const combos=(warehouse as any).combos||[];const clone=[...combos];clone.splice(ci,1);updateWarehouseData(index,'combos' as any,clone);}} className="text-danger hover:text-danger text-sm">Remove Combination</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                ))}
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end space-x-3 pt-6 border-t border-line">
                <button
                  type="button"
                  onClick={() => navigate('/viewProducts')}
                  className="px-4 py-2 text-base font-medium text-foreground bg-surface border border-line-strong rounded-lg hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-base font-medium text-on-primary bg-primary rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200"
                >
                  Update Product
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditProduct;
