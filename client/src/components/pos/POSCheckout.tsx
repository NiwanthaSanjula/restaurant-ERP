import { POS_PRINT_CSS, printBillHtml } from '../../utils/printDocument';
import KitchenTicketAction from '../sales/KitchenTicketAction';
import type { KitchenTicketData } from '../../utils/kitchenTicket';
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useCurrency } from '../../contexts/CurrencyContext';
import { useBranding } from '../../contexts/BrandingProvider';
import CalculatorModal from "./CalculatorModal";
import POSLayout from './POSLayout';
import { usePermissions } from '../../contexts/PermissionContext';
import { Info, Minus, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from "react-router-dom";
import { showInfoToast, showSuccessToast } from "../../utils/toast";
import { clearPosCheckout, pendingPosCheckout, preparePosCheckout } from '../../services/posCheckoutRequest';
import { fetchPosLocations, resolvePosLocation, rememberPosLocation, validPosLocation } from '../../services/posLocation';
import { HOSTED_MODE } from '../../services/hostedMode';

const POS_API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;
const CATALOG_PLACEHOLDER_IMG = HOSTED_MODE
  ? '/portfolio-assets/menu-illustration.jpg'
  : "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop";

/** Normalize filter values for case-insensitive comparison. */
const normalizeFilterValue = (val: string): string => String(val || "").toLowerCase().trim();

function buildFallbackReceiptHtml(params: {
  companyName: string;
  currencyCode: string;
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
  date?: string;
}): string {
  const now = params.date ? new Date(params.date) : new Date();
  const companyName = params.companyName.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
  const currency = params.currencyCode.replace(/[<>&"']/g, '');
  const rows = params.items
    .map(
      (item) =>
        `<tr><td>${item.name.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char))}</td><td style="text-align:center">${item.quantity}</td><td style="text-align:right">${currency} ${(item.price * item.quantity).toFixed(2)}</td></tr>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Receipt</title><style>${POS_PRINT_CSS}</style></head><body><div class="r">
    <h2 class="c">${companyName}</h2>
    <p class="c small">POS Receipt</p>
    <p class="c small mt">${now.toLocaleString()}</p>
    ${params.orderId ? `<p class="c small">Order: ${params.orderId.replace(/[<>&"']/g, '')}</p>` : ""}
    <div class="line"></div>
    <table><tbody>${rows}</tbody></table>
    <div class="line"></div>
    <table><tbody>
      <tr><td>Subtotal</td><td style="text-align:right">${currency} ${params.subtotal.toFixed(2)}</td></tr>
      ${params.specialOfferDiscount && params.specialOfferDiscount > 0 ? `<tr><td>Special Offer</td><td style="text-align:right">${currency} -${params.specialOfferDiscount.toFixed(2)}</td></tr>` : ''}
      <tr><td>Discount</td><td style="text-align:right">${currency} ${params.discountAmount.toFixed(2)}</td></tr>
      <tr><td>Shipping</td><td style="text-align:right">${currency} ${params.shipping.toFixed(2)}</td></tr>
      <tr><td>Tax</td><td style="text-align:right">${currency} ${params.taxAmount.toFixed(2)}</td></tr>
      <tr><td><b>Total</b></td><td style="text-align:right"><b>${currency} ${params.total.toFixed(2)}</b></td></tr>
      <tr><td>Paid</td><td style="text-align:right">${currency} ${params.paid.toFixed(2)}</td></tr>
      <tr><td>Change</td><td style="text-align:right">${currency} ${params.change.toFixed(2)}</td></tr>
      <tr><td>Due</td><td style="text-align:right">${currency} ${params.due.toFixed(2)}</td></tr>
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
  code?: string;
  barcode?: string;
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

function posCartDraftStorageKey(warehouseId: string, demo = false): string {
  if (demo) return `${POS_CART_DRAFT_PREFIX}_public-demo_${warehouseId}`;
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
  onDetails: (product: Product) => void;
  onDecrease?: () => void;
  quantity: number;
  currencyCode: string;
};

const ProductCard: React.FC<ProductCardProps> = ({ product, onSelect, onDetails, onDecrease, quantity, currencyCode }) => (
  <article className="pos-product" data-product-id={product.id}>
    <button type="button" className="pos-product-details" onClick={() => onDetails(product)} aria-label={`Product details: ${product.name}`}>
      <img src={product.image} alt="" loading="lazy" />
      <span className="pos-product-name">{product.name}</span>
      <span className="pos-product-price">{currencyCode} {product.price.toFixed(2)}</span>
    </button>
    <div className="pos-product-controls">
      {quantity > 0 ? <>
        <button type="button" onClick={onDecrease} disabled={!onDecrease} aria-label={`Decrease ${product.name} in catalog`} title={onDecrease ? 'Decrease quantity' : 'Adjust individual variations in your order'}><Minus size={14} /></button>
        <output aria-label={`${product.name} quantity in order`}>{quantity}</output>
        <button type="button" onClick={() => onSelect(product)} aria-label={`Add ${product.name}`}><Plus size={14} /></button>
      </> : <button type="button" className="pos-add" onClick={() => onSelect(product)} aria-label={`Add ${product.name}`}><Plus size={14} />{product.variations?.length ? 'Choose options' : 'Add to order'}</button>}
    </div>
  </article>
);

type CartItemProps = {
  item: CartItem;
  onUpdateQuantity: (item: CartItem, quantity: number) => void;
  onRemoveItem: (item: CartItem) => void;
  currencyCode: string;
};

const CartItemRow: React.FC<CartItemProps> = ({ item, onUpdateQuantity, onRemoveItem, currencyCode }) => (
  <div className="pos-cart-line" data-cart-key={item.cartKey}>
    <img src={item.image} alt="" />
    <div className="pos-cart-line-info"><h4 title={item.name}>{item.name}</h4>{item.selectedVariation && <p>{item.selectedVariation.name}</p>}<strong>{currencyCode} {item.price.toFixed(2)}</strong></div>
    <div className="pos-stepper">
      <button type="button" aria-label={`Decrease ${item.name}`} onClick={() => onUpdateQuantity(item, Math.max(0, item.quantity - 1))}><Minus size={13} /></button>
      <output aria-label={`${item.name} cart quantity`}>{item.quantity}</output>
      <button type="button" aria-label={`Increase ${item.name}`} onClick={() => onUpdateQuantity(item, item.quantity + 1)}><Plus size={13} /></button>
    </div>
    <button type="button" className="pos-remove" aria-label={`Remove ${item.name}`} onClick={() => onRemoveItem(item)}><Trash2 size={14} /></button>
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
      role="dialog" aria-modal="true" aria-label="Product options" data-pos-dialog className="fixed inset-0 bg-overlay backdrop-blur-sm z-[120] flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-xl sm:rounded-2xl shadow-elevated max-w-sm w-full overflow-hidden animate-slideUp flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Compact */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-line bg-surface-muted">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">{product.name}</h2><p className="text-xs text-muted mt-1">{product.category} · {product.brand}</p>
            <p className="text-sm sm:text-base text-foreground font-semibold mt-0.5">
              {currencyCode} {currentPrice.toFixed(2)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-muted hover:bg-surface-muted active:bg-surface-muted flex items-center justify-center smooth-transition flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Product Image - Compact */}
          <div className="p-3 sm:p-4 pb-2">
            <div className="relative overflow-hidden rounded-lg">
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
              <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-2">Size</h3>
              <div className="grid grid-cols-3 gap-2">
                {product.variations.map((variation) => (
                  <button
                    key={variation.id}
                    onClick={() => setSelectedVariation(variation)}
                    className={`py-2 px-2 rounded-lg font-semibold text-xs sm:text-sm smooth-transition ${
                      selectedVariation?.id === variation.id
                        ? "bg-primary text-on-primary"
                        : "bg-surface-muted text-primary border border-line-strong hover:bg-surface hover:border-primary"
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
            <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-2">Quantity</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-9 h-9 bg-surface-muted hover:bg-primary-hover text-primary hover:text-on-primary border-2 border-line-strong hover:border-primary rounded-lg font-bold text-lg flex items-center justify-center smooth-transition"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 text-center text-lg font-bold text-foreground bg-surface-muted border-2 border-line-strong rounded-lg py-2 px-2 focus:outline-none focus:border-primary"
                min="1"
              />
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-9 h-9 bg-surface-muted hover:bg-primary-hover text-primary hover:text-on-primary border-2 border-line-strong hover:border-primary rounded-lg font-bold text-lg flex items-center justify-center smooth-transition"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

          {/* Total - Compact */}
          <div className="px-3 sm:px-4 pb-3 border-t border-line pt-3">
            <div className="flex justify-between items-center p-3 rounded-lg bg-surface-muted">
              <span className="text-sm sm:text-base font-semibold text-primary">Total</span>
              <span className="text-lg sm:text-xl font-bold text-primary">
                {currencyCode} {total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Add to Cart Button - Fixed at Bottom */}
        <div className="p-3 sm:p-4 pt-2 border-t border-line bg-surface">
          <button
            onClick={handleAddToCart}
            className="w-full bg-primary hover:bg-primary-hover text-on-primary py-2.5 sm:py-3 rounded-lg font-bold text-sm sm:text-base smooth-transition flex items-center justify-center gap-2"
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
  onReset,
  onPayNow,
  currencyCode,
}) => {
  const { isDemo } = usePermissions();

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
      setHasSession(isDemo || (!!sid && sid !== "no-session"));
    };
    window.addEventListener("storage", checkSession);
    checkSession();
    return () => window.removeEventListener("storage", checkSession);
  }, [isDemo]);

  const handlePayNowClick = () => {
    if (!hasSession) {
      showInfoToast("No active POS session found. Please start a session before checkout.");
      return;
    }
    onPayNow();
  };

  return (
    <div className="pos-order-body">
      {/* Customer Selection */}
      <div className="glass-card p-2.5 rounded-xl relative z-20 flex-shrink-0">
        {selectedCustomer ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5">
            <div className="w-8 h-8 rounded-full bg-primary-soft text-foreground flex items-center justify-center flex-shrink-0 font-bold text-xs">
              {selectedCustomer.name.trim().charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-bold text-foreground leading-tight truncate">
                {selectedCustomer.name}
              </p>
              <p className="text-[10px] text-muted truncate">
                {selectedCustomer.mobile || "No mobile"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearCustomer}
              className="flex-shrink-0 text-xs font-semibold text-primary hover:underline px-1"
            >
              Switch to Walk-in
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-foreground">Walk-in · no customer selected</p>
            <div className="relative">
              <svg
                className="w-4 h-4 text-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.6-4.15a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
              </svg>
              <input
                type="text"
                aria-label="Find customer" placeholder="Find Customer"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                className="w-full h-9 pl-8 pr-8 rounded-md border border-line-strong bg-surface text-xs text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {(customerLoading || customerResults.length > 0) && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-md border border-line-strong bg-surface max-h-48 overflow-y-auto custom-scrollbar">
                {customerLoading ? (
                  <div className="px-3 py-2 text-xs text-muted">Searching...</div>
                ) : (
                  customerResults.map((customer) => {
                    const contact = [customer.mobile, customer.NIC].filter(Boolean).join(" | ") || "No mobile";
                    return (
                      <button
                        key={customer._id}
                        type="button"
                        onClick={() => onSelectCustomer(customer)}
                        className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-surface-muted border-b border-line last:border-b-0 leading-snug"
                      >
                        <span className="font-semibold block truncate">{customer.name}</span>
                        <span className="text-[10px] text-muted block truncate">{contact}</span>
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
      <div className="pos-cart-section">
        <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
          <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
            <span>Cart Items</span>
            {cartItems.length > 0 && (
              <span className="bg-primary text-on-primary text-xs px-2 py-0.5 rounded-full font-bold">
                {cartItems.reduce((acc, i) => acc + i.quantity, 0)}
              </span>
            )}
          </h3>

          {cartItems.length > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-danger hover:text-danger transition font-medium"
            >
              Clear Cart
            </button>
          )}
        </div>

        <div className="pos-cart-lines custom-scrollbar">
          {cartItems.length === 0 ? (
            <div className="rounded-xl p-5 text-center flex flex-col items-center justify-center h-full min-h-[100px] text-muted">
              <svg
                className="w-9 h-9 mx-auto mb-2 text-subtle"
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
              <p className="font-semibold text-foreground text-sm">
                Cart is empty
              </p>
              <p className="text-xs text-muted mt-0.5">
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
      <details className="pos-adjustments"><summary>Adjustments &amp; offers</summary><div className="pos-adjustments-content">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Order discount</span>
          <div className="flex items-center gap-1 bg-surface-muted p-0.5 rounded-lg border border-line-strong">
            <button
              type="button"
              onClick={() => setDiscountType("fixed")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold smooth-transition ${
                discountType === "fixed"
                  ? "bg-primary text-on-primary"
                  : "text-foreground hover:bg-surface"
              }`}
            >
              Fixed
            </button>
            <button
              type="button"
              onClick={() => setDiscountType("percentage")}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold smooth-transition ${
                discountType === "percentage"
                  ? "bg-primary text-on-primary"
                  : "text-foreground hover:bg-surface"
              }`}
            >
              %
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div>
            <label htmlFor="pos-discount" className="block text-[10px] text-foreground font-bold uppercase mb-0.5">
              Discount {discountType === "percentage" ? "(%)" : ""}
            </label>
            <input
              type="number"
              id="pos-discount" value={discount === 0 ? "" : discount}
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
              className="w-full px-2 py-1 bg-surface border border-line rounded-lg text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
              placeholder="0"
            />
          </div>

          <div>
            <label htmlFor="pos-tax" className="block text-[10px] text-foreground font-bold uppercase mb-0.5">
              Tax (%)
            </label>
            <input
              type="number"
              id="pos-tax" value={tax === 0 ? "" : tax}
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
              className="w-full px-2 py-1 bg-surface border border-line rounded-lg text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
              placeholder="0"
              min="0"
              max="100"
            />
          </div>

          <div>
            <label htmlFor="pos-shipping" className="block text-[10px] text-foreground font-bold uppercase mb-0.5">
              Shipping
            </label>
            <input
              type="number"
              id="pos-shipping" value={shipping === 0 ? "" : shipping}
              onChange={(e) => {
                const raw = e.target.value;
                setShipping(raw === "" ? 0 : Number(raw) || 0);
              }}
              className="w-full px-2 py-1 bg-surface border border-line rounded-lg text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <label htmlFor="pos-offer" className="block text-[10px] text-foreground font-bold uppercase mb-0.5">
            Special Offer
          </label>
          <select
            id="pos-offer" value={selectedOfferId}
            onChange={(e) => setSelectedOfferId(e.target.value)}
            className="w-full px-2 py-1 bg-surface border border-line rounded-lg text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
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
      </div></details>

      {/* Bill Calculating Summary Box - Compact */}
      <div className="pos-summary">
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-foreground font-medium">Subtotal</span>
            <span className="font-bold text-foreground text-xs">
              {currencyCode} {subtotal.toFixed(2)}
            </span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-foreground font-medium">Discount</span>
              <span className="font-bold text-secondary text-xs">
                -{currencyCode} {discountAmount.toFixed(2)}
              </span>
            </div>
          )}
          {selectedOffer && specialOfferDiscount > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-foreground font-medium truncate max-w-[180px]">Offer: {selectedOffer.offerName}</span>
              <span className="font-bold text-secondary text-xs">
                -{currencyCode} {specialOfferDiscount.toFixed(2)}
              </span>
            </div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-foreground font-medium">Tax</span>
              <span className="font-bold text-foreground text-xs">
                {currencyCode} {taxAmount.toFixed(2)}
              </span>
            </div>
          )}
          {shipping > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-foreground font-medium">Shipping</span>
              <span className="font-bold text-foreground text-xs">
                {currencyCode} {shipping.toFixed(2)}
              </span>
            </div>
          )}
          <div className="border-t border-line/20 pt-1.5 mt-1">
            <div className="flex justify-between items-center">
              <span className="font-bold text-foreground text-sm">Total</span>
              <span className="font-extrabold text-foreground text-lg">
                {currencyCode} {total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="pos-checkout-actions">
        <button type="button" onClick={onReset} className="border border-line bg-surface text-muted flex items-center justify-center" aria-label="Reset order" title="Reset order"><Trash2 size={17} /></button>
        <button type="button" onClick={handlePayNowClick} className="bg-primary text-on-primary font-semibold text-sm disabled:opacity-50" disabled={!hasSession}>
          Checkout <span className="ml-2 opacity-80">{currencyCode} {total.toFixed(2)}</span>
        </button>
      </div>
    </div>
  );
};

type POSCheckoutProps = {
  onSessionClosed?: () => void;
};

const POSCheckout: React.FC<POSCheckoutProps> = ({ onSessionClosed }) => {
  const { isDemo, userId } = usePermissions();
  const { companyName } = useBranding();
  const { currencyCode } = useCurrency();
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationError, setLocationError] = useState('');
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
  const [completedPrint, setCompletedPrint] = useState<{ saleId: string; reference: string; receiptHtml: string; kitchenTicket?: KitchenTicketData } | null>(null);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<{ message: string; customerUnavailable: boolean } | null>(null);
  const checkoutInFlight = useRef(false);
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
      localStorage.setItem((isDemo ? "pos_demo_selected_offer_id" : "pos_selected_offer_id"), id);
    } else {
      localStorage.removeItem((isDemo ? "pos_demo_selected_offer_id" : "pos_selected_offer_id"));
    }
  };

  // Restore selectedOfferId from localStorage on mount
  useEffect(() => {
    const savedOfferId = localStorage.getItem((isDemo ? "pos_demo_selected_offer_id" : "pos_selected_offer_id"));
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
    const controller = new AbortController();
    setLocationsLoading(true); setLocationError('');
    fetchPosLocations(controller.signal).then(({ locations, defaultWarehouseId }) => {
      if (controller.signal.aborted) return;
      setWarehouses(locations);
      setSelectedWarehouseId(resolvePosLocation(userId, locations, defaultWarehouseId, localStorage));
    }).catch(error => {
      if (controller.signal.aborted) return;
      setWarehouses([]); setSelectedWarehouseId('');
      setLocationError(error instanceof Error ? error.message : 'Selling locations could not be loaded.');
    }).finally(() => { if (!controller.signal.aborted) setLocationsLoading(false); });
    return () => controller.abort();
  }, [userId]);

  const handleLocationChange = (nextId: string) => {
    if (nextId === selectedWarehouseId || !validPosLocation(nextId, warehouses)) return;
    try {
      const sessionId = sessionStorage.getItem('posSessionId');
      if (!isDemo && sessionId && pendingPosCheckout(localStorage, sessionId)) {
        showInfoToast('An unconfirmed payment is tied to the current selling location. Reconcile or retry it before switching.'); return;
      }
      if (cartItems.length) {
        if (!window.confirm('Keep this cart as a draft for the current selling location and switch locations?')) return;
        localStorage.setItem(posCartDraftStorageKey(selectedWarehouseId, isDemo), JSON.stringify({ cartItems, discountType, discount, tax, shipping, selectedCustomer, customerQuery, selectedOfferId }));
      }
    } catch { showInfoToast('The cart could not be saved. Clear it or restore browser storage before changing selling location.'); return; }
    if (!rememberPosLocation(userId, nextId, warehouses, localStorage)) showInfoToast('This location is selected for this visit, but could not be remembered on this device.');
    setNameCodeQuery(''); setBarcodeQuery(''); setSelectedCategory('all'); setSelectedBrand('all');
    setSelectedWarehouseId(nextId);
  };

  useEffect(() => {
    // When the warehouse changes to a different one, clear the cart.
    if (
      prevWarehouseRef.current !== null &&
      prevWarehouseRef.current !== selectedWarehouseId
    ) {
      setCartItems([]);
    }
    prevWarehouseRef.current = selectedWarehouseId;

    // Only show the selected warehouse; cancel older catalog requests on change.
    const token = localStorage.getItem("token");
    const controller = new AbortController();
    setCatalogFromApi(false);
    setCatalogItems([]);
    if (!selectedWarehouseId) {
      setCatalogLoading(false);
      return () => controller.abort();
    }
    setCatalogLoading(true);
    const url = `${POS_API_BASE}/pos/catalog?warehouseId=${encodeURIComponent(selectedWarehouseId)}`;
    fetch(url, {
      signal: controller.signal,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((r) => r.json())
      .then((payload) => {
        if (payload?.status !== "success" || !payload?.data) {
          throw new Error(payload?.message || "Catalog error");
        }
        if (controller.signal.aborted) return;
        const d = payload.data as {
          categories: Array<{ id: string; name: string }>;
          brands: Array<{ id: string; name: string }>;
          items: Array<{
            id: string;
            name: string;
            code?: string;
            barcode?: string;
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
          code: it.code,
          barcode: it.barcode,
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
        if (controller.signal.aborted) return;
        showInfoToast("Could not load catalog. Please try again.");
        console.error("Catalog fetch error:", error);
        setCatalogFromApi(false);
        setCatalogItems([]);
        setUiCategories(DEFAULT_CATEGORIES);
        setUiBrands(DEFAULT_BRANDS);
        setSelectedCategory("all");
        setSelectedBrand("all");
      })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (!selectedWarehouseId) return;
    // Never save the previous location's render into the new location's draft.
    skipNextCartPersistRef.current = true;
    setCartItems([]); setDiscountType('fixed'); setDiscount(0); setTax(0); setShipping(0);
    setSelectedCustomer(null); setCustomerQuery(''); setCustomerResults([]); setSelectedOfferIdState('');
    const key = posCartDraftStorageKey(selectedWarehouseId, isDemo);
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
    const key = posCartDraftStorageKey(selectedWarehouseId, isDemo);
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
          !nq || product.name.toLowerCase().includes(nq) || (product.code || '').toLowerCase().includes(nq);

        const bq = barcodeQuery.trim();
        const matchesBarcode =
          !bq ||
          product.barcode === bq ||
          (product.code || '').toLowerCase() === bq.toLowerCase() ||
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
        if (selectedWarehouseId) localStorage.removeItem(posCartDraftStorageKey(selectedWarehouseId, isDemo));
      } catch {
        /* ignore */
      }
    }
  };

  const handlePayNow = async () => {
    if (!validPosLocation(selectedWarehouseId, warehouses)) { showInfoToast('Choose an available selling location before checkout.'); return; }
    if (cartItems.length === 0) {
      showInfoToast("Please add items to cart first!");
      return;
    }
    try {
      if (isDemo) { setShowCheckoutModal(true); return; }
      const sessionId = sessionStorage.getItem('posSessionId');
      const pending = sessionId ? pendingPosCheckout(localStorage, sessionId) : null;
      if (pending && Array.isArray(pending.payload.payments)) {
        const payments = pending.payload.payments as Array<{ type: string; amount: number }>;
        setCashPayment(payments.find(payment => payment.type === 'cash')?.amount ?? 0);
        setCardPayment(payments.find(payment => payment.type === 'card')?.amount ?? 0);
        setBankPayment(payments.find(payment => payment.type === 'bankTransfer')?.amount ?? 0);
        showInfoToast('An earlier payment is unconfirmed. Submitting will retry it; do not collect payment again.');
      }
      setShowCheckoutModal(true);
    } catch {
      showInfoToast('Pending payment storage is unavailable. Confirm the previous payment before continuing.');
    }
  };

  const sanitizePaymentInput = (value: string): number => {
    const cleaned = value.replace(/[^\d.]/g, "");
    if (!cleaned) return 0;
    const normalized = cleaned.replace(/^0+(?=\d)/, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const handleCheckoutSubmit = async (printBill = false) => {
    if (isDemo) { showInfoToast('Read-only demo: checkout is a preview. No sale will be submitted.'); return; }
    if (checkoutInFlight.current) return;
    checkoutInFlight.current = true;
    setCheckoutSubmitting(true);
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
        warehouseId: selectedWarehouseId,
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

      const request = preparePosCheckout(localStorage, payload);
      setCheckoutError(null);
      const res = await fetch(`${api}/pos/sale`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(request)
      });
      const data = await res.json();
      if (!res.ok) {
        // A validation failure rolls back the transaction and allows correction.
        // Ambiguous failures retain the ID so a retry cannot duplicate a sale.
        if (res.status === 400) clearPosCheckout(localStorage, sessionId, request.checkoutRequestId);
        setCheckoutError({ message: data?.message || 'Failed to process POS sale', customerUnavailable: data?.code === 'customer_unavailable' });
        throw new Error(data?.message || "Failed to process POS sale");
      }

      const receipt = data?.data;
      if (!receipt || !Array.isArray(receipt.items) || typeof receipt.total !== 'number' || typeof receipt.change !== 'number') {
        throw new Error('Payment response could not be confirmed. Retry the same payment.');
      }
      showSuccessToast(data.replayed ? "Previous payment confirmed." : "Payment processed successfully!");
      const billHtml = data?.billHtml || data?.data?.billHtml;
      const htmlToPrint =
        typeof billHtml === "string" && billHtml.trim()
          ? billHtml
          : buildFallbackReceiptHtml({ ...receipt, currencyCode, companyName });
      setCompletedPrint({ saleId: receipt.saleId, reference: receipt.orderId, receiptHtml: htmlToPrint, kitchenTicket: receipt.kitchenTicket });
      setCartItems([]);
      setCashPayment(0);
      setCardPayment(0);
      setBankPayment(0);
      setShowCheckoutModal(false);
      setCheckoutError(null);
      try {
        clearPosCheckout(localStorage, sessionId, request.checkoutRequestId);
        if (selectedWarehouseId) localStorage.removeItem(posCartDraftStorageKey(selectedWarehouseId, isDemo));
      } catch {
        /* ignore */
      }
      // Discount/shipping reset via useEffect when cart becomes empty
      if (printBill) printBillHtml(htmlToPrint);
    } catch (e: any) {
      showInfoToast(e?.message || "Failed to process POS payment");
    } finally {
      checkoutInFlight.current = false;
      setCheckoutSubmitting(false);
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
    setCheckoutError(null);
    setSelectedCustomer(customer);
    setCustomerQuery(customer.name);
    setCustomerResults([]);
  };

  const handleClearCustomer = () => {
    setCheckoutError(null);
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
  };

  return (
    <div className="ss-pos">
      <POSLayout quantity={cartItems.reduce((sum, item) => sum + item.quantity, 0)} total={`${currencyCode} ${orderGrandTotal.toFixed(2)}`}
        isFullScreen={isFullScreen} onDashboard={() => navigate('/dashboard')} onSales={() => navigate('/viewSales')}
        onCalculator={() => setShowCalculator(true)} onFullScreen={toggleFullScreen} onCloseRegister={handleCloseRegister}
        catalog={<>
          <div className="pos-toolbar">
            <label className="pos-field"><span>Selling location</span><select
                value={selectedWarehouseId}
                onChange={(e) => handleLocationChange(e.target.value)}
                disabled={locationsLoading || warehouses.length === 0 || catalogLoading}
                className="pos-toolbar-input"
                aria-label="Selling location"
              >
                <option value="" disabled>{locationsLoading ? 'Loading locations…' : 'Choose selling location'}</option>
                {warehouses.length > 0 && (
                  warehouses.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name}
                    </option>
                  ))
                )}
              </select></label>
            <label className="pos-field"><span>Barcode</span><input
                  type="text"
                  placeholder="Scan Barcode"
                  value={barcodeQuery}
                  onChange={(e) => setBarcodeQuery(e.target.value)}
                  className="pos-toolbar-input"
                /></label>
            <label className="pos-field"><span>Find a product</span><input
                  type="text"
                  placeholder="Find By Name Code"
                  value={nameCodeQuery}
                  onChange={(e) => setNameCodeQuery(e.target.value)}
                  className="pos-toolbar-input"
                /></label>
          </div>
          {(locationError || (!locationsLoading && !selectedWarehouseId)) && <p role="status" className="px-5 pb-3 text-sm text-muted">{locationError || (warehouses.length ? 'No valid saved or default selling location. Choose a location to browse its catalog.' : 'No authorized active selling locations are available. Ask an administrator to review location setup.')}</p>}
          <div className="pos-filters">
            <div className="pos-categories" role="group" aria-label="Product categories">
              {uiCategories.map(category => <button key={category.id} type="button" className="pos-category" aria-pressed={selectedCategory === category.id} onClick={() => setSelectedCategory(category.id)}>{category.name}</button>)}
            </div>
            <div className="pos-brand-row"><label>Brand <select aria-label="Brand" value={selectedBrand} onChange={event => setSelectedBrand(event.target.value)}>{uiBrands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><span>{filteredProducts.length} products</span></div>
          </div>
          <div className="pos-products-scroll custom-scrollbar" aria-label="Product catalog">
            {catalogLoading || locationsLoading ? <div className="ss-state" role="status">Loading products…</div> : !selectedWarehouseId ? <div className="ss-state"><h2 className="font-semibold">Choose a selling location</h2><p className="mt-1 text-xs text-muted">Use the Selling location selector above to load its catalog.</p></div> : filteredProducts.length === 0 ? <div className="ss-state"><Info size={24} className="mx-auto mb-3 text-subtle" /><h2 className="font-semibold text-foreground">No sellable products found</h2><p className="mt-1 text-xs">Try another search, category, or warehouse. POS requires Active items explicitly marked Sellable; unclassified items need review in Products.</p></div> :
              <div className="pos-product-grid">{filteredProducts.map(product => {
                const baseItem = cartItems.find(item => item.id === product.id && !item.selectedVariation);
                const quantity = cartItems.filter(item => item.id === product.id).reduce((sum, item) => sum + item.quantity, 0);
                return <ProductCard key={product.id} product={product} onSelect={handleSelectProduct}
                  onDetails={item => { setSelectedProduct(item); setIsModalOpen(true); }}
                  onDecrease={baseItem ? () => handleUpdateQuantity(baseItem, Math.max(0, baseItem.quantity - 1)) : undefined}
                  quantity={quantity} currencyCode={currencyCode} />;
              })}</div>}
          </div>
        </>}
        order={        <CartSidebar
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
          onReset={handleReset}
          onPayNow={handlePayNow}
          currencyCode={currencyCode}
        />}
      />

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
        <div role="dialog" aria-modal="true" aria-label={isDemo ? 'Checkout preview' : 'Checkout'} data-pos-dialog className="fixed inset-0 z-[120] flex items-center justify-center bg-overlay backdrop-blur-sm p-4">
          <div className="pos-dialog-panel w-full max-w-4xl min-w-0 rounded-2xl bg-surface-raised border border-line-strong shadow-elevated overflow-hidden">
            <div className="max-h-[78vh] overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowCheckoutModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-foreground hover:bg-surface-muted smooth-transition"
                  aria-label="Back"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
                <div className="flex-1 h-9 rounded-xl border border-line-strong bg-surface flex items-center justify-center">
                  <h3 className="text-base font-semibold text-foreground">{isDemo ? 'Checkout preview · Read-only demo' : 'Checkout'}</h3>
                </div>
              </div>

              <div className="rounded-xl border border-line-strong bg-surface p-3">
                <h4 className="text-sm font-semibold text-foreground mb-2.5">Cart Items</h4>
                {checkoutError && <div role="alert" className="mb-3 rounded-lg border border-danger-line bg-danger-soft p-3 text-sm"><p>{checkoutError.message}</p>{checkoutError.customerUnavailable && <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="ss-button" onClick={handleClearCustomer}>Switch to Walk-in</button><button type="button" className="ss-button" onClick={() => setShowCheckoutModal(false)}>Choose another customer</button></div>}</div>}
                <p className="mb-2 text-xs text-muted">Customer: {selectedCustomer?.name || 'Walk-in'}</p>
                <p className="mb-2 text-xs text-muted">Warehouse: {warehouses.find(warehouse => String(warehouse._id) === selectedWarehouseId)?.name || 'Not selected'}</p>
                <div className="space-y-2">
                {cartItems.map((item) => (
                  <div key={`${item.id}-${item.selectedVariation?.id || "base"}`} className="flex items-center justify-between rounded-lg border border-line px-2 py-1.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={item.image} alt={item.name} className="w-10 h-10 rounded-md object-cover border border-line" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                        {item.selectedVariation?.name && (
                          <p className="text-xs text-muted">{item.selectedVariation.name}</p>
                        )}
                        <p className="text-xs font-semibold text-foreground">Rs {item.price.toFixed(2)}</p>
                      </div>
                    </div>
                    <span className="w-8 h-6 rounded-md border border-line bg-surface flex items-center justify-center text-xs font-semibold text-foreground">
                      {item.quantity}
                    </span>
                  </div>
                ))}
                </div>
              </div>

              <div className="rounded-xl border border-line-strong bg-surface p-3">
                <h4 className="text-sm font-semibold text-foreground mb-2.5">Payment Method</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 min-w-0">
                  <div className="rounded-lg border border-line p-2.5 bg-surface-raised min-w-0">
                    <div className="flex items-center gap-2 text-secondary mb-1.5">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <rect x="3" y="6.5" width="18" height="11" rx="2" />
                        <path d="M7 12h4" />
                      </svg>
                      <span className="text-xs font-semibold text-foreground">Cash</span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Cash payment" value={cashPayment === 0 ? "" : String(cashPayment)}
                      onChange={(e) => setCashPayment(sanitizePaymentInput(e.target.value))}
                      className="w-full h-8 rounded-md border border-line-strong bg-surface px-2 text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div className="rounded-lg border border-line p-2.5 bg-surface-raised min-w-0">
                    <div className="flex items-center gap-2 text-primary mb-1.5">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <rect x="3" y="6.5" width="18" height="11" rx="2" />
                        <path d="M3 10.5h18" />
                      </svg>
                      <span className="text-xs font-semibold text-foreground">Card Payment</span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Card payment" value={cardPayment === 0 ? "" : String(cardPayment)}
                      onChange={(e) => setCardPayment(sanitizePaymentInput(e.target.value))}
                      className="w-full h-8 rounded-md border border-line-strong bg-surface px-2 text-sm"
                      placeholder="0"
                    />
                  </div>
                  <div className="rounded-lg border border-line p-2.5 bg-surface-raised min-w-0">
                    <div className="flex items-center gap-2 text-danger mb-1.5">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <rect x="7" y="2.5" width="10" height="19" rx="2" />
                        <path d="M11 18.5h2" />
                      </svg>
                      <span className="text-xs font-semibold text-foreground">Bank Transfer</span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Bank transfer payment" value={bankPayment === 0 ? "" : String(bankPayment)}
                      onChange={(e) => setBankPayment(sanitizePaymentInput(e.target.value))}
                      className="w-full h-8 rounded-md border border-line-strong bg-surface px-2 text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-line-strong bg-surface p-3">
                <h4 className="text-sm font-semibold text-foreground mb-2.5">Order Summary</h4>
                <div className="space-y-1.5 text-[13px] text-foreground">
                  <div className="flex justify-between"><span>Subtotal</span><span className="font-semibold">Rs {orderSubtotal.toFixed(2)}</span></div>
                  {orderDiscountAmount > 0 && (
                    <div className="flex justify-between text-danger">
                      <span>Discount</span>
                      <span className="font-semibold">-Rs {orderDiscountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOffer && orderSpecialOfferDiscount > 0 && (
                    <div className="flex justify-between text-secondary">
                      <span>Offer: {selectedOffer.offerName} ({selectedOffer.percentage}%)</span>
                      <span className="font-semibold">-Rs {orderSpecialOfferDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between"><span>Delivery / Shipping</span><span className="font-semibold">Rs {shipping.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Tax ({tax.toFixed(2)}%)</span><span className="font-semibold">Rs {orderTaxAmount.toFixed(2)}</span></div>
                  <div className="flex justify-between border-t border-line pt-2 mt-2 text-base font-bold text-foreground"><span>Total</span><span>Rs {orderGrandTotal.toFixed(2)}</span></div>
                  <div className="flex justify-between gap-3 min-w-0"><span className="shrink-0">Paid Amount</span><span className="font-semibold text-right tabular-nums">Rs {orderPaid.toFixed(2)}</span></div>
                  <div className="flex justify-between gap-3 min-w-0">
                    <span className={`shrink-0 font-semibold ${orderPaidOverTotal ? "text-danger" : "text-foreground"}`}>{orderDueOrBalanceLabel}</span>
                    <span className={`font-semibold text-right tabular-nums ${orderPaidOverTotal ? "text-danger" : "text-foreground"}`}>Rs {orderDueOrBalanceAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Sale type</span>
                    <span className="px-2 py-0.5 rounded bg-surface-muted text-primary text-[11px] font-semibold">POS</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-line-strong bg-surface-raised grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="h-10 rounded-lg bg-surface-muted text-muted font-semibold border border-line-strong hover:bg-surface-muted text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCheckoutSubmit(false)}
                disabled={isDemo || checkoutSubmitting}
                title={isDemo ? 'Read-only demo: payments cannot be submitted.' : undefined}
                className="h-10 rounded-lg bg-secondary hover:bg-secondary-hover text-on-secondary font-semibold text-sm"
              >
                Submit Payment
              </button>
              <button
                type="button"
                onClick={() => handleCheckoutSubmit(true)}
                disabled={isDemo || checkoutSubmitting}
                title={isDemo ? 'Read-only demo: payments cannot be submitted.' : undefined}
                className="h-10 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-semibold text-sm"
              >
                Submit &amp; Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {completedPrint && (
        <div role="dialog" aria-modal="true" aria-label="Sale saved print actions" data-pos-dialog className="fixed inset-0 z-[120] flex items-center justify-center bg-overlay p-4">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 space-y-4">
            <h2 className="text-xl font-bold">Sale saved</h2>
            <p className="text-sm">Reference: {completedPrint.reference}</p>
            <p className="text-sm text-muted">Printing uses the saved sale and does not take payment or change stock.</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="ss-button bg-primary text-on-primary" onClick={() => printBillHtml(completedPrint.receiptHtml)}>Print Receipt</button>
              <KitchenTicketAction ticket={completedPrint.kitchenTicket} />
            </div>
            <button type="button" className="text-sm text-primary underline" onClick={() => navigate(`/saleInvoice/${completedPrint.saleId}`)}>Open saved sale / reprint later</button>
            <button type="button" className="ss-button w-full" onClick={() => setCompletedPrint(null)}>Done</button>
          </div>
        </div>
      )}

      {showCloseRegisterModal && (
        <div role="dialog" aria-modal="true" aria-label="Close register" data-pos-dialog className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface shadow-elevated border border-line overflow-hidden animate-slideUp">
            <div className="px-6 pt-6 pb-4">
              <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-surface-muted flex items-center justify-center border border-line-strong">
                <svg className="w-7 h-7 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 3c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
              </div>
              <h3 className="text-center text-xl font-semibold text-foreground">Close Register?</h3>
              <p className="mt-2 text-center text-sm text-muted">
                Are you sure you want to close the register for this session?
              </p>
            </div>

            <div className="px-6 pb-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={cancelCloseRegister}
                className="px-5 py-2.5 rounded-xl bg-surface-muted text-primary font-medium border border-line-strong hover:bg-surface-muted transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCloseRegister}
                disabled={reportLoading}
                className="px-5 py-2.5 rounded-xl text-on-primary font-semibold hover:opacity-95 transition bg-primary"
              >
                {reportLoading ? "Loading..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRegisterReportModal && registerReport && (
        <div role="dialog" aria-modal="true" aria-label="Register report" data-pos-dialog className="fixed inset-0 z-[110] flex items-center justify-center bg-overlay backdrop-blur-sm p-4">
          <div className="pos-register-dialog w-full max-w-5xl rounded-xl bg-surface shadow-elevated border border-line-strong overflow-hidden animate-slideUp">
            <div className="px-6 py-4 border-b border-line">
              <h3 className="text-3xl font-semibold text-center text-foreground">Register Report</h3>
            </div>

            <div className="p-5">
              <div className="rounded-md border border-line overflow-hidden">
                <div className="grid grid-cols-5 bg-surface-raised text-[11px] font-semibold text-muted uppercase">
                  <div className="p-3 border-r border-line">Open Time</div>
                  <div className="p-3 border-r border-line">Cashier</div>
                  <div className="p-3 border-r border-line">Cash Hand In</div>
                  <div className="p-3 border-r border-line">Your Sale (without cash hand)</div>
                  <div className="p-3">Today Total Sale (without cash hand)</div>
                </div>
                <div className="grid grid-cols-5 text-sm bg-surface">
                  <div className="p-3 border-r border-line"><span className="inline-block bg-danger-soft text-danger px-2 py-1 rounded">{new Date(registerReport.openTime).toLocaleString()}</span></div>
                  <div className="p-3 border-r border-line font-medium">{registerReport.cashierName}</div>
                  <div className="p-3 border-r border-line"><span className="inline-block bg-surface-muted text-primary px-2 py-1 rounded">LKR {registerReport.openingCash.toFixed(2)}</span></div>
                  <div className="p-3 border-r border-secondary-line"><span className="inline-block bg-secondary-soft text-secondary px-2 py-1 rounded">LKR {registerReport.userSales.toFixed(2)}</span></div>
                  <div className="p-3"><span className="inline-block bg-secondary-soft text-secondary px-2 py-1 rounded">LKR {registerReport.todayTotalSales.toFixed(2)}</span></div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mt-3 text-sm">
                <div><div className="mb-1">Total Discount :</div><div className="h-10 rounded border border-line-strong bg-surface-raised px-3 flex items-center">LKR&nbsp;{registerReport.totalDiscount.toFixed(2)}</div></div>
                <div><div className="mb-1">Cash :</div><div className="h-10 rounded border border-line-strong bg-surface-raised px-3 flex items-center">LKR&nbsp;{registerReport.cashPayments.toFixed(2)}</div></div>
                <div><div className="mb-1">Card :</div><div className="h-10 rounded border border-line-strong bg-surface-raised px-3 flex items-center">LKR&nbsp;{registerReport.cardPayments.toFixed(2)}</div></div>
                <div><div className="mb-1">Bank Transfer :</div><div className="h-10 rounded border border-line-strong bg-surface-raised px-3 flex items-center">LKR&nbsp;{registerReport.bankTransferPayments.toFixed(2)}</div></div>
              </div>

              <div className="mt-5 rounded-xl bg-surface-raised border border-line p-4">
                <div className="font-semibold text-foreground mb-3">Handle Cash Balancing</div>
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
                          className="w-24 h-9 border border-line-strong rounded px-2 text-center text-sm bg-surface"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="col-span-3">
                    <div className="text-sm mb-1">Total Cash</div>
                    <div className={`h-10 rounded border px-3 flex items-center ${countedCash === 0 ? "border-danger-line bg-danger-soft text-danger" : "border-line-strong bg-surface text-foreground"}`}>
                      LKR {countedCash.toFixed(2)}
                    </div>
                    {countedCash === 0 && <div className="text-xs text-danger mt-1">No cash detected</div>}
                  </div>

                  <div className="col-span-3">
                    <div className="text-sm mb-1">Cash Variance</div>
                    <div className="h-10 rounded border border-line-strong bg-surface px-3 flex items-center">
                      LKR {cashVariance.toFixed(2)}
                    </div>
                    <div className={`text-xs mt-1 ${Math.abs(cashVariance) < 0.0001 ? "text-secondary" : "text-danger"}`}>
                      {Math.abs(cashVariance) < 0.0001 ? "Register is balanced" : "Variance detected"}
                    </div>
                  </div>

                  <div className="col-span-1 flex justify-center pt-6">
                    <div className="w-12 h-12 rounded bg-primary text-on-primary flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 2h8l1 3h3v17H4V5h3l1-3z" />
                        <path d="M8 8h8M8 12h8M8 16h5" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-line flex justify-start gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRegisterReportModal(false);
                  showInfoToast("Register close cancelled.");
                }}
                className="px-5 py-2 rounded-lg bg-surface-muted text-primary border border-line-strong hover:bg-surface-muted transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={finalizeCloseRegister}
                disabled={closeSubmitting}
                className="px-5 py-2 rounded-lg text-on-primary font-semibold hover:opacity-95 transition bg-primary"
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

