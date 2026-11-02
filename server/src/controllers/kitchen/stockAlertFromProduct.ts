/**
 * Reads stockAlert from a Product document (warehouse / variation structure)
 * as stored in MongoDB. Aligns with POS "first warehouse" unless warehouseId is set.
 */
export function resolveStockAlertFromProduct(
  product: { warehouse?: any; ptype?: string; isInventory?: boolean } | null | undefined,
  warehouseId?: string
): number | undefined {
  if (!product || product.isInventory !== true) return undefined;
  const wh = product.warehouse;
  if (!wh || typeof wh !== 'object') return undefined;
  const entries: [string, any][] =
    wh instanceof Map ? Array.from(wh.entries()) : Object.entries(wh);
  const wData =
    warehouseId && entries.length
      ? entries.find(([id]) => String(id) === String(warehouseId))?.[1]
      : entries[0]?.[1];
  if (!wData || typeof wData !== 'object') return undefined;

  if (product.ptype === 'Single') {
    return typeof wData.stockAlert === 'number' ? wData.stockAlert : undefined;
  }

  if (typeof wData.stockAlert === 'number') return wData.stockAlert;

  if (wData.variationValues) {
    const vv =
      wData.variationValues instanceof Map
        ? Array.from(wData.variationValues.values())
        : Object.values(wData.variationValues || {});
    for (const v of vv as any[]) {
      if (v && typeof v.stockAlert === 'number') return v.stockAlert;
    }
  }

  if (Array.isArray(wData.batches)) {
    for (const b of wData.batches) {
      if (b && typeof b.stockAlert === 'number') return b.stockAlert;
      if (b?.variationValues) {
        const vv =
          b.variationValues instanceof Map
            ? Array.from(b.variationValues.values())
            : Object.values(b.variationValues || {});
        for (const v of vv as any[]) {
          if (v && typeof v.stockAlert === 'number') return v.stockAlert;
        }
      }
    }
  }

  return undefined;
}

export function enrichKitchenProductDoc(doc: any, warehouseId?: string): any {
  if (!doc) return doc;
  const inv = doc.inventoryProductId;
  const stockAlertFromProduct =
    inv && typeof inv === 'object' && inv._id
      ? resolveStockAlertFromProduct(inv, warehouseId)
      : undefined;
  const minLocal = doc.minStockLevel != null ? doc.minStockLevel : null;
  return {
    ...doc,
    stockAlertFromProduct: stockAlertFromProduct != null ? stockAlertFromProduct : null,
    minStockLevelEffective:
      stockAlertFromProduct != null ? stockAlertFromProduct : minLocal
  };
}
