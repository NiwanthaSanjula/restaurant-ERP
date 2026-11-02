import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Loader from '../common/Loader';
import { showErrorToast, showInfoToast, showSuccessToast } from '../../utils/toast';
import {
  cascadeVariationSelection,
  extractMenuVariationOptions,
  findMenuVariationOptionBySelection,
  getMenuVariationAttributeModel,
  humanizeVariationKey,
  humanizeVariationSegment,
  mapApiProductToProductRow,
  variationValuesForDimension,
  type MenuVariationAttributeModel,
  type MenuVariationOption,
  type ProductRow
} from '../products/viewProducts';

const PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop';

const looksLikeObjectId = (s: string) => /^[a-f\d]{24}$/i.test(s.trim());

function displayCategoryName(p: ProductRow, categoryIdToName: Map<string, string>): string {
  const c = p.category as unknown;
  if (typeof c === 'string') {
    const t = c.trim();
    if (!t) return '';
    if (looksLikeObjectId(t)) return categoryIdToName.get(t) || '';
    return t;
  }
  if (c && typeof c === 'object') {
    const o = c as { name?: string; _id?: string };
    if (o.name) return String(o.name).trim();
    if (o._id && looksLikeObjectId(String(o._id))) {
      return categoryIdToName.get(String(o._id)) || '';
    }
  }
  return '';
}

function categoryFilterLabel(p: ProductRow, categoryIdToName: Map<string, string>): string {
  const n = displayCategoryName(p, categoryIdToName).trim();
  return n || 'Uncategorized';
}

function displayBrandName(p: ProductRow, brandIdToName: Map<string, string>): string {
  const b = p.brand as unknown;
  if (typeof b === 'string') {
    const t = b.trim();
    if (!t) return '';
    if (looksLikeObjectId(t)) return brandIdToName.get(t) || '';
    return t;
  }
  if (b && typeof b === 'object') {
    const o = b as { name?: string; _id?: string };
    if (o.name) return String(o.name).trim();
    if (o._id && looksLikeObjectId(String(o._id))) {
      return brandIdToName.get(String(o._id)) || '';
    }
  }
  return '';
}

function brandFilterLabel(p: ProductRow, brandIdToName: Map<string, string>): string {
  return displayBrandName(p, brandIdToName).trim();
}

type ServiceType = 'dine-in' | 'takeaway' | 'delivery';

type MenuCartItem = {
  /** Line id: product id, or `productId::variantKey` when a variation is chosen */
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  /** Set when this line is a specific warehouse variation */
  variantKey?: string;
  variantLabel?: string;
};

type DiscountMode = 'fixed' | 'percentage';

/** ServeSmart / dashboard palette */
const BRAND = {
  navy: '#003366',
  navyDeep: '#001F54',
  navyMid: '#1f3b63',
  blue: '#4A90E2'
} as const;

const fmtRs = (n: number) =>
  `Rs. ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtLkr = (n: number) =>
  `LKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function parseNonNegativeNumber(raw: string): number {
  const n = parseFloat(String(raw).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

type OrderLineCardProps = {
  item: MenuCartItem;
  index: number;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
};

/** Curved wave divider (SVG) — sits between header and body */
function MenuCardWaveDivider({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`w-full h-5 shrink-0 text-slate-100/90 ${className}`}
      viewBox="0 0 320 20"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M0,20 L0,8 C40,18 80,2 120,10 C160,18 200,2 240,10 C280,18 310,6 320,12 L320,20 Z"
      />
    </svg>
  );
}

const OrderLineCard: React.FC<OrderLineCardProps> = ({
  item,
  index,
  onUpdateQuantity,
  onRemove
}) => {
  const unit = item.price;
  const qty = item.quantity;
  const lineTotal = unit * qty;
  const floatDelay = `${(index % 6) * 0.45}s`;

  return (
    <div
      className="menu-order-line-enter mb-5"
      style={{ animationDelay: `${Math.min(index, 12) * 55}ms` }}
    >
      <div
        className="menu-order-card-breathe relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/95 ring-1 ring-[#003366]/8 transition-all duration-300 hover:ring-[#003366]/20 hover:shadow-[0_18px_44px_-16px_rgba(0,31,84,0.35)]"
        style={{ animationDelay: floatDelay }}
      >
        <div className="pointer-events-none absolute inset-x-5 top-0 h-10 overflow-hidden">
          <div className="menu-order-ribbon absolute left-1/2 top-0 h-16 w-[78%] -translate-x-1/2 rounded-b-[100%] bg-gradient-to-r from-[#001F54]/14 via-[#4A90E2]/22 to-[#003366]/14" />
        </div>
        <div
          className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-gradient-to-br from-[#4A90E2]/20 to-transparent blur-2xl menu-curve-accent"
          style={{ animationDelay: floatDelay }}
        />
        <div
          className="pointer-events-none absolute -bottom-10 -left-8 h-32 w-32 rounded-full bg-gradient-to-tr from-[#003366]/12 to-transparent blur-2xl menu-curve-accent"
          style={{ animationDelay: `${(index % 5) * 0.5}s` }}
        />

        <div className="relative px-4 pt-5 pb-0">
          <div className="absolute top-0 left-4 right-4 h-1 rounded-full bg-gradient-to-r from-transparent via-[#003366] to-transparent opacity-70 menu-curve-accent" />
          <div className="relative flex flex-col items-center justify-center pb-2 pt-2 min-h-[2.5rem] gap-0.5">
            <h4 className="font-bold text-[#001F54] text-base leading-tight text-center px-10">{item.name}</h4>
            {item.variantLabel ? (
              <p className="text-xs font-semibold text-[#4A90E2] text-center px-10 leading-tight">{item.variantLabel}</p>
            ) : null}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full text-red-500 bg-white/80 shadow-sm border border-red-100 hover:bg-red-50 hover:scale-110 text-lg leading-none font-light transition-all duration-200"
              aria-label={`Remove ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''}`}
            >
              ×
            </button>
          </div>
        </div>

        <MenuCardWaveDivider />

        <div className="relative px-4 pb-4 pt-1 flex flex-col items-center text-center gap-4">
          <div
            className="flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-slate-100/90 via-white to-slate-100/90 px-2.5 py-1.5 border border-slate-200/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]"
            role="group"
            aria-label="Quantity"
          >
            <button
              type="button"
              onClick={() => onUpdateQuantity(item.id, Math.max(0, qty - 1))}
              className="w-10 h-10 rounded-full bg-gradient-to-b from-sky-50 to-sky-100 text-[#001F54] font-bold text-xl flex items-center justify-center border-2 border-sky-200/90 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="min-w-[2.8rem] text-center font-extrabold text-[#001F54] text-2xl tabular-nums">{qty}</span>
            <button
              type="button"
              onClick={() => onUpdateQuantity(item.id, qty + 1)}
              className="w-10 h-10 rounded-full font-bold text-xl flex items-center justify-center text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200"
              style={{ background: `linear-gradient(145deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 100%)` }}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          <div className="w-full max-w-xs mx-auto text-sm space-y-2 text-center rounded-[1.25rem] bg-gradient-to-br from-slate-50/95 to-white px-3.5 py-3.5 border border-slate-100/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <div className="text-slate-600 leading-tight">
              <span className="text-slate-500 font-medium">Price </span>
              <span className="text-slate-800 font-semibold">{fmtRs(lineTotal)}</span>
              {qty > 1 ? (
                <span className="block text-xs text-slate-500 mt-1">
                  {fmtRs(unit)} × {qty}
                </span>
              ) : null}
            </div>
            <div className="mx-auto h-px w-20 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
            <div className="font-extrabold text-[1.6rem] leading-none pt-0.5 tabular-nums tracking-tight" style={{ color: BRAND.navy }}>
              {fmtRs(lineTotal)}
            </div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.22em] pt-0.5">Item total</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const serviceMeta: Record<ServiceType, { label: string }> = {
  'dine-in': { label: 'Dine in' },
  takeaway: { label: 'Takeaway' },
  delivery: { label: 'Delivery' }
};

function initialVariationParts(m: MenuVariationAttributeModel): string[] {
  const first = m.options[0];
  if (m.flatKeys) return [first.key];
  let cur = first.key.split('|').map((s) => s.trim()).slice(0, m.attributeCount);
  while (cur.length < m.attributeCount) cur.push('');
  for (let d = 1; d < m.attributeCount; d++) {
    const vals = variationValuesForDimension(m.options, m.attributeCount, m.flatKeys, d, cur);
    cur = [...cur];
    cur[d] = vals[0] ?? cur[d];
  }
  return cur;
}

type MenuVariationPickerModalProps = {
  product: ProductRow;
  model: MenuVariationAttributeModel;
  onClose: () => void;
  onAdd: (option: MenuVariationOption, quantity: number, displayLabel: string) => void;
};

const MenuVariationPickerModal: React.FC<MenuVariationPickerModalProps> = ({
  product,
  model,
  onClose,
  onAdd
}) => {
  const [qty, setQty] = useState(1);
  const [parts, setParts] = useState<string[]>(() => initialVariationParts(model));

  const selectedOption = useMemo(() => {
    if (!parts.length) return undefined;
    return findMenuVariationOptionBySelection(
      model.options,
      model.attributeCount,
      model.flatKeys,
      parts
    );
  }, [model, parts]);

  const unitPrice = selectedOption?.price ?? product.price ?? 0;
  const lineTotal = unitPrice * qty;
  const img = product.image?.trim() ? product.image : PLACEHOLDER_IMAGE;

  const displayLabel = model.flatKeys
    ? humanizeVariationKey(parts[0] ?? '')
    : parts
        .slice(0, model.attributeCount)
        .filter(Boolean)
        .map(humanizeVariationSegment)
        .join(' · ');

  const canAdd = Boolean(selectedOption && qty >= 1);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-sm w-full max-h-[min(88vh,36rem)] overflow-hidden flex flex-col animate-fadeIn"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-variation-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-3 sm:p-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50 shrink-0">
          <div className="flex-1 min-w-0 pr-2">
            <h2 id="menu-variation-modal-title" className="text-lg sm:text-xl font-bold text-[#001F54] truncate">
              {product.name}
            </h2>
            <p className="text-sm sm:text-base font-semibold mt-0.5 tabular-nums" style={{ color: BRAND.navy }}>
              LKR {unitPrice.toFixed(2)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
          <div className="p-3 sm:p-4 pb-2">
            <div className="relative overflow-hidden rounded-xl shadow-md ring-1 ring-slate-200/80">
              <img src={img} alt={product.name} className="w-full h-40 sm:h-48 object-cover" />
            </div>
          </div>

          {Array.from({ length: model.attributeCount }, (_, dim) => {
            const vals = variationValuesForDimension(
              model.options,
              model.attributeCount,
              model.flatKeys,
              dim,
              parts
            );
            const label = model.attributeLabels[dim] ?? `Option ${dim + 1}`;
            return (
              <div key={dim} className="px-3 sm:px-4 pb-3">
                <h3 className="text-xs sm:text-sm font-semibold text-[#001F54] mb-2">{label}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {[...vals]
                    .sort((a, b) =>
                      humanizeVariationSegment(a).localeCompare(humanizeVariationSegment(b), undefined, {
                        numeric: true
                      })
                    )
                    .map((v) => {
                      const active = parts[dim] === v;
                      return (
                        <button
                          key={`${dim}-${v}`}
                          type="button"
                          onClick={() =>
                            setParts(cascadeVariationSelection(model.options, model, parts, dim, v))
                          }
                          className={`py-2 px-2 rounded-lg font-semibold text-xs sm:text-sm transition-all ${
                            active
                              ? 'text-white shadow-md'
                              : 'bg-[#f5f7fb] text-[#001F54] border border-slate-200 hover:border-[#003366] hover:bg-white'
                          }`}
                          style={
                            active
                              ? { background: `linear-gradient(180deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 100%)` }
                              : undefined
                          }
                        >
                          {humanizeVariationSegment(v)}
                        </button>
                      );
                    })}
                </div>
              </div>
            );
          })}

          <div className="px-3 sm:px-4 pb-3">
            <h3 className="text-xs sm:text-sm font-semibold text-[#001F54] mb-2">Quantity</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-lg font-bold text-lg flex items-center justify-center border-2 border-slate-200 text-[#001F54] hover:bg-[#003366] hover:text-white hover:border-[#003366] transition-colors"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="flex-1 text-center text-lg font-bold text-[#001F54] bg-slate-50 border-2 border-slate-200 rounded-lg py-2 px-2 focus:outline-none focus:border-[#003366]"
              />
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="w-9 h-9 rounded-lg font-bold text-lg flex items-center justify-center border-2 border-slate-200 text-[#001F54] hover:bg-[#003366] hover:text-white hover:border-[#003366] transition-colors"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

          <div className="px-3 sm:px-4 pb-4 border-t border-slate-100 pt-3">
            <div className="flex justify-between items-center bg-gradient-to-r from-slate-50 to-white p-3 rounded-xl">
              <span className="text-sm sm:text-base font-semibold text-slate-700">Total</span>
              <span className="text-lg sm:text-xl font-bold tabular-nums text-[#001F54]">
                LKR {lineTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4 pt-2 border-t border-slate-100 bg-white shrink-0 flex flex-col gap-2">
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => {
              if (!selectedOption || !canAdd) return;
              onAdd(selectedOption, qty, displayLabel || selectedOption.label);
            }}
            className="w-full disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 sm:py-3 rounded-xl font-bold text-sm sm:text-base shadow-md hover:brightness-110 transition-all flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(180deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 100%)` }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add to Cart
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

type MenuProductCardProps = {
  product: ProductRow;
  categoryIdToName: Map<string, string>;
  onProductActivate: (product: ProductRow) => void;
  index: number;
};

const MenuProductCard: React.FC<MenuProductCardProps> = ({
  product,
  categoryIdToName,
  onProductActivate,
  index
}) => {
  const img = product.image?.trim() ? product.image : PLACEHOLDER_IMAGE;
  const price = product.price ?? 0;
  const cat = displayCategoryName(product, categoryIdToName);
  const variantOptions = extractMenuVariationOptions(product);
  const variantCount = variantOptions.length;
  const isVariationProduct = product.ptype === 'Variation' && variantCount > 0;

  const floatDelay = `${(index % 7) * 0.42}s`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onProductActivate(product)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onProductActivate(product);
        }
      }}
      className="menu-card-reveal product-card group relative cursor-pointer text-slate-900"
      style={{ animationDelay: `${Math.min(index, 24) * 40}ms` }}
    >
      <div
        className="menu-product-card-breathe relative h-full rounded-3xl overflow-hidden bg-gradient-to-b from-white via-white to-slate-50/98 shadow-[0_12px_40px_-14px_rgba(0,31,84,0.42)] ring-1 ring-white/90 hover:shadow-[0_22px_56px_-12px_rgba(0,31,84,0.52)] hover:ring-2 hover:ring-[#003366]/25 transition-[box-shadow,ring] duration-300 ease-out"
        style={{ animationDelay: floatDelay }}
      >
        <div className="absolute top-0 left-0 right-0 h-1.5 z-10 overflow-hidden rounded-t-3xl">
          <div className="h-full w-full bg-gradient-to-r from-[#001F54] via-[#4A90E2] to-[#003366] menu-curve-accent opacity-95" />
        </div>
        <div
          className="pointer-events-none absolute -right-4 top-16 h-24 w-24 rounded-full bg-[#4A90E2]/15 blur-2xl opacity-60 group-hover:opacity-90 transition-opacity duration-500"
          style={{ animationDelay: floatDelay }}
        />
        <div className="relative overflow-hidden p-3 pt-4">
          <div className="relative mx-auto w-[90%] rounded-2xl overflow-hidden ring-2 ring-slate-100/90 group-hover:ring-[#003366]/30 transition-[box-shadow,transform] duration-300 ease-out shadow-[inset_0_2px_8px_rgba(0,31,84,0.06)] bg-gradient-to-b from-slate-50/80 to-slate-100/50">
            <img
              src={img}
              alt={product.name}
              className="product-card-image w-full mx-auto rounded-xl smooth-transition duration-500 ease-out group-hover:scale-105"
            />
          </div>
          <div className="menu-mobile-hover-layer absolute inset-0 top-0 left-0 right-0 bottom-0 bg-gradient-to-t from-[#001F54]/90 via-[#003366]/35 to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-300 ease-out flex items-end justify-center pb-5 pointer-events-none group-hover:pointer-events-auto group-active:pointer-events-auto rounded-t-3xl">
            <button
              type="button"
              className="menu-mobile-hover-cta pointer-events-auto px-5 py-2.5 rounded-full font-bold text-sm text-white shadow-xl translate-y-3 group-hover:translate-y-0 group-active:translate-y-0 transition-all duration-300 ease-out hover:scale-105 active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 55%, ${BRAND.navyMid} 100%)`,
                boxShadow: '0 8px 24px rgba(0, 51, 102, 0.45)'
              }}
              onClick={(e) => {
                e.stopPropagation();
                onProductActivate(product);
              }}
            >
              {isVariationProduct ? 'Choose options' : '+ Add to Cart'}
            </button>
          </div>
        </div>

      <div className="p-3 sm:p-4 pt-1 flex flex-col flex-1 min-h-0 justify-end relative">
        <MenuCardWaveDivider className="text-slate-200/95 -mx-1 h-4" />
        <div className="mt-auto pt-2 w-full flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1 text-left">
            <h3 className="font-semibold text-slate-900 text-[13px] sm:text-sm leading-tight line-clamp-2 mb-1 tracking-tight">
              {product.name}
            </h3>
            <p className="font-bold text-sm sm:text-base tabular-nums" style={{ color: BRAND.navy }}>
              {price > 0 ? `LKR ${price.toFixed(2)}` : '—'}
            </p>
          </div>
          {cat ? (
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide text-[#003366] bg-gradient-to-br from-[#003366]/10 to-[#4A90E2]/10 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-full shrink-0 max-w-[45%] truncate self-end border border-[#003366]/20">
              {cat}
            </span>
          ) : null}
        </div>
      </div>
      </div>
    </div>
  );
};

const MenuDisplayPage: React.FC = () => {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categoryIdToName, setCategoryIdToName] = useState<Map<string, string>>(() => new Map());
  const [brandIdToName, setBrandIdToName] = useState<Map<string, string>>(() => new Map());
  const [categoryMasterOptions, setCategoryMasterOptions] = useState<string[]>([]);
  const [brandMasterOptions, setBrandMasterOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [cartItems, setCartItems] = useState<MenuCartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceType>('takeaway');
  const [kitchenNotes, setKitchenNotes] = useState('');
  const [variantPickerProduct, setVariantPickerProduct] = useState<ProductRow | null>(null);
  const [discountMode, setDiscountMode] = useState<DiscountMode>('fixed');
  const [discountInput, setDiscountInput] = useState('0');
  const [shippingInput, setShippingInput] = useState('0');
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  const orderSummary = useMemo(() => {
    const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const raw = parseNonNegativeNumber(discountInput);
    const discount =
      discountMode === 'percentage' ? subtotal * (raw / 100) : raw;
    const shipping = parseNonNegativeNumber(shippingInput);
    const total = subtotal - discount + shipping;
    return { subtotal, discount, shipping, total };
  }, [cartItems, discountMode, discountInput, shippingInput]);

  const variationModel = useMemo(
    () => (variantPickerProduct ? getMenuVariationAttributeModel(variantPickerProduct) : null),
    [variantPickerProduct]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const headers: HeadersInit = {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        };

        const [productsRes, categoriesRes, brandsRes] = await Promise.all([
          fetch(`${api}/products`, { headers }),
          fetch(`${api}/categories`, { headers }).catch(() => null as Response | null),
          fetch(`${api}/brands`, { headers }).catch(() => null as Response | null)
        ]);

        if (categoriesRes?.ok) {
          const catJson = await categoriesRes.json();
          const map = new Map<string, string>();
          const arr = Array.isArray(catJson.data) ? catJson.data : [];
          arr.forEach((c: { _id?: string; name?: string }) => {
            if (c._id && c.name) map.set(String(c._id), String(c.name));
          });
          setCategoryIdToName(map);
          const names = arr
            .map((c: { name?: string }) => (c.name ? String(c.name).trim() : ''))
            .filter((n: string) => Boolean(n));
          setCategoryMasterOptions(
            Array.from(new Set<string>(names)).sort((a, b) =>
              a.localeCompare(b, undefined, { sensitivity: 'base' })
            )
          );
        } else {
          setCategoryIdToName(new Map());
          setCategoryMasterOptions([]);
        }

        if (brandsRes?.ok) {
          const brandJson = await brandsRes.json();
          const map = new Map<string, string>();
          const arr = Array.isArray(brandJson.data) ? brandJson.data : [];
          arr.forEach((b: { _id?: string; name?: string }) => {
            if (b._id && b.name) map.set(String(b._id), String(b.name));
          });
          setBrandIdToName(map);
          const names = arr
            .map((b: { name?: string }) => (b.name ? String(b.name).trim() : ''))
            .filter((n: string) => Boolean(n));
          setBrandMasterOptions(
            Array.from(new Set<string>(names)).sort((a, b) =>
              a.localeCompare(b, undefined, { sensitivity: 'base' })
            )
          );
        } else {
          setBrandIdToName(new Map());
          setBrandMasterOptions([]);
        }

        const data = await productsRes.json();
        if (!productsRes.ok) {
          showErrorToast(data?.message || 'Failed to load products');
          setProducts([]);
          return;
        }
        const list = Array.isArray(data.data) ? data.data : [];
        setProducts(list.map(mapApiProductToProductRow));
      } catch (e) {
        showErrorToast((e as Error).message || 'Network error');
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [api]);

  const categoryOptions = useMemo(() => {
    if (categoryMasterOptions.length > 0) return categoryMasterOptions;
    const set = new Set<string>();
    products.forEach((p) => set.add(categoryFilterLabel(p, categoryIdToName)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [products, categoryIdToName, categoryMasterOptions]);

  const brandOptions = useMemo(() => {
    if (brandMasterOptions.length > 0) return brandMasterOptions;
    const set = new Set<string>();
    products.forEach((p) => {
      const b = brandFilterLabel(p, brandIdToName);
      if (b) set.add(b);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [products, brandIdToName, brandMasterOptions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products;

    if (categoryFilter !== 'all') {
      list = list.filter(
        (p) => categoryFilterLabel(p, categoryIdToName) === categoryFilter
      );
    }
    if (brandFilter !== 'all') {
      list = list.filter((p) => brandFilterLabel(p, brandIdToName) === brandFilter);
    }

    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        displayCategoryName(p, categoryIdToName).toLowerCase().includes(q) ||
        displayBrandName(p, brandIdToName).toLowerCase().includes(q)
    );
  }, [products, search, categoryIdToName, brandIdToName, categoryFilter, brandFilter]);


  useEffect(() => {
    if (categoryFilter !== 'all' && !categoryOptions.includes(categoryFilter)) {
      setCategoryFilter('all');
    }
  }, [categoryOptions, categoryFilter]);

  useEffect(() => {
    if (brandFilter !== 'all' && !brandOptions.includes(brandFilter)) {
      setBrandFilter('all');
    }
  }, [brandOptions, brandFilter]);

  const addToCartLine = (
    p: ProductRow,
    variant?: MenuVariationOption,
    quantity: number = 1,
    lineVariantDisplay?: string
  ) => {
    const price = variant ? variant.price : p.price ?? 0;
    const image = p.image?.trim() ? p.image : PLACEHOLDER_IMAGE;
    const id = variant ? `${p.id}::${variant.key}` : p.id;
    const q = Math.max(1, Math.floor(quantity) || 1);
    setCartItems((prev) => {
      const i = prev.findIndex((x) => x.id === id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: next[i].quantity + q };
        return next;
      }
      return [
        ...prev,
        {
          id,
          name: p.name,
          price,
          image,
          quantity: q,
          variantKey: variant?.key,
          variantLabel: lineVariantDisplay ?? variant?.label
        }
      ];
    });
    const label = lineVariantDisplay ? `${p.name} (${lineVariantDisplay})` : p.name;
    showSuccessToast(`${label} added to order`);
  };

  const tryAddProduct = (p: ProductRow) => {
    const opts = extractMenuVariationOptions(p);
    if (p.ptype === 'Variation' && opts.length > 0) {
      setVariantPickerProduct(p);
      return;
    }
    addToCartLine(p);
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      setCartItems((prev) => prev.filter((x) => x.id !== id));
      return;
    }
    setCartItems((prev) => prev.map((x) => (x.id === id ? { ...x, quantity } : x)));
  };

  const clearCart = () => {
    setCartItems([]);
    setKitchenNotes('');
    setDiscountInput('0');
    setShippingInput('0');
    setDiscountMode('fixed');
    showInfoToast('Order cleared');
  };

  const removeItem = (id: string) => {
    setCartItems((prev) => prev.filter((x) => x.id !== id));
  };

  const changeDiscountMode = (mode: DiscountMode) => {
    if (mode === discountMode) return;
    setDiscountMode(mode);
    setDiscountInput('0');
  };

  const clearSearchAndFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setBrandFilter('all');
    showInfoToast('Search and filters cleared');
  };

  return (
    <div className="animated-gradient min-h-screen flex flex-col overflow-y-auto md:overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-visible md:overflow-hidden text-slate-900">
        <div className="glass-white menu-glass-boost border-b border-gray-200 px-3 sm:px-4 md:px-5 py-3 sm:py-4 flex-shrink-0 shadow-sm">
          <div className="max-w-[1600px] mx-auto">
            <div className="menu-top-panel menu-header-enter relative overflow-hidden rounded-[1.2rem] sm:rounded-[1.7rem] border border-white/70 bg-gradient-to-br from-white/96 via-white/90 to-slate-100/80 p-3 sm:p-5 shadow-[0_18px_50px_-28px_rgba(0,31,84,0.42)] ring-1 ring-[#003366]/8">
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#4A90E2]/14 blur-3xl menu-curve-accent" />
              <div className="pointer-events-none absolute -left-10 -bottom-12 h-32 w-32 rounded-full bg-[#003366]/10 blur-3xl menu-curve-accent" />
              <div className="menu-header-enter relative flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="w-full lg:flex-1 min-w-0 lg:min-w-[260px] lg:max-w-2xl">
                <div className="menu-search-shell group relative">
                  <div className="menu-search-shine pointer-events-none absolute inset-y-1.5 left-1.5 right-1.5 rounded-[0.9rem] sm:rounded-[1.15rem]" />
                  <svg
                    className="w-5 h-5 text-[#003366]/55 absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-none menu-search-icon"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="search"
                    placeholder="Search Menu Item..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="menu-search-input w-full px-4 sm:px-5 py-2.5 sm:py-3.5 pl-10 sm:pl-12 pr-20 sm:pr-24 rounded-xl sm:rounded-2xl smooth-transition font-medium text-gray-900 placeholder:text-slate-400 shadow-sm focus:shadow-md text-[0.84rem] sm:text-[0.95rem] menu-search-pulse border border-white/70 bg-gradient-to-r from-white/98 via-white to-slate-50/95 ring-1 ring-[#003366]/8"
                  />
                  {search ? (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="menu-search-clear absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-[10px] sm:text-[11px] font-bold text-slate-500 hover:text-[#003366] bg-white/92 border border-slate-200 rounded-full px-2.5 sm:px-3 py-1 transition-all hover:shadow-sm"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto sm:ml-auto shrink-0 justify-end">
                {(search || categoryFilter !== 'all' || brandFilter !== 'all') ? (
                  <button
                    type="button"
                    onClick={clearSearchAndFilters}
                    className="inline-flex items-center justify-center px-2.5 sm:px-3 py-2 rounded-xl font-semibold text-[11px] sm:text-xs text-[#003366] bg-white/95 border border-slate-200 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all"
                  >
                    Clear filters
                  </button>
                ) : null}
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center px-3 sm:px-5 py-2 sm:py-3 rounded-xl font-bold text-[11px] sm:text-base text-white shadow-md hover:shadow-lg hover:brightness-110 active:scale-[0.98] transition-all duration-300"
                  style={{
                    background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 100%)`
                  }}
                >
                  <span className="hidden sm:inline">Back to dashboard</span>
                  <span className="sm:hidden">Dashboard</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="relative inline-flex items-center justify-center w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-white border-2 border-slate-200 text-[#003366] shadow-md hover:shadow-lg hover:border-[#003366] hover:scale-105 active:scale-95 transition-all duration-300 ease-out"
                  aria-label={`Open cart${cartCount ? `, ${cartCount} items` : ''}`}
                >
                  <svg className="w-4.5 h-4.5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                    />
                  </svg>
                  {cartCount > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[1.1rem] sm:min-w-[1.25rem] h-4.5 sm:h-5 px-1 flex items-center justify-center rounded-full bg-[#003366] text-white text-[10px] sm:text-xs font-bold shadow-md ring-2 ring-white">
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>

            {!loading && (categoryOptions.length > 0 || brandOptions.length > 0) ? (
              <div className="flex flex-col gap-3 pt-3 border-t border-slate-200/70 mt-3">
                {categoryOptions.length > 0 ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Categories
                  </p>
                  <div className="flex flex-wrap sm:flex-nowrap gap-2 overflow-x-auto pb-1 custom-scrollbar">
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('all')}
                      className={`menu-chip-pop shrink-0 rounded-full px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-[12px] font-semibold border-2 transition-all duration-200 ${
                        categoryFilter === 'all'
                          ? 'text-white border-[#003366] shadow-[0_4px_14px_-4px_rgba(0,51,102,0.45)]'
                          : 'bg-white/90 border-slate-200 text-slate-600 hover:border-[#003366]/35'
                      }`}
                      style={
                        categoryFilter === 'all'
                          ? {
                              background: `linear-gradient(135deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 100%)`
                            }
                          : undefined
                      }
                    >
                      All categories
                    </button>
                    {categoryOptions.map((cat) => {
                      const active = categoryFilter === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategoryFilter(cat)}
                          className={`menu-chip-pop shrink-0 rounded-full px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-[12px] font-semibold border-2 transition-all duration-200 max-w-[160px] sm:max-w-[220px] truncate ${
                            active
                              ? 'text-white border-[#003366] shadow-[0_4px_14px_-4px_rgba(0,51,102,0.45)]'
                              : 'bg-white/90 border-slate-200 text-slate-600 hover:border-[#003366]/35'
                          }`}
                          style={
                            active
                              ? {
                                  background: `linear-gradient(135deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 100%)`
                                }
                              : undefined
                          }
                          title={cat}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
                ) : null}
                {brandOptions.length > 0 ? (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Brands
                    </p>
                    <div className="flex flex-wrap sm:flex-nowrap gap-2 overflow-x-auto pb-1 custom-scrollbar">
                      <button
                        type="button"
                        onClick={() => setBrandFilter('all')}
                        className={`menu-chip-pop shrink-0 rounded-full px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-[12px] font-semibold border-2 transition-all duration-200 ${
                          brandFilter === 'all'
                            ? 'text-white border-[#003366] shadow-[0_4px_14px_-4px_rgba(0,51,102,0.45)]'
                            : 'bg-white/90 border-slate-200 text-slate-600 hover:border-[#003366]/35'
                        }`}
                        style={
                          brandFilter === 'all'
                            ? {
                                background: `linear-gradient(135deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 100%)`
                              }
                            : undefined
                        }
                      >
                        All brands
                      </button>
                      {brandOptions.map((br) => {
                        const active = brandFilter === br;
                        return (
                          <button
                            key={br}
                            type="button"
                            onClick={() => setBrandFilter(br)}
                            className={`menu-chip-pop shrink-0 rounded-full px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-[12px] font-semibold border-2 transition-all duration-200 max-w-[160px] sm:max-w-[200px] truncate ${
                              active
                                ? 'text-white border-[#003366] shadow-[0_4px_14px_-4px_rgba(0,51,102,0.45)]'
                                : 'bg-white/90 border-slate-200 text-slate-600 hover:border-[#003366]/35'
                            }`}
                            style={
                              active
                                ? {
                                    background: `linear-gradient(135deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 100%)`
                                  }
                                : undefined
                            }
                            title={br}
                          >
                            {br}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-visible md:overflow-y-auto custom-scrollbar px-3 py-4 sm:px-4 md:px-5 lg:px-6 md:min-h-0">
          <div className="max-w-[1600px] mx-auto">
            {loading ? (
              <div className="flex justify-center py-24">
                <Loader />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <div className="glass-card rounded-3xl p-16 text-center max-w-md text-gray-800">
                  <p className="text-xl font-bold text-slate-700 mb-2">No products found</p>
                  <p className="text-sm text-slate-500">
                    {products.length === 0
                      ? 'No products available'
                      : 'Try another category, brand, or search term'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="perfect-grid">
                {filtered.map((p, idx) => (
                  <MenuProductCard
                    key={p.id}
                    index={idx}
                    product={p}
                    categoryIdToName={categoryIdToName}
                    onProductActivate={tryAddProduct}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {!cartOpen ? (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="menu-mobile-cart-fab fixed right-4 bottom-4 sm:right-5 sm:bottom-5 lg:hidden z-40 inline-flex items-center gap-2.5 rounded-2xl px-4 py-3 text-white shadow-[0_16px_36px_-14px_rgba(0,31,84,0.55)] border border-white/25"
          style={{ background: `linear-gradient(135deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 60%, ${BRAND.navyMid} 100%)` }}
          aria-label={`Open order${cartCount ? `, ${cartCount} items` : ''}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
          <span className="text-sm font-bold tracking-wide">Your order</span>
          {cartCount > 0 ? (
            <span className="min-w-[1.45rem] h-6 px-1.5 inline-flex items-center justify-center rounded-full bg-white/20 text-xs font-extrabold ring-1 ring-white/30">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          ) : null}
        </button>
      ) : null}

      {cartOpen ? (
        <>
          <button
            type="button"
            className="menu-cart-backdrop fixed inset-0 bg-[#001F54]/55 backdrop-blur-[3px] z-40 cursor-default"
            aria-label="Close cart overlay"
            onClick={() => setCartOpen(false)}
          />
          <aside
            className="menu-order-drawer-enter fixed top-0 right-0 h-[100dvh] w-full sm:max-w-[30rem] z-50 flex flex-col text-slate-900 border-l border-slate-200/80 shadow-[-12px_0_48px_-8px_rgba(0,31,84,0.35)] bg-gradient-to-b from-white via-slate-50/98 to-slate-100/95"
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-order-title"
          >
            <div className="relative shrink-0 bg-gradient-to-br from-white via-slate-50/95 to-white backdrop-blur-md border-b border-slate-200/90 overflow-hidden shadow-[0_8px_24px_-18px_rgba(0,31,84,0.35)]">
              <div className="pointer-events-none absolute -top-8 -left-10 h-24 w-24 rounded-full bg-[#4A90E2]/12 blur-2xl menu-curve-accent" />
              <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-[#003366]/10 blur-2xl menu-curve-accent" />
              <div className="relative flex items-center justify-between px-4 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#001F54] to-[#003366] text-white shadow-md">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </span>
                  <h2 id="menu-order-title" className="text-[1.08rem] font-extrabold tracking-tight text-[#001F54]">
                    Your Order
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-[#003366] text-xl leading-none transition-all duration-200 hover:scale-105 active:scale-95 border border-slate-200/80 bg-white/75"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <svg
                className="w-full h-6 text-slate-100 -mb-px"
                viewBox="0 0 320 24"
                preserveAspectRatio="none"
                aria-hidden
              >
                <path
                  fill="currentColor"
                  d="M0,0 L320,0 L320,9 C250,22 196,4 160,13 C116,24 52,7 0,18 Z"
                />
              </svg>
            </div>

            <div
              className="px-4 py-4 shrink-0 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] relative overflow-hidden border-b border-[#003366]/20"
              style={{
                background: `linear-gradient(115deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 45%, ${BRAND.navyMid} 100%)`
              }}
            >
              <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-3xl menu-curve-accent" />
              <div className="pointer-events-none absolute -left-10 -bottom-12 h-32 w-32 rounded-full bg-[#4A90E2]/14 blur-3xl menu-curve-accent" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold text-[1.1rem] tracking-tight">{serviceMeta[serviceType].label}</p>
                  <p className="text-sm text-white/80 mt-1 leading-snug">Tap items below to adjust quantity</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-white/15 border border-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/90">
                  Active
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Service type</p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        key: 'dine-in' as const,
                        label: 'Dine in',
                        icon: (
                          <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
                          </svg>
                        )
                      },
                      {
                        key: 'takeaway' as const,
                        label: 'Takeaway',
                        icon: (
                          <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.75}
                              d="M16 11V5H8v6M5 9h14v10a1 1 0 001 1h1M5 9L3 5h18l-2 4"
                            />
                          </svg>
                        )
                      },
                      {
                        key: 'delivery' as const,
                        label: 'Delivery',
                        icon: (
                          <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.75}
                              d="M13 16V6a1 1 0 00-1-1H4v11h9m4 0h2a1 1 0 001-1v-3.18M13 16H9m4 0v2a1 1 0 01-1 1H9m4-3h4M9 11h.01M20 8l-3 4h3l-3 4"
                            />
                          </svg>
                        )
                      }
                    ] as const
                  ).map(({ key, label, icon }) => {
                    const active = serviceType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setServiceType(key)}
                        className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 px-2 text-xs font-semibold border-2 transition-all duration-300 ease-out ${
                          active
                            ? 'bg-[#003366]/8 border-[#003366] text-[#001F54] shadow-[0_6px_20px_-6px_rgba(0,51,102,0.5)] scale-[1.02]'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-[#003366]/35 hover:bg-slate-50/80 hover:-translate-y-0.5'
                        }`}
                      >
                        {icon}
                        <span className="leading-tight text-center">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/50 to-white/80 p-2 pt-3 shadow-inner">
                {cartItems.length === 0 ? (
                  <div className="text-center py-12 px-4 text-slate-500 rounded-[1.35rem] bg-white/60">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#003366]/10 to-[#4A90E2]/15 text-[#003366] shadow-sm">
                      <svg className="w-7 h-7 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.75}
                          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                        />
                      </svg>
                    </div>
                    <p className="font-semibold text-slate-700">Your cart is ready</p>
                    <p className="text-sm mt-1 text-slate-500">Add products from the menu</p>
                  </div>
                ) : (
                  cartItems.map((item, idx) => (
                    <OrderLineCard
                      key={item.id}
                      index={idx}
                      item={item}
                      onUpdateQuantity={updateQuantity}
                      onRemove={removeItem}
                    />
                  ))
                )}
              </div>

              {cartItems.length > 0 ? (
                <div className="menu-tax-card relative overflow-hidden rounded-[1.6rem] border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/90 to-white p-4 shadow-[0_12px_34px_-14px_rgba(0,31,84,0.2)] space-y-4 ring-1 ring-[#003366]/8">
                  <div className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full bg-[#4A90E2]/20 blur-2xl menu-curve-accent" />
                  <div className="pointer-events-none absolute -left-10 -bottom-10 h-28 w-28 rounded-full bg-[#003366]/12 blur-2xl menu-curve-accent" />
                  <div className="relative">
                    <svg className="absolute -top-4 left-0 right-0 h-5 text-slate-100/90" viewBox="0 0 320 20" preserveAspectRatio="none" aria-hidden>
                      <path fill="currentColor" d="M0,20 L0,10 C80,2 160,24 240,8 L320,12 L320,20 Z" />
                    </svg>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="h-1.5 w-9 rounded-full bg-gradient-to-r from-[#001F54] via-[#003366] to-[#4A90E2] menu-curve-accent" />
                      <h3 className="font-extrabold text-[#001F54] text-sm tracking-tight">Tax &amp; Discount</h3>
                    </div>
                  </div>
                  <div className="relative flex rounded-2xl overflow-hidden border border-slate-200 bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                    <button
                      type="button"
                      onClick={() => changeDiscountMode('fixed')}
                      className={`flex-1 py-2.5 px-3 text-sm font-bold border-r border-slate-200 transition-all duration-200 ${
                        discountMode === 'fixed' ? 'text-white shadow-[0_4px_14px_-6px_rgba(0,31,84,0.45)]' : 'bg-white/70 text-[#001F54] hover:bg-slate-50'
                      }`}
                      style={
                        discountMode === 'fixed'
                          ? { background: `linear-gradient(180deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 100%)` }
                          : undefined
                      }
                    >
                      Fixed
                    </button>
                    <button
                      type="button"
                      onClick={() => changeDiscountMode('percentage')}
                      className={`flex-1 py-2.5 px-3 text-sm font-bold transition-all duration-200 ${
                        discountMode === 'percentage' ? 'text-white shadow-[0_4px_14px_-6px_rgba(0,31,84,0.45)]' : 'bg-white/70 text-[#001F54] hover:bg-slate-50'
                      }`}
                      style={
                        discountMode === 'percentage'
                          ? { background: `linear-gradient(180deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 100%)` }
                          : undefined
                      }
                    >
                      Percentage
                    </button>
                  </div>
                  <div className="space-y-3 rounded-2xl bg-white/75 border border-slate-100/90 p-3.5">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <label htmlFor="order-discount" className="text-sm font-semibold text-slate-700 shrink-0 inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-[#4A90E2]" />
                          Discount
                        </label>
                        <input
                          key={discountMode}
                          id="order-discount"
                          type="text"
                          inputMode="decimal"
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value)}
                          className="w-[7.5rem] sm:w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 text-right tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-[#003366]/35 focus:border-[#003366]"
                          aria-describedby="order-discount-hint"
                        />
                      </div>
                      <p id="order-discount-hint" className="text-[11px] text-slate-500 mt-1.5">
                        {discountMode === 'percentage'
                          ? 'Percentage of subtotal; values over 100% are allowed.'
                          : 'Fixed LKR subtracted from subtotal.'}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="order-shipping" className="text-sm font-semibold text-slate-700 shrink-0 inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#001F54]" />
                        Shipping
                      </label>
                      <input
                        id="order-shipping"
                        type="text"
                        inputMode="decimal"
                        value={shippingInput}
                        onChange={(e) => setShippingInput(e.target.value)}
                        className="w-[7.5rem] sm:w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 text-right tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-[#003366]/35 focus:border-[#003366]"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div>
                <label htmlFor="kitchen-notes" className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Note for Kitchen <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  id="kitchen-notes"
                  value={kitchenNotes}
                  onChange={(e) => setKitchenNotes(e.target.value)}
                  rows={3}
                  placeholder="Add any special instructions or notes for the kitchen…"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366] resize-y min-h-[80px] transition-shadow duration-200 shadow-sm"
                />
              </div>
            </div>

            <div className="relative shrink-0 border-t border-slate-200/90 bg-gradient-to-t from-slate-100/95 via-white to-white backdrop-blur-md px-4 pt-4 sm:pt-6 pb-3 sm:pb-4 space-y-3 shadow-[0_-12px_40px_-12px_rgba(0,31,84,0.14)]">
              <svg
                className="absolute left-0 right-0 top-0 h-5 w-full text-white -translate-y-[calc(100%-1px)]"
                viewBox="0 0 320 20"
                preserveAspectRatio="none"
                aria-hidden
              >
                <path
                  fill="currentColor"
                  d="M0,20 L0,12 C80,2 160,22 240,8 L320,14 L320,20 Z"
                />
              </svg>
              {cartItems.length > 0 ? (
                <div className="rounded-[1.35rem] border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white px-4 py-4 space-y-3 shadow-[0_10px_36px_-14px_rgba(0,31,84,0.2)] ring-1 ring-[#003366]/6">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">Subtotal</span>
                    <span className="font-bold tabular-nums text-slate-900">{fmtLkr(orderSummary.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">Discount</span>
                    <span className="font-bold tabular-nums text-emerald-500">
                      − {fmtLkr(orderSummary.discount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">Shipping</span>
                    <span className="font-bold tabular-nums text-slate-900">{fmtLkr(orderSummary.shipping)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-slate-200/90 pt-3 mt-1">
                    <span className="font-bold text-slate-900">Total</span>
                    <span className="font-extrabold text-2xl sm:text-[1.65rem] tabular-nums tracking-tight text-[#001F54]">
                      {fmtLkr(orderSummary.total)}
                    </span>
                  </div>
                </div>
              ) : null}
              {cartItems.length > 0 ? (
                <button
                  type="button"
                  onClick={clearCart}
                  className="w-full py-3 rounded-2xl text-sm font-semibold text-red-600 bg-red-50/90 hover:bg-red-100 border border-red-200/90 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] transition-all duration-200"
                >
                  Clear order
                </button>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}

      {variantPickerProduct && variationModel ? (
        <MenuVariationPickerModal
          key={variantPickerProduct.id}
          product={variantPickerProduct}
          model={variationModel}
          onClose={() => setVariantPickerProduct(null)}
          onAdd={(opt, quantity, displayLabel) => {
            addToCartLine(variantPickerProduct, opt, quantity, displayLabel);
            setVariantPickerProduct(null);
            setCartOpen(true);
          }}
        />
      ) : null}
    </div>
  );
};

export default MenuDisplayPage;
