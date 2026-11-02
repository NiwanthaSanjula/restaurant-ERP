import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Loader from '../common/Loader';
import { calculateProductSubtotal, calculateSaleTotals, calculateBalance, determinePaymentStatus } from '../../utils/saleCalculations';
import { getSaleById, updateSale } from '../../services/saleService';
import { toBusinessDateInputValue } from '../../utils/date';
import { showSuccessToast, showErrorToast } from '../../utils/toast';

interface SaleProduct {
  productId: string;
  productName: string;
  variation: string | null;
  batch: string | null;
  stockQtyAtSale: number;
  qty: number;
  price: number;
  discount: number;
  discountType: 'fixed' | 'percentage';
  tax: number;
  subtotal: number;
  cost: number;
}

interface Warehouse {
  _id: string;
  name: string;
  isActive: boolean;
}

interface Customer {
  _id: string;
  name: string;
  mobile: string;
}

interface ProductSearchOption {
  productId: string;
  productName: string;
  variation: string | null;
  stockQty: number;
  price: number;
  cost: number;
  tax: number;
  discount: number;
  discountType: 'fixed' | 'percentage';
  isWeight?: boolean;
  systemType?: 'retail' | 'restaurant';
}

const EditSale: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  
  const [loading, setLoading] = useState(false);
  const [loadingSale, setLoadingSale] = useState(true);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [businessType, setBusinessType] = useState<'retail' | 'restaurant'>('retail');
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productSearchOptions, setProductSearchOptions] = useState<ProductSearchOption[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [status, setStatus] = useState<'draft' | 'completed' | 'cancelled' | 'returned'>('draft');
  const [saleDiscountValue, setSaleDiscountValue] = useState<number>(0);
  const [saleDiscountType, setSaleDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [saleTaxValue, setSaleTaxValue] = useState<number>(0);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cardAmount, setCardAmount] = useState<number>(0);
  const [bankTransferAmount, setBankTransferAmount] = useState<number>(0);

  useEffect(() => {
    if (id) {
      fetchSale();
    }
    fetchWarehouses();
    fetchCustomers();
  }, [id]);

  useEffect(() => {
    if (customerSearch.trim().length > 0) {
      const timer = setTimeout(() => {
        searchCustomers();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setCustomers([]);
    }
  }, [customerSearch]);

  useEffect(() => {
    if (!selectedWarehouseId || productSearch.trim().length === 0) {
      setProductSearchOptions([]);
      return;
    }

    const timer = setTimeout(() => {
      searchProducts();
    }, 300);

    return () => clearTimeout(timer);
  }, [productSearch, selectedWarehouseId, businessType]);

  const fetchSale = async () => {
    if (!id) return;
    
    setLoadingSale(true);
    try {
      const result = await getSaleById(id);
      if (result.status === 'success' && result.data) {
        const sale = result.data;
        setSelectedWarehouseId(sale.warehouseId?._id || sale.warehouseId || '');
        setSelectedCustomerId(sale.customerId?._id || sale.customerId || '');
        if (sale.customerId) {
          setCustomerSearch(`${sale.customerId.name} - ${sale.customerId.mobile}`);
        }
        setDate(sale.date ? toBusinessDateInputValue(sale.date) : '');
        setBusinessType(sale.businessType);
        setStatus(sale.status);
        setProducts(sale.products || []);
        setSaleDiscountValue(sale.saleDiscountValue || 0);
        setSaleDiscountType(sale.saleDiscountType || 'fixed');
        setSaleTaxValue(sale.saleTaxValue || 0);
        setShippingCost(sale.shippingCost || 0);
        setCashAmount(sale.cashAmount || 0);
        setCardAmount(sale.cardAmount || 0);
        setBankTransferAmount(sale.bankTransferAmount || 0);
      }
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to fetch sale');
      navigate('/viewSales');
    } finally {
      setLoadingSale(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/warehouses`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setWarehouses(data.data);
      }
    } catch (e) {
      console.error('Failed to fetch warehouses:', e);
    }
  };

  const fetchCustomers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/customers`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setCustomers(data.data);
      }
    } catch (e) {
      console.error('Failed to fetch customers:', e);
    }
  };

  const searchCustomers = async () => {
    try {
      const token = localStorage.getItem('token');
      const searchParam = customerSearch ? `?q=${encodeURIComponent(customerSearch)}` : '';
      const res = await fetch(`${api}/customers${searchParam}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setCustomers(data.data);
      }
    } catch (e) {
      console.error('Failed to search customers:', e);
    }
  };

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomerId(customer._id);
    setCustomerSearch(`${customer.name} - ${customer.mobile}`);
    setCustomers([]);
  };

  const searchProducts = async () => {
    if (!selectedWarehouseId) return;

    setProductSearchLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.set('systemType', businessType);
      params.set('q', productSearch.trim());
      const res = await fetch(`${api}/products?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();

      if (!res.ok || !data.data) {
        setProductSearchOptions([]);
        return;
      }

      const options: ProductSearchOption[] = data.data.flatMap((p: any) => {
        const warehouseData = p.warehouse instanceof Map
          ? p.warehouse.get(selectedWarehouseId)
          : p.warehouse?.[selectedWarehouseId];
        if (!warehouseData) return [];

        if (p.ptype === 'Variation' && warehouseData.variationValues) {
          const variationValues = warehouseData.variationValues instanceof Map
            ? Array.from(warehouseData.variationValues.entries())
            : Object.entries(warehouseData.variationValues || {});
          return (variationValues as [string, any][]).map(([variationName, variationData]) => ({
            productId: p._id,
            productName: p.name,
            variation: variationName,
            stockQty: variationData?.productQty || 0,
            price: variationData?.productPrice || 0,
            cost: variationData?.productCost || 0,
            tax: variationData?.orderTax || 0,
            discount: typeof variationData?.discount === 'number' ? variationData.discount : 0,
            discountType: 'fixed' as const,
            isWeight: p.isWeight === true,
            systemType: p.systemType
          }));
        }

        return [{
          productId: p._id,
          productName: p.name,
          variation: null,
          stockQty: warehouseData.productQty || 0,
          price: warehouseData.productPrice || 0,
          cost: warehouseData.productCost || 0,
          tax: warehouseData.orderTax || 0,
          discount: typeof warehouseData.discount === 'number' ? warehouseData.discount : 0,
          discountType: 'fixed' as const,
          isWeight: p.isWeight === true,
          systemType: p.systemType
        }];
      });

      setProductSearchOptions(options);
    } catch (e) {
      console.error('Failed to search products:', e);
      setProductSearchOptions([]);
    } finally {
      setProductSearchLoading(false);
    }
  };

  const handleAddProductFromSearch = (option: ProductSearchOption) => {
    const duplicate = products.some(
      (p) =>
        p.productId === option.productId &&
        (p.variation || '') === (option.variation || '') &&
        (p.batch || '') === ''
    );

    if (duplicate) {
      showErrorToast(
        option.variation
          ? `This product variation "${option.productName} - ${option.variation}" is already added.`
          : `This product "${option.productName}" is already added.`
      );
      return;
    }

    const subtotal = calculateProductSubtotal(
      1,
      option.price,
      option.discount,
      option.discountType,
      option.tax
    );
    const newProduct: SaleProduct = {
      productId: option.productId,
      productName: option.productName,
      variation: option.variation,
      batch: null,
      stockQtyAtSale: option.stockQty,
      qty: 1,
      price: option.price,
      discount: option.discount,
      discountType: option.discountType,
      tax: option.tax,
      subtotal,
      cost: option.cost
    };

    setProducts((prev) => [...prev, newProduct]);
    setProductSearch('');
    setProductSearchOptions([]);
  };

  const handleRemoveProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  const handleUpdateProductQty = (index: number, newQty: number) => {
    const product = products[index];
    if (newQty > product.stockQtyAtSale) {
      showErrorToast(`Quantity cannot exceed stock quantity (${product.stockQtyAtSale})`);
      return;
    }
    
    const updatedProduct = {
      ...product,
      qty: newQty,
      subtotal: calculateProductSubtotal(
        newQty,
        product.price,
        product.discount,
        product.discountType,
        product.tax
      )
    };
    
    const updatedProducts = [...products];
    updatedProducts[index] = updatedProduct;
    setProducts(updatedProducts);
  };

  const handleUpdateProductTax = (index: number, tax: number) => {
    const product = products[index];
    const updatedProduct = {
      ...product,
      tax,
      subtotal: calculateProductSubtotal(
        product.qty,
        product.price,
        product.discount,
        product.discountType,
        tax
      )
    };
    
    const updatedProducts = [...products];
    updatedProducts[index] = updatedProduct;
    setProducts(updatedProducts);
  };

  // Calculate totals
  const { total, profit } = calculateSaleTotals(
    products,
    saleDiscountValue,
    saleDiscountType,
    saleTaxValue,
    shippingCost
  );

  const balance = calculateBalance(total, cashAmount, cardAmount, bankTransferAmount);
  const paymentStatus = determinePaymentStatus(total, cashAmount, cardAmount, bankTransferAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedWarehouseId) {
      showErrorToast('Please select a warehouse');
      return;
    }
    
    if (!selectedCustomerId) {
      showErrorToast('Please select a customer');
      return;
    }
    
    if (products.length === 0) {
      showErrorToast('Please add at least one product');
      return;
    }
    
    if (!id) return;
    
    setLoading(true);
    try {
      await updateSale(id, {
        warehouseId: selectedWarehouseId,
        customerId: selectedCustomerId,
        date,
        businessType,
        status,
        products: products.map(p => ({
          productId: p.productId,
          variation: p.variation,
          batch: p.batch,
          qty: p.qty,
          discount: p.discount,
          discountType: p.discountType,
          tax: p.tax
        })),
        saleDiscountValue,
        saleDiscountType,
        saleTaxValue,
        shippingCost,
        cashAmount,
        cardAmount,
        bankTransferAmount
      });
      
      showSuccessToast('Sale updated successfully');
      navigate('/viewSales');
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to update sale');
    } finally {
      setLoading(false);
    }
  };

  if (loadingSale) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader text="Loading sale..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      {loading && <Loader text="Updating sale..." />}
      
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/viewSales')}
            className="flex items-center justify-center w-10 h-10 text-[#1A3E73] hover:text-[#0F2A55] hover:bg-gray-100 rounded-lg transition"
            title="Go back to Sales"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-3xl font-bold text-[#1A3E73]">Edit Sale</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* Sale Info Section */}
          <div className="mb-8 border-b border-gray-200 pb-6">
            <h2 className="text-xl font-semibold text-[#1A3E73] mb-4">Sale Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Warehouse <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73]"
                >
                  <option value="">Select warehouse...</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse._id} value={warehouse._id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      if (!e.target.value) {
                        setSelectedCustomerId('');
                      }
                    }}
                    placeholder="Search customer by name or mobile..."
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73]"
                  />
                  {customers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {customers.map((customer) => (
                        <div
                          key={customer._id}
                          onClick={() => handleCustomerSelect(customer)}
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                        >
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-sm text-gray-500">{customer.mobile}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'draft' | 'completed' | 'cancelled' | 'returned')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73]"
                  disabled={status === 'returned'}
                >
                  <option value="draft">Draft</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  {status === 'returned' && <option value="returned">Returned</option>}
                </select>
                {status === 'draft' && (
                  <p className="mt-1 text-sm text-gray-500">
                    Draft sales won't update inventory. Complete the sale later to finalize.
                  </p>
                )}
                {status === 'returned' && (
                  <p className="mt-1 text-sm text-red-600">
                    This sale cannot be edited as it is returned.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Products Section */}
          <div className="mb-8 border-b border-gray-200 pb-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-[#1A3E73]">Products</h2>
            </div>

            <div className="mb-4 relative">
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search product by name or code..."
                disabled={!selectedWarehouseId}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73] disabled:bg-gray-100"
              />
              {productSearchLoading && (
                <div className="mt-2 text-sm text-gray-500">Searching products...</div>
              )}
              {!productSearchLoading && productSearchOptions.length > 0 && (
                <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {productSearchOptions.map((option, idx) => (
                    <button
                      key={`${option.productId}-${option.variation || 'single'}-${idx}`}
                      type="button"
                      onClick={() => handleAddProductFromSearch(option)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 border-gray-100"
                    >
                      <div className="font-medium text-gray-900">
                        {option.productName}
                        {option.variation ? ` - ${option.variation}` : ''}
                      </div>
                      <div className="text-xs text-gray-500">
                        Stock: {option.stockQty} | Price: {option.price.toFixed(2)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {products.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Variation</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tax</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Discount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {products.map((product, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.productName}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{product.stockQtyAtSale}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateProductQty(index, Math.max(1, product.qty - 1))}
                              className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={product.qty}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 1;
                                handleUpdateProductQty(index, Math.max(1, Math.min(product.stockQtyAtSale, val)));
                              }}
                              min={1}
                              max={product.stockQtyAtSale}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateProductQty(index, Math.min(product.stockQtyAtSale, product.qty + 1))}
                              className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {product.variation || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.price.toFixed(2)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <input
                            type="number"
                            value={product.tax}
                            onChange={(e) => handleUpdateProductTax(index, Math.max(0, parseFloat(e.target.value) || 0))}
                            min={0}
                            className="w-20 px-2 py-1 border border-gray-300 rounded"
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          <span className="tabular-nums font-medium">{product.discount.toFixed(2)}</span>
                          <span className="text-gray-400 text-xs ml-1">
                            {product.discountType === 'percentage' ? '%' : 'fixed'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {product.subtotal.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(index)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No products added. Search and select a product to add.
              </div>
            )}
          </div>

          {/* Sale-Level Discount, Tax, Shipping */}
          <div className="mb-8 border-b border-gray-200 pb-6">
            <h2 className="text-xl font-semibold text-[#1A3E73] mb-4">Sale-Level Adjustments</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sale Discount
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={saleDiscountValue}
                    onChange={(e) => setSaleDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                    min={0}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73]"
                  />
                  <select
                    value={saleDiscountType}
                    onChange={(e) => setSaleDiscountType(e.target.value as 'fixed' | 'percentage')}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73]"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="percentage">%</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sale Tax (%)
                </label>
                <input
                  type="number"
                  value={saleTaxValue}
                  onChange={(e) => setSaleTaxValue(Math.max(0, parseFloat(e.target.value) || 0))}
                  min={0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shipping Cost
                </label>
                <input
                  type="number"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(Math.max(0, parseFloat(e.target.value) || 0))}
                  min={0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73]"
                />
              </div>
            </div>
          </div>

          {/* Payment Section */}
          <div className="mb-8 border-b border-gray-200 pb-6">
            <h2 className="text-xl font-semibold text-[#1A3E73] mb-4">Payment</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cash Amount
                </label>
                <input
                  type="number"
                  value={cashAmount}
                  onChange={(e) => {
                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                    setCashAmount(val);
                  }}
                  min={0}
                  max={total}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Amount
                </label>
                <input
                  type="number"
                  value={cardAmount}
                  onChange={(e) => {
                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                    setCardAmount(val);
                  }}
                  min={0}
                  max={total}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bank Transfer Amount
                </label>
                <input
                  type="number"
                  value={bankTransferAmount}
                  onChange={(e) => {
                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                    setBankTransferAmount(val);
                  }}
                  min={0}
                  max={total}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A3E73] focus:border-[#1A3E73]"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Status
              </label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                <span className={`font-medium ${
                  paymentStatus === 'paid' ? 'text-green-600' :
                  paymentStatus === 'partial' ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Summary Section */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 pt-6 mt-8">
            <h2 className="text-xl font-semibold text-[#1A3E73] mb-4">Summary</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="text-sm text-[#64748B] mb-1">Total</div>
                <div className="text-2xl font-bold text-gray-900">{total.toFixed(2)}</div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="text-sm text-[#64748B] mb-1">Balance</div>
                <div className={`text-2xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {balance.toFixed(2)}
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="text-sm text-[#64748B] mb-1">Profit</div>
                <div className={`text-2xl font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {profit.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => navigate('/viewSales')}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-[#1A3E73] text-white rounded-lg hover:bg-[#0F2A55] font-medium transition"
              >
                Update Sale
              </button>
            </div>
          </div>
        </form>
      </div>

    </div>
  );
};

export default EditSale;

