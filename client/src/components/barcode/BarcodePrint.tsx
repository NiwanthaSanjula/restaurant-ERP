import React, { useEffect, useMemo, useState } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import { showErrorToast, showInfoToast } from '../../utils/toast';
import Loader from '../common/Loader';
import JsBarcode from 'jsbarcode';

type WarehouseOption = {
  id: string;
  name: string;
};

type ProductSearchResult = {
  id: string;
  name: string;
  code: string;
  price?: number;
};

type SelectedProduct = ProductSearchResult & {
  qty: number;
  barcodeType?: '128' | '39';
};

const MIN_SEARCH_LENGTH = 1;

const PAPER_SIZE_OPTIONS = [
  {
    value: 'A4_24',
    label: '24 per sheet (A4) (2.48" × 1.334")',
  },
  {
    value: 'A4_20',
    label: '20 per sheet (4" × 1")',
  },
  {
    value: 'A4_18',
    label: '18 per sheet (A4) (2.5" × 1.835")',
  },
  {
    value: 'A4_14',
    label: '14 per sheet (A4) (4" × 1.33")',
  },
  {
    value: 'A4_12',
    label: '12 per sheet (A4) (2.5" × 2.834")',
  },
  {
    value: 'A4_10',
    label: '10 per sheet (4" × 2")',
  },
  {
    value: 'THERMAL_2x1',
    label: 'Thermal Label (2" × 1")',
  },
  {
    value: 'CUSTOM',
    label: 'Custom Size',
  },
] as const;

type PaperSizeValue = (typeof PAPER_SIZE_OPTIONS)[number]['value'];

const PAPER_PREVIEW_CONFIG: Record<PaperSizeValue, { perSheet: number; columns: number }> = {
  A4_24: { perSheet: 24, columns: 4 },
  A4_20: { perSheet: 20, columns: 4 },
  A4_18: { perSheet: 18, columns: 3 },
  A4_14: { perSheet: 14, columns: 2 },
  A4_12: { perSheet: 12, columns: 3 },
  A4_10: { perSheet: 10, columns: 2 },
  THERMAL_2x1: { perSheet: 20, columns: 2 },
  CUSTOM: { perSheet: 30, columns: 3 },
};

const generateBarcodeSvgString = (code: string, barcodeType?: '128' | '39'): string => {
  /** Map the product's barcodeType field to the JsBarcode format string */
  const format = barcodeType === '39' ? 'CODE39' : 'CODE128';
  try {
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svgNode, code, {
      format,
      width: 2,
      height: 40,
      displayValue: false,
      margin: 0,
    });
    return svgNode.outerHTML;
  } catch {
    return `<svg width="100" height="40"><text y="20" fill="red" font-size="10">Invalid code</text></svg>`;
  }
};

/**
 * Extracts product prices from the warehouse map.
 * When `targetWarehouseId` is provided, only the prices for that specific
 * warehouse are collected — fixing BUG-032 (global-minimum price leak).
 * Falls back to all warehouses when no warehouse is selected.
 */
const extractAllPrices = (warehouse: any, targetWarehouseId?: string): number[] => {
  const prices: number[] = [];
  if (!warehouse) return prices;

  const allEntries = warehouse instanceof Map
    ? Array.from(warehouse.entries())
    : Object.entries(warehouse);

  // If a specific warehouse is selected, restrict to that entry only.
  const entries = targetWarehouseId
    ? allEntries.filter(([id]) => id === targetWarehouseId)
    : allEntries;

  entries.forEach(([_, whData]: [string, any]) => {
    if (whData.batches && Array.isArray(whData.batches) && whData.batches.length > 0) {
      whData.batches.forEach((batch: any) => {
        if (batch.variationValues) {
          const variationValues = batch.variationValues instanceof Map
            ? Object.fromEntries(batch.variationValues)
            : batch.variationValues;
          Object.values(variationValues || {}).forEach((varVal: any) => {
            if (varVal.productPrice !== undefined && varVal.productPrice !== null) {
              prices.push(Number(varVal.productPrice));
            }
          });
        } else if (batch.productPrice !== undefined && batch.productPrice !== null) {
          prices.push(Number(batch.productPrice));
        }
      });
    } else if (whData.variationValues) {
      const variationValues = whData.variationValues instanceof Map
        ? Object.fromEntries(whData.variationValues)
        : whData.variationValues;
      Object.values(variationValues || {}).forEach((varVal: any) => {
        if (varVal.productPrice !== undefined && varVal.productPrice !== null) {
          prices.push(Number(varVal.productPrice));
        }
      });
    } else if (whData.productPrice !== undefined && whData.productPrice !== null) {
      prices.push(Number(whData.productPrice));
    }
  });

  return prices;
};

const calculatePrice = (warehouse: any, targetWarehouseId?: string): number | undefined => {
  const prices = extractAllPrices(warehouse, targetWarehouseId);
  if (prices.length === 0) return undefined;
  return Math.min(...prices);
};

const BarcodePrint: React.FC = () => {
  const [customBarcode, setCustomBarcode] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const { currencyCode, currencySymbol } = useCurrency();
  const [warehouseId, setWarehouseId] = useState('');
  const [paperSize, setPaperSize] = useState('');
  const [customWidthMm, setCustomWidthMm] = useState<string>('');
  const [customHeightMm, setCustomHeightMm] = useState<string>('');
  const [showStoreName, setShowStoreName] = useState(true);
  const [showProductName, setShowProductName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showBorder, setShowBorder] = useState(false);
  const [priceFontSize, setPriceFontSize] = useState(12);

  // Custom barcode state
  const [customCode, setCustomCode] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState<string>('');
  const [customQty, setCustomQty] = useState<number>(10);

  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [hasPreview, setHasPreview] = useState(false);

  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  useEffect(() => {
    const fetchWarehouses = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${api}/warehouses`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();

        if (!res.ok) {
          showErrorToast(data?.message || 'Failed to load warehouses');
          return;
        }

        const options: WarehouseOption[] = (data.data || []).map((w: any) => ({
          id: w._id,
          name: w.name,
        }));
        setWarehouses(options);

        const defaultWarehouse = localStorage.getItem('defaultWarehouse');
        if (defaultWarehouse && options.some((w) => w.id === defaultWarehouse)) {
          setWarehouseId(defaultWarehouse);
        }
      } catch (error) {
        showErrorToast((error as Error).message || 'Network error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchWarehouses();
  }, [api]);

  useEffect(() => {
    if (!searchTerm || searchTerm.length < MIN_SEARCH_LENGTH) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const token = localStorage.getItem('token');
        const systemType =
          (localStorage.getItem('systemType') as 'restaurant' | 'retail' | null) || 'restaurant';
        const res = await fetch(
          `${api}/products?systemType=${systemType}&q=${encodeURIComponent(searchTerm)}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          },
        );
        const data = await res.json();

        if (!res.ok) {
          showErrorToast(data?.message || 'Failed to search products');
          setSearchResults([]);
          return;
        }

        const results: ProductSearchResult[] = (data.data || []).map((p: any) => {
          let price: number | undefined;
          if (typeof p.price === 'number') {
            price = p.price;
          } else if (p.warehouse) {
            // Pass the selected warehouseId so we get that warehouse's price,
            // not the global minimum across all warehouses (BUG-032).
            price = calculatePrice(p.warehouse, warehouseId || undefined);
          }
          return {
            id: p._id,
            name: p.name,
            code: p.code,
            price,
          };
        });
        setSearchResults(results);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          showErrorToast((error as Error).message || 'Network error occurred');
        }
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
    // warehouseId is a dep: price extraction is warehouse-specific (BUG-032)
  }, [api, searchTerm, warehouseId]);

  const handleAddProduct = (product: ProductSearchResult) => {
    setSelectedProducts((prev) => {
      const existing = prev.find((p) => p.id === product.id);
      if (existing) {
        return prev.map((p) => (p.id === product.id ? { ...p, qty: p.qty + 1 } : p));
      }
      return [...prev, { ...product, qty: 1 }];
    });
    setSearchResults([]);
    setSearchTerm('');
  };

  const handleQtyChange = (id: string, qty: number) => {
    if (Number.isNaN(qty) || qty <= 0) return;
    setSelectedProducts((prev) => prev.map((p) => (p.id === id ? { ...p, qty } : p)));
  };

  const handleRemoveProduct = (id: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleReset = () => {
    setCustomBarcode(false);
    setSelectedProducts([]);
    setPaperSize('');
    setCustomCode('');
    setCustomName('');
    setCustomPrice('');
    setCustomQty(10);
    setCustomWidthMm('');
    setCustomHeightMm('');
    setShowStoreName(true);
    setShowProductName(true);
    setShowPrice(true);
    setShowBorder(false);
    setPriceFontSize(12);
    setSearchTerm('');
    setSearchResults([]);
    setHasPreview(false);
  };

  const handlePreview = () => {
    if (!customBarcode && !warehouseId) {
      showErrorToast('Please choose a warehouse before previewing.');
      return;
    }
    if (!paperSize) {
      showErrorToast('Please choose a paper size before previewing.');
      return;
    }
    if (paperSize === 'CUSTOM') {
      if (!customWidthMm || !customHeightMm) {
        showErrorToast('Please enter both custom width and height in millimeters.');
        return;
      }
      const w = Number(customWidthMm);
      const h = Number(customHeightMm);
      if (!w || !h || w <= 0 || h <= 0) {
        showErrorToast('Custom width and height must be valid positive numbers.');
        return;
      }
    }

    if (customBarcode) {
      if (!customCode.trim()) {
        showErrorToast('Please enter a SKU / Barcode.');
        return;
      }
      if (!customQty || customQty <= 0) {
        showErrorToast('Quantity must be greater than 0.');
        return;
      }
    } else if (selectedProducts.length === 0) {
      showErrorToast('Please add at least one product to print barcodes.');
      return;
    }
    setHasPreview(true);
    showInfoToast('Preview updated. Scroll down to see the labels.');
  };

  const handlePrint = () => {
    if (!customBarcode && selectedProducts.length === 0) {
      showErrorToast('Please add at least one product to print barcodes.');
      return;
    }
    if (!customBarcode && !warehouseId) {
      showErrorToast('Please choose a warehouse before printing.');
      return;
    }
    if (!paperSize) {
      showErrorToast('Please choose a paper size before printing.');
      return;
    }

    window.print();
  };

  const selectedWarehouseName = useMemo(
    () => warehouses.find((w) => w.id === warehouseId)?.name || '',
    [warehouses, warehouseId],
  );

  const previewLabels = useMemo(() => {
    if (customBarcode) {
      if (!customCode || !customQty || customQty <= 0) return [];
      const numericPrice =
        customPrice && !Number.isNaN(Number(customPrice)) ? Number(customPrice) : undefined;
      const base: SelectedProduct = {
        id: 'custom',
        name: customName || customCode,
        code: customCode,
        price: numericPrice,
        qty: customQty,
      };
      return Array.from({ length: customQty }).map(() => base);
    }
    return selectedProducts.flatMap((product) =>
      Array.from({ length: product.qty }).map(() => product),
    );
  }, [customBarcode, customCode, customName, customPrice, customQty, selectedProducts]);

  return (
    <div className="min-h-screen bg-canvas">
      {loading && <Loader text="Loading" />}

      <div className="bg-surface border-b">
        <div className="px-6 py-4 md:px-4 md:py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-xl font-bold text-foreground">Print Barcode</h1>
            <p className="text-sm text-muted mt-1">
              Generate barcode labels for your products
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">Print Custom Barcode</span>
            <button
              type="button"
              onClick={() => setCustomBarcode((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                customBarcode ? 'bg-primary' : 'bg-surface-muted'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform ${
                  customBarcode ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-4 space-y-6">
        <div className="bg-surface rounded-lg border border-line p-4 md:p-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {!customBarcode && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Warehouse<span className="text-danger">*</span>
                  </label>
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                  >
                    <option value="">Choose Warehouse</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {customBarcode ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      SKU / Barcode<span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      value={customCode}
                      onChange={(e) => setCustomCode(e.target.value)}
                      placeholder="SKU / Barcode"
                      className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Name"
                      className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Price
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      placeholder="Price"
                      className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Quantity<span className="text-danger">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={customQty}
                      onChange={(e) => setCustomQty(Number(e.target.value) || 0)}
                      className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                    />
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Product
                  </label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search product by code or name"
                    className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                  />
                  {searchLoading && (
                    <div className="absolute right-3 top-9">
                      <span className="h-4 w-4 border-2 border-line-strong border-t-[#003366] rounded-full animate-spin inline-block" />
                    </div>
                  )}
                  {searchResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-line bg-surface max-h-64 overflow-y-auto">
                      {searchResults.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => handleAddProduct(product)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-surface-raised"
                        >
                          <div>
                            <div className="font-medium text-foreground">{product.name}</div>
                            <div className="text-xs text-muted">{product.code}</div>
                          </div>
                          {typeof product.price === 'number' && (
                            <div className="text-xs font-semibold text-foreground">
                              {currencyCode} {product.price.toFixed(2)}
                            </div>
                          )}
                        </button>
                      ))}
                      {searchResults.length === 0 && !searchLoading && (
                        <div className="px-3 py-2 text-xs text-muted">No products found</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Paper Size<span className="text-danger">*</span>
                </label>
                <select
                  value={paperSize}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPaperSize(value);
                    if (value !== 'CUSTOM') {
                      setCustomWidthMm('');
                      setCustomHeightMm('');
                    }
                  }}
                  className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                >
                  <option value="">Choose paper size</option>
                  {PAPER_SIZE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {paperSize === 'CUSTOM' && (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Width (mm)<span className="text-danger">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={customWidthMm}
                      onChange={(e) => setCustomWidthMm(e.target.value)}
                      placeholder="Width"
                      className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Height (mm)<span className="text-danger">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={customHeightMm}
                      onChange={(e) => setCustomHeightMm(e.target.value)}
                      placeholder="Height"
                      className="mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-primary focus:ring-primary"
                    />
                  </div>
                </div>
              )}
              <div>
                <label
                  className={`block text-sm font-medium mb-1 ${
                    showPrice ? 'text-foreground' : 'text-subtle'
                  }`}
                >
                  Price Font Size
                </label>
                <input
                  type="number"
                  min={8}
                  max={32}
                  value={priceFontSize}
                  onChange={(e) => setPriceFontSize(Number(e.target.value) || 12)}
                  disabled={!showPrice}
                  className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:border-primary focus:ring-primary ${
                    showPrice
                      ? 'border-line-strong bg-surface text-foreground'
                      : 'border-line bg-surface-muted text-subtle cursor-not-allowed'
                  }`}
                />
              </div>

              <div className="col-span-2 grid grid-cols-2 gap-4">
                <label className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm text-foreground">
                  <span>Show Store Name</span>
                  <button
                    type="button"
                    onClick={() => setShowStoreName((prev) => !prev)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      showStoreName ? 'bg-primary' : 'bg-surface-muted'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform ${
                        showStoreName ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
                <label className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm text-foreground">
                  <span>Show Product Name</span>
                  <button
                    type="button"
                    onClick={() => setShowProductName((prev) => !prev)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      showProductName ? 'bg-primary' : 'bg-surface-muted'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform ${
                        showProductName ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
                <label className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm text-foreground">
                  <span>Show Price</span>
                  <button
                    type="button"
                    onClick={() => setShowPrice((prev) => !prev)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      showPrice ? 'bg-primary' : 'bg-surface-muted'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform ${
                        showPrice ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
                <label className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm text-foreground">
                  <span>Show Border</span>
                  <button
                    type="button"
                    onClick={() => setShowBorder((prev) => !prev)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      showBorder ? 'bg-primary' : 'bg-surface-muted'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform ${
                        showBorder ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-line pt-4">
            {!customBarcode && (
              <>
                <h2 className="text-sm font-semibold text-foreground mb-3">Products To Print</h2>
                <div className="overflow-x-auto border border-line rounded-lg">
                  <table className="min-w-full divide-y divide-line">
                    <thead className="bg-surface-raised">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                          Product
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
                          Qty
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-foreground uppercase tracking-wider">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-line">
                      {selectedProducts.map((product) => (
                        <tr key={product.id} className="hover:bg-surface-raised">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-foreground">{product.code}</div>
                            <div className="mt-1 inline-flex items-center rounded-full bg-secondary-soft px-2.5 py-0.5 text-xs font-medium text-secondary">
                              {product.name}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <input
                              type="number"
                              min={1}
                              value={product.qty}
                              onChange={(e) => handleQtyChange(product.id, Number(e.target.value))}
                              className="w-24 rounded-md border border-line-strong px-3 py-1.5 text-sm text-center focus:border-primary focus:ring-primary"
                            />
                          </td>
                          <td className="px-4 py-3 text-right align-middle">
                            <button
                              type="button"
                              onClick={() => handleRemoveProduct(product.id)}
                              className="inline-flex items-center justify-center p-2 rounded-full text-danger hover:text-danger hover:bg-danger-soft"
                              title="Remove product from list"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {selectedProducts.length === 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-6 text-center text-sm text-muted bg-surface"
                          >
                            No products added. Search and select a product to start building your
                            barcode list.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {!customBarcode && (
                <div className="text-xs text-muted">
                  {selectedWarehouseName
                    ? `Labels will be printed for products in "${selectedWarehouseName}".`
                    : 'Choose a warehouse to start printing barcodes.'}
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePreview}
                  className="inline-flex items-center px-4 py-2 rounded-md bg-secondary text-on-secondary text-sm font-medium hover:bg-secondary-hover focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-secondary-line"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center px-4 py-2 rounded-md bg-danger text-on-danger text-sm font-medium hover:bg-danger-hover focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-danger-line"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-on-primary text-sm font-medium hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary"
                >
                  Print
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-foreground mb-2">Preview</h3>
            {!hasPreview || previewLabels.length === 0 ? (
              <div className="border border-dashed border-line-strong rounded-lg p-4 bg-surface-raised">
                <p className="text-xs text-muted">
                  Add products, choose a paper size and click Preview to see how your barcode
                  labels will look before you print.
                </p>
              </div>
            ) : (
              (() => {
                const key = (paperSize || 'A4_18') as PaperSizeValue;
                const cfg =
                  PAPER_PREVIEW_CONFIG[key] || {
                    perSheet: previewLabels.length || 1,
                    columns: Math.min(previewLabels.length || 1, 3),
                  };
                const totalLabels = previewLabels.length;
                const pages: React.ReactNode[] = [];

                for (let pageIndex = 0; pageIndex * cfg.perSheet < totalLabels; pageIndex++) {
                  const start = pageIndex * cfg.perSheet;
                  const pageLabels = previewLabels.slice(start, start + cfg.perSheet);
                  const placeholders = Math.max(cfg.perSheet - pageLabels.length, 0);

                  pages.push(
                    <div
                      key={`page-${pageIndex}`}
                      className={`barcode-page ${pageIndex > 0 ? 'mt-4 border-t border-line pt-4' : ''}`}
                    >
                      <div
                        className="grid gap-px bg-surface-muted border border-line-strong rounded-md overflow-hidden"
                        style={{ gridTemplateColumns: `repeat(${cfg.columns}, minmax(0, 1fr))` }}
                      >
                        {pageLabels.map((product, idx) => (
                          <div
                            key={`${product.id}-${start + idx}`}
                            className={`flex flex-col items-center justify-center px-3 py-3 bg-surface text-center min-h-[140px] ${
                              showBorder ? 'border border-line-strong' : ''
                            }`}
                          >
                            {showStoreName && (
                              <div className="text-[10px] font-bold tracking-wider uppercase">
                                General Store
                              </div>
                            )}
                            {showProductName && (
                              <div className="mt-1 text-[11px] font-medium text-foreground break-words">
                                {product.name}
                              </div>
                            )}
                            {showPrice && typeof product.price === 'number' && (
                              <div
                                className="mt-1 text-foreground"
                                style={{ fontSize: `${Math.max(priceFontSize, 8)}px` }}
                              >
                                Price: {currencySymbol} {product.price.toFixed(2)}
                              </div>
                            )}
                            <div
                              className="mt-1.5"
                              dangerouslySetInnerHTML={{ __html: generateBarcodeSvgString(product.code, product.barcodeType) }}
                            />
                            <div className="mt-1 text-[9px] font-semibold tracking-[0.18em] text-foreground font-mono">
                              {product.code}
                            </div>
                          </div>
                        ))}
                        {Array.from({ length: placeholders }).map((_, idx) => (
                          <div key={`placeholder-${pageIndex}-${idx}`} className="bg-surface-muted min-h-[140px]" />
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <div id="barcode-preview-area">
                    {pages}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodePrint;