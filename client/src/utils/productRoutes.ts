export const PRODUCT_LIST_PATHS = {
  pos: '/pos-products',
  inventory: '/inventory-items',
  review: '/inventory-items/needs-review'
} as const;

export type ProductView = keyof typeof PRODUCT_LIST_PATHS;

export function productViewForPath(pathname: string): ProductView {
  const path = pathname.toLowerCase().replace(/\/+$/, '');
  if (path === PRODUCT_LIST_PATHS.review) return 'review';
  return path === PRODUCT_LIST_PATHS.inventory || path.startsWith(`${PRODUCT_LIST_PATHS.inventory}/`)
    ? 'inventory' : 'pos';
}

/** Return to the list matching the saved classification, never a guessed item purpose. */
export function productListPath(isSellable: unknown): string {
  return PRODUCT_LIST_PATHS[isSellable === true ? 'pos' : isSellable === false ? 'inventory' : 'review'];
}
