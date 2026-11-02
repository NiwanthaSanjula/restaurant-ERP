import { Response } from 'express';
import { query, validationResult } from 'express-validator';
import KitchenStockMovement from '../../models/KitchenStockMovement';
import { authenticate, AuthRequest } from '../../middleware/auth';

import KitchenRecipe from '../../models/KitchenRecipe';

import KitchenInventoryProduct from '../../models/KitchenInventoryProduct';
import { buildZonedDateRange } from '../../utils/timezone';

export const getLowStockAlerts = [
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const all = await KitchenInventoryProduct.find()
        .populate('unitId', 'shortName')
        .populate('inventoryProductId', 'warehouse ptype isInventory')
        .lean();

      // Use the logic from stockAlertFromProduct.ts to determine effective min stock
      const { enrichKitchenProductDoc } = require('./stockAlertFromProduct');

      const alerts = all
        .map((p) => enrichKitchenProductDoc(p))
        .filter((p: any) => p.currentStock <= (p.minStockLevelEffective || 0))
        .map((p: any) => ({
          _id: p._id,
          name: p.name,
          currentStock: p.currentStock,
          minStockLevel: p.minStockLevelEffective,
          unit: p.unitId?.shortName || ''
        }));

      res.json({ status: 'success', data: alerts });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch low stock alerts' });
    }
  }
];

export const getKitchenWasteReport = [
  authenticate,
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { startDate, endDate } = req.query;
      const filter: any = { 
        type: 'out', 
        source: 'manual' 
      };

      if (startDate || endDate) {
        const { start, end } = buildZonedDateRange(startDate as string | undefined, endDate as string | undefined);
        filter.createdAt = { $gte: start, $lte: end };
      }

      const waste = await KitchenStockMovement.find(filter)
        .populate({
          path: 'kitchenProductId',
          select: 'name averageCost unitId',
          populate: { path: 'unitId', select: 'shortName' }
        })
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .lean();

      // Calculate total waste value
      const totalWasteValue = waste.reduce((acc, curr: any) => {
        const cost = curr.costAtTime || curr.kitchenProductId?.averageCost || 0;
        return acc + (cost * curr.quantity);
      }, 0);

      res.json({ 
        status: 'success', 
        data: {
          items: waste,
          summary: {
            totalWasteValue,
            count: waste.length
          }
        } 
      });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch waste report' });
    }
  }
];

function getWarehouseEntries(product: any): Array<[string, any]> {
  const warehouse = product?.warehouse;
  if (!warehouse || typeof warehouse !== 'object') return [];
  return warehouse instanceof Map ? Array.from(warehouse.entries()) : Object.entries(warehouse);
}

function normalizeVariationName(key: string): string {
  const v = String(key || '').trim();
  const splitAt = Math.max(v.lastIndexOf('='), v.lastIndexOf('-'));
  return splitAt >= 0 ? v.slice(splitAt + 1).trim() : v;
}

function getVariationPrice(
  variationValues: Map<string, any> | Record<string, any> | undefined,
  variationName?: string
): number | null {
  if (!variationValues) return null;
  const entries = variationValues instanceof Map ? Array.from(variationValues.entries()) : Object.entries(variationValues);
  if (!entries.length) return null;
  const target = variationName ? String(variationName).trim().toLowerCase() : '';
  if (target) {
    for (const [key, value] of entries) {
      if (String(key).trim().toLowerCase() === target && typeof value?.productPrice === 'number') {
        return value.productPrice;
      }
    }
    for (const [key, value] of entries) {
      if (normalizeVariationName(String(key)).toLowerCase() === target && typeof value?.productPrice === 'number') {
        return value.productPrice;
      }
    }
  }
  for (const [, value] of entries) {
    if (typeof value?.productPrice === 'number') {
      return value.productPrice;
    }
  }
  return null;
}

function resolveDishSellPrice(product: any, variationName?: string): number {
  if (!product || typeof product !== 'object') return 0;
  const warehouseEntries = getWarehouseEntries(product);
  for (const [, warehouseData] of warehouseEntries) {
    if (product.ptype === 'Variation') {
      const variationPrice = getVariationPrice(warehouseData?.variationValues, variationName);
      if (variationPrice !== null) return variationPrice;
    }
    if (typeof warehouseData?.productPrice === 'number') return warehouseData.productPrice;
  }
  return typeof product?.sellPrice === 'number' ? product.sellPrice : 0;
}

export const getRecipeCostAnalysis = [
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const recipes = await KitchenRecipe.find()
        .populate({ path: 'productId', select: 'name code ptype warehouse sellPrice' })
        .populate({ path: 'ingredients.kitchenProductId', select: 'name averageCost' })
        .lean();

      const analysis = recipes.map((r: any) => {
        const totalCost = (r.ingredients || []).reduce((acc: number, ing: any) => {
          const cost = ing.kitchenProductId?.averageCost || 0;
          return acc + (cost * ing.quantity);
        }, 0);

        const sellPrice = resolveDishSellPrice(r.productId, r.variationName);
        const profit = sellPrice - totalCost;
        const margin = sellPrice > 0 ? (profit / sellPrice) * 100 : 0;

        return {
          _id: r._id,
          dishName: r.productId?.name,
          dishCode: r.productId?.code,
          variationName: r.variationName,
          totalCost,
          sellPrice,
          profit,
          margin: margin.toFixed(2)
        };
      });

      res.json({ status: 'success', data: analysis });
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: e.message || 'Failed to fetch cost analysis' });
    }
  }
];

