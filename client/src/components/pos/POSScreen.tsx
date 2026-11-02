import React, { useEffect, useMemo, useState } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import CalculatorModal from './CalculatorModal';
import ThemeToggle from '../common/ThemeToggle';

type Catalog = {
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  items: Array<{ id: string; name: string; price: number; categoryId: string; brandId: string }>;
};

type CartLine = { id: string; name: string; price: number; qty: number };

const POSScreen: React.FC = () => {
  const { currencySymbol } = useCurrency();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('cat-all');
  const [activeBrand, setActiveBrand] = useState<string>('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [note, setNote] = useState('');
  const [showCalc, setShowCalc] = useState(false);
  const [specialOffers, setSpecialOffers] = useState<Array<{ _id: string; offerName: string; percentage: number; status: string }>>([]);
  const [offersLoading, setOffersLoading] = useState<boolean>(false);
  const [offersError, setOffersError] = useState<boolean>(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string>('');
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  useEffect(() => {
    const token = localStorage.getItem('token');
    const sess = sessionStorage.getItem('posSessionId');
    if (!sess) {
      // Redirect back if no session; guarded in router typically
      window.location.href = '/';
      return;
    }
    setSessionId(sess);
    fetch(`${api}/pos/catalog`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    }).then(r => r.json()).then(data => setCatalog(data.data));

    const fetchOffers = async () => {
      setOffersLoading(true);
      setOffersError(false);
      try {
        const res = await fetch(`${api}/special-offers`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const json = await res.json();
        if (res.ok && json.success) {
          const active = json.data.filter((offer: any) => (offer.status || '').toString().toLowerCase() === 'active');
          setSpecialOffers(active);
        } else {
          setSpecialOffers([]);
        }
      } catch (err) {
        console.warn('Failed to load special offers', err);
        setSpecialOffers([]);
        setOffersError(true);
      } finally {
        setOffersLoading(false);
      }
    };

    fetchOffers();
  }, []);

  const items = useMemo(() => {
    if (!catalog) return [];
    return catalog.items.filter(i => (activeCategory === 'cat-all' || i.categoryId === activeCategory) && (!activeBrand || i.brandId === activeBrand));
  }, [catalog, activeCategory, activeBrand]);

  const addToCart = (item: { id: string; name: string; price: number }) => {
    setCart(prev => {
      const idx = prev.findIndex(l => l.id === item.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(l => l.id === id ? { ...l, qty: Math.max(1, l.qty + delta) } : l));
  };

  const removeLine = (id: string) => setCart(prev => prev.filter(l => l.id !== id));

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);

  const [discount, setDiscount] = useState<number>(0);
  const [taxPercent, setTaxPercent] = useState<number>(0);
  const [shipping, setShipping] = useState<number>(0);

  const selectedOffer = specialOffers.find((offer) => offer._id === selectedOfferId);
  const specialOfferDiscount = selectedOffer ? (subtotal * selectedOffer.percentage) / 100 : 0;
  const afterOfferSubtotal = Math.max(0, subtotal - specialOfferDiscount);
  const discountAmount = Math.max(0, discount);
  const afterDiscount = Math.max(0, afterOfferSubtotal - discountAmount);
  const taxAmount = (afterDiscount * Math.max(0, taxPercent)) / 100;
  const totalAfterOffer = Math.max(0, afterDiscount + taxAmount + Math.max(0, shipping));

  const checkout = async () => {
    if (!sessionId || cart.length === 0) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${api}/pos/sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        sessionId,
        items: cart,
        specialOfferId: selectedOfferId || undefined,
        specialOfferDiscount,
        discount: discountAmount,
        taxPercent: taxPercent,
        taxAmount,
        shipping: shipping,
        payments: [{ type: 'cash', amount: totalAfterOffer }],
        notes: note
      })
    });
    const data = await res.json();
    if (res.ok) {
      setCart([]);
      setNote('');
      alert(`Order placed. ID: ${data.data.orderId}`);
    } else {
      alert(data.message || 'Checkout failed');
    }
  };

  const handleHold = () => {
    if (cart.length === 0) return;
    alert('Hold feature not configured yet.');
  };

  const handleReset = () => {
    setCart([]);
    setNote('');
  };

  if (!catalog) return null;

  const toggleFullscreen = () => {
    const elem = document.documentElement as any;
    if (!document.fullscreenElement) {
      if (elem.requestFullscreen) elem.requestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const exitWithoutClosing = () => {
    window.location.href = '/dashboard';
  };

  const closePos = async () => {
    if (!sessionId) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${api}/pos/close`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ sessionId }) });
    if (res.ok) {
      sessionStorage.removeItem('posSessionId');
      window.location.href = '/dashboard';
    } else {
      const data = await res.json();
      alert(data.message || 'Failed to close session');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <div className="h-12 bg-surface border-b border-line flex items-center justify-between px-3">
        <ThemeToggle />
        <div className="flex items-center gap-2">
          <button onClick={closePos} className="px-3 h-8 rounded bg-danger text-on-danger text-sm hover:bg-danger-hover">Close POS</button>
          <button onClick={() => setShowCalc(true)} className="px-3 h-8 rounded bg-surface-muted text-primary text-sm">🧮 Calculator</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleFullscreen} className="px-3 h-8 rounded bg-surface-muted text-primary text-sm">⛶ Full Screen</button>
          <button onClick={exitWithoutClosing} className="px-3 h-8 rounded bg-primary text-on-primary text-sm hover:bg-primary-hover">Exit (Keep Session)</button>
        </div>
      </div>
      <div className="flex-1 flex">
      <div className="w-2/3 p-4">
        <div className="flex items-center gap-2 mb-3">
          {catalog.categories.map(c => (
            <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`px-3 py-2 rounded ${activeCategory === c.id ? 'bg-primary text-on-primary' : 'bg-surface text-primary border border-line'}`}>{c.name}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <select value={activeBrand} onChange={e => setActiveBrand(e.target.value)} className="border border-line rounded px-3 py-2">
            <option value="">All Brands</option>
            {catalog.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map(i => (
            <button key={i.id} onClick={() => addToCart(i)} className="bg-surface border border-line rounded p-3 text-left hover:border-primary">
              <div className="font-medium text-foreground">{i.name}</div>
              <div className="text-sm text-muted">{currencySymbol} {i.price.toFixed(2)}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="w-1/3 p-4 bg-surface border-l border-line flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold text-foreground">Cart</div>
          <button onClick={handleReset} className="text-sm text-muted hover:text-primary">Reset</button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="space-y-2 h-full min-h-0 overflow-y-auto pr-1">
            {cart.map(line => (
              <div key={line.id} className="flex items-center justify-between border border-line rounded p-2">
                <div>
                  <div className="font-medium text-foreground">{line.name}</div>
                  <div className="text-xs text-muted">{currencySymbol} {line.price.toFixed(2)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(line.id, -1)} className="w-7 h-7 rounded bg-surface-muted">-</button>
                  <div className="w-8 text-center">{line.qty}</div>
                  <button onClick={() => updateQty(line.id, 1)} className="w-7 h-7 rounded bg-surface-muted">+</button>
                  <button onClick={() => removeLine(line.id)} className="text-danger text-sm">Remove</button>
                </div>
              </div>
            ))}
            {cart.length === 0 && <div className="text-sm text-muted">No items yet</div>}
          </div>
        </div>
        <div className="mt-4 space-y-3 pt-4 border-t border-line">
          <div className="bg-surface-raised p-3 rounded-lg">
            <div className="text-sm font-semibold text-foreground mb-2">TAX & DISCOUNT</div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">DISCOUNT</label>
                <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value) || 0)} className="w-full border border-line rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">TAX (%)</label>
                <input type="number" value={taxPercent} onChange={e => setTaxPercent(Number(e.target.value) || 0)} className="w-full border border-line rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">SHIPPING</label>
                <input type="number" value={shipping} onChange={e => setShipping(Number(e.target.value) || 0)} className="w-full border border-line rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Special Offer</label>
                <select
                  value={selectedOfferId}
                  onChange={(e) => setSelectedOfferId(e.target.value)}
                  className="w-full border border-line rounded px-3 py-2 bg-surface text-sm"
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
          </div>

          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Notes (optional)" className="w-full border border-line rounded px-3 py-2" />

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span>{currencySymbol} {subtotal.toFixed(2)}</span>
            </div>
            {selectedOffer && specialOfferDiscount > 0 && (
              <div className="flex items-center justify-between text-sm text-secondary">
                <span>Offer: {selectedOffer.offerName} ({selectedOffer.percentage}%)</span>
                <span>-{currencySymbol} {specialOfferDiscount.toFixed(2)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-sm text-danger">
                <span>Discount</span>
                <span>-{currencySymbol} {discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Tax</span>
              <span>{currencySymbol} {taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Shipping</span>
              <span>{currencySymbol} {shipping.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-lg font-semibold text-foreground border-t border-line pt-2">
              <span>Total</span>
              <span>{currencySymbol} {totalAfterOffer.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={handleHold} disabled={cart.length === 0} className="py-3 rounded-xl bg-surface-muted text-foreground hover:bg-surface-muted transition disabled:opacity-50">Hold</button>
            <button onClick={handleReset} className="py-3 rounded-xl bg-surface-raised text-foreground border border-line hover:bg-surface-muted transition">Reset</button>
            <button onClick={checkout} disabled={cart.length === 0} className="py-3 rounded-xl bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50">Pay Now</button>
          </div>
        </div>
      </div>
      </div>
      {showCalc && <CalculatorModal onClose={() => setShowCalc(false)} onUse={() => setShowCalc(false)} />}
    </div>
  );
};

export default POSScreen;


