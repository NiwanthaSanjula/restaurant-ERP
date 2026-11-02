import React, { useMemo, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Smartphone,
  Gift,
  X,
} from "lucide-react";
import {
  calculateProductSubtotal,
  calculateSaleTotals,
  type SaleProduct,
} from "../../utils/saleCalculations";
import { createSale } from "../../services/saleService";
import { getWarehouses } from "../../services/warehouseService";
import { clearCart } from "../../services/cartService";
import { getActiveOffers, type SpecialOffer } from "../../services/specialOfferService";
import { showSuccessToast, showErrorToast } from "../../utils/toast";
import { useCurrency } from "../../contexts/CurrencyContext";
import { usePermissions } from "../../contexts/PermissionContext";

type Variation = {
  id: string;
  name: string;
  price: number;
};

export type CheckoutCartItem = {
  id: string;
  name: string;
  price: number;
  discount: number;
  image: string;
  quantity: number;
  selectedVariation?: Variation;
  cartKey: string; // composite key for product+variation
};

type CheckoutLocationState = {
  cartItems: CheckoutCartItem[];
  discountType?: "fixed" | "percentage";
  discount?: number;
  tax?: number;
  shipping?: number;
};

/** When provided, checkout renders as overlay (no route); otherwise uses location.state */
export type CheckoutPageOverlayProps = {
  cartItems: CheckoutCartItem[];
  discountType: "fixed" | "percentage";
  discount: number;
  tax: number;
  shipping: number;
  onClose: () => void;
  onOrderPlaced: () => void;
};

// Delivery/shipping: use cart's shipping value only so checkout total matches sidebar
const POS_LAST_DELIVERY_KEY = "pos_last_delivery";

/** MongoDB ObjectIds are 24 hex characters. POS mock products use "1", "2", etc. */
function isMongoId(id: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(id);
}

/** Open print window with backend-generated 80mm receipt HTML */
function printBillHtml(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open(); doc.write(html); doc.close();

  const doprint = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    const remove = () => { if (document.body.contains(iframe)) document.body.removeChild(iframe); };
    iframe.contentWindow?.addEventListener("afterprint", remove);
    setTimeout(remove, 3000);
  };

  // Wait for all images to load before printing so the logo appears
  const tryPrint = () => {
    const images = Array.from(doc.images);
    if (images.length === 0) {
      setTimeout(doprint, 100);
      return;
    }
    let loaded = 0;
    const check = () => { if (++loaded >= images.length) setTimeout(doprint, 50); };
    images.forEach((img) => {
      if (img.complete) check();
      else { img.onload = check; img.onerror = check; }
    });
  };

  // doc.write triggers load synchronously in some browsers; use small delay
  setTimeout(tryPrint, 150);
}

const CheckoutPage: React.FC<Partial<CheckoutPageOverlayProps>> = (overlayProps) => {
  const navigate = useNavigate();
  const { selectedCurrency } = useCurrency();
  const { hasPermission } = usePermissions();
  const canCreateSale = hasPermission("posOperations", "create");
  const location = useLocation();
  const state = location.state as CheckoutLocationState | null;
  const isOverlay = overlayProps?.cartItems != null && overlayProps?.onClose != null;
  const cartItems = isOverlay ? overlayProps.cartItems! : (state?.cartItems ?? []);
  const discountType = isOverlay ? overlayProps.discountType! : (state?.discountType ?? "fixed");
  const discount = isOverlay ? overlayProps.discount! : (state?.discount ?? 0);
  const taxFromCart = isOverlay ? overlayProps.tax! : (state?.tax ?? 0);
  const shippingFromCart = isOverlay ? overlayProps.shipping! : (state?.shipping ?? 0);

  const [loading, setLoading] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cardAmount, setCardAmount] = useState<number>(0);
  const [bankTransferAmount, setBankTransferAmount] = useState<number>(0);
  const [specialOffers, setSpecialOffers] = useState<SpecialOffer[]>([]);
  const [selectedOfferIdState, setSelectedOfferIdState] = useState<string | null>(null);
  useState(false); // Preserve hook order for the inactive offer modal.

  // Wrapper for selectedOfferId with localStorage persistence
  const selectedOfferId = selectedOfferIdState;
  const setSelectedOfferId = (id: string | null) => {
    setSelectedOfferIdState(id);
    if (id) {
      localStorage.setItem("checkout_selected_offer_id", id);
    } else {
      localStorage.removeItem("checkout_selected_offer_id");
    }
  };

  useEffect(() => {
    if (cartItems.length === 0) {
      if (isOverlay) overlayProps?.onClose?.();
      else navigate("/pos", { replace: true });
      return;
    }
    
    // Restore selectedOfferId from localStorage on mount
    const savedOfferId = localStorage.getItem("checkout_selected_offer_id");
    if (savedOfferId) {
      setSelectedOfferIdState(savedOfferId);
    }
    
    const loadWarehouses = async () => {
      const token = sessionStorage.getItem("token");
      if (!token) return;
      try {
        const res = await getWarehouses();
        const list = res?.data ?? res ?? [];
        const arr = Array.isArray(list) ? list : [];
        const defaultWh = arr.find((w: any) => w.isActive) ?? arr[0];
        if (defaultWh) setSelectedWarehouseId(defaultWh._id);
      } catch {
        // no warehouses or not logged in
      }
    };
    const loadSpecialOffers = async () => {
      try {
        const offers = await getActiveOffers();
        const activeOffers = offers.filter(o => o.status === 'Active');
        setSpecialOffers(activeOffers);
      } catch (error) {
        console.error("Failed to load special offers:", error);
        setSpecialOffers([]);
      }
    };
    loadWarehouses();
    loadSpecialOffers();
  }, [cartItems.length, navigate, isOverlay, overlayProps?.onClose]);

  // Build sale products for calculation — apply product-level discount per item
  const saleProducts: SaleProduct[] = useMemo(
    () =>
      cartItems.map((item) => {
        const productDiscount = item.discount || 0;
        const subtotal = calculateProductSubtotal(
          item.quantity,
          item.price,
          productDiscount,
          "fixed",
          0
        );
        return {
          productId: item.id,
          productName: item.name,
          variation: item.selectedVariation?.name ?? null,
          batch: null,
          stockQtyAtSale: 0,
          qty: item.quantity,
          price: item.price,
          discount: productDiscount,
          discountType: "fixed" as const,
          tax: 0,
          subtotal,
          cost: 0,
        };
      }),
    [cartItems]
  );

  const { total: totalBeforeOffer } = useMemo(
    () =>
      calculateSaleTotals(
        saleProducts,
        discount,
        discountType,
        taxFromCart,
        shippingFromCart
      ),
    [saleProducts, discount, discountType, taxFromCart, shippingFromCart]
  );

  const subtotal = useMemo(
    () => cartItems.reduce((sum, i) => sum + (i.price - (i.discount || 0)) * i.quantity, 0),
    [cartItems]
  );
  
  const discountAmount = useMemo(
    () => discountType === "percentage" ? (subtotal * discount) / 100 : discount,
    [discountType, discount, subtotal]
  );
  
  // Get selected special offer and calculate discount
  const selectedOffer = specialOffers.find(o => o._id === selectedOfferId);
  const specialOfferDiscount = useMemo(
    () => selectedOffer ? (subtotal * selectedOffer.percentage) / 100 : 0,
    [selectedOffer, subtotal]
  );
  
  // Apply special offer discount to the final total
  const total = useMemo(
    () => Math.max(0, totalBeforeOffer - specialOfferDiscount),
    [totalBeforeOffer, specialOfferDiscount]
  );
  
  // Calculate taxable amount after both discounts
  const totalDiscount = discountAmount + specialOfferDiscount;
  const taxableAmount = Math.max(0, subtotal - totalDiscount);
  const taxAmount = (taxableAmount * taxFromCart) / 100;
  const paymentTotal = cashAmount + cardAmount + bankTransferAmount;
  const remainingBalance = Math.max(0, total - paymentTotal);
  const isOverpaid = paymentTotal > total;

  const sanitizeAmount = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  };

  const handleBack = () => {
    if (isOverlay) overlayProps?.onClose?.();
    else navigate("/pos", {
      state: {
        cartItems,
        discountType,
        discount,
        tax: taxFromCart,
        shipping: shippingFromCart,
      },
    });
  };

  const doOnOrderSuccess = (printBill: boolean, billHtml?: string) => {
    if (printBill && billHtml) {
      printBillHtml(billHtml);
    }
    try {
      const sessionId = sessionStorage.getItem("posSessionId");
      clearCart(sessionId || undefined).catch((err: unknown) =>
        console.error("Failed to clear cart:", err)
      );
    } catch (_) {}
    localStorage.removeItem(POS_LAST_DELIVERY_KEY);
    localStorage.removeItem("checkout_selected_offer_id");
    if (isOverlay) overlayProps?.onOrderPlaced?.();
    else navigate("/pos", { replace: true });
  };

  const handlePlaceOrder = async (printBill: boolean) => {
    if (paymentTotal <= 0) {
      showErrorToast("Please enter at least one payment amount.");
      return;
    }
    if (isOverpaid) {
      showErrorToast("Payment amount cannot exceed total.");
      return;
    }

    setLoading(true);
    const token = sessionStorage.getItem("token");
    const cartUsesRealProducts = cartItems.every((item) => isMongoId(item.id));

    if (token && selectedWarehouseId && cartUsesRealProducts) {
      try {
        const api = (import.meta.env.VITE_API_URL || "http://localhost:5000/api") as string;
        const walkInName = "Walk-in Customer";
        const walkInMobile = "0000000000";
        const selectedCustomerId = sessionStorage.getItem("posSelectedCustomerId") || undefined;
        let customerId: string | undefined = selectedCustomerId;

        if (!customerId) {
          const searchRes = await fetch(
            `${api}/customers?q=${encodeURIComponent(walkInName)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const searchData = await searchRes.json();
          if (searchRes.ok) {
            const list = Array.isArray(searchData?.data) ? searchData.data : [];
            const byName = list.find(
              (c: any) => String(c?.name || "").toLowerCase() === walkInName.toLowerCase()
            );
            const byMobile = list.find((c: any) => String(c?.mobile || "") === walkInMobile);
            customerId = byName?._id || byMobile?._id;
          }

          if (!customerId) {
            const createRes = await fetch(`${api}/customers`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                name: walkInName,
                mobile: walkInMobile,
                address: "N/A",
              }),
            });
            const createData = await createRes.json();
            if (createRes.ok) {
              customerId = createData?.data?._id || createData?._id;
            } else if (createRes.status === 409) {
              const retryRes = await fetch(
                `${api}/customers?q=${encodeURIComponent(walkInMobile)}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              const retryData = await retryRes.json();
              if (retryRes.ok) {
                const retryList = Array.isArray(retryData?.data) ? retryData.data : [];
                const existing = retryList.find((c: any) => String(c?.mobile || "") === walkInMobile);
                customerId = existing?._id;
              }
            }
          }
        }

        if (!customerId) {
          throw new Error("Unable to resolve walk-in customer.");
        }

        const posSessionId = sessionStorage.getItem("posSessionId") || undefined;

        const saleRes = await createSale({
          warehouseId: selectedWarehouseId,
          customerId,
          businessType: "restaurant",
          status: "completed",
          saleType: "pos",
          ...(posSessionId ? { posSessionId } : {}),
          ...(selectedOfferId ? { specialOfferId: selectedOfferId } : {}),
          products: cartItems.map((item) => ({
            productId: item.id,
            variation: item.selectedVariation?.id ?? item.selectedVariation?.name ?? null,
            qty: item.quantity,
            discount: 0,
            discountType: "fixed" as const,
            tax: 0,
          })),
          saleDiscountValue: discount,
          saleDiscountType: discountType,
          saleTaxValue: taxFromCart,
          shippingCost: shippingFromCart,
          cashAmount,
          cardAmount,
          bankTransferAmount,
        });

        showSuccessToast("Order placed successfully. Inventory has been updated.");
        doOnOrderSuccess(printBill, saleRes?.billHtml);
      } catch (err: any) {
        showErrorToast(err?.message ?? "Failed to place order");
      } finally {
        setLoading(false);
      }
    } else {
      showSuccessToast(
        cartUsesRealProducts
          ? "Order placed successfully (demo mode)."
          : "Order placed. (Menu items—stock not updated. Use Sales module for inventory sales.)"
      );
      doOnOrderSuccess(printBill);
      setLoading(false);
    }
  };

  if (cartItems.length === 0) {
    return null;
  }

  const content = (
    <div className={isOverlay ? "min-h-full bg-[#E8F4FD] p-3 sm:p-4 pb-8 overflow-y-auto" : "min-h-screen bg-[#E8F4FD] p-4 pb-8"}>
      <div className="max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <button
            type="button"
            onClick={handleBack}
            className="p-2.5 rounded-lg hover:bg-white/80 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-800" />
          </button>
          <div className="flex-1 bg-white rounded-xl shadow-sm py-3 px-3 sm:px-4 text-center min-h-[44px] flex items-center justify-center">
            <h1 className="text-base sm:text-lg font-bold text-gray-900">Checkout</h1>
          </div>
        </div>

        {/* Cart Items */}
        <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
          <h2 className="font-bold text-gray-900 mb-3">Cart Items</h2>
          <div className="space-y-3">
            {cartItems.map((item) => (
              <div
                key={item.cartKey}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{item.name}</p>
                  {item.selectedVariation && (
                    <p className="text-sm text-gray-600">
                      {item.selectedVariation.name}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-medium text-[#1f3b63]">
                      {selectedCurrency?.symbol} {(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
                  <span className="text-sm font-semibold w-6 text-center">
                    {item.quantity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-2xl shadow-md p-3 sm:p-4 mb-4">
          <h2 className="font-bold text-gray-900 mb-3">Payment Method</h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="flex flex-col p-3 sm:p-4 rounded-xl border-2 border-gray-200 bg-gray-50 min-h-[80px] sm:min-h-0">
              <Banknote className="w-7 h-7 sm:w-8 sm:h-8 text-green-600 mb-1 sm:mb-2 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-800 text-center leading-tight">
                Cash
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cashAmount}
                onChange={(e) => setCashAmount(sanitizeAmount(e.target.value))}
                className="mt-2 w-full px-2 py-1.5 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1f3b63]"
                placeholder="0.00"
              />
            </div>
            <div className="flex flex-col p-3 sm:p-4 rounded-xl border-2 border-gray-200 bg-gray-50 min-h-[80px] sm:min-h-0">
              <CreditCard className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 mb-1 sm:mb-2 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-800 text-center leading-tight">
                Card Payment
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cardAmount}
                onChange={(e) => setCardAmount(sanitizeAmount(e.target.value))}
                className="mt-2 w-full px-2 py-1.5 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1f3b63]"
                placeholder="0.00"
              />
            </div>
            <div className="flex flex-col p-3 sm:p-4 rounded-xl border-2 border-gray-200 bg-gray-50 min-h-[80px] sm:min-h-0">
              <Smartphone className="w-7 h-7 sm:w-8 sm:h-8 text-red-500 mb-1 sm:mb-2 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs font-semibold text-gray-800 text-center leading-tight">
                Bank Transfer
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={bankTransferAmount}
                onChange={(e) => setBankTransferAmount(sanitizeAmount(e.target.value))}
                className="mt-2 w-full px-2 py-1.5 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1f3b63]"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Special Offers Section */}
        <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-5 h-5 text-purple-600" />
            <h2 className="font-bold text-gray-900">Special Offers</h2>
          </div>
          {specialOffers.length > 0 ? (
            <div className="space-y-2">
              {specialOffers.map((offer) => (
                <button
                  key={offer._id}
                  onClick={() => {
                    setSelectedOfferId(selectedOfferId === offer._id ? null : offer._id);
                  }}
                  className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                    selectedOfferId === offer._id
                      ? "border-purple-500 bg-purple-50"
                      : "border-gray-200 bg-gray-50 hover:border-purple-300"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{offer.offerName}</p>
                      <p className="text-sm text-purple-600 font-bold">{offer.percentage}% Off</p>
                      {offer.endDate && (
                        <p className="text-xs text-gray-500 mt-1">
                          Expires: {new Date(offer.endDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedOfferId === offer._id
                        ? "bg-purple-500 border-purple-500"
                        : "border-gray-300"
                    }`}>
                      {selectedOfferId === offer._id && (
                        <svg className="w-3 h-3 text-white" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                          <path d="M5 13l4 4L19 7"></path>
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {selectedOfferId && (
                <button
                  onClick={() => setSelectedOfferId(null)}
                  className="w-full p-2 text-sm text-gray-600 hover:text-gray-900 flex items-center justify-center gap-1"
                >
                  <X className="w-4 h-4" />
                  Remove Offer
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-2">No active offers available</p>
          )}
        </div>

        {/* Order Summary */}
        <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
          <h2 className="font-bold text-gray-900 mb-3">Order Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-semibold text-gray-900">
                {selectedCurrency?.symbol} {subtotal.toFixed(2)}
              </span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Discount</span>
                <span className="font-semibold text-green-600">
                  -{selectedCurrency?.symbol} {discountAmount.toFixed(2)}
                </span>
              </div>
            )}
            {specialOfferDiscount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600 flex items-center gap-1">
                  <Gift className="w-4 h-4 text-purple-600" />
                  Special Offer ({selectedOffer?.percentage}%)
                </span>
                <span className="font-semibold text-purple-600">
                  -{selectedCurrency?.symbol} {specialOfferDiscount.toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Delivery / Shipping</span>
              <span className="font-semibold text-gray-900">
                {selectedCurrency?.symbol} {shippingFromCart.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Tax ({taxFromCart.toFixed(2)}%)</span>
              <span className="font-semibold text-gray-900">
                {selectedCurrency?.symbol} {taxAmount.toFixed(2)}
              </span>
            </div>
            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-bold text-lg text-gray-900">
                  {selectedCurrency?.symbol} {total.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Paid Amount</span>
              <span className="font-semibold text-gray-900">
                {selectedCurrency?.symbol} {paymentTotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between gap-3 min-w-0">
              <span className={`text-sm shrink-0 font-semibold ${isOverpaid ? "text-red-600" : "text-gray-600"}`}>
                {isOverpaid ? "Balance" : "Due"}
              </span>
              <span className={`font-semibold text-right tabular-nums ${isOverpaid ? "text-red-600" : "text-gray-900"}`}>
                {selectedCurrency?.symbol} {(isOverpaid ? paymentTotal - total : remainingBalance).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-600 text-sm">Sale type</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                POS
              </span>
            </div>
          </div>
        </div>

        {/* Cancel, Submit Payment, Submit & Print Bill */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={loading}
            className="flex-1 py-3.5 sm:py-3 rounded-xl font-bold text-[#4b5563] bg-[#e7ecf2] hover:bg-[#dfe5ed] border border-[#d3dbe6] transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-h-[48px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handlePlaceOrder(false)}
            disabled={loading || !canCreateSale || paymentTotal <= 0 || isOverpaid}
            title={!canCreateSale ? "You don't have permission to create a sale" : undefined}
            className="flex-1 py-3.5 sm:py-3 rounded-xl font-bold text-white bg-[#68ae59] hover:bg-[#5da04f] border-2 border-[#68ae59] shadow-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-h-[48px]"
          >
            {loading ? "Placing order..." : "Submit Payment"}
          </button>
          <button
            type="button"
            onClick={() => handlePlaceOrder(true)}
            disabled={loading || !canCreateSale || paymentTotal <= 0 || isOverpaid}
            title={!canCreateSale ? "You don't have permission to create a sale" : undefined}
            className="flex-1 py-3.5 sm:py-3 rounded-xl font-bold text-white bg-[#2f3f6f] hover:bg-[#293862] border-2 border-[#2f3f6f] shadow-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-h-[48px]"
          >
            {loading ? "Placing order..." : "Submit & Print Bill"}
          </button>
        </div>
      </div>
    </div>
  );

  if (isOverlay) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 overflow-y-auto p-0 sm:p-4 min-h-[100dvh]"
        onClick={() => overlayProps?.onClose?.()}
        role="dialog"
        aria-modal="true"
        aria-label="Checkout"
      >
        <div
          className="relative w-full max-w-5xl max-h-[95dvh] sm:max-h-[95vh] my-0 sm:my-4 mx-auto bg-[#E8F4FD] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );
  }

  return content;
};

export default CheckoutPage;
