type Supplier = { _id?: string; id?: string; name?: string };
type Stock = { warehouseName?: string; productQty?: number; productCost?: number; batches?: unknown[]; variationValues?: object };
type ReorderProduct = { _id: string; name: string; unit?: string; supplier?: string; isInventory?: boolean; ptype?: string; hasBatches?: boolean; isWeight?: boolean; warehouse?: Record<string, Stock> };

/** Only explicit product/location records supply defaults. Quantity is always left for staff review. */
export function purchaseReorderDraft(product: ReorderProduct, warehouse: { _id?: string; id?: string; name: string; isActive?: boolean }, suppliers: Supplier[]) {
  const warehouseId = String(warehouse._id || warehouse.id || '');
  const stock = product.warehouse?.[warehouseId];
  const sameName = (value?: string) => String(value || '').trim().toLowerCase() === warehouse.name.trim().toLowerCase();
  const legacy = Object.entries(product.warehouse || {}).some(([key, entry]) => key !== warehouseId && (sameName(key) || sameName(entry.warehouseName)));
  if (!warehouseId || warehouse.isActive === false || product.isInventory !== true || product.ptype !== 'Single' || product.hasBatches || product.isWeight || !product.unit || legacy || stock?.batches?.length || Object.keys(stock?.variationValues || {}).length) throw new Error('This stock identity needs review before reordering. Single items in their recorded stock unit are supported.');
  if (stock && (typeof stock.productQty !== 'number' || !Number.isFinite(stock.productQty) || stock.productQty < 0)) throw new Error('The warehouse balance is not recorded reliably. Review it before reordering.');
  const matches = product.supplier ? suppliers.filter(supplier => supplier._id === product.supplier || supplier.id === product.supplier || supplier.name === product.supplier) : [];
  const supplierId = matches.length === 1 ? String(matches[0]._id || matches[0].id || '') : '';
  return {
    warehouseId, warehouseName: warehouse.name, supplierId,
    supplierNote: supplierId ? 'The item’s saved Supplier assignment is selected. Review it before saving.' : 'No unique saved Supplier assignment is available. Choose a supplier; none was inferred from purchase history.',
    item: { productId: product._id, name: product.name, stockUnit: product.unit, stock: stock?.productQty ?? 0, qty: 0, cost: typeof stock?.productCost === 'number' && Number.isFinite(stock.productCost) && stock.productCost > 0 ? stock.productCost.toFixed(2) : '', subTotal: 0 }
  };
}
