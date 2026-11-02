//./POS_Frontend/src/components/transfers/CreateTransfer.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { getProducts } from '../../services/productService';
import { createTransfer } from '../../services/transferService';
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
  productData?: any; // Store full product for variation selection
}

const CreateTransfer: React.FC = () => {
  const { currencyCode } = useCurrency();
  const [date, setDate] = useState(toBusinessDateInputValue());
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [items, setItems] = useState<TransferItem[]>([]);
  const [notes, setNotes] = useState('');
  const [searchValue, setSearchValue] = useState('');
  
  const [warehouses, setWarehouses] = useState<{_id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const wData = await getWarehouses();
        setWarehouses(wData.data);
      } catch (e) {}
    };
    fetchData();
  }, []);

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
    for (const [key, wh] of warehouseEntries) {
      const whData = wh as any;
      if (whData && whData.warehouseName && 
          whData.warehouseName.toLowerCase().trim() === warehouseName.toLowerCase().trim()) {
        return whData;
      }
    }
    
    return null;
  };

  const getProductStock = (product: any, warehouseName: string, selectedVariation?: string | null) => {
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
    
    const warehouseName = warehouses.find(w => w._id === fromWarehouse)?.name || '';
    
    // Fetch full product data to ensure warehouse data is included
    let fullProduct = product;
    if (!product.warehouse || Object.keys(product.warehouse || {}).length === 0) {
      try {
        const { getProductById } = await import('../../services/productService');
        const productRes = await getProductById(product._id);
        fullProduct = productRes.data;
      } catch (e) {
        console.error('Failed to fetch full product:', e);
      }
    }
    
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

    // Validate all items before submit
    for (const item of items) {
      if (item.qty > item.availableStock) {
        showErrorToast(`Transfer quantity cannot exceed available stock. ${item.productName} has only ${item.availableStock} unit(s) available.`);
        return;
      }
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

      await createTransfer({ 
        date, 
        fromWarehouse, 
        toWarehouse, 
        fromWarehouseName: fromWhName,
        toWarehouseName: toWhName,
        items: itemsWithTotals, 
        notes,
        subtotal,
        tax: 0,
        discount: 0,
        shipping: 0,
        grandTotal: subtotal,
        status: 'Pending'
      });
      
      showSuccessToast('Transfer completed successfully');
      navigate('/transfers');
    } catch (e: any) {
      showErrorToast(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {loading && <Loader text="Processing..." />}
      
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-[#001F54]">New Stock Transfer</h1>
        <button onClick={() => navigate('/transfers')} className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors">Back</button>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Date *</label>
              <input type="date" className="w-full bg-gray-50 border-none rounded-xl px-4 py-4 text-gray-800" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">From Warehouse *</label>
              <select className="w-full bg-gray-50 border-none rounded-xl px-4 py-4 text-gray-800" value={fromWarehouse} onChange={(e) => setFromWarehouse(e.target.value)}>
                <option value="">Select source</option>
                {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">To Warehouse *</label>
              <select className="w-full bg-gray-50 border-none rounded-xl px-4 py-4 text-gray-800" value={toWarehouse} onChange={(e) => setToWarehouse(e.target.value)}>
                <option value="">Select destination</option>
                {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t border-gray-50 pt-6">
            <label className="text-xs font-bold text-gray-400 block mb-2">Add Product</label>
            {!fromWarehouse && (
              <div className="mb-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800 font-semibold">
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
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400">Product Name</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 text-center">Cost</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 text-center">Stock Qty</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 text-center">Transfer Qty</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 text-center">Variation</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 text-center">Subtotal</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item, index) => (
                    <tr key={`${item.productId}-${index}`} className={item.qty > item.availableStock ? 'bg-red-50' : ''}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">{item.productName}</td>
                      <td className="px-6 py-4 text-sm text-center text-gray-600">{currencyCode} {item.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${item.availableStock > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`} title={item.availableStock === 0 ? 'No stock available in source warehouse' : `${item.availableStock} units available`}>
                          {item.availableStock}
                        </span>
                        {item.availableStock === 0 && (
                          <p className="text-[10px] text-red-500 mt-1">No stock</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="number" 
                          min="1" 
                          max={item.availableStock}
                          className={`w-24 bg-gray-50 border rounded-lg px-3 py-2 text-sm text-center ${item.qty > item.availableStock ? 'border-red-500' : ''}`}
                          value={item.qty} 
                          onChange={(e) => updateItemQty(index, Number(e.target.value))}
                        />
                        {item.qty > item.availableStock && (
                          <p className="text-xs text-red-500 mt-1 text-center">Exceeds available stock</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {item.productData?.ptype === 'Variation' ? (
                          <select 
                            className="w-32 bg-gray-50 border rounded-lg px-2 py-1 text-xs"
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
                          <span className="text-xs text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-center font-bold text-gray-800">{currencyCode} {item.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right">
                        <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 transition-colors">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-gray-400 italic">No products added yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-gray-50 pt-6">
            <label className="text-xs font-bold text-gray-400 block mb-2">Notes</label>
            <textarea className="w-full bg-gray-50 border-none rounded-xl px-4 py-4 text-gray-800 min-h-[100px]" placeholder="Add any notes here..." value={notes} onChange={(e) => setNotes(e.target.value)}></textarea>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="submit" 
              disabled={loading || items.length === 0}
              className="bg-[#001F54] text-white px-10 py-4 rounded-xl font-bold hover:bg-[#002b7a] transition-all shadow-lg shadow-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Stock Transfer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTransfer;
