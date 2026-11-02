import React, { useEffect, useMemo, useState, useRef } from "react";
import { useCurrency } from '../../contexts/CurrencyContext';
import CalculatorModal from "./CalculatorModal";
import { useNavigate } from "react-router-dom";
import { showInfoToast, showSuccessToast } from "../../utils/toast";

const POS_API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;
const CATALOG_PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop";

/** Normalize filter values for case-insensitive comparison. */
const normalizeFilterValue = (val: string): string => String(val || "").toLowerCase().trim();

/** Open print dialog with backend-generated receipt HTML. */
function printBillHtml(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const doPrint = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    const remove = () => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    };
    iframe.contentWindow?.addEventListener("afterprint", remove);
    setTimeout(remove, 3000);
  };

  const tryPrint = () => {
    const images = Array.from(doc.images);
    if (images.length === 0) {
      setTimeout(doPrint, 100);
      return;
    }
    let loaded = 0;
    const check = () => {
      loaded += 1;
      if (loaded >= images.length) setTimeout(doPrint, 50);
    };
    images.forEach((img) => {
      if (img.complete) check();
      else {
        img.onload = check;
        img.onerror = check;
      }
    });
  };

  setTimeout(tryPrint, 150);
}

function buildFallbackReceiptHtml(params: {
  orderId?: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  subtotal: number;
  specialOfferDiscount?: number;
  discountAmount: number;
  shipping: number;
  taxAmount: number;
  total: number;
  paid: number;
  change: number;
  due: number;
}): string {
  const now = new Date();
  const rows = params.items
    .map(
      (item) =>
        `<tr><td>${item.name}</td><td style="text-align:center">${item.quantity}</td><td style="text-align:right">Rs ${(item.price * item.quantity).toFixed(2)}</td></tr>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Receipt</title><style>
    body{font-family:Arial,sans-serif;margin:0;padding:8px;color:#111}
    .r{width:80mm;margin:0 auto}
    h2,p{margin:0}
    .c{text-align:center}.mt{margin-top:6px}.line{border-top:1px dashed #000;margin:6px 0}
    table{width:100%;border-collapse:collapse;font-size:12px}
    td{padding:2px 0;vertical-align:top}
    .small{font-size:11px}
  </style></head><body><div class="r">
    <h2 class="c">POS Receipt</h2>
    <p class="c small mt">${now.toLocaleString()}</p>
    ${params.orderId ? `<p class="c small">Order: ${params.orderId}</p>` : ""}
    <div class="line"></div>
    <table><tbody>${rows}</tbody></table>
    <div class="line"></div>
    <table><tbody>
      <tr><td>Subtotal</td><td style="text-align:right">Rs ${params.subtotal.toFixed(2)}</td></tr>
      ${params.specialOfferDiscount && params.specialOfferDiscount > 0 ? `<tr><td>Special Offer</td><td style="text-align:right">Rs -${params.specialOfferDiscount.toFixed(2)}</td></tr>` : ''}
      <tr><td>Discount</td><td style="text-align:right">Rs ${params.discountAmount.toFixed(2)}</td></tr>
      <tr><td>Shipping</td><td style="text-align:right">Rs ${params.shipping.toFixed(2)}</td></tr>
      <tr><td>Tax</td><td style="text-align:right">Rs ${params.taxAmount.toFixed(2)}</td></tr>
      <tr><td><b>Total</b></td><td style="text-align:right"><b>Rs ${params.total.toFixed(2)}</b></td></tr>
      <tr><td>Paid</td><td style="text-align:right">Rs ${params.paid.toFixed(2)}</td></tr>
      <tr><td>${params.change > 0 ? "Balance" : "Due"}</td><td style="text-align:right">Rs ${(params.change > 0 ? params.change : params.due).toFixed(2)}</td></tr>
    </tbody></table>
    <div class="line"></div><p class="c small">Thank you!</p>
  </div></body></html>`;
}

type Variation = {
  id: string;
  name: string;
  price: number;
};

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
  brand: string;
  /** Set when loaded from API catalog (warehouse filter). */
  categoryId?: string;
  brandId?: string;
  variations?: Variation[];
};

type WarehouseOption = { _id: string; name: string; isActive?: boolean };

type Category = {
  id: string;
  name: string;
};

type Brand = {
  id: string;
  name: string;
};

type CartItem = Product & {
  quantity: number;
  selectedVariation?: Variation;
  /** Stable, unique key for React list rendering: `"<productId>-<variationId|base>"` */
  cartKey: string;
};

const POS_CART_DRAFT_PREFIX = "posCartDraft_v1";

function posCartDraftStorageKey(warehouseId: string): string {
  const sessionId =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("posSessionId") || "no-session"
      : "no-session";
  return `${POS_CART_DRAFT_PREFIX}_${sessionId}_${warehouseId}`;
}

function parsePersistedCartItem(raw: unknown): CartItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  const price = Number(o.price);
  if (!Number.isFinite(price)) return null;
  const qty = Number(o.quantity);
  const quantity = Number.isFinite(qty) ? Math.max(1, Math.floor(qty)) : 1;
  const image = typeof o.image === "string" && o.image.trim() ? o.image.trim() : CATALOG_PLACEHOLDER_IMG;
  const category = typeof o.category === "string" ? o.category : "";
  const brand = typeof o.brand === "string" ? o.brand : "";
  let selectedVariation: Variation | undefined;
  if (o.selectedVariation && typeof o.selectedVariation === "object") {
    const v = o.selectedVariation as Record<string, unknown>;
    const vp = Number(v.price);
    if (typeof v.id === "string" && typeof v.name === "string" && Number.isFinite(vp)) {
      selectedVariation = { id: v.id, name: v.name, price: vp };
    }
  }
  // Restore cartKey from persisted data, or derive it from id + variation.
  // Format: "<productId>-base" for no-variation, "<productId>-var:<variationId>" for
  // variation products. The "var:" prefix guarantees disjoint namespaces so a
  // variation whose id equals the string "base" can never collide (POS-184 / BUG-106).
  const cartKey =
    typeof o.cartKey === "string" && o.cartKey
      ? o.cartKey
      : selectedVariation
      ? `${o.id}-var:${selectedVariation.id}`
      : `${o.id}-base`;
  const item: CartItem = {
    id: o.id,
    name: o.name,
    price,
    image,
    category,
    brand,
    quantity,
    cartKey,
    ...(typeof o.categoryId === "string" ? { categoryId: o.categoryId } : {}),
    ...(typeof o.brandId === "string" ? { brandId: o.brandId } : {}),
    ...(selectedVariation ? { selectedVariation } : {}),
  };
  if (Array.isArray(o.variations)) {
    const vars = o.variations
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const u = x as Record<string, unknown>;
        const up = Number(u.price);
        if (typeof u.id !== "string" || typeof u.name !== "string" || !Number.isFinite(up)) return null;
        return { id: u.id, name: u.name, price: up };
      })
      .filter(Boolean) as Variation[];
    if (vars.length) item.variations = vars;
  }
  return item;
}

/** Default filter lists — just the "All" sentinel; real entries come from the backend catalog. */
const DEFAULT_CATEGORIES: Category[] = [{ id: "all", name: "All Categories" }];
const DEFAULT_BRANDS: Brand[] = [{ id: "all", name: "All Brands" }];

type ProductCardProps = {
  product: Product;
  onSelect: (product: Product) => void;
  currencyCode: string;
  selectedBrand: string;
};

const ProductCard: React.FC<ProductCardProps> = ({ product, onSelect, currencyCode, selectedBrand }) => {
  const normalizedBrand = product.brand.toLowerCase().replace(/\s+/g, "-");
  const isBrandMatch =
    selectedBrand !== "all" &&
    (product.brandId ? product.brandId === selectedBrand : normalizedBrand === selectedBrand);

  return (
    <div
      onClick={() => onSelect(product)}
      className="product-card glass-card rounded-2xl overflow-hidden shadow-lg hover-lift smooth-transition cursor-pointer group"
    >
      <div className="relative overflow-hidden p-4">
        <img
          src={product.image}
          alt={product.name}
          className="product-card-image w-[90%] mx-auto rounded-xl smooth-transition group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-navy-900/40 to-transparent opacity-0 group-hover:opacity-100 smooth-transition flex items-end justify-center pb-6">
          <button className="bg-white px-6 py-2.5 rounded-full font-bold text-[#1f3b63] shadow-lg ring-2 ring-offset-2 ring-[#1f3b63]/50 transform translate-y-4 group-hover:translate-y-0 smooth-transition hover:bg-[#1f3b63] hover:text-white">
            + Add to Cart
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="flex-1 min-h-0">
          <h3 className="font-semibold text-navy-900 mb-1.5 text-sm leading-tight line-clamp-2">
            {product.name}
          </h3>
          <span
            className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-[0.65rem] font-semibold uppercase tracking-[0.16em] mb-3 ${
              isBrandMatch
                ? "bg-[#1f3b63] text-white"
                : "bg-[#f5f7fb] text-[#1f3b63]"
            }`}
          >
            {product.brand}
          </span>
        </div>
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
          <p className="font-bold text-navy-700 text-base">
            {currencyCode} {product.price.toFixed(2)}
          </p>
          <span className="text-xs font-medium text-navy-600 bg-navy-50 px-2 py-0.5 rounded-full">
            {product.category}
          </span>
        </div>
      </div>
    </div>
  );
};

type CartItemProps = {
  item: CartItem;
  onUpdateQuantity: (item: CartItem, quantity: number) => void;
  onRemoveItem: (item: CartItem) => void;
  currencyCode: string;
};

const CartItemRow: React.FC<CartItemProps> = ({ item, onUpdateQuantity, onRemoveItem, currencyCode }) => (
  <div className="bg-white p-2.5 rounded-xl mb-2 border border-navy-200 shadow-sm smooth-transition hover:shadow-md hover:border-[#1f3b63]">
    <div className="flex items-center gap-2.5">
      <img
        src={item.image}
        alt={item.name}
        className="w-14 h-14 object-cover rounded-lg flex-shrink-0 border border-navy-100"
      />
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-navy-900 text-base truncate mb-1">
          {item.name}
        </h4>
        {item.selectedVariation && (
          <p className="text-sm text-navy-600 mb-1">
            {item.selectedVariation.name}
          </p>
        )}
        <p className="text-[#1f3b63] font-bold text-lg">
          {currencyCode} {item.price.toFixed(2)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpdateQuantity(item, Math.max(0, item.quantity - 1));
          }}
          className="w-8 h-8 bg-[#f5f7fb] hover:bg-[#1f3b63] text-[#1f3b63] hover:text-white border border-[#dde3f0] hover:border-[#1f3b63] rounded-lg font-bold text-base flex items-center justify-center smooth-transition hover-scale"
        >
          −
        </button>
        <span className="w-10 text-center font-bold text-[#1f3b63] text-base bg-[#f5f7fb] px-2 py-1 rounded-lg border border-[#dde3f0]">
          {item.quantity}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpdateQuantity(item, item.quantity + 1);
          }}
          className="w-8 h-8 bg-[#f5f7fb] hover:bg-[#1f3b63] text-[#1f3b63] hover:text-white border border-[#dde3f0] hover:border-[#1f3b63] rounded-lg font-bold text-base flex items-center justify-center smooth-transition hover-scale"
        >
          +
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveItem(item);
          }}
          className="w-8 h-8 bg-[#fff5f5] hover:bg-[#c24141] text-[#c24141] hover:text-white border border-[#fecaca] hover:border-[#c24141] rounded-lg flex items-center justify-center smooth-transition hover-scale"
          aria-label={`Remove ${item.name}`}
          title="Remove item"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-7 0 1 12h6l1-12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
);

type DiscountType = "fixed" | "percentage";
type DenominationKey = "20" | "50" | "100" | "500" | "1000" | "5000" | "1" | "2" | "5" | "10";
type Denominations = Record<DenominationKey, number>;
type RegisterReport = {
  sessionId: string;
  openTime: string;
  cashierName: string;
  openingCash: number;
  userSales: number;
  todayTotalSales: number;
  totalDiscount: number;
  cashPayments: number;
  cardPayments: number;
  bankTransferPayments: number;
};

type CustomerSearchItem = {
  _id: string;
  name: string;
  mobile?: string;
  NIC?: string;
};

const denominationKeys: DenominationKey[] = ["20", "50", "100", "500", "1000", "5000", "1", "2", "5", "10"];
const noteDenominationKeys: DenominationKey[] = ["20", "50", "100", "500", "1000", "5000"];
const coinDenominationKeys: DenominationKey[] = ["1", "2", "5", "10"];

const emptyDenominations: Denominations = {
  "20": 0,
  "50": 0,
  "100": 0,
  "500": 0,
  "1000": 0,
  "5000": 0,
  "1": 0,
  "2": 0,
  "5": 0,
  "10": 0
};

type ProductSelectionModalProps = {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number, variation?: Variation) => void;
  currencyCode: string;
};

const ProductSelectionModal: React.FC<ProductSelectionModalProps> = ({
  product,
  isOpen,
  onClose,
  onAddToCart,
  currencyCode,
}) => {
  const [selectedVariation, setSelectedVariation] = useState<Variation | null>(null);
  const [quantity, setQuantity] = useState(1);

  React.useEffect(() => {
    if (product) {
      // Set first variation as default if available
      if (product.variations && product.variations.length > 0) {
        setSelectedVariation(product.variations[0]);
      } else {
        setSelectedVariation(null);
      }
      setQuantity(1);
    }
  }, [product]);

  if (!isOpen || !product) return null;

  const currentPrice = selectedVariation ? selectedVariation.price : product.price;
  const total = currentPrice * quantity;

  const handleAddToCart = () => {
    onAddToCart(product, quantity, selectedVariation || undefined);
    onClose();
    setQuantity(1);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-slideUp flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Compact */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-100 bg-gradient-to-r from-white to-gray-50">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-lg sm:text-xl font-bold text-navy-900 truncate">{product.name}</h2>
            <p className="text-sm sm:text-base text-[#1f3b63] font-semibold mt-0.5">
              {currencyCode} {currentPrice.toFixed(2)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center smooth-transition flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Product Image - Compact */}
          <div className="p-3 sm:p-4 pb-2">
            <div className="relative overflow-hidden rounded-lg shadow-md">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-40 sm:h-48 object-cover"
              />
            </div>
          </div>

          {/* Variations - Compact */}
          {product.variations && product.variations.length > 0 && (
            <div className="px-3 sm:px-4 pb-3">
              <h3 className="text-xs sm:text-sm font-semibold text-navy-700 mb-2">Size</h3>
              <div className="grid grid-cols-3 gap-2">
                {product.variations.map((variation) => (
                  <button
                    key={variation.id}
                    onClick={() => setSelectedVariation(variation)}
                    className={`py-2 px-2 rounded-lg font-semibold text-xs sm:text-sm smooth-transition ${
                      selectedVariation?.id === variation.id
                        ? "bg-[#1f3b63] text-white shadow-md"
                        : "bg-[#f5f7fb] text-[#1f3b63] border border-[#dde3f0] hover:bg-white hover:border-[#1f3b63]"
                    }`}
                  >
                    {variation.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity Selector - Compact */}
          <div className="px-3 sm:px-4 pb-3">
            <h3 className="text-xs sm:text-sm font-semibold text-navy-700 mb-2">Quantity</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-9 h-9 bg-[#f5f7fb] hover:bg-[#1f3b63] text-[#1f3b63] hover:text-white border-2 border-[#dde3f0] hover:border-[#1f3b63] rounded-lg font-bold text-lg flex items-center justify-center smooth-transition"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 text-center text-lg font-bold text-[#1f3b63] bg-[#f5f7fb] border-2 border-[#dde3f0] rounded-lg py-2 px-2 focus:outline-none focus:border-[#1f3b63]"
                min="1"
              />
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-9 h-9 bg-[#f5f7fb] hover:bg-[#1f3b63] text-[#1f3b63] hover:text-white border-2 border-[#dde3f0] hover:border-[#1f3b63] rounded-lg font-bold text-lg flex items-center justify-center smooth-transition"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

          {/* Total - Compact */}
          <div className="px-3 sm:px-4 pb-3 border-t border-gray-100 pt-3">
            <div className="flex justify-between items-center bg-gradient-to-r from-[#f5f7fb] to-white p-3 rounded-lg">
              <span className="text-sm sm:text-base font-semibold text-navy-700">Total</span>
              <span className="text-lg sm:text-xl font-bold text-[#1f3b63]">
                {currencyCode} {total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Add to Cart Button - Fixed at Bottom */}
        <div className="p-3 sm:p-4 pt-2 border-t border-gray-100 bg-white">
          <button
            onClick={handleAddToCart}
            className="w-full bg-[#1f3b63] hover:bg-[#243b53] text-white py-2.5 sm:py-3 rounded-lg font-bold text-sm sm:text-base shadow-md smooth-transition hover:shadow-lg flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

type CartSidebarProps = {
  cartItems: CartItem[];
  discountType: DiscountType;
  setDiscountType: (t: DiscountType) => void;
  discount: number;
  setDiscount: (n: number) => void;
  tax: number;
  setTax: (n: number) => void;
  shipping: number;
  setShipping: (n: number) => void;
  specialOffers: Array<{ _id: string; offerName: string; percentage: number; status: string }>;
  selectedOfferId: string;
  setSelectedOfferId: (id: string) => void;
  offersLoading: boolean;
  offersError: boolean;
  customerQuery: string;
  setCustomerQuery: (v: string) => void;
  customerResults: CustomerSearchItem[];
  customerLoading: boolean;
  selectedCustomer: CustomerSearchItem | null;
  onSelectCustomer: (customer: CustomerSearchItem) => void;
  onClearCustomer: () => void;
  onUpdateQuantity: (item: CartItem, quantity: number) => void;
  onRemoveItem: (item: CartItem) => void;
  onHold: () => void;
  onReset: () => void;
  onPayNow: () => void;
  currencyCode: string;
};

const CartSidebar: React.FC<CartSidebarProps> = ({
  cartItems,
  discountType,
  setDiscountType,
  discount,
  setDiscount,
  tax,
  setTax,
  shipping,
  setShipping,
  customerQuery,
  setCustomerQuery,
  customerResults,
  customerLoading,
  selectedCustomer,
  specialOffers,
  selectedOfferId,
  setSelectedOfferId,
  offersLoading,
  offersError,
  onSelectCustomer,
  onClearCustomer,
  onUpdateQuantity,
  onRemoveItem,
  onHold,
  onReset,
  onPayNow,
  currencyCode,
}) => {

  const subtotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      ),
    [cartItems]
  );

  const selectedOffer = specialOffers.find((offer) => offer._id === selectedOfferId);
  const specialOfferDiscount = selectedOffer ? (subtotal * selectedOffer.percentage) / 100 : 0;
  const subtotalAfterOffer = Math.max(0, subtotal - specialOfferDiscount);
  const discountAmount =
    discountType === "percentage" ? (subtotalAfterOffer * discount) / 100 : discount;
  const taxableBase = subtotalAfterOffer - discountAmount + shipping;
  const taxAmount = (Math.max(0, taxableBase) * tax) / 100;
  const total = taxableBase + taxAmount;

  // Session validation for checkout
  const [hasSession, setHasSession] = useState(() => {
    if (typeof sessionStorage !== "undefined") {
      const sid = sessionStorage.getItem("posSessionId");
      return !!sid && sid !== "no-session";
    }
    return false;
  });

  useEffect(() => {
    const checkSession = () => {
      const sid = sessionStorage.getItem("posSessionId");
      setHasSession(!!sid && sid !== "no-session");
    };
    window.addEventListener("storage", checkSession);
    checkSession();
    return () => window.removeEventListener("storage", checkSession);
  }, []);

  const handlePayNowClick = () => {
    if (!hasSession) {
      showInfoToast("No active POS session found. Please start a session before checkout.");
      return;
    }
    onPayNow();
  };

  return (
    <div className="flex flex-col h-full p-3 min-h-0 space-y-3 overflow-hidden">
      {/* Customer Selection */}
      <div className="glass-card p-2.5 rounded-xl relative z-20 flex-shrink-0">
        {selectedCustomer ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-[#d1d5db] bg-white px-2.5 py-1.5 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-[#1f3b63]/10 text-[#1f3b63] flex items-center justify-center flex-shrink-0 font-bold text-xs">
              {selectedCustomer.name.trim().charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-bold text-[#111827] leading-tight truncate">
                {selectedCustomer.name}
              </p>
              <p className="text-[10px] text-[#6b7280] truncate">
                {selectedCustomer.mobile || "No mobile"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearCustomer}
              className="flex-shrink-0 text-xs font-semibold text-[#1f3b63] hover:underline px-1"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <svg
                className="w-4 h-4 text-[#9ca3af] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.6-4.15a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
              </svg>
              <input
                type="text"
                placeholder="Find Customer"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                className="w-full h-9 pl-8 pr-8 rounded-md border border-[#d1d5db] bg-white text-xs text-[#374151] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#1f3b63]/30 focus:border-[#1f3b63]"
              />
            </div>

            {(customerLoading || customerResults.length > 0) && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-md border border-[#d1d5db] bg-white shadow-lg max-h-48 overflow-y-auto custom-scrollbar">
                {customerLoading ? (
                  <div className="px-3 py-2 text-xs text-[#6b7280]">Searching...</div>
                ) : (
                  customerResults.map((customer) => {
                    const contact = [customer.mobile, customer.NIC].filter(Boolean).join(" | ") || "No mobile";
                    return (
                      <button
                        key={customer._id}
                        type="button"
                        onClick={() => onSelectCustomer(customer)}
                        className="w-full text-left px-3 py-2 text-xs text-[#111827] hover:bg-[#f3f4f6] border-b border-[#eef2f7] last:border-b-0 leading-snug"
                      >
                        <span className="font-semibold block truncate">{customer.name}</span>
                        <span className="text-[10px] text-gray-500 block truncate">{contact}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cart Items - Main Flex Expandable Container */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-0">
        <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
          <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
            <span>Cart Items</span>
            {cartItems.length > 0 && (
              <span className="bg-[#1f3b63] text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {cartItems.reduce((acc, i) => acc + i.quantity, 0)}
              </span>
            )}
          </h3>
          {cartItems.length > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-red-300 hover:text-red-100 transition font-medium"
            >
              Clear Cart
            </button>
          )}
        </div>

        <div className="custom-scrollbar pr-1 overflow-y-auto flex-1 min-h-0 space-y-2">
          {cartItems.length === 0 ? (
            <div className="glass-card rounded-2xl p-6 text-center flex flex-col items-center justify-center h-full min-h-[120px]">
              <svg
                className="w-12 h-12 mx-auto mb-2 text-navy-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              <p className="font-semibold text-navy-500 text-sm">
                Cart is empty
              </p>
              <p className="text-xs text-navy-400 mt-0.5">
                Add items to get started
              </p>
            </div>
          ) : (
            cartItems.map((item) => (
              <CartItemRow
                key={item.cartKey}
                item={item}
                onUpdateQuantity={onUpdateQuantity}
                onRemoveItem={onRemoveItem}
                currencyCode={currencyCode}
              />
            ))
          )}
        </div>
      </div>

      {/* Tax, Discount & Special Offer Section - Compact */}
      <div className="glass-card p-2.5 rounded-xl bg-white shadow-md flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-navy-900 text-xs uppercase tracking-wide">
            Tax, Discount &amp; Offer
          </span>
          <div className="flex items-center gap-1 bg-[#f5f7fb] p-0.5 rounded-lg border border-[#dde3f0]">
            <button
              type="button"
              onClick={() => setDiscountType("fixed")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold smooth-transition ${
                discountType === "fixed"
                  ? "bg-[#1f3b63] text-white shadow-xs"
                  : "text-[#1f3b63] hover:bg-white"
              }`}
            >
              Fixed
            </button>
            <button
              type="button"
              onClick={() => setDiscountType("percentage")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold smooth-transition ${
                discountType === "percentage"
                  ? "bg-[#1f3b63] text-white shadow-xs"
                  : "text-[#1f3b63] hover:bg-white"
              }`}
            >
              %
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div>
            <label className="block text-[10px] text-navy-900 font-bold uppercase mb-0.5">
              Discount {discountType === "percentage" ? "(%)" : ""}
            </label>
            <input
              type="number"
              value={discount === 0 ? "" : discount}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") { setDiscount(0); return; }
                const numeric = Number(raw);
                if (!Number.isFinite(numeric)) { setDiscount(0); return; }
                if (discountType === "percentage" && numeric > 100) {
                  setDiscount(100);
                  showInfoToast("Percentage discount cannot exceed 100%.");
                  return;
                }
                setDiscount(Math.max(0, numeric));
              }}
              className="w-full px-2 py-1 bg-white border border-navy-200 rounded-lg text-xs font-semibold text-navy-900 focus:border-[#1f3b63] focus:outline-none"
              placeholder="0"
            />
          </div>

          <div>
            <label className="block text-[10px] text-navy-900 font-bold uppercase mb-0.5">
              Tax (%)
            </label>
            <input
              type="number"
              value={tax === 0 ? "" : tax}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") { setTax(0); return; }
                const numeric = Number(raw);
                if (!Number.isFinite(numeric)) { setTax(0); return; }
                if (numeric > 100) {
                  setTax(100);
                  showInfoToast("Tax percentage cannot exceed 100%.");
                  return;
                }
                setTax(Math.max(0, numeric));
              }}
              className="w-full px-2 py-1 bg-white border border-navy-200 rounded-lg text-xs font-semibold text-navy-900 focus:border-[#1f3b63] focus:outline-none"
              placeholder="0"
              min="0"
              max="100"
            />
          </div>

          <div>
            <label className="block text-[10px] text-navy-900 font-bold uppercase mb-0.5">
              Shipping
            </label>
            <input
              type="number"
              value={shipping === 0 ? "" : shipping}
              onChange={(e) => {
                const raw = e.target.value;
                setShipping(raw === "" ? 0 : Number(raw) || 0);
              }}
              className="w-full px-2 py-1 bg-white border border-navy-200 rounded-lg text-xs font-semibold text-navy-900 focus:border-[#1f3b63] focus:outline-none"
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-navy-900 font-bold uppercase mb-0.5">
            Special Offer
          </label>
          <select
            value={selectedOfferId}
            onChange={(e) => setSelectedOfferId(e.target.value)}
            className="w-full px-2 py-1 bg-white border border-navy-200 rounded-lg text-xs font-semibold text-navy-900 focus:border-[#1f3b63] focus:outline-none"
          >
            <option value="">No offer selected</option>
            {offersLoading && <option disabled>Loading offers...</option>}
            {offersError && <option disabled>Failed to load offers</option>}
            {!offersLoading && !offersError && specialOffers.length === 0 && (
              <option disabled>No active offers</option>
            )}
            {specialOffers.map((offer) => (
              <option key={offer._id} value={offer._id}>
                {offer.offerName} — {offer.percentage}% off
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bill Calculating Summary Box - Compact */}
      <div className="bg-gradient-to-br from-navy-700 to-navy-900 p-2.5 rounded-xl shadow-xl border border-navy-600 flex-shrink-0">
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-white/80 font-medium">Subtotal</span>
            <span className="font-bold text-white text-xs">
              {currencyCode} {subtotal.toFixed(2)}
            </span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-white/80 font-medium">Discount</span>
              <span className="font-bold text-emerald-300 text-xs">
                -{currencyCode} {discountAmount.toFixed(2)}
              </span>
            </div>
          )}
          {selectedOffer && specialOfferDiscount > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-white/80 font-medium truncate max-w-[180px]">Offer: {selectedOffer.offerName}</span>
              <span className="font-bold text-emerald-300 text-xs">
                -{currencyCode} {specialOfferDiscount.toFixed(2)}
              </span>
            </div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-white/80 font-medium">Tax</span>
              <span className="font-bold text-white text-xs">
                {currencyCode} {taxAmount.toFixed(2)}
              </span>
            </div>
          )}
          {shipping > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-white/80 font-medium">Shipping</span>
              <span className="font-bold text-white text-xs">
                {currencyCode} {shipping.toFixed(2)}
              </span>
            </div>
          )}
          <div className="border-t border-white/20 pt-1.5 mt-1">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white text-sm">Total</span>
              <span className="font-extrabold text-white text-lg">
                {currencyCode} {total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={onHold}
          className="bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] text-[#e0a06d] py-2 rounded-xl font-bold smooth-transition hover-scale flex items-center justify-center gap-1 shadow-xs text-xs"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6v12M14 6v12" />
          </svg>
          Hold
        </button>
        <button
          type="button"
          onClick={onReset}
          className="bg-white hover:bg-[#f9fafb] border border-[#e5e7eb] text-[#c24141] py-2 rounded-xl font-bold smooth-transition hover-scale flex items-center justify-center gap-1 shadow-xs text-xs"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Reset
        </button>
        <button
          type="button"
          onClick={handlePayNowClick}
          className="bg-[#1f3b63] hover:bg-[#163052] text-white py-2 rounded-xl font-bold smooth-transition hover-scale flex items-center justify-center gap-1 shadow-md text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!hasSession}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
            <rect x="3" y="6.5" width="18" height="11" rx="2.2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5h18" />
          </svg>
          Pay Now
        </button>
      </div>
    </div>
  );
};

type POSCheckoutProps = {
  onSessionClosed?: () => void;
};

const POSCheckout: React.FC<POSCheckoutProps> = ({ onSessionClosed }) => {
  const { currencyCode } = useCurrency();
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [catalogItems, setCatalogItems] = useState<Product[]>([]);
  const [uiCategories, setUiCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [uiBrands, setUiBrands] = useState<Brand[]>(DEFAULT_BRANDS);
  const [catalogFromApi, setCatalogFromApi] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [barcodeQuery, setBarcodeQuery] = useState<string>("");
  const [nameCodeQuery, setNameCodeQuery] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("fixed");
  const [discount, setDiscount] = useState<number>(0);
  const [tax, setTax] = useState<number>(0);
  const [shipping, setShipping] = useState<number>(0);
  const [specialOffers, setSpecialOffers] = useState<Array<{ _id: string; offerName: string; percentage: number; status: string }>>([]);
  const [selectedOfferId, setSelectedOfferIdState] = useState<string>("");
  const [offersLoading, setOffersLoading] = useState<boolean>(false);
  const [offersError, setOffersError] = useState<boolean>(false);
  const [showCloseRegisterModal, setShowCloseRegisterModal] = useState(false);
  const [showRegisterReportModal, setShowRegisterReportModal] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [registerReport, setRegisterReport] = useState<RegisterReport | null>(null);
  const [closingDenominations, setClosingDenominations] = useState<Denominations>(emptyDenominations);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [cashPayment, setCashPayment] = useState<number>(0);
  const [cardPayment, setCardPayment] = useState<number>(0);
  const [bankPayment, setBankPayment] = useState<number>(0);
  const [customerQuery, setCustomerQuery] = useState<string>("");
  const [customerResults, setCustomerResults] = useState<CustomerSearchItem[]>([]);
  const [customerLoading, setCustomerLoading] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchItem | null>(null);

  const prevWarehouseRef = useRef<string | null>(null);
  /** Skip one persist pass after hydrating from localStorage so we do not overwrite the draft with empty state. */
  const skipNextCartPersistRef = useRef(false);
  const prevCartLengthRef = useRef(0);

  // Wrapper for selectedOfferId with localStorage persistence
  const setSelectedOfferId = (id: string) => {
    setSelectedOfferIdState(id);
    if (id) {
      localStorage.setItem("pos_selected_offer_id", id);
    } else {
      localStorage.removeItem("pos_selected_offer_id");
    }
  };

  // Restore selectedOfferId from localStorage on mount
  useEffect(() => {
    const savedOfferId = localStorage.getItem("pos_selected_offer_id");
    if (savedOfferId) {
      setSelectedOfferIdState(savedOfferId);
    }
  }, []);

  const handleDiscountTypeChange = (nextType: DiscountType) => {
    setDiscountType(nextType);
    if (nextType === "percentage") {
      // Prevent stale fixed discount values from becoming invalid percentages.
      setDiscount((prev) => Math.min(100, Math.max(0, prev)));
    }
  };

  // When cart is empty, reset discount and shipping
  React.useEffect(() => {
    if (cartItems.length === 0 && prevCartLengthRef.current > 0) {
      setDiscountType("fixed");
      setDiscount(0);
      setTax(0);
      setShipping(0);
      setSelectedOfferId("");
    }
    prevCartLengthRef.current = cartItems.length;
  }, [cartItems.length]);

  useEffect(() => {
    const fetchOffers = async () => {
      setOffersLoading(true);
      setOffersError(false);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${POS_API_BASE}/special-offers`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setSpecialOffers(
            data.data.filter((offer: any) => (offer.status || '').toString().toLowerCase() === 'active')
          );
        } else {
          setSpecialOffers([]);
          setOffersError(true);
        }
      } catch (err) {
        console.warn('Failed to fetch special offers', err);
        setSpecialOffers([]);
        setOffersError(true);
      } finally {
        setOffersLoading(false);
      }
    };

    fetchOffers();
  }, []);

  // Full screen functionality
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      // Enter fullscreen
      const element = document.documentElement;
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        // Safari
        (element as any).webkitRequestFullscreen();
      } else if ((element as any).msRequestFullscreen) {
        // IE/Edge
        (element as any).msRequestFullscreen();
      } else if ((element as any).mozRequestFullScreen) {
        // Firefox
        (element as any).mozRequestFullScreen();
      }
      setIsFullScreen(true);
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      }
      setIsFullScreen(false);
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('msfullscreenchange', handleFullScreenChange);
    document.addEventListener('mozfullscreenchange', handleFullScreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
      document.removeEventListener('msfullscreenchange', handleFullScreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullScreenChange);
    };
  }, []);

  useEffect(() => {
    const query = customerQuery.trim();
    if (!query) {
      setCustomerResults([]);
      setCustomerLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setCustomerLoading(true);
        const token = localStorage.getItem("token");
        const api = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;
        const res = await fetch(`${api}/customers?q=${encodeURIComponent(query)}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.message || "Failed to search customers");
        setCustomerResults(Array.isArray(payload?.data) ? payload.data.slice(0, 8) : []);
      } catch {
        setCustomerResults([]);
      } finally {
        setCustomerLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [customerQuery]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${POS_API_BASE}/warehouses`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((r) => r.json())
      .then((payload) => {
        const list = Array.isArray(payload?.data)
          ? (payload.data as WarehouseOption[]).filter((w) => w.isActive !== false)
          : [];
        setWarehouses(list);
        setSelectedWarehouseId((prev) => (prev ? prev : list[0] ? String(list[0]._id) : ""));
      })
      .catch(() => setWarehouses([]));
  }, []);

  useEffect(() => {
    // When the warehouse changes to a different one, clear the cart.
    if (
      prevWarehouseRef.current !== null &&
      prevWarehouseRef.current !== selectedWarehouseId
    ) {
      setCartItems([]);
    }
    prevWarehouseRef.current = selectedWarehouseId;

    // Always fetch from the backend:
    // - No warehouseId → backend returns all active products (real-time prices).
    // - With warehouseId → backend scopes prices to that warehouse.
    const token = localStorage.getItem("token");
    setCatalogLoading(true);
    const url = selectedWarehouseId
      ? `${POS_API_BASE}/pos/catalog?warehouseId=${encodeURIComponent(selectedWarehouseId)}`
      : `${POS_API_BASE}/pos/catalog`;
    fetch(url, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((r) => r.json())
      .then((payload) => {
        if (payload?.status !== "success" || !payload?.data) {
          throw new Error(payload?.message || "Catalog error");
        }
        const d = payload.data as {
          categories: Array<{ id: string; name: string }>;
          brands: Array<{ id: string; name: string }>;
          items: Array<{
            id: string;
            name: string;
            price: number;
            categoryId?: string;
            brandId?: string;
            image?: string;
            variations?: Variation[];
          }>;
        };
        const catMap = new Map(d.categories.map((c) => [c.id, c.name]));
        const brandMap = new Map(d.brands.map((b) => [b.id, b.name]));
        const mapped: Product[] = d.items.map((it) => ({
          id: it.id,
          name: it.name,
          price: it.price,
          image: it.image?.trim() ? it.image.trim() : CATALOG_PLACEHOLDER_IMG,
          category: catMap.get(it.categoryId || "") || "—",
          brand: brandMap.get(it.brandId || "") || "—",
          categoryId: it.categoryId,
          brandId: it.brandId,
          variations: it.variations,
        }));
        setCatalogItems(mapped);
        setUiCategories([
          { id: "all", name: "All Categories" },
          ...d.categories.map((c) => ({ id: c.id, name: c.name })),
        ]);
        setUiBrands([
          { id: "all", name: "All Brands" },
          ...d.brands.map((b) => ({ id: b.id, name: b.name })),
        ]);
        setCatalogFromApi(true);
        setSelectedCategory("all");
        setSelectedBrand("all");
      })
      .catch((error) => {
        showInfoToast("Could not load catalog. Please try again.");
        console.error("Catalog fetch error:", error);
        setCatalogFromApi(false);
        setCatalogItems([]);
        setUiCategories(DEFAULT_CATEGORIES);
        setUiBrands(DEFAULT_BRANDS);
        setSelectedCategory("all");
        setSelectedBrand("all");
      })
      .finally(() => setCatalogLoading(false));
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (!selectedWarehouseId) return;
    const key = posCartDraftStorageKey(selectedWarehouseId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, unknown>;
      let touched = false;
      if (Array.isArray(data.cartItems)) {
        const parsed = data.cartItems.map(parsePersistedCartItem).filter(Boolean) as CartItem[];
        if (parsed.length > 0) {
          setCartItems(parsed);
          touched = true;
        }
      }
      if (data.discountType === "percentage" || data.discountType === "fixed") {
        setDiscountType(data.discountType);
        touched = true;
      }
      if (typeof data.discount === "number" && Number.isFinite(data.discount) && data.discount >= 0) {
        setDiscount(data.discount);
        touched = true;
      }
      if (typeof data.tax === "number" && Number.isFinite(data.tax)) {
        setTax(Math.min(100, Math.max(0, data.tax)));
        touched = true;
      }
      if (typeof data.shipping === "number" && Number.isFinite(data.shipping) && data.shipping >= 0) {
        setShipping(data.shipping);
        touched = true;
      }
      if (typeof data.selectedOfferId === "string") {
        setSelectedOfferIdState(data.selectedOfferId);
        touched = true;
      }
      if (data.selectedCustomer && typeof data.selectedCustomer === "object") {
        const c = data.selectedCustomer as Record<string, unknown>;
        if (typeof c._id === "string" && typeof c.name === "string") {
          setSelectedCustomer({
            _id: c._id,
            name: c.name,
            ...(typeof c.mobile === "string" ? { mobile: c.mobile } : {}),
            ...(typeof c.NIC === "string" ? { NIC: c.NIC } : {}),
          });
          const q = data.customerQuery;
          setCustomerQuery(typeof q === "string" ? q : c.name);
          touched = true;
        }
      }
      if (touched) skipNextCartPersistRef.current = true;
    } catch {
      /* ignore corrupt draft */
    }
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (!selectedWarehouseId) return;
    if (skipNextCartPersistRef.current) {
      skipNextCartPersistRef.current = false;
      return;
    }
    const key = posCartDraftStorageKey(selectedWarehouseId);
    const emptyLine =
      cartItems.length === 0 &&
      discount === 0 &&
      tax === 0 &&
      shipping === 0 &&
      !selectedCustomer &&
      !selectedOfferId;
    try {
      if (emptyLine) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(
        key,
        JSON.stringify({
          cartItems,
          discountType,
          discount,
          tax,
          shipping,
          selectedCustomer,
          customerQuery: selectedCustomer ? customerQuery : "",
          selectedOfferId,
        })
      );
    } catch {
      /* quota / private mode */
    }
  }, [
    selectedWarehouseId,
    cartItems,
    discountType,
    discount,
    tax,
    shipping,
    selectedCustomer,
    customerQuery,
    selectedOfferId,
  ]);

  // F11 keyboard shortcut for fullscreen
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullScreen();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const productList = useMemo(() => {
    // Products are exclusively sourced from the live backend catalog.
    // Show nothing while the initial fetch is in flight; show results once ready.
    if (catalogLoading && !catalogFromApi) return [];
    return catalogFromApi ? catalogItems : [];
  }, [catalogLoading, catalogFromApi, catalogItems]);

  const filteredProducts = useMemo(
    () =>
      productList.filter((product) => {
        const normSelectedCat = normalizeFilterValue(selectedCategory);
        const matchesCategory =
          normSelectedCat === "all" ||
          (product.categoryId
            ? normalizeFilterValue(product.categoryId) === normSelectedCat
            : normalizeFilterValue(product.category) === normSelectedCat);

        const normSelectedBrand = normalizeFilterValue(selectedBrand);
        const matchesBrand =
          normSelectedBrand === "all" ||
          (product.brandId
            ? normalizeFilterValue(product.brandId) === normSelectedBrand
            : normalizeFilterValue(product.brand).replace(/\s+/g, "-") === normSelectedBrand);

        const nq = nameCodeQuery.trim().toLowerCase();
        const matchesNameCode =
          !nq || product.name.toLowerCase().includes(nq);

        const bq = barcodeQuery.trim();
        const matchesBarcode =
          !bq ||
          product.id === bq ||
          product.name.toLowerCase() === bq.toLowerCase();

        return matchesCategory && matchesBrand && matchesNameCode && matchesBarcode;
      }),
    [productList, selectedCategory, selectedBrand, nameCodeQuery, barcodeQuery]
  );

  const handleSelectProduct = (product: Product) => {
    const hasVariations = Array.isArray(product.variations) && product.variations.length > 0;

    if (hasVariations) {
      // Show modal only when user must pick a variation/quantity.
      setSelectedProduct(product);
      setIsModalOpen(true);
      return;
    }

    // For single products without variations, add directly to cart.
    handleAddToCartWithVariation(product, 1);
  };

  const handleAddToCartWithVariation = (product: Product, quantity: number, variation?: Variation) => {
    // Stable, unique cartKey with disjoint namespaces (POS-184 / BUG-106):
    //   No-variation  → "<productId>-base"
    //   With variation → "<productId>-var:<variationId>"
    // The "var:" prefix ensures a variation whose id equals the sentinel
    // "base" can never collide with the plain-product slot.
    const cartKey = variation ? `${product.id}-var:${variation.id}` : `${product.id}-base`;
    setCartItems((prev) => {
      const existing = prev.find((item) => item.cartKey === cartKey);

      if (existing) {
        return prev.map((item) =>
          item.cartKey === cartKey
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }

      const price = variation ? variation.price : product.price;
      return [...prev, {
        ...product,
        quantity,
        price,
        cartKey,
        selectedVariation: variation,
      }];
    });
  };

  const handleUpdateQuantity = (target: CartItem, quantity: number) => {
    if (quantity === 0) {
      setCartItems((prev) => prev.filter((item) => item.cartKey !== target.cartKey));
    } else {
      setCartItems((prev) =>
        prev.map((item) =>
          item.cartKey === target.cartKey ? { ...item, quantity } : item
        )
      );
    }
  };

  const handleRemoveItem = (target: CartItem) => {
    handleUpdateQuantity(target, 0);
  };

  const handleHold = () => {
    // Placeholder behaviour for now
    alert("Order held successfully!");
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to clear the cart?")) {
      setCartItems([]);
      setDiscountType("fixed");
      setDiscount(0);
      setTax(0);
      setShipping(0);
      setSelectedCustomer(null);
      setCustomerQuery("");
      setCustomerResults([]);
      setSelectedOfferId("");
      try {
        if (selectedWarehouseId) localStorage.removeItem(posCartDraftStorageKey(selectedWarehouseId));
      } catch {
        /* ignore */
      }
    }
  };

  const handlePayNow = async () => {
    if (cartItems.length === 0) {
      showInfoToast("Please add items to cart first!");
      return;
    }
    setShowCheckoutModal(true);
  };

  const sanitizePaymentInput = (value: string): number => {
    const cleaned = value.replace(/[^\d.]/g, "");
    if (!cleaned) return 0;
    const normalized = cleaned.replace(/^0+(?=\d)/, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const handleCheckoutSubmit = async (printBill = false) => {
    try {
      const token = localStorage.getItem("token");
      const sessionId = sessionStorage.getItem("posSessionId");
      const api = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;

      if (!sessionId) {
        throw new Error("No active POS session found");
      }

      const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const selectedOffer = specialOffers.find((offer) => offer._id === selectedOfferId);
      const specialOfferDiscount = selectedOffer ? (subtotal * selectedOffer.percentage) / 100 : 0;
      const subtotalAfterOffer = Math.max(0, subtotal - specialOfferDiscount);
      const discountAmount = discountType === "percentage" ? (subtotalAfterOffer * discount) / 100 : discount;
      const taxableBase = subtotalAfterOffer - discountAmount + shipping;
      const taxAmount = (Math.max(0, taxableBase) * tax) / 100;
      const checkoutTotal = taxableBase + taxAmount;
      const totalPaid = cashPayment + cardPayment + bankPayment;

      if (totalPaid <= 0) {
        showInfoToast("Enter at least one payment amount.");
        return;
      }
      if (totalPaid < checkoutTotal) {
        showInfoToast("Paid amount is less than total.");
        return;
      }

      const payments = [
        ...(cashPayment > 0 ? [{ type: "cash", amount: cashPayment }] : []),
        ...(cardPayment > 0 ? [{ type: "card", amount: cardPayment }] : []),
        ...(bankPayment > 0 ? [{ type: "bankTransfer", amount: bankPayment }] : []),
      ];

      const payload = {
        sessionId,
        customerId: selectedCustomer?._id,
        items: cartItems.map((item) => ({
          id: item.id,
          name: item.name,
          qty: item.quantity,
          price: item.price,
          ...(item.selectedVariation ? { variation: item.selectedVariation.id } : {})
        })),
        specialOfferId: selectedOfferId || undefined,
        specialOfferDiscount,
        discount,
        discountType,
        tax,
        shipping,
        payments,
        notes: ""
      };

      const res = await fetch(`${api}/pos/sale`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to process POS sale");
      }

      showSuccessToast("Payment processed successfully!");
      const billHtml = data?.billHtml || data?.data?.billHtml;
      if (printBill) {
        const htmlToPrint =
          typeof billHtml === "string" && billHtml.trim()
            ? billHtml
            : buildFallbackReceiptHtml({
                orderId: data?.data?.orderId,
                items: cartItems.map((item) => ({ name: item.name, quantity: item.quantity, price: item.price })),
                subtotal,
                discountAmount,
                shipping,
                taxAmount,
                total: checkoutTotal,
                paid: totalPaid,
                change: Math.max(0, totalPaid - checkoutTotal),
                due: Math.max(0, checkoutTotal - totalPaid),
                specialOfferDiscount,
              });
        printBillHtml(htmlToPrint);
      }
      setCartItems([]);
      setCashPayment(0);
      setCardPayment(0);
      setBankPayment(0);
      setShowCheckoutModal(false);
      try {
        if (selectedWarehouseId) localStorage.removeItem(posCartDraftStorageKey(selectedWarehouseId));
      } catch {
        /* ignore */
      }
      // Discount/shipping reset via useEffect when cart becomes empty
    } catch (e: any) {
      showInfoToast(e?.message || "Failed to process POS payment");
    }
  };

  const handleCloseRegister = () => {
    setShowCloseRegisterModal(true);
  };

  const calculateDenominationTotal = (denoms: Denominations) =>
    denominationKeys.reduce((sum, key) => sum + Number(key) * (denoms[key] || 0), 0);

  const countedCash = useMemo(() => calculateDenominationTotal(closingDenominations), [closingDenominations]);
  const cashVariance = useMemo(() => {
    if (!registerReport) return 0;
    return (registerReport.openingCash + registerReport.cashPayments) - countedCash;
  }, [registerReport, countedCash]);

  const setClosingQty = (key: DenominationKey, value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    setClosingDenominations(prev => ({ ...prev, [key]: safe }));
  };

  const confirmCloseRegister = async () => {
    try {
      const token = localStorage.getItem("token");
      const sessionId = sessionStorage.getItem("posSessionId");
      const api = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;
      if (!sessionId) throw new Error("No active POS session found");

      setReportLoading(true);
      const res = await fetch(`${api}/pos/report/${sessionId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.message || "Failed to load register report");

      setRegisterReport(payload?.data || null);
      setClosingDenominations(emptyDenominations);
      setShowCloseRegisterModal(false);
      setShowRegisterReportModal(true);
    } catch (e: any) {
      showInfoToast(e?.message || "Unable to load register report.");
    } finally {
      setReportLoading(false);
    }
  };

  const cancelCloseRegister = () => {
    setShowCloseRegisterModal(false);
    showInfoToast("Register close cancelled.");
  };

  const finalizeCloseRegister = async () => {
    try {
      const token = localStorage.getItem("token");
      const sessionId = sessionStorage.getItem("posSessionId");
      const api = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;
      if (!sessionId) throw new Error("No active POS session found");

      setCloseSubmitting(true);
      const res = await fetch(`${api}/pos/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ sessionId, denominations: closingDenominations })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.message || "Failed to close register");

      setShowRegisterReportModal(false);
      sessionStorage.removeItem("posSessionId");
      sessionStorage.removeItem("posSessionMeta");
      showSuccessToast("Register closed successfully.");
      onSessionClosed?.();
      window.setTimeout(() => navigate("/dashboard"), 700);
    } catch (e: any) {
      showInfoToast(e?.message || "Failed to close register.");
    } finally {
      setCloseSubmitting(false);
    }
  };

  const orderSubtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems]
  );
  const selectedOffer = useMemo(
    () => specialOffers.find((offer) => offer._id === selectedOfferId),
    [specialOffers, selectedOfferId]
  );
  const orderSpecialOfferDiscount = useMemo(
    () => (selectedOffer ? (orderSubtotal * selectedOffer.percentage) / 100 : 0),
    [selectedOffer, orderSubtotal]
  );
  const orderSubtotalAfterOffer = useMemo(
    () => Math.max(0, orderSubtotal - orderSpecialOfferDiscount),
    [orderSubtotal, orderSpecialOfferDiscount]
  );
  const orderDiscountAmount = useMemo(
    () => (discountType === "percentage" ? (orderSubtotalAfterOffer * discount) / 100 : discount),
    [discountType, discount, orderSubtotalAfterOffer]
  );
  const orderTaxableBase = useMemo(
    () => orderSubtotalAfterOffer - orderDiscountAmount + shipping,
    [orderSubtotalAfterOffer, orderDiscountAmount, shipping]
  );
  const orderTaxAmount = useMemo(
    () => (Math.max(0, orderTaxableBase) * tax) / 100,
    [orderTaxableBase, tax]
  );
  const orderGrandTotal = useMemo(
    () => Math.max(0, orderTaxableBase + orderTaxAmount),
    [orderTaxableBase, orderTaxAmount]
  );
  const orderPaid = cashPayment + cardPayment + bankPayment;
  const orderPaidOverTotal = orderPaid > orderGrandTotal;
  const orderDueOrBalanceLabel = orderPaidOverTotal ? "Balance" : "Due";
  const orderDueOrBalanceAmount = orderPaidOverTotal
    ? orderPaid - orderGrandTotal
    : Math.max(0, orderGrandTotal - orderPaid);

  const handleSelectCustomer = (customer: CustomerSearchItem) => {
    setSelectedCustomer(customer);
    setCustomerQuery(customer.name);
    setCustomerResults([]);
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
  };

  return (
    <div className="animated-gradient h-screen flex flex-col lg:flex-row overflow-hidden">
      <div className="w-full lg:w-[420px] glass border-r border-white/20 flex-shrink-0 h-full overflow-y-auto custom-scrollbar">
        <CartSidebar
          cartItems={cartItems}
          discountType={discountType}
          setDiscountType={handleDiscountTypeChange}
          discount={discount}
          setDiscount={setDiscount}
          tax={tax}
          setTax={setTax}
          shipping={shipping}
          setShipping={setShipping}
          customerQuery={customerQuery}
          setCustomerQuery={setCustomerQuery}
          customerResults={customerResults}
          customerLoading={customerLoading}
          selectedCustomer={selectedCustomer}
          specialOffers={specialOffers}
          selectedOfferId={selectedOfferId}
          setSelectedOfferId={setSelectedOfferId}
          offersLoading={offersLoading}
          offersError={offersError}
          onSelectCustomer={handleSelectCustomer}
          onClearCustomer={handleClearCustomer}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveItem={handleRemoveItem}
          onHold={handleHold}
          onReset={handleReset}
          onPayNow={handlePayNow}
          currencyCode={currencyCode}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="glass-white border-b border-gray-200 px-4 py-3 sm:px-5 flex-shrink-0 shadow-sm bg-[#f3f4f6]">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative flex-shrink-0">
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                disabled={warehouses.length === 0 || catalogLoading}
                className="h-11 pl-3 pr-9 rounded-lg border border-[#d1d5db] bg-white text-sm font-medium text-[#111827] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1f3b63]/20 focus:border-[#b8c4d4] min-w-[160px] disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label="Warehouse"
              >
                {warehouses.length === 0 ? (
                  <option value="">No warehouse</option>
                ) : (
                  warehouses.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name}
                    </option>
                  ))
                )}
              </select>
              <svg
                className="w-4 h-4 text-[#6b7280] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            <div className="flex flex-1 flex-wrap gap-2 min-w-0 items-center">
              <div className="relative flex-1 min-w-[160px]">
                <svg
                  className="w-4 h-4 text-[#9ca3af] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Scan Barcode"
                  value={barcodeQuery}
                  onChange={(e) => setBarcodeQuery(e.target.value)}
                  className="w-full h-11 pl-9 pr-3 rounded-lg border border-[#d1d5db] bg-white text-sm text-[#374151] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#1f3b63]/25 focus:border-[#1f3b63]"
                />
              </div>
              <div className="relative flex-1 min-w-[160px]">
                <input
                  type="text"
                  placeholder="Find By Name Code"
                  value={nameCodeQuery}
                  onChange={(e) => setNameCodeQuery(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg border border-[#d1d5db] bg-white text-sm text-[#374151] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#1f3b63]/25 focus:border-[#1f3b63]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end">
              <div className="flex gap-2 p-2 rounded-xl border border-[#1f2937] bg-white shadow-sm overflow-x-auto max-w-full">
                {[
                  {
                    icon: <img src="/icons/1.png" alt="" className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-sm" draggable={false} />,
                    title: "Dashboard",
                  },
                  {
                    icon: <img src="/icons/2.png" alt="" className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-sm" draggable={false} />,
                    title: "POS Sales",
                    onClick: () => navigate("/viewSales"),
                  },
                  {
                    icon: <img src="/icons/3.png" alt="" className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-sm" draggable={false} />,
                    title: "Close Register",
                    onClick: handleCloseRegister,
                  },
                  {
                    icon: <img src="/icons/4.png" alt="" className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-sm" draggable={false} />,
                    title: "Back to Dashboard",
                    onClick: () => navigate("/dashboard"),
                  },
                  {
                    icon: <img src="/icons/5.png" alt="" className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-sm" draggable={false} />,
                    title: isFullScreen ? "Exit Full Screen" : "Enter Full Screen",
                    onClick: toggleFullScreen,
                    active: isFullScreen,
                  },
                  {
                    icon: <img src="/icons/6.png" alt="" className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-sm" draggable={false} />,
                    title: "Calculator",
                    onClick: () => setShowCalculator(true),
                  },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    title={item.title}
                    onClick={item.onClick}
                    className={`min-w-[3.25rem] min-h-[3.25rem] w-14 h-14 sm:w-[3.75rem] sm:h-[3.75rem] shrink-0 rounded-lg bg-[#1f3b63] flex items-center justify-center smooth-transition hover:bg-[#163052] active:scale-[0.97] ${item.active ? "ring-2 ring-white/90 ring-offset-2 ring-offset-white" : ""}`}
                  >
                    {item.icon}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="h-11 px-5 rounded-lg font-bold text-sm sm:text-base bg-[#1f3b63] text-white shadow-sm hover:bg-[#163052] smooth-transition whitespace-nowrap"
              >
                View Menu
              </button>
            </div>
          </div>
        </div>

        <div className="glass-white px-5 py-4 border-b border-gray-200 flex-shrink-0 shadow-sm mb-3">
          <div className="mb-3">
            <h3 className="text-xs font-bold text-navy-800 mb-2.5 uppercase tracking-wide">
              Categories
            </h3>
            <div className="flex flex-wrap gap-2">
              {uiCategories.map((category) => {
                const isActive = normalizeFilterValue(selectedCategory) === normalizeFilterValue(category.id);

                return (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`px-4 py-2 rounded-lg font-semibold smooth-transition text-sm shadow-sm hover:shadow-md ${
                      isActive
                        ? "bg-[#1f3b63] text-white shadow-md ring-1 ring-[#1f3b63]/30 font-bold"
                        : "bg-[#f5f7fb] text-[#1f3b63] border border-[#dde3f0] hover:bg-white hover:border-[#1f3b63]"
                    }`}
                    type="button"
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-navy-800 mb-2.5 uppercase tracking-wide">
              Brands
            </h3>
            <div className="flex flex-wrap gap-2">
              {uiBrands.map((brand) => {
                const isActive = normalizeFilterValue(selectedBrand) === normalizeFilterValue(brand.id);

                return (
                  <button
                    key={brand.id}
                    onClick={() => setSelectedBrand(brand.id)}
                    className={`px-4 py-2 rounded-lg font-semibold smooth-transition text-sm shadow-sm hover:shadow-md ${
                      isActive
                        ? "bg-[#1f3b63] text-white shadow-md ring-1 ring-[#1f3b63]/30 font-bold"
                        : "bg-[#f5f7fb] text-[#1f3b63] border border-[#dde3f0] hover:bg-white hover:border-[#1f3b63]"
                    }`}
                    type="button"
                  >
                    {brand.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4 sm:px-4 md:px-5 lg:px-6 mt-3">
          {filteredProducts.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="glass-card rounded-3xl p-16 text-center max-w-md">
                {catalogLoading && selectedWarehouseId && !catalogFromApi ? (
                  <>
                    <p className="text-xl font-bold text-navy-700 mb-2">Loading products…</p>
                    <p className="text-sm text-navy-500">Fetching catalog for the selected warehouse.</p>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-24 h-24 mx-auto mb-6 text-navy-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-xl font-bold text-navy-700 mb-2">
                      No products found
                    </p>
                    <p className="text-sm text-navy-500">
                      Try adjusting your filters or search query
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="perfect-grid">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={handleSelectProduct}
                  currencyCode={currencyCode}
                  selectedBrand={selectedBrand}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Product Selection Modal */}
      <ProductSelectionModal
        product={selectedProduct}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedProduct(null);
        }}
        onAddToCart={handleAddToCartWithVariation}
        currencyCode={currencyCode}
      />

      {/* Calculator Modal */}
      {showCalculator && (
        <CalculatorModal
          onClose={() => setShowCalculator(false)}
        />
      )}

      {showCheckoutModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl min-w-0 rounded-2xl bg-[#f7f9fc] border border-[#cfd8e4] shadow-2xl overflow-hidden">
            <div className="max-h-[78vh] overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowCheckoutModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[#374151] hover:bg-[#e9edf3] smooth-transition"
                  aria-label="Back"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
                <div className="flex-1 h-9 rounded-xl border border-[#d9e2ee] bg-white flex items-center justify-center shadow-sm">
                  <h3 className="text-base font-semibold text-[#111827]">Checkout</h3>
                </div>
              </div>

              <div className="rounded-xl border border-[#d9e2ee] bg-white p-3">
                <h4 className="text-sm font-semibold text-[#1f2937] mb-2.5">Cart Items</h4>
                <div className="space-y-2">
                {cartItems.map((item) => (
                  <div key={`${item.id}-${item.selectedVariation?.id || "base"}`} className="flex items-center justify-between rounded-lg border border-[#edf1f6] px-2 py-1.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={item.image} alt={item.name} className="w-10 h-10 rounded-md object-cover border border-[#e5e7eb]" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1f2937] truncate">{item.name}</p>
                        {item.selectedVariation?.name && (
                          <p className="text-xs text-[#6b7280]">{item.selectedVariation.name}</p>
                        )}
                        <p className="text-xs font-semibold text-[#374151]">Rs {item.price.toFixed(2)}</p>
                      </div>
                    </div>
                    <span className="w-8 h-6 rounded-md border border-[#e5e7eb] bg-white flex items-center justify-center text-xs font-semibold text-[#374151]">
                      {item.quantity}
                    </span>
                  </div>
                ))}
                </div>
              </div>

              <div className="rounded-xl border border-[#d9e2ee] bg-white p-3">
                <h4 className="text-sm font-semibold text-[#1f2937] mb-2.5">Payment Method</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 min-w-0">
                  <div className="rounded-lg border border-[#e5e7eb] p-2.5 bg-[#fbfcfe] min-w-0">
                    <div className="flex items-center gap-2 text-[#7cb389] mb-1.5">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <rect x="3" y="6.5" width="18" height="11" rx="2" />
                        <path d="M7 12h4" />
                      </svg>
                      <span className="text-xs font-semibold text-[#1f2937]">Cash</span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cashPayment === 0 ? "" : String(cashPayment)}
                      onChange={(e) => setCashPayment(sanitizePaymentInput(e.target.value))}
                      className="w-full h-8 rounded-md border border-[#d5dfeb] bg-white px-2 text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div className="rounded-lg border border-[#e5e7eb] p-2.5 bg-[#fbfcfe] min-w-0">
                    <div className="flex items-center gap-2 text-[#5d79c9] mb-1.5">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <rect x="3" y="6.5" width="18" height="11" rx="2" />
                        <path d="M3 10.5h18" />
                      </svg>
                      <span className="text-xs font-semibold text-[#1f2937]">Card Payment</span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cardPayment === 0 ? "" : String(cardPayment)}
                      onChange={(e) => setCardPayment(sanitizePaymentInput(e.target.value))}
                      className="w-full h-8 rounded-md border border-[#d5dfeb] bg-white px-2 text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div className="rounded-lg border border-[#e5e7eb] p-2.5 bg-[#fbfcfe] min-w-0">
                    <div className="flex items-center gap-2 text-[#e07a7a] mb-1.5">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <rect x="7" y="2.5" width="10" height="19" rx="2" />
                        <path d="M11 18.5h2" />
                      </svg>
                      <span className="text-xs font-semibold text-[#1f2937]">Bank Transfer</span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={bankPayment === 0 ? "" : String(bankPayment)}
                      onChange={(e) => setBankPayment(sanitizePaymentInput(e.target.value))}
                      className="w-full h-8 rounded-md border border-[#d5dfeb] bg-white px-2 text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#d9e2ee] bg-white p-3">
                <h4 className="text-sm font-semibold text-[#1f2937] mb-2.5">Order Summary</h4>
                <div className="space-y-1.5 text-[13px] text-[#374151]">
                  <div className="flex justify-between"><span>Subtotal</span><span className="font-semibold">Rs {orderSubtotal.toFixed(2)}</span></div>
                  {orderDiscountAmount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount</span>
                      <span className="font-semibold">-Rs {orderDiscountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOffer && orderSpecialOfferDiscount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Offer: {selectedOffer.offerName} ({selectedOffer.percentage}%)</span>
                      <span className="font-semibold">-Rs {orderSpecialOfferDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between"><span>Delivery / Shipping</span><span className="font-semibold">Rs {shipping.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Tax ({tax.toFixed(2)}%)</span><span className="font-semibold">Rs {orderTaxAmount.toFixed(2)}</span></div>
                  <div className="flex justify-between border-t border-[#e5e7eb] pt-2 mt-2 text-base font-bold text-[#1f2937]"><span>Total</span><span>Rs {orderGrandTotal.toFixed(2)}</span></div>
                  <div className="flex justify-between gap-3 min-w-0"><span className="shrink-0">Paid Amount</span><span className="font-semibold text-right tabular-nums">Rs {orderPaid.toFixed(2)}</span></div>
                  <div className="flex justify-between gap-3 min-w-0">
                    <span className={`shrink-0 font-semibold ${orderPaidOverTotal ? "text-red-600" : "text-[#374151]"}`}>{orderDueOrBalanceLabel}</span>
                    <span className={`font-semibold text-right tabular-nums ${orderPaidOverTotal ? "text-red-600" : "text-[#111827]"}`}>Rs {orderDueOrBalanceAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Sale type</span>
                    <span className="px-2 py-0.5 rounded bg-[#eef2ff] text-[#6575a6] text-[11px] font-semibold">POS</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-[#d9e2ee] bg-[#f7f9fc] grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="h-10 rounded-lg bg-[#e7ecf2] text-[#4b5563] font-semibold border border-[#d3dbe6] hover:bg-[#dfe5ed] text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCheckoutSubmit(false)}
                className="h-10 rounded-lg bg-[#68ae59] hover:bg-[#5da04f] text-white font-semibold text-sm"
              >
                Submit Payment
              </button>
              <button
                type="button"
                onClick={() => handleCheckoutSubmit(true)}
                className="h-10 rounded-lg bg-[#2f3f6f] hover:bg-[#293862] text-white font-semibold text-sm"
              >
                Submit &amp; Print Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseRegisterModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-[#e5e7eb] overflow-hidden animate-slideUp">
            <div className="px-6 pt-6 pb-4">
              <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[#e8eef7] flex items-center justify-center border border-[#c9d5e8]">
                <svg className="w-7 h-7 text-[#1f3b63]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 3c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
              </div>
              <h3 className="text-center text-xl font-semibold text-[#111827]">Close Register?</h3>
              <p className="mt-2 text-center text-sm text-[#6b7280]">
                Are you sure you want to close the register for this session?
              </p>
            </div>

            <div className="px-6 pb-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={cancelCloseRegister}
                className="px-5 py-2.5 rounded-xl bg-[#eef2f7] text-[#1f3b63] font-medium border border-[#d5dfeb] hover:bg-[#e1e9f5] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCloseRegister}
                disabled={reportLoading}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#1f3b63] to-[#2b4d7a] text-white font-semibold shadow-md hover:opacity-95 transition"
              >
                {reportLoading ? "Loading..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRegisterReportModal && registerReport && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl rounded-xl bg-white shadow-2xl border border-[#dbe3ef] overflow-hidden animate-slideUp">
            <div className="px-6 py-4 border-b border-[#e5e7eb]">
              <h3 className="text-3xl font-semibold text-center text-[#1f3b63]">Register Report</h3>
            </div>

            <div className="p-5">
              <div className="rounded-md border border-[#e5e7eb] overflow-hidden">
                <div className="grid grid-cols-5 bg-[#f7f9fc] text-[11px] font-semibold text-[#6b7280] uppercase">
                  <div className="p-3 border-r border-[#e5e7eb]">Open Time</div>
                  <div className="p-3 border-r border-[#e5e7eb]">Cashier</div>
                  <div className="p-3 border-r border-[#e5e7eb]">Cash Hand In</div>
                  <div className="p-3 border-r border-[#e5e7eb]">Your Sale (without cash hand)</div>
                  <div className="p-3">Today Total Sale (without cash hand)</div>
                </div>
                <div className="grid grid-cols-5 text-sm bg-white">
                  <div className="p-3 border-r border-[#e5e7eb]"><span className="inline-block bg-[#fde8e8] text-[#b45353] px-2 py-1 rounded">{new Date(registerReport.openTime).toLocaleString()}</span></div>
                  <div className="p-3 border-r border-[#e5e7eb] font-medium">{registerReport.cashierName}</div>
                  <div className="p-3 border-r border-[#e5e7eb]"><span className="inline-block bg-[#e8f0fe] text-[#355f9a] px-2 py-1 rounded">LKR {registerReport.openingCash.toFixed(2)}</span></div>
                  <div className="p-3 border-r border-[#e5f8ea]"><span className="inline-block bg-[#e5f8ea] text-[#2f8f56] px-2 py-1 rounded">LKR {registerReport.userSales.toFixed(2)}</span></div>
                  <div className="p-3"><span className="inline-block bg-[#e5f8ea] text-[#2f8f56] px-2 py-1 rounded">LKR {registerReport.todayTotalSales.toFixed(2)}</span></div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mt-3 text-sm">
                <div><div className="mb-1">Total Discount :</div><div className="h-10 rounded border border-[#d8dee9] bg-[#f9fafb] px-3 flex items-center">LKR&nbsp;{registerReport.totalDiscount.toFixed(2)}</div></div>
                <div><div className="mb-1">Cash :</div><div className="h-10 rounded border border-[#d8dee9] bg-[#f9fafb] px-3 flex items-center">LKR&nbsp;{registerReport.cashPayments.toFixed(2)}</div></div>
                <div><div className="mb-1">Card :</div><div className="h-10 rounded border border-[#d8dee9] bg-[#f9fafb] px-3 flex items-center">LKR&nbsp;{registerReport.cardPayments.toFixed(2)}</div></div>
                <div><div className="mb-1">Bank Transfer :</div><div className="h-10 rounded border border-[#d8dee9] bg-[#f9fafb] px-3 flex items-center">LKR&nbsp;{registerReport.bankTransferPayments.toFixed(2)}</div></div>
              </div>

              <div className="mt-5 rounded-xl bg-[#f7f9fc] border border-[#e5e7eb] p-4">
                <div className="font-semibold text-[#1f3b63] mb-3">Handle Cash Balancing</div>
                <div className="grid grid-cols-12 gap-3 items-start">
                  <div className="col-span-5 grid grid-cols-2 gap-x-3 gap-y-2">
                    {[...noteDenominationKeys, ...coinDenominationKeys].map((k) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="w-10 text-sm">{k} x</span>
                        <input
                          type="number"
                          min="0"
                          value={closingDenominations[k]}
                          onChange={(e) => setClosingQty(k, Number(e.target.value) || 0)}
                          className="w-24 h-9 border border-[#d5dfeb] rounded px-2 text-center text-sm bg-white"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="col-span-3">
                    <div className="text-sm mb-1">Total Cash</div>
                    <div className={`h-10 rounded border px-3 flex items-center ${countedCash === 0 ? "border-[#e89aa0] bg-[#fff7f7] text-[#b45353]" : "border-[#d5dfeb] bg-white text-[#111827]"}`}>
                      LKR {countedCash.toFixed(2)}
                    </div>
                    {countedCash === 0 && <div className="text-xs text-[#c16a6a] mt-1">No cash detected</div>}
                  </div>

                  <div className="col-span-3">
                    <div className="text-sm mb-1">Cash Variance</div>
                    <div className="h-10 rounded border border-[#d5dfeb] bg-white px-3 flex items-center">
                      LKR {cashVariance.toFixed(2)}
                    </div>
                    <div className={`text-xs mt-1 ${Math.abs(cashVariance) < 0.0001 ? "text-green-600" : "text-red-600"}`}>
                      {Math.abs(cashVariance) < 0.0001 ? "Register is balanced" : "Variance detected"}
                    </div>
                  </div>

                  <div className="col-span-1 flex justify-center pt-6">
                    <div className="w-12 h-12 rounded bg-[#1f6d7a] text-white flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 2h8l1 3h3v17H4V5h3l1-3z" />
                        <path d="M8 8h8M8 12h8M8 16h5" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#e5e7eb] flex justify-start gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRegisterReportModal(false);
                  showInfoToast("Register close cancelled.");
                }}
                className="px-5 py-2 rounded-lg bg-[#eef2f7] text-[#1f3b63] border border-[#d5dfeb] hover:bg-[#e1e9f5] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={finalizeCloseRegister}
                disabled={closeSubmitting}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#1f3b63] to-[#2b4d7a] text-white font-semibold hover:opacity-95 transition"
              >
                {closeSubmitting ? "Closing..." : "Close the POS"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default POSCheckout;

