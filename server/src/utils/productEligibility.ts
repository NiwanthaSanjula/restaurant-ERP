/** Selling eligibility is explicit; unclassified legacy records require review. */
export function isProductSellable(product: { isSellable?: unknown }): boolean {
  return product.isSellable === true;
}

export function isPosEligibleProduct(product: { status?: unknown; isSellable?: unknown }): boolean {
  return product.status === 'Active' && isProductSellable(product);
}

/** Keep MongoDB filtering equivalent to the checkout predicate. */
export function productSellabilityFilter(sellable: boolean): Record<string, unknown> {
  return { isSellable: sellable };
}

export const posEligibilityFilter = (): Record<string, unknown> => ({ status: 'Active', ...productSellabilityFilter(true) });
