import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import DeleteConfirmModal from '../common/DeleteConfirmModal';
import Loader from '../common/Loader';
import PermissionGate from '../common/PermissionGate';
import SearchBar from '../common/SearchBar';
import { formatDate } from '../../utils/date.ts';

type ProductRow = { 
  id: string; 
  name: string; 
  code: string;
  brand?: string;
  category: string;
  image?: string;
  unit: string;
  saleUnit: string;
  ptype: 'Single' | 'Variation';
  status: 'Pending' | 'Active' | 'Inactive';
  createdAt: string;
  warehouse?: any;
  price?: number;
  inStock?: number;
  /** false / undefined = prepared (POS) product — eligible for recipes */
  isInventory?: boolean;
};

type ProductDetails = {
  _id: string;
  name: string;
  code: string;
  brand?: string;
  category: string;
  image?: string;
  unit: string;
  baseUnit?: string;
  saleUnit?: string;
  purchase?: string;
  supplier?: string;
  ptype: 'Single' | 'Variation';
  variation?: string;
  status: string;
  note?: string;
  warehouse?: any;
  hasBatches?: boolean;
  isWeight?: boolean;
  isInventory?: boolean;
  barcodeType?: string;
  isWholesale?: boolean;
  wholesalePrice?: number;
  wholesaleQuantity?: number;
  warranty?: string;
  createdAt: string;
  updatedAt: string;
};

const ViewProducts: React.FC = () => {
  const { currencyCode } = useCurrency();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [viewingProduct, setViewingProduct] = useState<ProductDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const navigate = useNavigate();
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  const productTableHeaders = [
    'Product',
    'Price',
    'Unit',
    'In Stock',
    'Created On',
    'Action',
  ];
  const tableColumnCount = productTableHeaders.length;

  // Helper function to extract all prices from warehouse data (including variations and batches)
  const extractAllPrices = (warehouse: any): number[] => {
    const prices: number[] = [];
    if (!warehouse) return prices;
    
    const warehouses = warehouse instanceof Map ? Array.from(warehouse.entries()) : Object.entries(warehouse);
    
    warehouses.forEach(([_, whData]: [string, any]) => {
      // Check if product has batches
      if (whData.batches && Array.isArray(whData.batches) && whData.batches.length > 0) {
        whData.batches.forEach((batch: any) => {
          // For variation products with batches
          if (batch.variationValues) {
            const variationValues = batch.variationValues instanceof Map
              ? Object.fromEntries(batch.variationValues)
              : batch.variationValues;
            Object.values(variationValues || {}).forEach((varVal: any) => {
              if (varVal.productPrice !== undefined && varVal.productPrice !== null) {
                prices.push(Number(varVal.productPrice));
              }
            });
          } else {
            // For single products with batches
            if (batch.productPrice !== undefined && batch.productPrice !== null) {
              prices.push(Number(batch.productPrice));
            }
          }
        });
      } else {
        // Product without batches
        // Check if it has variations
        if (whData.variationValues) {
          const variationValues = whData.variationValues instanceof Map
            ? Object.fromEntries(whData.variationValues)
            : whData.variationValues;
          Object.values(variationValues || {}).forEach((varVal: any) => {
            if (varVal.productPrice !== undefined && varVal.productPrice !== null) {
              prices.push(Number(varVal.productPrice));
            }
          });
        } else {
          // Single product without batches
          if (whData.productPrice !== undefined && whData.productPrice !== null) {
            prices.push(Number(whData.productPrice));
          }
        }
      }
    });
    
    return prices;
  };

  // Helper function to extract all quantities from warehouse data
  const extractAllQuantities = (warehouse: any): number[] => {
    const quantities: number[] = [];
    if (!warehouse) return quantities;
    
    const warehouses = warehouse instanceof Map ? Array.from(warehouse.entries()) : Object.entries(warehouse);
    
    warehouses.forEach(([_, whData]: [string, any]) => {
      // Check if product has batches
      if (whData.batches && Array.isArray(whData.batches) && whData.batches.length > 0) {
        whData.batches.forEach((batch: any) => {
          // For variation products with batches
          if (batch.variationValues) {
            const variationValues = batch.variationValues instanceof Map
              ? Object.fromEntries(batch.variationValues)
              : batch.variationValues;
            Object.values(variationValues || {}).forEach((varVal: any) => {
              if (varVal.productQty !== undefined && varVal.productQty !== null) {
                quantities.push(Number(varVal.productQty));
              }
            });
          } else {
            // For single products with batches
            if (batch.productQty !== undefined && batch.productQty !== null) {
              quantities.push(Number(batch.productQty));
            }
          }
        });
      } else {
        // Product without batches
        // Check if it has variations
        if (whData.variationValues) {
          const variationValues = whData.variationValues instanceof Map
            ? Object.fromEntries(whData.variationValues)
            : whData.variationValues;
          Object.values(variationValues || {}).forEach((varVal: any) => {
            if (varVal.productQty !== undefined && varVal.productQty !== null) {
              quantities.push(Number(varVal.productQty));
            }
          });
        } else {
          // Single product without batches
          if (whData.productQty !== undefined && whData.productQty !== null) {
            quantities.push(Number(whData.productQty));
          }
        }
      }
    });
    
    return quantities;
  };

  // Helper function to extract all stock alerts from warehouse data
  const extractAllStockAlerts = (warehouse: any): number[] => {
    const stockAlerts: number[] = [];
    if (!warehouse) return stockAlerts;
    
    const warehouses = warehouse instanceof Map ? Array.from(warehouse.entries()) : Object.entries(warehouse);
    
    warehouses.forEach(([_, whData]: [string, any]) => {
      // Check if product has batches
      if (whData.batches && Array.isArray(whData.batches) && whData.batches.length > 0) {
        whData.batches.forEach((batch: any) => {
          // For variation products with batches
          if (batch.variationValues) {
            const variationValues = batch.variationValues instanceof Map
              ? Object.fromEntries(batch.variationValues)
              : batch.variationValues;
            Object.values(variationValues || {}).forEach((varVal: any) => {
              if (varVal.stockAlert !== undefined && varVal.stockAlert !== null) {
                stockAlerts.push(Number(varVal.stockAlert));
              }
            });
          } else {
            // For single products with batches
            if (batch.stockAlert !== undefined && batch.stockAlert !== null) {
              stockAlerts.push(Number(batch.stockAlert));
            }
          }
        });
      } else {
        // Product without batches
        // Check if it has variations
        if (whData.variationValues) {
          const variationValues = whData.variationValues instanceof Map
            ? Object.fromEntries(whData.variationValues)
            : whData.variationValues;
          Object.values(variationValues || {}).forEach((varVal: any) => {
            if (varVal.stockAlert !== undefined && varVal.stockAlert !== null) {
              stockAlerts.push(Number(varVal.stockAlert));
            }
          });
        } else {
          // Single product without batches
          if (whData.stockAlert !== undefined && whData.stockAlert !== null) {
            stockAlerts.push(Number(whData.stockAlert));
          }
        }
      }
    });
    
    return stockAlerts;
  };


  const calculatePrice = (warehouse: any): number => {
    const prices = extractAllPrices(warehouse);
    if (prices.length === 0) return 0;
    return Math.min(...prices);
  };

  const calculateStock = (warehouse: any): number => {
    const quantities = extractAllQuantities(warehouse);
    return quantities.reduce((sum, qty) => sum + qty, 0);
  };

  // Calculate total stock alert
  const calculateTotalStockAlert = (warehouse: any): number => {
    const stockAlerts = extractAllStockAlerts(warehouse);
    return stockAlerts.reduce((sum, alert) => sum + alert, 0);
  };

  const escapeRegExp = (value: string): string => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const highlightText = (value: string, query: string): React.ReactNode => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return value;

    const terms = trimmedQuery
      .split(/\s+/)
      .filter(Boolean)
      .map(escapeRegExp);

    if (terms.length === 0) return value;

    const regex = new RegExp(`(${terms.join('|')})`, 'gi');
    const parts = value.split(regex);

    return parts.map((part, idx) =>
      regex.test(part) ? (
        <span key={idx} className="bg-yellow-100 text-yellow-900 rounded-sm px-0.5">
          {part}
        </span>
      ) : (
        <span key={idx}>{part}</span>
      )
    );
  };

  const fetchProducts = async (searchQuery: string = '') => {
    const token = localStorage.getItem('token');
    if (!token) {
      showErrorToast('Session expired. Please log in again.');
      return;
    }
    setLoading(true);
    try {
      const searchParam = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
      const url = `${api}/products${searchParam}`;
      console.log(`[ViewProducts] Fetching from URL: ${url}`);
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log(`[ViewProducts] Response status: ${res.status}, ok: ${res.ok}`);
      
      const data = await res.json();
      console.log(`[ViewProducts] Response data:`, data);
      
      if (!res.ok) {
        const errorMessage = data?.message || 'Failed to load products';
        console.error(`[ViewProducts] API error:`, errorMessage);
        showErrorToast(errorMessage);
        setProducts([]);
        return;
      }
      
      const rawProducts: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.products)
            ? data.products
            : [];
      
      console.log(`[ViewProducts] Received ${rawProducts.length} products`);
      console.log(`[ViewProducts] API Response:`, data);
      console.log(`[ViewProducts] Sample product:`, rawProducts[0]);
      
      if (!rawProducts || !Array.isArray(rawProducts)) {
        console.error(`[ViewProducts] Invalid API response structure:`, data);
        showErrorToast('Invalid response from server');
        setProducts([]);
        return;
      }
      
      const rows: ProductRow[] = rawProducts.map((p: any) => {
        try {
          const price = calculatePrice(p.warehouse);
          const inStock = calculateStock(p.warehouse);
          return {
            id: p._id, 
            name: p.name, 
            code: p.code,
            brand: p.brand,
            category: p.category,
            image: p.image,
            unit: p.unit,
            saleUnit: p.saleUnit,
            ptype: p.ptype,
            status: p.status,
            createdAt: p.createdAt,
            warehouse: p.warehouse,
            price,
            inStock,
            isInventory: p.isInventory
          };
        } catch (error) {
          console.error(`[ViewProducts] Error processing product ${p.name}:`, error);
          // Return product anyway, with default values
          return {
            id: p._id, 
            name: p.name, 
            code: p.code,
            brand: p.brand,
            category: p.category,
            image: p.image,
            unit: p.unit,
            saleUnit: p.saleUnit,
            ptype: p.ptype,
            status: p.status,
            createdAt: p.createdAt,
            warehouse: p.warehouse,
            price: 0,
            inStock: 0,
            isInventory: p.isInventory
          };
        }
      });
      console.log(`[ViewProducts] Processed ${rows.length} products`);
      setProducts(rows);
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchProductDetails = async (productId: string) => {
    setLoadingDetails(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${api}/products/${productId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      
      if (!res.ok) {
        showErrorToast(data?.message || 'Failed to load product details');
        return;
      }
      
      setViewingProduct(data.data);
    } catch (e) {
      showErrorToast((e as Error).message || 'Network error occurred');
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => { 
    console.log(`[ViewProducts] useEffect triggered - searchQuery: ${debouncedSearchQuery}`);
    fetchProducts(debouncedSearchQuery);
  }, [debouncedSearchQuery]);
  
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const token = localStorage.getItem('token');
    if (!token) {
      showErrorToast('Session expired. Please log in again.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${api}/products/${toDelete}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data?.message || 'Failed to delete product';
        showErrorToast(errorMessage);
        setLoading(false);
        return;
      }
      
      showSuccessToast(data.message || 'Product deleted successfully');
      setToDelete(null);
      fetchProducts(debouncedSearchQuery);
    } catch (e) {
      const errorMessage = (e as Error).message || 'Network error occurred';
      showErrorToast(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {loading && <Loader text="Loading" />}
      
      {/* Header Section */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
    <div>
              <h1 className="text-2xl font-bold text-gray-900">Products</h1>
              <p className="text-sm text-gray-600 mt-1">
                Manage your restaurant products
              </p>
            </div>
            <PermissionGate component="manageProducts" action="create">
              <Link 
                to="/createProduct" 
                className="inline-flex items-center px-4 py-2 bg-[#003366] text-white rounded-lg hover:bg-[#004080] transition-colors duration-200 font-medium"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Product
              </Link>
            </PermissionGate>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <div className="mb-4">
          <SearchBar 
            onSearch={handleSearch}
            placeholder="Search products by name, code, or brand..."
            className="max-w-md"
          />
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {productTableHeaders.map((header, index) => (
                    <th
                      key={header}
                      className={`px-6 py-4 text-sm font-semibold text-gray-700 uppercase tracking-wider ${
                        header === 'Action' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.map(product => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-6 py-5">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-14 w-14">
                          {product.image ? (
                            <img className="h-14 w-14 rounded-full object-cover" src={product.image} alt={product.name} />
                          ) : (
                            <div className="h-14 w-14 rounded-full bg-gray-200 flex items-center justify-center">
                              <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="ml-4 min-w-0">
                          <div className="text-base font-semibold text-gray-900 truncate">
                            {highlightText(product.name, searchQuery)}
                          </div>
                          <div className="text-sm text-gray-600 truncate">
                            Code: {highlightText(product.code, searchQuery)}
                          </div>
                          <div className="text-sm text-gray-600 truncate">
                            Brand: {highlightText(product.brand || '-', searchQuery)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-base font-semibold text-gray-900">{product.name}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-base text-gray-900">{product.code}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-base text-gray-900">{product.brand || '-'}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-base font-medium text-gray-900">{currencyCode} {product.price?.toFixed(2) || '0.00'}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-base text-gray-900">{product.unit}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-base text-gray-900">{product.inStock || 0}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="text-base text-gray-900">{formatDate(product.createdAt)}</div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-right text-base font-medium">
                      <div className="flex items-center justify-end space-x-3">
                        {!product.isInventory && (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/kitchen/recipes?productId=${encodeURIComponent(product.id)}`
                              )
                            }
                            className="inline-flex items-center p-2.5 text-[#003366] hover:text-[#003366] hover:bg-gray-100 rounded-lg transition-colors duration-200"
                            title="Recipe — configure ingredients for this dish"
                            aria-label={`Open recipe configuration for ${product.name}`}
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              viewBox="0 0 24 24"
                              aria-hidden
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 11h6M9 14h6M9 17h4"
                              />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => fetchProductDetails(product.id)}
                          className="inline-flex items-center p-2.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors duration-200"
                          title="View product details"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => navigate(`/editProduct/${product.id}`)}
                          className="inline-flex items-center p-2.5 text-[#003366] hover:text-[#003366] hover:bg-gray-100 rounded-lg transition-colors duration-200"
                          title="Edit product"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setToDelete(product.id)}
                          className="inline-flex items-center p-2.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors duration-200"
                          title="Delete product"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center">
                        <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
                        <p className="text-gray-500 mb-4">Get started by creating your first product.</p>
                        <PermissionGate component="manageProducts" action="create">
                          <Link 
                            to="/createProduct" 
                            className="inline-flex items-center px-4 py-2 bg-[#003366] text-white rounded-lg hover:bg-[#004080] transition-colors duration-200"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Add Product
                          </Link>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {toDelete && (
        <DeleteConfirmModal onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />
      )}

      {/* Product Details Modal */}
      {viewingProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:p-0">
            <div className="fixed inset-0 bg-gray-900 bg-opacity-20 backdrop-blur-sm transition-opacity" onClick={() => setViewingProduct(null)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
              {loadingDetails ? (
                <div className="p-8 text-center">
                  <Loader text="Loading product details" />
                </div>
              ) : viewingProduct ? (
                <>
                  <div className="bg-white px-6 pt-6 pb-4 sm:p-8 sm:pb-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-8 pb-6 border-b-2 border-gray-200">
                      <div>
                        <h3 className="text-3xl font-bold text-gray-900 mb-2">{viewingProduct.name}</h3>
                        <p className="text-base text-gray-600">Product Code: <span className="font-semibold text-gray-800">{viewingProduct.code}</span></p>
                      </div>
                      <button
                        onClick={() => setViewingProduct(null)}
                        className="text-gray-400 hover:text-gray-600 transition-colors duration-200 p-2 hover:bg-gray-100 rounded-lg"
                        title="Close"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Basic Information Section */}
                    <div className="mb-8">
                      <h4 className="text-xl font-bold text-gray-900 mb-6 pb-2 border-b-2 border-gray-300">Basic Information</h4>

                      {viewingProduct.image && (
                        <div className="mb-6">
                          <img
                            src={viewingProduct.image}
                            alt={viewingProduct.name}
                            className="h-28 w-28 rounded-lg object-cover border border-gray-200"
                          />
                        </div>
                      )}
                      
                      {/* Product Details Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Product Name</div>
                          <div className="text-lg font-bold text-gray-900">{viewingProduct.name}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Product Code</div>
                          <div className="text-lg font-bold text-gray-900">{viewingProduct.code}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Category</div>
                          <div className="text-lg font-bold text-gray-900">{viewingProduct.category}</div>
                        </div>
                        {viewingProduct.brand && (
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Brand</div>
                            <div className="text-lg font-bold text-gray-900">{viewingProduct.brand}</div>
                          </div>
                        )}
                        {viewingProduct.supplier && (
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Supplier</div>
                            <div className="text-lg font-bold text-gray-900">{viewingProduct.supplier}</div>
                          </div>
                        )}
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Unit</div>
                          <div className="text-lg font-bold text-gray-900">{viewingProduct.unit}</div>
                        </div>
                        {viewingProduct.baseUnit && (
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Base Unit</div>
                            <div className="text-lg font-bold text-gray-900">{viewingProduct.baseUnit}</div>
                          </div>
                        )}
                        {viewingProduct.saleUnit && (
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Sale Unit</div>
                            <div className="text-lg font-bold text-gray-900">{viewingProduct.saleUnit}</div>
                          </div>
                        )}
                        {viewingProduct.purchase && (
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Purchase Unit</div>
                            <div className="text-lg font-bold text-gray-900">{viewingProduct.purchase}</div>
                          </div>
                        )}
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Product Type</div>
                          <div className="text-lg font-bold text-gray-900">{viewingProduct.ptype}</div>
                        </div>
                        {viewingProduct.ptype === 'Variation' && viewingProduct.variation && (
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Variation Attributes</div>
                            <div className="text-base font-bold text-gray-900">{viewingProduct.variation}</div>
                          </div>
                        )}
                        {/* System type removed in restaurant-only build */}
                      </div>

                      {/* Restaurant-Specific Properties (restaurant-only build) */}
                      {(
                        <div className="bg-blue-50 rounded-xl p-6 border-2 border-blue-200 shadow-sm mb-6">
                          <h5 className="text-lg font-bold text-blue-900 mb-5 pb-3 border-b-2 border-blue-300">Restaurant Properties</h5>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {viewingProduct.isInventory !== undefined && (
                              <div className="bg-white rounded-lg p-5 border-2 border-blue-200 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-base font-bold text-blue-900">Is Inventory</span>
                                  <span className={`px-3 py-1.5 text-sm font-bold rounded-lg ${viewingProduct.isInventory ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {viewingProduct.isInventory ? 'Yes' : 'No'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-700 mt-3 leading-relaxed">
                                  {viewingProduct.isInventory 
                                    ? 'This product is tracked in inventory. Stock levels, stock alerts, and quantity management are enabled.'
                                    : 'This product is not tracked in inventory (e.g., rice, kottu, pasta). No stock management required.'}
                                </p>
                              </div>
                            )}
                            {viewingProduct.hasBatches !== undefined && (
                              <div className="bg-white rounded-lg p-5 border-2 border-blue-200 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-base font-bold text-blue-900">Has Batches</span>
                                  <span className={`px-3 py-1.5 text-sm font-bold rounded-lg ${viewingProduct.hasBatches ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {viewingProduct.hasBatches ? 'Yes' : 'No'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-700 mt-3 leading-relaxed">
                                  {viewingProduct.hasBatches
                                    ? 'This product uses batch tracking. Each batch can have its own pricing, expiry date, and stock levels.'
                                    : 'This product does not use batch tracking. Pricing and stock are managed at the warehouse level.'}
                                </p>
                              </div>
                            )}
                            {viewingProduct.isWeight !== undefined && (
                              <div className="bg-white rounded-lg p-5 border-2 border-blue-200 shadow-sm">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-base font-bold text-blue-900">Is Weight Based</span>
                                  <span className={`px-3 py-1.5 text-sm font-bold rounded-lg ${viewingProduct.isWeight ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {viewingProduct.isWeight ? 'Yes' : 'No'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-700 mt-3 leading-relaxed">
                                  {viewingProduct.isWeight
                                    ? 'This product is sold by weight. The unit is automatically set based on the selected base unit (e.g., Kilogram → Gram).'
                                    : 'This product is sold by quantity. You can manually select the unit (e.g., Pieces, Boxes, Bottles).'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Retail-specific properties removed in restaurant-only build */}

                      {/* Additional Information */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {viewingProduct.note && (
                          <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 shadow-sm">
                            <div className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-300">Note</div>
                            <div className="text-base text-gray-900 whitespace-pre-wrap leading-relaxed">{viewingProduct.note}</div>
                          </div>
                        )}
                        <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 shadow-sm">
                          <div className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-300">Created At</div>
                          <div className="text-base text-gray-900">{new Date(viewingProduct.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>

                    {/* Summary Statistics */}
                    {viewingProduct.warehouse && (() => {
                      const totalStock = calculateStock(viewingProduct.warehouse);
                      const totalStockAlert = calculateTotalStockAlert(viewingProduct.warehouse);
                      const isInventory = viewingProduct.isInventory === true;
                      
                      // Show summary only when inventory is enabled (restaurant-only)
                      if (isInventory) {
                        const summaryItems = [];
                        
                        // Stock Alert
                        summaryItems.push(
                          <div key="stockAlert" className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200 shadow-sm">
                            <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Stock Alert</div>
                            <div className="text-2xl font-bold text-blue-900">{totalStockAlert || 0}</div>
                          </div>
                        );
                        
                        // Quantity
                        summaryItems.push(
                          <div key="quantity" className="bg-green-50 rounded-lg p-4 border-2 border-green-200 shadow-sm">
                            <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Quantity</div>
                            <div className="text-2xl font-bold text-green-900">{totalStock || 0}</div>
                          </div>
                        );
                        
                        // Margin
                        summaryItems.push(
                          <div key="margin" className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200 shadow-sm">
                            <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-2">Margin</div>
                            <div className="text-2xl font-bold text-purple-900">{avgMargin.toFixed(2)}%</div>
                          </div>
                        );
                        
                        // Profit
                        summaryItems.push(
                            <div key="profit" className="bg-orange-50 rounded-lg p-4 border-2 border-orange-200 shadow-sm">
                            <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">Profit</div>
                            <div className="text-2xl font-bold text-orange-900">{currencyCode} {totalProfit.toFixed(2)}</div>
                          </div>
                        );
                        
                        return (
                          <div className="mb-8 pt-8 border-t-2 border-gray-200">
                            <h4 className="text-xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">Summary Statistics</h4>
                            <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
                              {summaryItems}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Warehouse Details */}
                    {viewingProduct.warehouse && (() => {
                      try {
                        const warehouses = viewingProduct.warehouse instanceof Map 
                          ? Array.from(viewingProduct.warehouse.entries()) 
                          : Object.entries(viewingProduct.warehouse || {});
                        const hasBatches = viewingProduct.hasBatches === true;
                        const isInventory = viewingProduct.isInventory === true;
                        const ptype = viewingProduct.ptype;
                      
                      return (
                        <div className="mt-8 pt-8 border-t-2 border-gray-200">
                          <h4 className="text-xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">Warehouse Details</h4>
                          <div className="space-y-6">
                            {warehouses.map(([warehouseId, whData]: [string, any]) => {
                              // Check if product has batches
                              if (hasBatches) {
                                // Product with batches
                                if (ptype === 'Single') {
                                  // Single product with batches
                                  return (
                                    <div key={warehouseId} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-gray-200 p-6 mb-6 shadow-sm">
                                      <h5 className="text-lg font-bold text-gray-900 mb-5 pb-3 border-b-2 border-gray-300">
                                        {whData.warehouseName || warehouseId}
                                      </h5>
                                      {whData.batches && whData.batches.length > 0 ? (
                                        <div className="overflow-x-auto">
                                          <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-200">
                                              <tr>
                                                <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Batch Number</th>
                                                {whData.batches[0]?.expiryDate && (
                                                  <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Expiry Date</th>
                                                )}
                                                <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Cost</th>
                                                <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Price</th>
                                                {isInventory && (
                                                  <>
                                                    <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Stock Alert</th>
                                                    <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Quantity</th>
                                                  </>
                                                )}
                                                {whData.batches.some((b: any) => b.discount && b.discount > 0) && (
                                                  <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Discount</th>
                                                )}
                                              </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                              {whData.batches.map((batch: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                  <td className="px-5 py-4 whitespace-nowrap text-base font-medium text-gray-900">{batch.batchNumber || '-'}</td>
                                                  {whData.batches[0]?.expiryDate && (
                                                    <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">
                                                      {batch.expiryDate ? formatDate(batch.expiryDate) : '-'}
                                                    </td>
                                                  )}
                                                  <td className="px-5 py-4 whitespace-nowrap text-base font-medium text-gray-900">{currencyCode} {batch.productCost?.toFixed(2) || '0.00'}</td>
                                                  <td className="px-5 py-4 whitespace-nowrap text-base font-medium text-gray-900">{currencyCode} {batch.productPrice?.toFixed(2) || '0.00'}</td>
                                                  {isInventory && (
                                                    <>
                                                      <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{batch.stockAlert || 0}</td>
                                                      <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{batch.productQty || 0}</td>
                                                    </>
                                                  )}
                                                  {whData.batches.some((b: any) => b.discount && b.discount > 0) && (
                                                    <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{currencyCode} {batch.discount?.toFixed(2) || '0.00'}</td>
                                                  )}
                                                  <td className="px-5 py-4 whitespace-nowrap text-base text-green-600 font-bold">{currencyCode} {batch.productProfit?.toFixed(2) || '0.00'}</td>
                                                  <td className="px-5 py-4 whitespace-nowrap text-base text-green-600 font-bold">{batch.profitMargin?.toFixed(2) || '0.00'}%</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-500">No batches available</p>
                                      )}
                                  </div>
                                  );
                                } else if (ptype === 'Variation') {
                                  // Variation product with batches
                                  return (
                                    <div key={warehouseId} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-gray-200 p-6 mb-6 shadow-sm">
                                      <h5 className="text-lg font-bold text-gray-900 mb-5 pb-3 border-b-2 border-gray-300">
                                        {whData.warehouseName || warehouseId}
                                      </h5>
                                      {whData.batches && whData.batches.length > 0 ? (
                                        whData.batches.map((batch: any, batchIdx: number) => (
                                          <div key={batchIdx} className="mb-6 last:mb-0">
                                            <div className="mb-3 flex items-center gap-3">
                                              <span className="text-base font-bold text-gray-800">Batch: {batch.batchNumber || `Batch ${batchIdx + 1}`}</span>
                                              {batch.expiryDate && (
                                                <span className="text-sm text-gray-600">Expiry: {formatDate(batch.expiryDate)}</span>
                                              )}
                                  </div>
                                            {batch.variationValues ? (
                                              <div className="overflow-x-auto">
                                                <table className="min-w-full divide-y divide-gray-200 bg-white rounded-lg">
                                                  <thead className="bg-gray-200">
                                                    <tr>
                                                      {viewingProduct.variation && viewingProduct.variation.split('|').map((attr: string) => (
                                                        <th key={attr} className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">{attr}</th>
                                                      ))}
                                                      <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Code</th>
                                                      <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Cost</th>
                                                      <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Price</th>
                                                      {isInventory && (
                                                        <>
                                                          <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Stock Alert</th>
                                                          <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Quantity</th>
                                                        </>
                                                      )}
                                                      <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Discount</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="divide-y divide-gray-200">
                                                    {(() => {
                                                      const variationValues = batch.variationValues instanceof Map
                                                        ? Object.fromEntries(batch.variationValues)
                                                        : batch.variationValues;
                                                      return Object.entries(variationValues || {}).map(([key, varVal]: [string, any], idx: number) => {
                                                        const valueMap: Record<string, string> = {};
                                                        key.split('|').forEach(kvp => {
                                                          const [attr, val] = kvp.split('=');
                                                          if (attr) valueMap[attr] = val || '';
                                                        });
                                                        return (
                                                          <tr key={idx} className="hover:bg-gray-50">
                                                            {viewingProduct.variation && viewingProduct.variation.split('|').map((attr: string) => (
                                                              <td key={attr} className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{valueMap[attr] || '-'}</td>
                                                            ))}
                                                            <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{varVal.code || '-'}</td>
                                                            <td className="px-5 py-4 whitespace-nowrap text-base font-medium text-gray-900">{currencyCode} {varVal.productCost?.toFixed(2) || '0.00'}</td>
                                                            <td className="px-5 py-4 whitespace-nowrap text-base font-medium text-gray-900">{currencyCode} {varVal.productPrice?.toFixed(2) || '0.00'}</td>
                                                            {isInventory && (
                                                              <>
                                                                <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{varVal.stockAlert || 0}</td>
                                                                <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{varVal.productQty || 0}</td>
                                                              </>
                                                            )}
                                                            <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{currencyCode} {varVal.discount?.toFixed(2) || '0.00'}</td>
                                                            <td className="px-5 py-4 whitespace-nowrap text-base text-green-600 font-bold">{currencyCode} {varVal.productProfit?.toFixed(2) || '0.00'}</td>
                                                            <td className="px-5 py-4 whitespace-nowrap text-base text-green-600 font-bold">{varVal.profitMargin?.toFixed(2) || '0.00'}%</td>
                                                          </tr>
                                                        );
                                                      });
                                                    })()}
                                                  </tbody>
                                                </table>
                                  </div>
                                            ) : (
                                              <p className="text-sm text-gray-500">No variation values available</p>
                                            )}
                                  </div>
                                        ))
                                      ) : (
                                        <p className="text-sm text-gray-500">No batches available</p>
                                      )}
                                    </div>
                                  );
                                }
                              } else {
                                // Product without batches
                                if (ptype === 'Single') {
                                  // Single product without batches
                                  return (
                                    <div key={warehouseId} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-gray-200 p-6 mb-6 shadow-sm">
                                      <h5 className="text-lg font-bold text-gray-900 mb-5 pb-3 border-b-2 border-gray-300">
                                        {whData.warehouseName || warehouseId}
                                      </h5>
                                      <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 bg-white rounded-lg">
                                          <thead className="bg-gray-200">
                                            <tr>
                                              <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Cost</th>
                                              <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Price</th>
                                              {isInventory && (
                                                <>
                                                  <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Stock Alert</th>
                                                  <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Quantity</th>
                                                </>
                                              )}
                                              {whData.discount && whData.discount > 0 && (
                                                <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Discount</th>
                                              )}
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-200">
                                            <tr className="hover:bg-gray-50">
                                              <td className="px-5 py-4 whitespace-nowrap text-base font-medium text-gray-900">{currencyCode} {whData.productCost?.toFixed(2) || '0.00'}</td>
                                              <td className="px-5 py-4 whitespace-nowrap text-base font-medium text-gray-900">{currencyCode} {whData.productPrice?.toFixed(2) || '0.00'}</td>
                                              {isInventory && (
                                                <>
                                                  <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{whData.stockAlert || 0}</td>
                                                  <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{whData.productQty || 0}</td>
                                                </>
                                              )}
                                              {whData.discount && whData.discount > 0 && (
                                                <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{currencyCode} {whData.discount?.toFixed(2) || '0.00'}</td>
                                              )}
                                              <td className="px-5 py-4 whitespace-nowrap text-base text-green-600 font-bold">{currencyCode} {whData.productProfit?.toFixed(2) || '0.00'}</td>
                                              <td className="px-5 py-4 whitespace-nowrap text-base text-green-600 font-bold">{whData.profitMargin?.toFixed(2) || '0.00'}%</td>
                                            </tr>
                                          </tbody>
                                        </table>
                                  </div>
                                    </div>
                                  );
                                } else if (ptype === 'Variation') {
                                  // Variation product without batches
                                  return (
                                    <div key={warehouseId} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-gray-200 p-6 mb-6 shadow-sm">
                                      <h5 className="text-lg font-bold text-gray-900 mb-5 pb-3 border-b-2 border-gray-300">
                                        {whData.warehouseName || warehouseId}
                                      </h5>
                                      {whData.variationValues ? (
                                        <div className="overflow-x-auto">
                                          <table className="min-w-full divide-y divide-gray-200 bg-white rounded-lg">
                                            <thead className="bg-gray-100">
                                              <tr>
                                                {viewingProduct.variation && viewingProduct.variation.split('|').map((attr: string) => (
                                                  <th key={attr} className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">{attr}</th>
                                                ))}
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Code</th>
                                                <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Cost</th>
                                                <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Price</th>
                                                {isInventory && (
                                                  <>
                                                    <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Stock Alert</th>
                                                    <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Quantity</th>
                                                  </>
                                                )}
                                                <th className="px-5 py-4 text-left text-sm font-bold text-gray-800 uppercase tracking-wider">Discount</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                              {(() => {
                                                const variationValues = whData.variationValues instanceof Map
                                                  ? Object.fromEntries(whData.variationValues)
                                                  : whData.variationValues;
                                                return Object.entries(variationValues || {}).map(([key, varVal]: [string, any], idx: number) => {
                                                  const valueMap: Record<string, string> = {};
                                                  key.split('|').forEach(kvp => {
                                                    const [attr, val] = kvp.split('=');
                                                    if (attr) valueMap[attr] = val || '';
                                                  });
                                                  return (
                                                    <tr key={idx} className="hover:bg-gray-50">
                                                      {viewingProduct.variation && viewingProduct.variation.split('|').map((attr: string) => (
                                                        <td key={attr} className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{valueMap[attr] || '-'}</td>
                                                      ))}
                                                      <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{varVal.code || '-'}</td>
                                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{currencyCode} {varVal.productCost?.toFixed(2) || '0.00'}</td>
                                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{currencyCode} {varVal.productPrice?.toFixed(2) || '0.00'}</td>
                                                      {isInventory && (
                                                        <>
                                                          <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{varVal.stockAlert || 0}</td>
                                                          <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{varVal.productQty || 0}</td>
                                                        </>
                                                      )}
                                                      <td className="px-5 py-4 whitespace-nowrap text-base text-gray-700">{currencyCode} {varVal.discount?.toFixed(2) || '0.00'}</td>
                                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-green-600 font-medium">{currencyCode} {varVal.productProfit?.toFixed(2) || '0.00'}</td>
                                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-green-600 font-medium">{varVal.profitMargin?.toFixed(2) || '0.00'}%</td>
                                                    </tr>
                                                  );
                                                });
                                              })()}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-500">No variation values available</p>
                                  )}
                                </div>
                                  );
                                }
                              }
                              return null;
                            })}
                              </div>
                        </div>
                      );
                      } catch (error) {
                        console.error('Error rendering warehouse details:', error);
                        return (
                          <div className="mt-6 border-t border-gray-200 pt-6">
                            <h4 className="text-lg font-semibold text-gray-900 mb-4">Warehouse Details</h4>
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                              <p className="text-sm text-red-700">Error loading warehouse details. Please try again.</p>
                        </div>
                      </div>
                        );
                      }
                    })()}
                  </div>
                  <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                    <button
                      type="button"
                      onClick={() => setViewingProduct(null)}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-[#003366] text-base font-medium text-white hover:bg-[#004080] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#003366] sm:ml-3 sm:w-auto sm:text-sm"
                    >
                      Close
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-gray-500">No product data available</p>
                  <button
                    type="button"
                    onClick={() => setViewingProduct(null)}
                    className="mt-4 px-4 py-2 bg-[#003366] text-white rounded-lg hover:bg-[#004080]"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewProducts;