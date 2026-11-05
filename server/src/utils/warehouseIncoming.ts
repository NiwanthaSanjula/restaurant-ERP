import { warehouseStockRows } from './warehouseStock';

/** Incoming is unreceived, unit-verified purchase quantity; it is never an on-hand balance. */
export function warehouseIncomingStock(products: any[], purchases: any[] | null, warehouseId: string, warehouseName: string) {
  const rows = warehouseStockRows(products, warehouseId, warehouseName);
  if (purchases === null) return rows.map(row => ({ ...row, incoming: null, incomingNote: 'Purchases Read permission is required to view incoming stock.' }));
  const open = purchases.filter(order => String(order.warehouseId) === warehouseId && ['Ordered', 'Pending'].includes(order.purchaseStatus) && !order.stockReceivedAt);
  // Show incoming orders even before this item has ever been stocked at this location.
  for (const product of products) {
    if (product.isInventory !== true || rows.some(row => row.productId === String(product._id)) || !open.some(order => order.items?.some((line: any) => String(line.productId) === String(product._id)))) continue;
    const added = warehouseStockRows([{ ...product, warehouse: { [warehouseId]: { warehouseName, productQty: 0 } } }], warehouseId, warehouseName);
    rows.push(...added.map(row => ({ ...row, alertEditable: false, issueSupported: false, onOrderOnly: true })));
  }
  return rows.map(row => {
    if (row.legacyKey || !row.reorderSupported) return { ...row, incoming: null, incomingNote: 'Review stock identity before matching incoming orders.' };
    let incoming = 0;
    for (const order of open) for (const line of order.items || []) {
      if (String(line.productId) !== row.productId) continue;
      if (order.stockReceiptVersion !== 1 || !row.stockUnit || line.stockUnit !== row.stockUnit || typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0) {
        return { ...row, incoming: null, incomingNote: 'An unreceived order has unverified stock posting or units. Review it before receiving.' };
      }
      incoming += line.quantity;
    }
    if (!Number.isFinite(incoming)) return { ...row, incoming: null, incomingNote: 'Incoming quantity needs review.' };
    return { ...row, incoming, incomingNote: '' };
  });
}
