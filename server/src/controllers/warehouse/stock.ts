import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Product from '../../models/Product';
import Purchase from '../../models/Purchase';
import Warehouse from '../../models/Warehouse';
import { warehouseIncomingStock } from '../../utils/warehouseIncoming';
import { AuthRequest } from '../../middleware/auth';
import { getRolePermissions, checkPermissionInMap } from '../../config/rbac';

export async function getWarehouseStock(req: AuthRequest, res: Response): Promise<void> {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ status: 'error', message: 'Invalid warehouse ID' }); return; }
  try {
    const warehouse = await Warehouse.findById(req.params.id).select('_id name isActive').lean();
    if (!warehouse) { res.status(404).json({ status: 'error', message: 'Warehouse not found' }); return; }
    const products = await Product.find({ isInventory: { $ne: false } }).select('_id name code unit isInventory isSellable ptype hasBatches isWeight warehouse').sort({ name: 1 }).lean();
    const permissions = req.user ? await getRolePermissions(req.user) : null;
    const canReadPurchases = checkPermissionInMap(permissions, 'managePurchases', 'read');
    const purchases = canReadPurchases ? await Purchase.find({ warehouseId: warehouse._id, purchaseStatus: { $in: ['Ordered', 'Pending'] }, stockReceivedAt: null }).select('warehouseId purchaseStatus stockReceivedAt stockReceiptVersion items.productId items.quantity items.stockUnit').lean() : null;
    res.json({ status: 'success', data: { warehouse, items: warehouseIncomingStock(products, purchases, String(warehouse._id), warehouse.name) } });
  } catch { res.status(500).json({ status: 'error', message: 'Could not load warehouse stock' }); }
}

/** A field-level update cannot replace, reset or race a stock quantity. */
export async function putWarehouseStockAlert(req: Request, res: Response): Promise<void> {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.productId)) { res.status(400).json({ status: 'error', message: 'Invalid stock reference' }); return; }
  const body = req.body;
  if (!body || Object.keys(body).some(key => !['stockAlert', 'stockUnit'].includes(key)) || !Object.prototype.hasOwnProperty.call(body, 'stockAlert') || (body.stockAlert !== null && (typeof body.stockAlert !== 'number' || !Number.isFinite(body.stockAlert) || body.stockAlert < 0)) || typeof body.stockUnit !== 'string' || !body.stockUnit.trim()) {
    res.status(400).json({ status: 'error', message: 'Provide a nonnegative threshold (or null to clear it) and the recorded stock unit. Other fields are not accepted.' }); return;
  }
  try {
    const warehouse = await Warehouse.findById(req.params.id).select('_id name').lean();
    const product = await Product.findById(req.params.productId).lean();
    if (!warehouse || !product) { res.status(404).json({ status: 'error', message: 'Warehouse or item not found' }); return; }
    const row = warehouseIncomingStock([product], [], String(warehouse._id), warehouse.name).find(row => !row.legacyKey);
    if (!row?.alertEditable || product.unit !== body.stockUnit) { res.status(409).json({ status: 'error', message: 'Review this item’s canonical stock record and unit before changing its threshold. No balance was changed.' }); return; }
    const path = `warehouse.${req.params.id}.stockAlert`;
    const result = await Product.updateOne({ _id: product._id, unit: body.stockUnit, isInventory: true, ptype: 'Single', [`warehouse.${req.params.id}`]: { $exists: true } }, body.stockAlert === null ? { $unset: { [path]: '' } } : { $set: { [path]: body.stockAlert } });
    if (result.matchedCount !== 1) { res.status(409).json({ status: 'error', message: 'Stock setup changed. Reload before editing the threshold.' }); return; }
    res.json({ status: 'success', data: { stockAlert: body.stockAlert, stockUnit: product.unit } });
  } catch { res.status(500).json({ status: 'error', message: 'Could not save the stock threshold. Reload to confirm it.' }); }
}
