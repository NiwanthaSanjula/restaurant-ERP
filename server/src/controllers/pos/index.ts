import express from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../../middleware/auth';
import Brand from '../../models/Brand';
import Category from '../../models/Category';
import PosSession, { IDenominations } from '../../models/PosSession';
import Product from '../../models/Product';
import Sale from '../../models/Sale';
import { buildZonedDateRange, getZonedTodayRange } from '../../utils/timezone';

import { CheckoutError, checkoutCashSale, checkoutReceipt } from '../../services/posCheckout';
import { isPosEligibleProduct, posEligibilityFilter } from '../../utils/productEligibility';

/** Get first warehouse data for a product (optionally by warehouseId). */
function getFirstWarehouse(product: any, warehouseId?: string): any {
  const wh = product?.warehouse;
  if (!wh || typeof wh !== 'object') return null;
  const entries = wh instanceof Map ? Array.from(wh.entries()) : Object.entries(wh);
  return warehouseId && entries.length
    ? entries.find(([id]: [string, any]) => id === warehouseId)?.[1]
    : entries[0]?.[1];
}

/** Get first available sell price from a product (first warehouse, then by type). */
function getDisplayPrice(product: any, warehouseId?: string): number | null {
  const w = getFirstWarehouse(product, warehouseId);
  if (!w) return null;
  if (typeof w.productPrice === 'number') return w.productPrice;
  if (Array.isArray(w.batches) && w.batches.length > 0) {
    const b = w.batches[0];
    if (typeof b.productPrice === 'number') return b.productPrice;
    if (b.variationValues) {
      const vv = b.variationValues instanceof Map ? Array.from(b.variationValues.values()) : Object.values(b.variationValues || {});
      const first = vv[0] as any;
      if (first && typeof first.productPrice === 'number') return first.productPrice;
    }
  }
  if (w.variationValues) {
    const vv = w.variationValues instanceof Map ? Array.from(w.variationValues.values()) : Object.values(w.variationValues || {});
    const first = vv[0] as any;
    if (first && typeof first.productPrice === 'number') return first.productPrice;
  }
  return null;
}

/** Turn variation key like "Size=Small" or "Portion Type=Family" into display name (e.g. "Small", "Family"). */
function variationKeyToName(key: string): string {
  if (typeof key !== 'string' || !key) return key;
  const eq = key.indexOf('=');
  return eq >= 0 ? key.slice(eq + 1).trim() : key;
}

/** Get list of variations for POS catalog: { id, name, price }[]. From warehouse or first batch. */
function getCatalogVariations(product: any, warehouseId?: string): Array<{ id: string; name: string; price: number }> {
  const w = getFirstWarehouse(product, warehouseId);
  if (!w) return [];
  let variationValues: Map<string, any> | Record<string, any> | null = null;
  if (w.variationValues && (typeof w.variationValues === 'object' || w.variationValues instanceof Map)) {
    variationValues = w.variationValues instanceof Map ? w.variationValues : (w.variationValues as Record<string, any>);
  } else if (Array.isArray(w.batches) && w.batches.length > 0) {
    const b = w.batches[0];
    if (b?.variationValues) {
      variationValues = b.variationValues instanceof Map ? b.variationValues : (b.variationValues as Record<string, any>);
    }
  }
  if (!variationValues) return [];
  const entries = variationValues instanceof Map ? Array.from(variationValues.entries()) : Object.entries(variationValues);
  const out: Array<{ id: string; name: string; price: number }> = [];
  for (const [key, val] of entries) {
    const price = val?.productPrice;
    if (typeof price === 'number') {
      out.push({
        id: String(key),
        name: variationKeyToName(String(key)),
        price,
      });
    }
  }
  return out;
}

/**
 * GET /pos/catalog
 * Returns categories, brands, and product items from DB for POS display.
 * Query: warehouseId (optional), q (optional search on product name/code/brand).
 */
export const getCatalog = async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { warehouseId, q } = req.query as { warehouseId?: string; q?: string };
    const search = q?.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = search ? { $and: [posEligibilityFilter(), { $or: [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
      { barcode: q?.trim() },
      { brand: { $regex: search, $options: 'i' } }
    ] }] } : posEligibilityFilter();

    const [categories, brands, products] = await Promise.all([
      Category.find({}).select('_id category').sort({ category: 1 }).lean(),
      Brand.find({}).select('_id brandName').sort({ brandName: 1 }).lean(),
      Product.find(filter)
        .select('name code barcode brand category image warehouse ptype hasBatches status isSellable')
        .lean()
    ]);

    // Build maps for category/brand lookup by both ID and name
    const categoryById = new Map<string, string>();
    const categoryByName = new Map<string, string>();
    categories.forEach((c: any) => {
      const catId = String(c._id);
      const catName = String(c.category || '').trim();
      categoryById.set(catId, catId); // ID -> ID (for direct match)
      if (catName) {
        categoryByName.set(catName.toLowerCase(), catId); // Name -> ID (for name match)
      }
    });

    const brandById = new Map<string, string>();
    const brandByName = new Map<string, string>();
    brands.forEach((b: any) => {
      const brId = String(b._id);
      const brName = String(b.brandName || '').trim();
      brandById.set(brId, brId); // ID -> ID (for direct match)
      if (brName) {
        brandByName.set(brName.toLowerCase(), brId); // Name -> ID (for name match)
      }
    });

    const items: Array<{
      id: string;
      name: string;
      code?: string;
      barcode?: string;
      price: number;
      categoryId: string;
      brandId: string;
      image?: string;
      variations?: Array<{ id: string; name: string; price: number }>;
    }> = [];
    for (const p of products) {
      if (!isPosEligibleProduct(p)) continue;
      const price = getDisplayPrice(p, warehouseId);
      if (price === null) continue;

      const variations = getCatalogVariations(p, warehouseId);

      // Match category: try by ID first, then by name
      const pCategory = String(p.category || '').trim();
      let catId = '';
      if (pCategory) {
        // Check if it's an ObjectId (24 hex chars) - products from seed store IDs
        if (/^[a-fA-F0-9]{24}$/.test(pCategory)) {
          catId = categoryById.get(pCategory) || '';
        } else {
          // It's a name - lookup by name
          catId = categoryByName.get(pCategory.toLowerCase()) || '';
        }
      }

      // Match brand: try by ID first, then by name
      const pBrand = String(p.brand || '').trim();
      let brId = '';
      if (pBrand) {
        // Check if it's an ObjectId (24 hex chars) - products from seed store IDs
        if (/^[a-fA-F0-9]{24}$/.test(pBrand)) {
          brId = brandById.get(pBrand) || '';
        } else {
          // It's a name - lookup by name
          brId = brandByName.get(pBrand.toLowerCase()) || '';
        }
      }

      const img = (p as any).image;
      items.push({
        id: String((p as any)._id),
        name: (p as any).name,
        code: p.code,
        barcode: p.barcode,
        price,
        categoryId: catId,
        brandId: brId,
        image: typeof img === 'string' && img.trim() ? img.trim() : '',
        ...(variations.length > 0 ? { variations } : {})
      });
    }

    const catalog = {
      categories: categories.filter(c => items.some(item => item.categoryId === String(c._id))).map((c: any) => ({ id: String(c._id), name: c.category })),
      brands: brands.filter(b => items.some(item => item.brandId === String(b._id))).map((b: any) => ({ id: String(b._id), name: b.brandName })),
      items
    };

    res.json({ status: 'success', data: catalog });
  } catch (e: any) {
    console.error('Error fetching POS catalog:', e);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
};

type PosUserRequest = express.Request & { user?: any };

const DENOM_KEYS: Array<keyof IDenominations> = ['20', '50', '100', '500', '1000', '5000', '1', '2', '5', '10'];

function normalizeDenominations(input: any): IDenominations {
  const out: any = {};
  for (const key of DENOM_KEYS) {
    const raw = input?.[key];
    const qty = Number.isFinite(Number(raw)) ? Math.floor(Number(raw)) : 0;
    out[key] = Math.max(0, qty);
  }
  return out as IDenominations;
}

function denominationTotal(denoms: IDenominations): number {
  return DENOM_KEYS.reduce((sum, k) => sum + (Number(k) * (denoms[k] || 0)), 0);
}

export const postOpenSession = [authenticate, async (req: PosUserRequest, res: express.Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user?._id) {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
      return;
    }

    const existing = await PosSession.findOne({ userId: user._id, status: 'OPEN' }).lean();
    if (existing) {
      res.status(409).json({
        status: 'error',
        message: 'You already have an active POS session',
        data: existing
      });
      return;
    }

    const denominations = normalizeDenominations(req.body?.denominations || {});
    const openingCash = denominationTotal(denominations);

    if (openingCash <= 500) {
      res.status(400).json({ status: 'error', message: 'Opening cash must be greater than 500 LKR' });
      return;
    }

    const session = await PosSession.create({
      userId: user._id,
      username: user.name || user.username || user.email || 'Cashier',
      openTime: new Date(),
      openingCash,
      denominations,
      status: 'OPEN'
    });

    res.status(201).json({ status: 'success', data: session });
  } catch (e: any) {
    if (e?.code === 11000) {
      res.status(409).json({ status: 'error', message: 'Active session already exists for this user' });
      return;
    }
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}];

export const getActiveSession = [authenticate, async (req: PosUserRequest, res: express.Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user?._id) {
      res.status(401).json({ status: 'error', message: 'Unauthorized' });
      return;
    }
    const session = await PosSession.findOne({ userId: user._id, status: 'OPEN' }).lean();
    res.json({ status: 'success', data: session || null });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}];

export const getRegisterReport = [authenticate, async (req: PosUserRequest, res: express.Response): Promise<void> => {
  try {
    const user = req.user;
    const { sessionId } = req.params as { sessionId: string };

    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      res.status(400).json({ status: 'error', message: 'Invalid session id' });
      return;
    }

    const session = await PosSession.findById(sessionId).lean();
    if (!session) {
      res.status(404).json({ status: 'error', message: 'Session not found' });
      return;
    }

    const isOwner = String(session.userId) === String(user?._id);
    const isAdmin = String(user?.role || '').toLowerCase() === 'admin';
    if (!isOwner && !isAdmin && !((req as AuthRequest).isDemo && (req as AuthRequest).demoReadAuthorized)) {
      res.status(403).json({ status: 'error', message: 'Forbidden' });
      return;
    }

    const sessionAgg = await Sale.aggregate([
      { $match: { posSessionId: new mongoose.Types.ObjectId(sessionId), saleType: 'pos' } },
      {
        $group: {
          _id: null,
          userSales: { $sum: '$total' },
          totalDiscount: { $sum: '$saleDiscountValue' },
          cashPayments: { $sum: '$cashAmount' },
          cardPayments: { $sum: '$cardAmount' },
          bankTransferPayments: { $sum: '$bankTransferAmount' }
        }
      }
    ]);

    const totals = sessionAgg[0] || {
      userSales: 0,
      totalDiscount: 0,
      cashPayments: 0,
      cardPayments: 0,
      bankTransferPayments: 0
    };

    const { start: startOfDay, end: endOfDay } = getZonedTodayRange();

    const todaySalesAgg = await Sale.aggregate([
      {
        $match: {
          date: { $gte: startOfDay, $lte: endOfDay },
          businessType: 'restaurant'
        }
      },
      {
        $group: {
          _id: null,
          todayTotalSales: { $sum: '$total' }
        }
      }
    ]);
    const todayTotalSales = todaySalesAgg[0]?.todayTotalSales || 0;

    res.json({
      status: 'success',
      data: {
        sessionId: session._id,
        openTime: session.openTime,
        cashierName: session.username,
        openingCash: session.openingCash,
        userSales: totals.userSales,
        todayTotalSales,
        totalDiscount: totals.totalDiscount,
        cashPayments: totals.cashPayments,
        cardPayments: totals.cardPayments,
        bankTransferPayments: totals.bankTransferPayments
      }
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}];

export const postSale = [authenticate, async (req: PosUserRequest, res: express.Response): Promise<void> => {
  try {
    const { sale, replayed } = await checkoutCashSale(req.body, String(req.user?._id || ''));
    res.status(replayed ? 200 : 201).json({ status: 'success', data: checkoutReceipt(sale), replayed });
  } catch (error) {
    const known = error instanceof CheckoutError;
    res.status(known ? error.status : 500).json({
      status: 'error',
      ...(known && error.code ? { code: error.code } : {}),
      message: known ? error.message : 'Checkout could not be confirmed. Retry with the same checkout ID.'
    });
  }
}];

export const postCloseSession = [authenticate, async (req: PosUserRequest, res: express.Response): Promise<void> => {
  try {
    const user = req.user;
    const { sessionId, denominations } = req.body as { sessionId: string; denominations: any };
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      res.status(400).json({ status: 'error', message: 'Missing or invalid sessionId' });
      return;
    }

    const session = await PosSession.findOne({ _id: sessionId, userId: user?._id, status: 'OPEN' });
    if (!session) {
      res.status(404).json({ status: 'error', message: 'Active session not found' });
      return;
    }

    const closingDenoms = normalizeDenominations(denominations || {});
    const closingCash = denominationTotal(closingDenoms);
    if (closingCash <= 0) {
      res.status(400).json({ status: 'error', message: 'Enter cash balancing amounts before closing the POS session' });
      return;
    }

    const cashSalesAgg = await Sale.aggregate([
      { $match: { posSessionId: new mongoose.Types.ObjectId(sessionId), saleType: 'pos' } },
      { $group: { _id: null, cashSales: { $sum: '$cashAmount' } } }
    ]);
    const cashSales = cashSalesAgg[0]?.cashSales || 0;
    const cashVariance = (session.openingCash + cashSales) - closingCash;

    session.closeTime = new Date();
    session.closingCash = closingCash;
    session.closingDenominations = closingDenoms;
    session.cashVariance = cashVariance;
    session.status = 'CLOSED';
    await session.save();

    res.json({
      status: 'success',
      data: {
        sessionId: session._id,
        closeTime: session.closeTime,
        closingCash,
        cashVariance,
        status: session.status
      }
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}];

export const getZBills = [authenticate, async (req: PosUserRequest, res: express.Response): Promise<void> => {
  try {
    const { fromDate, toDate } = req.query as { fromDate?: string; toDate?: string };

    const match: Record<string, unknown> = {};
    if (fromDate || toDate) {
      try {
        const { start, end } = buildZonedDateRange(fromDate, toDate);
        match.openTime = { $gte: start, $lte: end };
      } catch {
        res.status(400).json({ status: 'error', message: 'Invalid date range' });
        return;
      }
    }

    const sessions = await PosSession.find(match).sort({ openTime: -1 }).lean();
    if (sessions.length === 0) {
      res.json({ status: 'success', data: [] });
      return;
    }

    const sessionIds = sessions.map((s) => s._id);
    const totals = await Sale.aggregate([
      { $match: { posSessionId: { $in: sessionIds }, saleType: 'pos' } },
      {
        $group: {
          _id: '$posSessionId',
          total: { $sum: '$total' },
          discount: { $sum: '$saleDiscountValue' },
          cashPayment: { $sum: '$cashAmount' },
          cardPayment: { $sum: '$cardAmount' },
          bankTransfer: { $sum: '$bankTransferAmount' }
        }
      }
    ]);
    const totalMap = new Map<string, any>(totals.map((t) => [String(t._id), t]));

    const data = sessions.map((s: any) => {
      const agg = totalMap.get(String(s._id)) || {};
      return {
        sessionId: String(s._id),
        date: s.openTime,
        openTime: s.openTime,
        closeTime: s.closeTime || null,
        username: s.username || '—',
        cashHandIn: Number(s.openingCash || 0),
        cardPayment: Number(agg.cardPayment || 0),
        cashPayment: Number(agg.cashPayment || 0),
        bankTransfer: Number(agg.bankTransfer || 0),
        cashVariance: Number(s.cashVariance || 0),
        discount: Number(agg.discount || 0),
        total: Number(agg.total || 0),
        status: s.status
      };
    });

    res.json({ status: 'success', data });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}];

export const getZBillBySessionId = [authenticate, async (req: PosUserRequest, res: express.Response): Promise<void> => {
  try {
    const { sessionId } = req.params as { sessionId: string };
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      res.status(400).json({ status: 'error', message: 'Invalid session id' });
      return;
    }

    const session = await PosSession.findById(sessionId).lean();
    if (!session) {
      res.status(404).json({ status: 'error', message: 'Session not found' });
      return;
    }

    const sessionAgg = await Sale.aggregate([
      { $match: { posSessionId: new mongoose.Types.ObjectId(sessionId), saleType: 'pos' } },
      {
        $group: {
          _id: null,
          sessionSaleValue: { $sum: '$total' },
          totalDiscount: { $sum: '$saleDiscountValue' },
          cashPayments: { $sum: '$cashAmount' },
          cardPayments: { $sum: '$cardAmount' },
          bankTransferPayments: { $sum: '$bankTransferAmount' }
        }
      }
    ]);
    const totals = sessionAgg[0] || {
      sessionSaleValue: 0,
      totalDiscount: 0,
      cashPayments: 0,
      cardPayments: 0,
      bankTransferPayments: 0
    };

    const { start: startOfDay, end: endOfDay } = getZonedTodayRange(new Date(session.openTime));

    const dayAgg = await Sale.aggregate([
      {
        $match: {
          date: { $gte: startOfDay, $lte: endOfDay },
          businessType: 'restaurant',
          saleType: 'pos'
        }
      },
      { $group: { _id: null, daySaleValue: { $sum: '$total' } } }
    ]);

    res.json({
      status: 'success',
      data: {
        sessionId: String(session._id),
        date: session.openTime,
        cashierName: session.username,
        sessionSaleValue: Number(totals.sessionSaleValue || 0),
        daySaleValue: Number(dayAgg[0]?.daySaleValue || 0),
        totalDiscount: Number(totals.totalDiscount || 0),
        cashPayments: Number(totals.cashPayments || 0),
        cardPayments: Number(totals.cardPayments || 0),
        bankTransferPayments: Number(totals.bankTransferPayments || 0),
        cashVariance: Number(session.cashVariance || 0),
        openingCash: Number(session.openingCash || 0),
        closingCash: Number(session.closingCash || 0),
        openingDenominations: normalizeDenominations(session.denominations || {}),
        closingDenominations: normalizeDenominations(session.closingDenominations || {}),
        openTime: session.openTime,
        closeTime: session.closeTime || null
      }
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}];

export const deleteZBillBySessionId = [authenticate, async (req: PosUserRequest, res: express.Response): Promise<void> => {
  try {
    const { sessionId } = req.params as { sessionId: string };
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      res.status(400).json({ status: 'error', message: 'Invalid session id' });
      return;
    }

    const session = await PosSession.findById(sessionId).lean();
    if (!session) {
      res.status(404).json({ status: 'error', message: 'Session not found' });
      return;
    }

    await Promise.all([
      Sale.deleteMany({ posSessionId: new mongoose.Types.ObjectId(sessionId), saleType: 'pos' }),
      PosSession.deleteOne({ _id: sessionId })
    ]);

    res.json({ status: 'success', message: 'Z-bill deleted successfully' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}];

export const bulkDeleteZBills = [authenticate, async (req: PosUserRequest, res: express.Response): Promise<void> => {
  try {
    const sessionIdsRaw = req.body?.sessionIds;
    if (!Array.isArray(sessionIdsRaw) || sessionIdsRaw.length === 0) {
      res.status(400).json({ status: 'error', message: 'sessionIds array is required' });
      return;
    }

    const sessionIds = sessionIdsRaw
      .map((id: unknown) => String(id))
      .filter((id: string) => mongoose.Types.ObjectId.isValid(id));

    if (sessionIds.length === 0) {
      res.status(400).json({ status: 'error', message: 'No valid session ids provided' });
      return;
    }

    const objectIds = sessionIds.map((id) => new mongoose.Types.ObjectId(id));
    const [salesResult, sessionsResult] = await Promise.all([
      Sale.deleteMany({ posSessionId: { $in: objectIds }, saleType: 'pos' }),
      PosSession.deleteMany({ _id: { $in: objectIds } })
    ]);

    res.json({
      status: 'success',
      message: 'Z-bills deleted successfully',
      data: {
        deletedSessions: sessionsResult.deletedCount || 0,
        deletedSales: salesResult.deletedCount || 0
      }
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}];


