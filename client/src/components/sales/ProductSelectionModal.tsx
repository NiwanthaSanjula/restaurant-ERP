import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Loader from '../common/Loader';

interface Product {
  _id: string;
  name: string;
  code: string;
  ptype: 'Single' | 'Variation';
  hasBatches?: boolean;
  warehouse?: any;
  systemType: 'restaurant' | 'retail';
  isWeight?: boolean;
  /** false = prepared dish; may have a kitchen recipe */
  isInventory?: boolean;
}

interface Batch {
  batchNumber?: string;
  productQty?: number;
  variationValues?: Map<string, any> | Record<string, any>;
}

interface Variation {
  productQty?: number;
  productPrice?: number;
  productCost?: number;
}

interface ProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (product: {
    productId: string;
    productName: string;
    variation: string | null;
    batch: string | null;
    qty: number;
    price: number;
    cost: number;
    stockQty: number;
    isWeight?: boolean;
    systemType?: 'retail' | 'restaurant';
    isInventory?: boolean;
    recipeIngredientCount?: number | null;
    recipeCost?: number | null;
    discount: number;
    discountType: 'fixed' | 'percentage';
    tax: number;
  }) => void;
  warehouseId: string;
  businessType: 'retail' | 'restaurant';
}

const ProductSelectionModal: React.FC<ProductSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  warehouseId,
  businessType
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [selectedVariation, setSelectedVariation] = useState<string | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [variations, setVariations] = useState<Array<{ name: string; data: Variation }>>([]);
  const [qty, setQty] = useState<number>(1);
  /** Line discount from product (warehouse / variation / batch); always sent as fixed per unit */
  const [discount, setDiscount] = useState<number>(0);
  const [tax, setTax] = useState<number>(0);
  const [stockQty, setStockQty] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [cost, setCost] = useState<number>(0);
  const [recipePreview, setRecipePreview] = useState<{
    hasRecipe: boolean;
    ingredientCount: number;
    recipeCost?: number;
  } | null>(null);
  const [recipePreviewLoading, setRecipePreviewLoading] = useState(false);

  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const preparedDish = selectedProduct?.isInventory === false;
  const effectiveMaxQty = preparedDish ? Number.MAX_SAFE_INTEGER : stockQty;

  useEffect(() => {
    if (isOpen && searchQuery.trim().length > 0) {
      const timer = setTimeout(() => {
        searchProducts();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setProducts([]);
    }
  }, [searchQuery, isOpen, warehouseId, businessType]);

  useEffect(() => {
    if (selectedProduct && warehouseId) {
      loadProductDetails();
    }
  }, [selectedProduct, warehouseId]);

  useEffect(() => {
    if (selectedProduct && (selectedBatch !== null || selectedVariation !== null)) {
      updatePriceAndStock();
    }
  }, [selectedProduct, selectedBatch, selectedVariation]);

  useEffect(() => {
    if (!selectedProduct || selectedProduct.isInventory !== false) {
      setRecipePreview(null);
      setRecipePreviewLoading(false);
      return;
    }
    if (selectedProduct.hasBatches && selectedBatch === null) {
      setRecipePreview(null);
      setRecipePreviewLoading(false);
      return;
    }
    if (selectedProduct.ptype === 'Variation' && selectedVariation === null) {
      setRecipePreview(null);
      setRecipePreviewLoading(false);
      return;
    }

    const productId = selectedProduct._id;
    const variationName =
      selectedProduct.ptype === 'Variation' && selectedVariation
        ? selectedVariation
        : undefined;

    let cancelled = false;
    setRecipePreviewLoading(true);
    setRecipePreview(null);

    (async () => {
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams();
        if (variationName) params.set('variationName', variationName);
        const qs = params.toString();
        const url = `${api}/kitchen/recipes/${productId}${qs ? `?${qs}` : ''}`;
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setRecipePreview(null);
          return;
        }
        const data = body.data;
        if (data == null) {
          setRecipePreview({ hasRecipe: false, ingredientCount: 0 });
        } else {
          const ings = Array.isArray(data.ingredients) ? data.ingredients : [];
          setRecipePreview({
            hasRecipe: ings.length > 0,
            ingredientCount: ings.length,
            recipeCost:
              typeof data.recipeCost === 'number' ? data.recipeCost : undefined
          });
        }
      } catch {
        if (!cancelled) setRecipePreview(null);
      } finally {
        if (!cancelled) setRecipePreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProduct, selectedBatch, selectedVariation, api]);

  const searchProducts = async () => {
    if (!warehouseId) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.set('systemType', businessType);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      const res = await fetch(`${api}/products?${params.toString()}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      
      if (res.ok && data.data) {
        // Filter products that exist in the selected warehouse
        const filtered = data.data.filter((p: Product) => {
          if (!p.warehouse) return false;
          const warehouse = p.warehouse instanceof Map
            ? p.warehouse.get(warehouseId)
            : p.warehouse[warehouseId];
          return warehouse !== undefined;
        });
        setProducts(filtered);
      }
    } catch (e) {
      console.error('Failed to search products:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadProductDetails = () => {
    if (!selectedProduct || !warehouseId) return;
    
    const warehouse = selectedProduct.warehouse instanceof Map
      ? selectedProduct.warehouse.get(warehouseId)
      : selectedProduct.warehouse?.[warehouseId];
    
    if (!warehouse) return;
    
    // Reset selections
    setSelectedBatch(null);
    setSelectedVariation(null);
    setBatches([]);
    setVariations([]);
    setDiscount(0);
    
    // Check if product has batches
    if (selectedProduct.hasBatches && warehouse.batches && warehouse.batches.length > 0) {
      setBatches(warehouse.batches);
      
      // If it's a variation product with batches, we'll need to select batch first
      if (selectedProduct.ptype === 'Variation') {
        // Variations will be loaded when batch is selected
      } else {
        // Single product with batches - user needs to select batch
      }
    } else {
      // No batches
      if (selectedProduct.ptype === 'Variation' && warehouse.variationValues) {
        // Load variations
        const variationValues = warehouse.variationValues instanceof Map
          ? Array.from(warehouse.variationValues.entries())
          : Object.entries(warehouse.variationValues || {});
        
        const variationList = (variationValues as [string, any][]).map(([name, data]) => ({
          name,
          data: data && typeof data === 'object' ? data : {}
        }));
        setVariations(variationList);
        if (variationList.length === 1) setSelectedVariation(variationList[0].name);
      } else {
        // Simple product - set price and stock directly
        setPrice(warehouse.productPrice || 0);
        setCost(warehouse.productCost || 0);
        setStockQty(warehouse.productQty || 0);
        setTax(warehouse.orderTax || 0);
        setDiscount(typeof warehouse.discount === 'number' ? warehouse.discount : 0);
      }
    }
  };

  const updatePriceAndStock = () => {
    if (!selectedProduct || !warehouseId) return;
    
    const warehouse = selectedProduct.warehouse instanceof Map
      ? selectedProduct.warehouse.get(warehouseId)
      : selectedProduct.warehouse?.[warehouseId];
    
    if (!warehouse) return;
    
    if (selectedProduct.hasBatches && warehouse.batches && selectedBatch !== null) {
      const batch = warehouse.batches.find((b: Batch) => b.batchNumber === selectedBatch);
      if (batch) {
        if (selectedProduct.ptype === 'Variation' && selectedVariation !== null && batch.variationValues) {
          const variationValues = batch.variationValues instanceof Map
            ? batch.variationValues.get(selectedVariation)
            : batch.variationValues[selectedVariation];
          
          if (variationValues) {
            setPrice(variationValues.productPrice || 0);
            setCost(variationValues.productCost || 0);
            setStockQty(variationValues.productQty || 0);
            setTax(variationValues.orderTax || 0);
            setDiscount(typeof variationValues.discount === 'number' ? variationValues.discount : 0);
          }
        } else if (selectedProduct.ptype === 'Single') {
          setPrice(batch.productPrice || 0);
          setCost(batch.productCost || 0);
          setStockQty(batch.productQty || 0);
          setTax(batch.orderTax || 0);
          setDiscount(typeof batch.discount === 'number' ? batch.discount : 0);
        }
      }
    } else if (selectedProduct.ptype === 'Variation' && selectedVariation !== null && warehouse.variationValues) {
      const variationValues = warehouse.variationValues instanceof Map
        ? warehouse.variationValues.get(selectedVariation)
        : warehouse.variationValues[selectedVariation];
      
      if (variationValues) {
        setPrice(variationValues.productPrice || 0);
        setCost(variationValues.productCost || 0);
        setStockQty(variationValues.productQty || 0);
        setTax(variationValues.orderTax || 0);
        setDiscount(typeof variationValues.discount === 'number' ? variationValues.discount : 0);
      }
    }
  };

  const handleBatchSelect = (batchNumber: string) => {
    setSelectedBatch(batchNumber);
    
    if (selectedProduct && selectedProduct.ptype === 'Variation') {
      const warehouse = selectedProduct.warehouse instanceof Map
        ? selectedProduct.warehouse.get(warehouseId)
        : selectedProduct.warehouse?.[warehouseId];
      
      const batch = warehouse?.batches?.find((b: Batch) => b.batchNumber === batchNumber);
      if (batch && batch.variationValues) {
        const variationValues = batch.variationValues instanceof Map
          ? Array.from(batch.variationValues.entries())
          : Object.entries(batch.variationValues || {});
        
        const variationList = (variationValues as [string, any][]).map(([name, data]) => ({
          name,
          data
        }));
        setVariations(variationList);
        setSelectedVariation(variationList.length === 1 ? variationList[0].name : null);
      }
    }
  };

  const handleAddProduct = () => {
    const maxQ = selectedProduct?.isInventory === false ? Number.MAX_SAFE_INTEGER : stockQty;
    if (!selectedProduct || qty <= 0 || qty > maxQ) {
      alert('Invalid quantity');
      return;
    }
    
    if (selectedProduct.hasBatches && selectedBatch === null) {
      alert('Please select a batch');
      return;
    }
    
    if (selectedProduct.ptype === 'Variation' && selectedVariation === null) {
      alert('Please select a variation');
      return;
    }
    
    const isPrep = selectedProduct.isInventory === false;
    onSelect({
      productId: selectedProduct._id,
      productName: selectedProduct.name,
      variation: selectedVariation,
      batch: selectedBatch,
      qty,
      price,
      cost,
      stockQty,
      isWeight: selectedProduct.isWeight === true,
      systemType: selectedProduct.systemType,
      isInventory: selectedProduct.isInventory,
      recipeIngredientCount: isPrep
        ? recipePreview
          ? recipePreview.hasRecipe
            ? recipePreview.ingredientCount
            : 0
          : null
        : undefined,
      recipeCost:
        isPrep && recipePreview?.hasRecipe ? recipePreview.recipeCost ?? null : undefined,
      discount,
      discountType: 'fixed',
      tax
    });
    
    // Reset form
    handleClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    setSelectedProduct(null);
    setSelectedBatch(null);
    setSelectedVariation(null);
    setBatches([]);
    setVariations([]);
    setQty(1);
    setDiscount(0);
    setTax(0);
    setStockQty(0);
    setPrice(0);
    setCost(0);
    setRecipePreview(null);
    setRecipePreviewLoading(false);
    setProducts([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={handleClose} aria-hidden="true" />
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl w-full border border-gray-200">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Select Product</h3>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Product Search */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Product <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by product name or code..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]"
              />
              {loading && (
                <div className="mt-2">
                  <Loader text="Searching..." />
                </div>
              )}
              {!loading && products.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                  {products.map((product) => (
                    <div
                      key={product._id}
                      onClick={() => setSelectedProduct(product)}
                      className={`p-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 ${
                        selectedProduct?._id === product._id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="font-medium">{product.name}</div>
                      <div className="text-sm text-gray-500">Code: {product.code}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected product summary */}
            {selectedProduct && (
              <div className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div>
                  <span className="text-sm font-medium text-slate-600">Selected product: </span>
                  <span className="text-sm font-semibold text-[#1A3E73]">{selectedProduct.name}</span>
                  <span className="text-slate-500 text-sm ml-1">({selectedProduct.code})</span>
                  {selectedProduct.isInventory === false && (
                    <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                      Prepared (no stock SKU)
                    </span>
                  )}
                </div>
                {preparedDish && businessType === 'restaurant' && (
                  <div className="text-sm rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
                    {recipePreviewLoading ? (
                      <span className="text-amber-900">Loading recipe…</span>
                    ) : recipePreview ? (
                      recipePreview.hasRecipe ? (
                        <span className="text-amber-950">
                          Recipe: <strong>{recipePreview.ingredientCount}</strong> ingredient
                          {recipePreview.ingredientCount !== 1 ? 's' : ''}
                          {typeof recipePreview.recipeCost === 'number' && (
                            <> · est. cost {recipePreview.recipeCost.toFixed(2)}</>
                          )}
                        </span>
                      ) : (
                        <span className="text-amber-900">
                          No recipe configured for this dish
                          {selectedProduct.ptype === 'Variation' && selectedVariation
                            ? ` (${selectedVariation})`
                            : ''}
                          . Kitchen deductions may not run on sale.
                        </span>
                      )
                    ) : (
                      <span className="text-amber-900">Could not load recipe status.</span>
                    )}
                    {!recipePreviewLoading && (
                      <Link
                        to="/kitchen/recipes"
                        className="block mt-1 text-xs font-semibold text-[#003366] hover:underline"
                      >
                        Open recipe configuration
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Batch Selection */}
            {selectedProduct && selectedProduct.hasBatches && batches.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Batch <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedBatch || ''}
                  onChange={(e) => handleBatchSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]"
                >
                  <option value="">Select batch...</option>
                  {batches.map((batch, idx) => (
                    <option key={idx} value={batch.batchNumber}>
                      {batch.batchNumber} (Stock: {batch.productQty || 0})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Variation Selection */}
            {selectedProduct && selectedProduct.ptype === 'Variation' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Variation <span className="text-red-500">*</span>
                </label>
                {variations.length > 0 ? (
                  <select
                    value={selectedVariation || ''}
                    onChange={(e) => setSelectedVariation(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]"
                  >
                    <option value="">Select variation for {selectedProduct.name}...</option>
                    {variations.map((variation) => (
                      <option key={variation.name} value={variation.name}>
                        {variation.name} (Stock: {variation.data.productQty ?? 0}, Price: {variation.data.productPrice ?? 0})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    No variations found for this product in the selected warehouse. Add stock or variations in inventory.
                  </p>
                )}
              </div>
            )}

            {/* Product Details */}
            {selectedProduct && (
              <>
                {(selectedProduct.hasBatches ? selectedBatch !== null : true) &&
                 (selectedProduct.ptype === 'Variation' ? selectedVariation !== null : true) && (
                  <>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Stock Qty
                        </label>
                        <input
                          type="number"
                          value={stockQty}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Price
                        </label>
                        <input
                          type="number"
                          value={price}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Quantity <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQty(Math.max(1, qty - 1))}
                          className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={qty}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 1;
                            setQty(Math.max(1, Math.min(effectiveMaxQty, val)));
                          }}
                          min={1}
                          max={effectiveMaxQty === Number.MAX_SAFE_INTEGER ? undefined : effectiveMaxQty}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]"
                        />
                        <button
                          type="button"
                          onClick={() => setQty(Math.min(effectiveMaxQty, qty + 1))}
                          className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Discount <span className="text-gray-400 font-normal">(from product)</span>
                        </label>
                        <div className="flex gap-2 items-center px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800">
                          <span className="font-medium tabular-nums">{Number(discount).toFixed(2)}</span>
                          <span className="text-xs text-gray-500 uppercase">Fixed / unit</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Tax (%)
                        </label>
                        <input
                          type="number"
                          value={tax}
                          onChange={(e) => setTax(Math.max(0, parseFloat(e.target.value) || 0))}
                          min={0}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]"
                        />
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleAddProduct}
              disabled={
                !selectedProduct ||
                qty <= 0 ||
                (selectedProduct.isInventory !== false && qty > stockQty) ||
                (selectedProduct.hasBatches && selectedBatch === null) ||
                (selectedProduct.ptype === 'Variation' && selectedVariation === null)
              }
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#003366] text-base font-medium text-white hover:bg-[#004080] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Product
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductSelectionModal;

