import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Loader from '../common/Loader';
import ProductSelectionModal from './ProductSelectionModal';
import {
  calculateProductSubtotal,
  calculateSaleTotals,
  calculateOverpaidBalance,
  determinePaymentStatus
} from '../../utils/saleCalculations';
import { createSale } from '../../services/saleService';
import { getQuotationById, updateQuotationStatus } from '../../services/quotationService';
import { toBusinessDateInputValue } from '../../utils/date';
import { showSuccessToast, showErrorToast } from '../../utils/toast';

interface SaleProduct {
  productId: string;
  productName: string;
  variation: string | null;
  batch: string | null;
  stockQtyAtSale: number;
  isWeight?: boolean;
  systemType?: 'retail' | 'restaurant';
  /** Prepared dish (POS product with isInventory false) */
  isInventory?: boolean;
  recipeIngredientCount?: number | null;
  recipeCost?: number | null;
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

const CreateSale: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const queryParams = new URLSearchParams(location.search);
  const quotationId = queryParams.get('quotationId');

  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [date, setDate] = useState<string>(toBusinessDateInputValue());
  const [businessType, setBusinessType] = useState<'retail' | 'restaurant'>('retail');
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [status, setStatus] = useState<'ordered' | 'pending' | 'completed'>('completed');
  const [saleDiscountValue, setSaleDiscountValue] = useState<number>(0);
  const [saleDiscountType, setSaleDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [saleTaxValue, setSaleTaxValue] = useState<number>(0);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cardAmount, setCardAmount] = useState<number>(0);
  const [bankTransferAmount, setBankTransferAmount] = useState<number>(0);

  useEffect(() => {
    fetchWarehouses();
    const storedBusinessType = localStorage.getItem('systemType') as
      | 'retail'
      | 'restaurant'
      | null;
    if (storedBusinessType) {
      setBusinessType(storedBusinessType);
    }
  }, []);

  useEffect(() => {
    setProducts((prev) => {
      const next = prev.filter((p) => p.systemType == null || p.systemType === businessType);
      if (next.length < prev.length) {
        showErrorToast(
          'Some products were removed because they do not match the sale type.'
        );
      }
      return next;
    });
  }, [businessType]);

  useEffect(() => {
    if (quotationId) {
      loadQuotationData(quotationId);
    }
  }, [quotationId]);

  const loadQuotationData = async (id: string) => {
    setLoading(true);
    try {
      const qtnRes = await getQuotationById(id);
      const qtn = qtnRes.data;

      // BUG-076: Guard against URL-bypass. The "Convert to Sale" button in
      // ViewQuotations is hidden for non-Approved statuses, but a user can
      // manually craft the URL (/createSale?quotationId=<id>) to bypass that.
      // Enforce the same rule here at the data-load level.
      if (qtn.status !== 'Approved') {
        const reason =
          qtn.status === 'Converted'
            ? 'This quotation has already been converted to a sale.'
            : qtn.status === 'Rejected'
            ? 'Rejected quotations cannot be converted to a sale.'
            : qtn.status === 'Expired'
            ? 'This quotation has expired and cannot be converted.'
            : `Only Approved quotations can be converted. Current status: ${qtn.status}.`;
        showErrorToast(reason);
        navigate('/quotations');
        return;
      }

      setSelectedWarehouseId(qtn.warehouseId);
      setSelectedCustomerId(qtn.customerId);
      setCustomerSearch(qtn.customerName || '');
      const token = localStorage.getItem('token');
      const whId = qtn.warehouseId;
      const discountFromProduct = (prod: any, variation: string | null) => {
        if (!prod?.warehouse) return { discount: 0, discountType: 'fixed' as const };
        const wh =
          prod.warehouse instanceof Map ? prod.warehouse.get(whId) : prod.warehouse[whId];
        if (!wh) return { discount: 0, discountType: 'fixed' as const };
        if (prod.ptype === 'Variation' && variation && wh.variationValues) {
          const vv =
            wh.variationValues instanceof Map
              ? wh.variationValues.get(variation)
              : wh.variationValues[variation];
          return {
            discount: Math.max(0, Number(vv?.discount) || 0),
            discountType: 'fixed' as const
          };
        }
        return {
          discount: Math.max(0, Number(wh.discount) || 0),
          discountType: 'fixed' as const
        };
      };

      const saleProducts = await Promise.all(
        qtn.items.map(async (item: any) => {
          try {
            const res = await fetch(`${api}/products/${item.productId}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            const prodData = await res.json();
            const prod = prodData.data;
            const variation = item.variation || null;
            const { discount: lineDiscount, discountType: lineDiscountType } = discountFromProduct(
              prod,
              variation
            );
            const subtotal = calculateProductSubtotal(
              item.qty,
              item.price,
              lineDiscount,
              lineDiscountType,
              item.tax
            );
            return {
              productId: item.productId,
              productName: item.productName,
              variation,
              batch: null,
              stockQtyAtSale: prod ? prod.stockQty : 0,
              isInventory: prod?.isInventory,
              qty: item.qty,
              price: item.price,
              discount: lineDiscount,
              discountType: lineDiscountType,
              tax: item.tax,
              subtotal,
              cost: prod ? prod.costPrice : 0
            };
          } catch {
            return {
              productId: item.productId,
              productName: item.productName,
              variation: item.variation || null,
              batch: null,
              stockQtyAtSale: 0,
              isInventory: undefined,
              qty: item.qty,
              price: item.price,
              discount: item.discount,
              discountType: item.discountType,
              tax: item.tax,
              subtotal: item.subtotal,
              cost: 0
            };
          }
        })
      );
      setProducts(saleProducts);
      setSaleDiscountValue(qtn.discountValue || 0);
      setSaleDiscountType(qtn.discountType || 'fixed');
      setSaleTaxValue(qtn.taxValue || 0);
      setShippingCost(qtn.shippingCost || 0);
    } catch {
      showErrorToast('Failed to load quotation data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (customerSearch.trim().length > 0) {
      const timer = setTimeout(() => {
        searchCustomers();
      }, 300);
      return () => clearTimeout(timer);
    }
    setCustomers([]);
  }, [customerSearch]);

  const fetchWarehouses = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/warehouses`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setWarehouses(data.data);
        const defaultWarehouse =
          data.data.find((w: Warehouse) => w.isActive) || data.data[0];
        if (defaultWarehouse) setSelectedWarehouseId(defaultWarehouse._id);
      }
    } catch (e) {
      console.error('Failed to fetch warehouses:', e);
    }
  };

  const searchCustomers = async () => {
    try {
      const token = localStorage.getItem('token');
      const searchParam = customerSearch
        ? `?q=${encodeURIComponent(customerSearch)}`
        : '';
      const res = await fetch(`${api}/customers${searchParam}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.data) setCustomers(data.data);
    } catch (e) {
      console.error('Failed to search customers:', e);
    }
  };

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomerId(customer._id);
    setCustomerSearch(`${customer.name} - ${customer.mobile}`);
    setCustomers([]);
  };

  const handleProductSelect = (productData: {
    productId: string;
    productName: string;
    variation: string | null;
    batch: string | null;
    qty: number;
    price: number;
    cost: number;
    stockQty: number;
    discount: number;
    discountType: 'fixed' | 'percentage';
    tax: number;
    isWeight?: boolean;
    systemType?: 'retail' | 'restaurant';
    isInventory?: boolean;
    recipeIngredientCount?: number | null;
    recipeCost?: number | null;
  }) => {
    const duplicate = products.some(
      (p) =>
        p.productId === productData.productId &&
        (p.variation || '') === (productData.variation || '') &&
        (p.batch || '') === (productData.batch || '')
    );

    if (duplicate) {
      showErrorToast(
        productData.variation
          ? `This product variation "${productData.productName} - ${productData.variation}" is already added.`
          : `This product "${productData.productName}" is already added.`
      );
      return;
    }

    const subtotal = calculateProductSubtotal(
      productData.qty,
      productData.price,
      productData.discount,
      productData.discountType,
      productData.tax
    );
    const newProduct: SaleProduct = {
      ...productData,
      stockQtyAtSale: productData.stockQty,
      subtotal,
      cost: productData.cost
    };
    setProducts((prev) => [...prev, newProduct]);
    setShowProductModal(false);
  };

  const handleRemoveProduct = (index: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const effectiveStock = (p: SaleProduct) =>
    p.isWeight ? p.stockQtyAtSale : Math.floor(p.stockQtyAtSale);

  const maxSaleQty = (p: SaleProduct) =>
    p.isInventory === false ? Number.MAX_SAFE_INTEGER : effectiveStock(p);

  const handleUpdateProductQty = (index: number, newQty: number) => {
    if (!Number.isFinite(newQty) || newQty <= 0) {
      showErrorToast('Quantity must be a finite number greater than 0');
      return;
    }
    setProducts((prev) => {
      const product = prev[index];
      const maxQty = maxSaleQty(product);
      if (newQty > maxQty) {
        showErrorToast(
          product.isInventory === false
            ? 'Invalid quantity'
            : `Quantity cannot exceed stock (${product.isWeight ? product.stockQtyAtSale : maxQty})`
        );
        return prev;
      }
      const updatedProduct: SaleProduct = {
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
      const next = [...prev];
      next[index] = updatedProduct;
      return next;
    });
  };

  const handleUpdateProductTax = (index: number, tax: number) => {
    setProducts((prev) => {
      const product = prev[index];
      const updatedProduct: SaleProduct = {
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
      const next = [...prev];
      next[index] = updatedProduct;
      return next;
    });
  };

  const { total, profit } = calculateSaleTotals(
    products,
    saleDiscountValue,
    saleDiscountType,
    saleTaxValue,
    shippingCost
  );
  const paymentStatus = determinePaymentStatus(
    total,
    cashAmount,
    cardAmount,
    bankTransferAmount
  );
  const balance = calculateOverpaidBalance(total, cashAmount, cardAmount, bankTransferAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;
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
    setLoading(true);
    try {
      await createSale({
        warehouseId: selectedWarehouseId,
        customerId: selectedCustomerId,
        date,
        businessType,
        status,
        saleType: 'non-pos',
        products: products.map((p) => ({
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
      if (quotationId) {
        try {
          await updateQuotationStatus(quotationId, 'Converted');
        } catch (err) {
          console.error('Failed to update quotation status:', err);
        }
      }
      showSuccessToast('Sale created successfully');
      if (quotationId) navigate('/quotations');
      else navigate('/viewSales');
    } catch (error: any) {
      showErrorToast(error.message || 'Failed to create sale');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas pb-32 xl:pb-12">
      {loading && <Loader text="Processing..." />}

      <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-10">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/viewSales')}
              className="w-12 h-12 flex items-center justify-center bg-surface border border-line text-primary hover:bg-surface-raised rounded-2xl transition-all active:scale-95"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="flex flex-col">
              <h1 className="text-3xl font-bold text-foreground tracking-tight">
                Create Sale
              </h1>
              <span className="text-[10px] font-black text-subtle uppercase tracking-widest mt-1">
                Transaction Portal
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col xl:flex-row gap-8 xl:items-start">
          <div className="flex-1 space-y-8 min-w-0">
            <div className="bg-surface rounded-[2.5rem] border border-line p-6 sm:p-10">
              <h3 className="text-xs font-black text-foreground uppercase tracking-widest mb-8 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-primary rounded-full" />
                Basic Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-subtle uppercase tracking-widest">
                    Warehouse <span className="text-danger">*</span>
                  </label>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    required
                    className="w-full h-14 px-5 border-2 border-line-strong rounded-2xl font-bold text-foreground focus:border-primary outline-none"
                  >
                    <option value="">Select Warehouse</option>
                    {warehouses.map((w) => (
                      <option key={w._id} value={w._id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-subtle uppercase tracking-widest">
                    Customer <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        if (!e.target.value) setSelectedCustomerId('');
                      }}
                      placeholder="Search..."
                      required
                      className="w-full h-14 px-5 border-2 border-line-strong rounded-2xl font-bold text-foreground focus:border-primary outline-none"
                    />
                    {customers.length > 0 && (
                      <div className="absolute z-50 w-full mt-2 bg-surface border border-line rounded-[1.5rem] shadow-elevated max-h-60 overflow-auto py-3">
                        {customers.map((c) => (
                          <div
                            key={c._id}
                            onClick={() => handleCustomerSelect(c)}
                            className="px-5 py-3 hover:bg-surface-raised cursor-pointer transition-colors"
                          >
                            <div className="font-bold text-foreground">{c.name}</div>
                            <div className="text-[10px] text-subtle font-bold">
                              {c.mobile}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-subtle uppercase tracking-widest">
                    Date <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full h-14 px-5 border-2 border-line-strong rounded-2xl font-bold text-foreground focus:border-primary outline-none"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-subtle uppercase tracking-widest">
                    Business Mode
                  </label>
                  <select
                    value={businessType}
                    onChange={(e) =>
                      setBusinessType(e.target.value as 'retail' | 'restaurant')
                    }
                    className="w-full h-14 px-5 border-2 border-line-strong rounded-2xl font-bold text-foreground focus:border-primary outline-none"
                  >
                    <option value="retail">Retail</option>
                    <option value="restaurant">Restaurant</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-subtle uppercase tracking-widest">
                    Order Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as 'ordered' | 'pending' | 'completed')
                    }
                    className="w-full h-14 px-5 border-2 border-line-strong rounded-2xl font-bold text-foreground focus:border-primary outline-none"
                  >
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="ordered">Ordered</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-[2.5rem] border border-line overflow-hidden">
              <div className="p-8 sm:p-10 border-b border-line flex flex-col sm:flex-row justify-between items-center gap-6">
                <h3 className="text-2xl font-black text-foreground">Products</h3>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedWarehouseId) {
                      showErrorToast('Select warehouse');
                      return;
                    }
                    setShowProductModal(true);
                  }}
                  className="w-full sm:w-auto px-8 py-4 bg-primary text-on-primary rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary-hover transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <Plus size={18} strokeWidth={3} /> Add Product
                </button>
              </div>
              {products.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[1000px]">
                    <thead className="bg-surface-raised text-[10px] font-black text-subtle uppercase tracking-widest border-b border-line">
                      <tr>
                        <th className="px-10 py-6">Product</th>
                        <th className="px-6 py-6 text-center">Stock</th>
                        <th className="px-6 py-6 text-center">Qty</th>
                        <th className="px-6 py-6 text-center">Variation</th>
                        <th className="px-6 py-6 text-right">Price</th>
                        <th className="px-6 py-6 text-right">Tax (%)</th>
                        <th className="px-6 py-6 text-right">Discount</th>
                        <th className="px-10 py-6 text-right">Subtotal</th>
                        <th className="px-10 py-6 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {products.map((product, index) => (
                        <tr key={index} className="hover:bg-surface-raised/50 transition-all">
                          <td className="p-6 font-bold text-foreground">
                            <div>{product.productName}</div>
                            {businessType === 'restaurant' &&
                              product.isInventory === false && (
                                <div className="mt-1 text-[10px] font-semibold text-warning normal-case">
                                  {product.recipeIngredientCount == null
                                    ? 'Recipe status unknown'
                                    : product.recipeIngredientCount > 0
                                      ? `Recipe: ${product.recipeIngredientCount} ingredient${
                                          product.recipeIngredientCount !== 1 ? 's' : ''
                                        }${
                                          typeof product.recipeCost === 'number'
                                            ? ` · ~${product.recipeCost.toFixed(2)} cost`
                                            : ''
                                        }`
                                      : 'No recipe configured'}
                                </div>
                              )}
                          </td>
                          <td className="p-6 text-center text-primary font-black">
                            {product.isWeight
                              ? Number(product.stockQtyAtSale).toFixed(2)
                              : Math.floor(product.stockQtyAtSale)}
                          </td>
                          <td className="p-6 text-center">
                            <input
                              type="number"
                              value={product.qty}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 1;
                                const maxQty = maxSaleQty(product);
                                handleUpdateProductQty(index, Math.max(1, Math.min(maxQty, val)));
                              }}
                              min={1}
                              max={
                                maxSaleQty(product) === Number.MAX_SAFE_INTEGER
                                  ? undefined
                                  : maxSaleQty(product)
                              }
                              className="w-20 p-2 border-2 border-line-strong rounded-xl text-center font-bold text-foreground focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="p-6 text-center text-muted font-medium">
                            {product.variation || '—'}
                          </td>
                          <td className="p-6 text-center font-black text-foreground">{product.price.toFixed(2)}</td>
                          <td className="p-6 text-center">
                            <input
                              type="number"
                              value={product.tax}
                              onChange={(e) =>
                                handleUpdateProductTax(index, Math.max(0, parseFloat(e.target.value) || 0))
                              }
                              min={0}
                              className="w-20 p-2 border-2 border-line-strong rounded-xl text-center font-bold text-foreground focus:outline-none focus:border-primary"
                            />
                          </td>
                          <td className="p-6 text-center">
                            <div className="inline-flex items-baseline gap-1 justify-center text-foreground font-bold tabular-nums">
                              <span>{product.discount.toFixed(2)}</span>
                              <span className="text-[10px] font-black text-subtle uppercase">
                                {product.discountType === 'percentage' ? '%' : 'fixed'}
                              </span>
                            </div>
                          </td>
                          <td className="p-6 text-right font-black text-primary">
                            {product.subtotal.toFixed(2)}
                          </td>
                          <td className="p-6 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveProduct(index)}
                              className="text-danger hover:text-danger transition"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-muted font-bold">
                  No products added. Click "Add Product" to start.
                </div>
              )}
          </div>

          {/* Discount, Tax, Shipping and Payment Fields */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-surface rounded-2xl border border-line p-6">
              <h3 className="text-lg font-black text-foreground mb-4">Discount & Tax</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Discount Type</label>
                    <select 
                      className="w-full p-3 border-2 border-line-strong rounded-xl font-bold text-foreground focus:outline-none focus:border-primary"
                      value={saleDiscountType} 
                      onChange={(e) => setSaleDiscountType(e.target.value as 'fixed' | 'percentage')}
                    >
                      <option value="fixed">Fixed</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">
                      Discount {saleDiscountType === 'percentage' && '(%)'}
                    </label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      max={saleDiscountType === 'percentage' ? 100 : undefined}
                      className="w-full p-3 border-2 border-line-strong rounded-xl font-bold text-foreground focus:outline-none focus:border-primary"
                      value={saleDiscountValue || ''} 
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const maxVal = saleDiscountType === 'percentage' ? 100 : undefined;
                        setSaleDiscountValue(maxVal ? Math.min(val, maxVal) : Math.max(0, val));
                      }} 
                      placeholder={saleDiscountType === 'percentage' ? '0-100' : '0.00'}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Tax (%)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      max={100}
                      className="w-full p-3 border-2 border-line-strong rounded-xl font-bold text-foreground focus:outline-none focus:border-primary"
                      value={saleTaxValue || ''} 
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setSaleTaxValue(Math.min(val, 100));
                      }} 
                      placeholder="0-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Shipping Cost</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0"
                      className="w-full p-3 border-2 border-line-strong rounded-xl font-bold text-foreground focus:outline-none focus:border-primary"
                      value={shippingCost || ''} 
                      onChange={(e) => setShippingCost(Math.max(0, parseFloat(e.target.value) || 0))} 
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-2xl border border-line p-6">
              <h3 className="text-lg font-black text-foreground mb-4">Payment Information</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Cash Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cashAmount || ''}
                      onChange={(e) => setCashAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full p-3 border-2 border-line-strong rounded-xl font-bold text-foreground focus:outline-none focus:border-primary"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Card Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cardAmount || ''}
                      onChange={(e) => setCardAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full p-3 border-2 border-line-strong rounded-xl font-bold text-foreground focus:outline-none focus:border-primary"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Bank Transfer Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bankTransferAmount || ''}
                      onChange={(e) => setBankTransferAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full p-3 border-2 border-line-strong rounded-xl font-bold text-foreground focus:outline-none focus:border-primary"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Balance</label>
                  <div className="px-4 py-3 bg-surface-raised border-2 border-line-strong rounded-xl font-bold text-foreground">
                    {balance.toFixed(2)}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-black text-muted uppercase tracking-widest mb-2 block">Payment Status</label>
                  <div className="px-4 py-3 bg-surface-raised border-2 border-line-strong rounded-xl">
                    <span className={`font-bold text-lg ${
                      paymentStatus === 'paid' ? 'text-secondary' :
                      paymentStatus === 'partial' ? 'text-warning' :
                      'text-danger'
                    }`}>
                      {paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer / Summary */}
          <div className="mt-8 flex justify-end">
            <div className="bg-primary p-8 rounded-2xl w-full md:w-1/3 text-on-primary shadow-elevated">
              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center">
                  <span className="opacity-60 text-xs font-bold uppercase tracking-widest">Total</span>
                  <span className="text-lg font-black">{total.toFixed(2)}</span>
                </div>
                {balance > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="opacity-60 text-xs font-bold uppercase tracking-widest">Balance</span>
                    <span className="text-lg font-black">{balance.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-line/20 pt-3 flex justify-between items-center">
                  <span className="opacity-60 text-xs font-bold uppercase tracking-widest">Profit</span>
                  <span className={`text-2xl font-black ${profit >= 0 ? 'text-secondary' : 'text-danger'}`}>
                    {profit.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  type="submit"
                  className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all ${
                    status === 'completed'
                      ? 'bg-secondary hover:bg-secondary-hover text-on-secondary'
                      : 'bg-primary hover:bg-primary-hover text-on-primary'
                  }`}
                >
                  Create Sale
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/viewSales')}
                  className="w-full py-3 bg-surface-muted text-foreground rounded-2xl font-bold hover:bg-surface-muted transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
        </form>
      </div>

      {/* Product Selection Modal */}
      {showProductModal && (
        <ProductSelectionModal
          isOpen={showProductModal}
          onClose={() => setShowProductModal(false)}
          onSelect={handleProductSelect}
          warehouseId={selectedWarehouseId}
          businessType={businessType}
        />
      )}
    </div>
  );
};

export default CreateSale;

