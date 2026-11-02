// Sale calculation utilities

export interface SaleProduct {
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

/**
 * Calculate product subtotal
 */
export const calculateProductSubtotal = (
  qty: number,
  price: number,
  discount: number,
  discountType: 'fixed' | 'percentage',
  tax: number
): number => {
  let initialPrice = qty * price;
  
  // Apply discount
  if (discountType === 'fixed') {
    // Fixed discount is per-unit, so multiply by quantity.
    initialPrice -= discount * qty;
  } else {
    initialPrice -= (initialPrice * discount / 100);
  }
  
  // Apply tax
  initialPrice += (initialPrice * tax / 100);
  
  return Math.max(0, initialPrice);
};

/**
 * Calculate sale totals
 */
export const calculateSaleTotals = (
  products: SaleProduct[],
  saleDiscountValue: number,
  saleDiscountType: 'fixed' | 'percentage',
  saleTaxValue: number,
  shippingCost: number
): { total: number; profit: number } => {
  // Calculate total of products
  let totalOfProducts = products.reduce((sum, p) => sum + p.subtotal, 0);
  const totalProductQty = products.reduce((sum, p) => sum + Number(p.qty || 0), 0);
  
  // Apply sale-level discount
  if (saleDiscountType === 'fixed') {
    // Fixed sale discount is per sold unit across all line items.
    totalOfProducts -= saleDiscountValue * totalProductQty;
  } else {
    totalOfProducts -= (totalOfProducts * saleDiscountValue / 100);
  }
  
  // Apply sale tax
  totalOfProducts += (totalOfProducts * saleTaxValue / 100);
  
  // Add shipping
  const total = Math.max(0, totalOfProducts + shippingCost);
  
  // Calculate profit
  const profit = products.reduce((sum, p) => {
    const sellingPriceAfterTaxDiscount = p.subtotal;
    const profitPerProduct = (sellingPriceAfterTaxDiscount - (p.cost * p.qty));
    return sum + profitPerProduct;
  }, 0);
  
  return { total, profit };
};

/**
 * Calculate balance
 */
export const calculateBalance = (
  total: number,
  cashAmount: number,
  cardAmount: number,
  bankTransferAmount: number
): number => {
  const paymentTotal = cashAmount + cardAmount + bankTransferAmount;
  return Math.max(0, total - paymentTotal);
};

/**
 * Calculate overpaid balance amount.
 */
export const calculateOverpaidBalance = (
  total: number,
  cashAmount: number,
  cardAmount: number,
  bankTransferAmount: number
): number => {
  const paymentTotal = cashAmount + cardAmount + bankTransferAmount;
  return Math.max(0, paymentTotal - total);
};

/**
 * Determine payment status
 */
export const determinePaymentStatus = (
  total: number,
  cashAmount: number,
  cardAmount: number,
  bankTransferAmount: number
): 'paid' | 'partial' | 'unpaid' => {
  const paymentTotal = cashAmount + cardAmount + bankTransferAmount;
  
  if (paymentTotal === 0) {
    return 'unpaid';
  } else if (paymentTotal >= total) {
    return 'paid';
  } else {
    return 'partial';
  }
};

