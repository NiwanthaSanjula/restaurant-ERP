export function stockAlertState(quantity: number | null, threshold: number | null) {
  if (quantity === null) return 'stock_unknown';
  if (quantity <= 0) return 'out_of_stock';
  if (threshold === null) return 'threshold_missing';
  return quantity <= threshold ? 'low_stock' : 'healthy';
}

/** Read existing warehouse quantities without merging legacy keys or converting units. */
export function warehouseStockRows(products: any[], warehouseId: string, warehouseName: string) {
  const rows: any[] = [];
  const entries = (value: any): Array<[string, any]> => value instanceof Map ? [...value.entries()] : Object.entries(value || {});
  for (const product of products) {
    if (product.isInventory === false) continue;
    const sameName = (value: unknown) => String(value || '').trim().toLowerCase() === warehouseName.trim().toLowerCase();
    const hasLegacy = entries(product.warehouse).some(([key, value]) => key !== warehouseId && (sameName(key) || sameName(value.warehouseName)));
    for (const [key, warehouse] of entries(product.warehouse)) {
      if (key !== warehouseId && !sameName(key) && !sameName(warehouse.warehouseName)) continue;
      const singleCanonical = product.isInventory === true && product.ptype === 'Single' && !product.hasBatches && !product.isWeight && key === warehouseId && !hasLegacy && !warehouse.batches?.length && !entries(warehouse.variationValues).length;
      const add = (stock: any, variant = '', batch = '') => {
        const quantity = typeof stock.productQty === 'number' && Number.isFinite(stock.productQty) ? stock.productQty : null;
        const stockAlert = typeof stock.stockAlert === 'number' && Number.isFinite(stock.stockAlert) && stock.stockAlert >= 0 ? stock.stockAlert : null;
        rows.push({
        productId: String(product._id), name: product.name, code: product.code, stockUnit: product.unit || null,
        isSellable: typeof product.isSellable === 'boolean' ? product.isSellable : null,
        quantity, stockAlert, alertState: stockAlertState(quantity, stockAlert),
        alertEditable: singleCanonical && !!product.unit,
        reorderSupported: singleCanonical && !!product.unit,
        variant, batch, sourceKey: key, legacyKey: key !== warehouseId, trackingNeedsReview: product.isInventory !== true,
        issueSupported: product.isInventory === true && product.ptype === 'Single' && !product.hasBatches && !product.isWeight && key === warehouseId && !variant && !batch && !warehouse.batches?.length && !entries(warehouse.variationValues).length
        });
      };
      const expand = (stock: any, batch = '') => {
        const variants = entries(stock.variationValues);
        if (variants.length) variants.forEach(([variant, value]) => add(value, variant, batch));
        else add(stock, '', batch);
      };
      if (warehouse.batches?.length) warehouse.batches.forEach((batch: any) => expand(batch, batch.batchNumber || 'Unnamed batch'));
      else expand(warehouse);
    }
  }
  return rows;
}
