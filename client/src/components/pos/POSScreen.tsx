import React, { useEffect, useMemo, useState } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import CalculatorModal from './CalculatorModal';

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
    <div className="min-h-screen flex flex-col bg-[#F7F8FA]">
      <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <button onClick={closePos} className="px-3 h-8 rounded bg-red-600 text-white text-sm hover:bg-red-700">Close POS</button>
          <button onClick={() => setShowCalc(true)} className="px-3 h-8 rounded bg-gray-100 text-[#001F54] text-sm">🧮 Calculator</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleFullscreen} className="px-3 h-8 rounded bg-gray-100 text-[#001F54] text-sm">⛶ Full Screen</button>
          <button onClick={exitWithoutClosing} className="px-3 h-8 rounded bg-[#4A90E2] text-white text-sm hover:bg-[#004080]">Exit (Keep Session)</button>
        </div>
      </div>
      <div className="flex-1 flex">
      <div className="w-2/3 p-4">
        <div className="flex items-center gap-2 mb-3">
          {catalog.categories.map(c => (
            <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`px-3 py-2 rounded ${activeCategory === c.id ? 'bg-[#003366] text-white' : 'bg-white text-[#001F54] border border-gray-200'}`}>{c.name}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <select value={activeBrand} onChange={e => setActiveBrand(e.target.value)} className="border border-gray-200 rounded px-3 py-2">
            <option value="">All Brands</option>
            {catalog.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map(i => (
            <button key={i.id} onClick={() => addToCart(i)} className="bg-white border border-gray-200 rounded p-3 text-left hover:border-[#4A90E2]">
              <div className="font-medium text-[#001F54]">{i.name}</div>
              <div className="text-sm text-[#7E7F83]">{currencySymbol} {i.price.toFixed(2)}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="w-1/3 p-4 bg-white border-l border-gray-200 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold text-[#001F54]">Cart</div>
          <button onClick={handleReset} className="text-sm text-[#7E7F83] hover:text-[#003366]">Reset</button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="space-y-2 h-full min-h-0 overflow-y-auto pr-1">
            {cart.map(line => (
              <div key={line.id} className="flex items-center justify-between border border-gray-200 rounded p-2">
                <div>
                  <div className="font-medium text-[#001F54]">{line.name}</div>
                  <div className="text-xs text-[#7E7F83]">{currencySymbol} {line.price.toFixed(2)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(line.id, -1)} className="w-7 h-7 rounded bg-gray-100">-</button>
                  <div className="w-8 text-center">{line.qty}</div>
                  <button onClick={() => updateQty(line.id, 1)} className="w-7 h-7 rounded bg-gray-100">+</button>
                  <button onClick={() => removeLine(line.id)} className="text-red-600 text-sm">Remove</button>
                </div>
              </div>
            ))}
            {cart.length === 0 && <div className="text-sm text-[#7E7F83]">No items yet</div>}
          </div>
        </div>
        <div className="mt-4 space-y-3 pt-4 border-t border-gray-200">
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="text-sm font-semibold text-[#001F54] mb-2">TAX & DISCOUNT</div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">DISCOUNT</label>
                <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value) || 0)} className="w-full border border-gray-200 rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">TAX (%)</label>
                <input type="number" value={taxPercent} onChange={e => setTaxPercent(Number(e.target.value) || 0)} className="w-full border border-gray-200 rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">SHIPPING</label>
                <input type="number" value={shipping} onChange={e => setShipping(Number(e.target.value) || 0)} className="w-full border border-gray-200 rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Special Offer</label>
                <select
                  value={selectedOfferId}
                  onChange={(e) => setSelectedOfferId(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-2 bg-white text-sm"
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

          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Notes (optional)" className="w-full border border-gray-200 rounded px-3 py-2" />

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Subtotal</span>
              <span>{currencySymbol} {subtotal.toFixed(2)}</span>
            </div>
            {selectedOffer && specialOfferDiscount > 0 && (
              <div className="flex items-center justify-between text-sm text-emerald-700">
                <span>Offer: {selectedOffer.offerName} ({selectedOffer.percentage}%)</span>
                <span>-{currencySymbol} {specialOfferDiscount.toFixed(2)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-sm text-rose-600">
                <span>Discount</span>
                <span>-{currencySymbol} {discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Tax</span>
              <span>{currencySymbol} {taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Shipping</span>
              <span>{currencySymbol} {shipping.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-lg font-semibold text-[#001F54] border-t border-gray-200 pt-2">
              <span>Total</span>
              <span>{currencySymbol} {totalAfterOffer.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={handleHold} disabled={cart.length === 0} className="py-3 rounded-xl bg-[#f3f4f6] text-[#1f2937] hover:bg-[#e5e7eb] transition disabled:opacity-50">Hold</button>
            <button onClick={handleReset} className="py-3 rounded-xl bg-[#f8fafc] text-[#1f2937] border border-gray-200 hover:bg-[#eef2f6] transition">Reset</button>
            <button onClick={checkout} disabled={cart.length === 0} className="py-3 rounded-xl bg-[#003366] text-white hover:bg-[#004080] disabled:opacity-50">Pay Now</button>
          </div>
        </div>
      </div>
      </div>
      {showCalc && <CalculatorModal onClose={() => setShowCalc(false)} onUse={() => setShowCalc(false)} />}
    </div>
  );
};

export default POSScreen;


