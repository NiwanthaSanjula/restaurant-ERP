//./POS_Frontend/src/components/transfers/EditTransfer.ts
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { getProducts } from '../../services/productService';
import { getTransferById, updateTransfer } from '../../services/transferService';
import { getWarehouses } from '../../services/warehouseService';
import { toBusinessDateInputValue } from '../../utils/date';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import Loader from '../common/Loader';
import SearchableDropdown from '../common/SearchableDropdown';

interface TransferItem {
  productId: string;
  productName: string;
  qty: number;
  cost: number;
  subtotal: number;
  availableStock: number;
  variation?: string | null;
  productData?: any;
}

const EditTransfer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currencyCode } = useCurrency();
  const [date, setDate] = useState('');
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [items, setItems] = useState<TransferItem[]>([]);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('Pending');
  const [searchValue, setSearchValue] = useState('');
  
  const [warehouses, setWarehouses] = useState<{_id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  const getWarehouseData = (product: any, warehouseName: string) => {
    if (!product || !product.warehouse || !warehouseName) return null;
    
    const warehouseObj = product.warehouse;
    const warehouseEntries = Object.entries(warehouseObj);
    
    // 1. Try exact match by key (ID or Name)
    if (warehouseObj[warehouseName]) return warehouseObj[warehouseName];
    
    // 2. Try case-insensitive match by key
    const matchedKey = Object.keys(warehouseObj).find(key => 
      key.toLowerCase().trim() === warehouseName.toLowerCase().trim()
    );
    if (matchedKey) return warehouseObj[matchedKey];
    
    // 3. Try matching by warehouseName property inside the object
    for (const [, wh] of warehouseEntries) {
      const whData = wh as any;
      if (whData && whData.warehouseName && 
          whData.warehouseName.toLowerCase().trim() === warehouseName.toLowerCase().trim()) {
        return whData;
      }
    }
    
    return null;
  };

  const getProductStock = (product: any, warehouseName: string, selectedVariation?: string | null): number => {
    const warehouse = getWarehouseData(product, warehouseName);
    if (!warehouse) return 0;

    if (selectedVariation && warehouse.variationValues?.[selectedVariation]) {
      return warehouse.variationValues[selectedVariation].productQty || 0;
    }

    return warehouse.productQty ?? warehouse.qty ?? warehouse.quantity ?? 0;
  };

  const getProductCost = (product: any, warehouseName: string, selectedVariation?: string | null): number => {
    const warehouse = getWarehouseData(product, warehouseName);
    if (!warehouse) return product?.cost || product?.productCost || 0;

    if (selectedVariation && warehouse.variationValues?.[selectedVariation]) {
      return warehouse.variationValues[selectedVariation].productCost || 0;
    }

    return warehouse.productCost || product?.cost || product?.productCost || 0;
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [wData, pData, tData] = await Promise.all([
          getWarehouses(),
          getProducts(),
          getTransferById(id!)
        ]);
        
        setWarehouses(wData.data);
        
        const trans = tData.data;
        setDate(toBusinessDateInputValue(trans.date));
        const fromWhId = trans.fromWarehouse?._id || trans.fromWarehouse || '';
        const toWhId = trans.toWarehouse?._id || trans.toWarehouse || '';
        setFromWarehouse(fromWhId);
        setToWarehouse(toWhId);
        
        // Enrich items with product data and available stock
        const fromWhName = wData.data.find((w: {_id: string, name: string}) => w._id === fromWhId)?.name || '';
        const enrichedItems = await Promise.all((trans.items || []).map(async (item: any) => {
          let product = pData.data.find((p: any) => p._id === item.productId);
          
          // If product found but missing warehouse data, fetch it
          if (product && (!product.warehouse || Object.keys(product.warehouse).length === 0)) {
            try {
              const { getProductById } = await import('../../services/productService');
              const res = await getProductById(product._id);
              product = res.data;
            } catch (e) {}
          }

          const availableStock = product ? getProductStock(product, fromWhName, item.variation) : 0;
          const cost = product ? getProductCost(product, fromWhName, item.variation) : (item.cost || 0);
          return {
            ...item,
            cost,
            subtotal: cost * (item.qty || 1),
            availableStock,
            productData: product
          };
        }));
        setItems(enrichedItems);
        setNotes(trans.notes || '');
        setStatus(trans.status || 'Pending');
      } catch (e: any) {
        showErrorToast(e.message || 'Failed to fetch details');
        navigate('/transfers');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, navigate]);

  // Recalculate available stock when warehouse changes
  useEffect(() => {
    if (!fromWarehouse || items.length === 0) return;
    const warehouseName = warehouses.find(w => w._id === fromWarehouse)?.name || '';
    const updatedItems = items.map(item => {
      if (item.productData) {
        const newStock = getProductStock(item.productData, warehouseName, item.variation);
        const newCost = getProductCost(item.productData, warehouseName, item.variation);
        return { 
          ...item, 
          availableStock: newStock,
          cost: newCost,
          subtotal: newCost * item.qty
        };
      }
      return item;
    });
    setItems(updatedItems);
  }, [fromWarehouse]);

  const handleProductSearch = async (query: string) => {
    try {
      const res = await getProducts({ q: query });
      return res.data || [];
    } catch (e) {
      return [];
    }
  };

  const handleProductSelect = async (product: any) => {
    // Clear search bar immediately to fulfill requirement
    setSearchValue('');
    
    if (!product) {
      return; // No product selected
    }
    
    if (!fromWarehouse) {
      showErrorToast('Please select "From Warehouse" first before adding products');
      return;
    }
    
    if (items.some(item => item.productId === product._id)) {
      showErrorToast('Product already added to transfer list');
      return;
    }
    
    let fullProduct = product;
    if (!product.warehouse || Object.keys(product.warehouse || {}).length === 0) {
      try {
        const { getProductById } = await import('../../services/productService');
        const productRes = await getProductById(product._id);
        fullProduct = productRes.data;
      } catch (e) {}
    }

    const warehouseName = warehouses.find(w => w._id === fromWarehouse)?.name || '';
    const availableStock = getProductStock(fullProduct, warehouseName);
    const cost = getProductCost(fullProduct, warehouseName);
    
    setItems([...items, { 
      productId: fullProduct._id, 
      productName: fullProduct.name, 
      qty: 1, 
      cost, 
      subtotal: cost * 1,
      availableStock,
      variation: fullProduct.ptype === 'Variation' ? null : undefined,
      productData: fullProduct
    }]);
    
    // Reset search value to clear the input in SearchableDropdown
    setSearchValue('');
    
    showSuccessToast(`${fullProduct.name} added successfully`);
  };

  const updateItemQty = (index: number, qty: number) => {
    const newItems = [...items];
    const numQty = Math.max(1, qty);
    const item = newItems[index];
    
    // Validate: transfer quantity cannot exceed available stock
    if (numQty > item.availableStock) {
      showErrorToast(`Transfer quantity cannot exceed available stock. ${item.productName} has only ${item.availableStock} unit(s) available.`);
      return;
    }
    
    item.qty = numQty;
    item.subtotal = item.cost * numQty;
    setItems(newItems);
  };

  const updateItemVariation = (index: number, variation: string | null) => {
    const newItems = [...items];
    const item = newItems[index];
    const warehouseName = warehouses.find(w => w._id === fromWarehouse)?.name || '';
    
    item.variation = variation;
    
    // Recalculate stock and cost for the selected variation
    if (item.productData) {
      const newStock = getProductStock(item.productData, warehouseName, variation);
      const newCost = getProductCost(item.productData, warehouseName, variation);
      
      item.availableStock = newStock;
      item.cost = newCost;
      item.subtotal = newCost * item.qty;
    }
    
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromWarehouse || !toWarehouse || items.length === 0) {
      showErrorToast('Please fill all required fields and add at least one item');
      return;
    }
    if (fromWarehouse === toWarehouse) {
      showErrorToast('Source and destination warehouses must be different');
      return;
    }

    // Validate items: stock check only when status stays Pending (when completing, backend validates)
    if (status !== 'Completed') {
      for (const item of items) {
        if (item.qty > item.availableStock) {
          showErrorToast(`Transfer quantity cannot exceed available stock. ${item.productName} has only ${item.availableStock} unit(s) available.`);
          return;
        }
      }
    }
    for (const item of items) {
      if (item.productData?.ptype === 'Variation' && !item.variation) {
        showErrorToast(`Please select a variation for ${item.productName}`);
        return;
      }
    }

    setLoading(true);
    try {
      const fromWhName = warehouses.find(w => w._id === fromWarehouse)?.name;
      const toWhName = warehouses.find(w => w._id === toWarehouse)?.name;
      const itemsWithTotals = items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        qty: item.qty,
        cost: item.cost,
        subtotal: item.subtotal,
        variation: item.variation
      }));
      const subtotal = itemsWithTotals.reduce((sum, i) => sum + i.subtotal, 0);

      await updateTransfer(id!, { 
        date, 
        fromWarehouse, 
        toWarehouse, 
        fromWarehouseName: fromWhName,
        toWarehouseName: toWhName,
        items: itemsWithTotals, 
        notes,
        status: status as any,
        subtotal,
        tax: 0,
        discount: 0,
        shipping: 0,
        grandTotal: subtotal
      });
      
      showSuccessToast('Transfer updated successfully');
      navigate('/transfers');
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {loading && <Loader text="Updating..." />}
      
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-foreground">Edit Stock Transfer</h1>
        <button onClick={() => navigate('/transfers')} className="bg-surface-muted text-foreground px-6 py-2 rounded-lg font-semibold hover:bg-surface-muted transition-colors">Back</button>
      </div>

      <div className="bg-surface p-8 rounded-3xl border border-line">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <label className="text-xs font-bold text-subtle block mb-2">Date *</label>
              <input type="date" className="w-full bg-surface-raised border-none rounded-xl px-4 py-4 text-foreground" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold text-subtle block mb-2">From Warehouse *</label>
              <select className="w-full bg-surface-raised border-none rounded-xl px-4 py-4 text-foreground" value={fromWarehouse} onChange={(e) => setFromWarehouse(e.target.value)}>
                <option value="">Select source</option>
                {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-subtle block mb-2">To Warehouse *</label>
              <select className="w-full bg-surface-raised border-none rounded-xl px-4 py-4 text-foreground" value={toWarehouse} onChange={(e) => setToWarehouse(e.target.value)}>
                <option value="">Select destination</option>
                {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-subtle block mb-2">Status *</label>
              <select 
                className="w-full bg-surface-raised border-none rounded-xl px-4 py-4 text-foreground"
                value={status} 
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Approved">Approved</option>
              </select>
            </div>
          </div>

          <div className="border-t border-line pt-6">
            <label className="text-xs font-bold text-subtle block mb-2">Add Product</label>
            {!fromWarehouse && (
              <div className="mb-2 p-3 bg-warning-soft border border-warning-line rounded-lg">
                <p className="text-xs text-warning font-semibold">
                  ⚠️ Please select "From Warehouse" first, then search and click on a product from the dropdown to add it.
                </p>
              </div>
            )}
            <div className="mb-6">
              <SearchableDropdown 
                value={searchValue}
                onChange={handleProductSelect}
                onSearch={handleProductSearch}
                placeholder={fromWarehouse ? "Type product name and click from dropdown..." : "⚠️ Select 'From Warehouse' first"}
                clearOnSelect={true}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-raised border-b border-line">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-bold text-subtle">Product Name</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-subtle text-center">Cost</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-subtle text-center">Stock Qty</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-subtle text-center">Transfer Qty</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-subtle text-center">Variation</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-subtle text-center">Subtotal</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-subtle text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((item, index) => (
                    <tr key={`${item.productId}-${index}`} className={item.qty > item.availableStock ? 'bg-danger-soft' : ''}>
                      <td className="px-6 py-4 text-sm font-medium text-foreground">{item.productName}</td>
                      <td className="px-6 py-4 text-sm text-center text-muted">{currencyCode} {item.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${item.availableStock > 0 ? 'bg-secondary-soft text-secondary' : 'bg-danger-soft text-danger'}`} title={item.availableStock === 0 ? 'No stock available in source warehouse' : `${item.availableStock} units available`}>
                          {item.availableStock}
                        </span>
                        {item.availableStock === 0 && (
                          <p className="text-[10px] text-danger mt-1">No stock</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="number" 
                          min="1" 
                          max={item.availableStock}
                          className={`w-24 bg-surface-raised border rounded-lg px-3 py-2 text-sm text-center ${item.qty > item.availableStock ? 'border-danger-line' : ''}`}
                          value={item.qty} 
                          onChange={(e) => updateItemQty(index, Number(e.target.value))}
                        />
                        {item.qty > item.availableStock && (
                          <p className="text-xs text-danger mt-1 text-center">Exceeds available stock</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {item.productData?.ptype === 'Variation' ? (
                          <select 
                            className="w-32 bg-surface-raised border rounded-lg px-2 py-1 text-xs"
                            value={item.variation || ''}
                            onChange={(e) => updateItemVariation(index, e.target.value || null)}
                          >
                            <option value="">Select variation</option>
                            {(() => {
                              const whName = warehouses.find(w => w._id === fromWarehouse)?.name || '';
                              const whData = getWarehouseData(item.productData, whName);
                              const variations = whData?.variationValues ? Object.keys(whData.variationValues) : [];
                              return variations.map((varKey) => (
                                <option key={varKey} value={varKey}>{varKey}</option>
                              ));
                            })()}
                          </select>
                        ) : (
                          <span className="text-xs text-subtle">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-center font-bold text-foreground">{currencyCode} {item.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right">
                        <button type="button" onClick={() => removeItem(index)} className="text-danger hover:text-danger transition-colors">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-subtle italic">No products added yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-line pt-6">
            <label className="text-xs font-bold text-subtle block mb-2">Notes</label>
            <textarea className="w-full bg-canvas border-none rounded-xl px-4 py-4 text-foreground min-h-[100px]" placeholder="Add any notes here..." value={notes} onChange={(e) => setNotes(e.target.value)}></textarea>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="submit" 
              disabled={loading || items.length === 0}
              className="bg-primary text-on-primary px-10 py-4 rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Update Stock Transfer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditTransfer;
