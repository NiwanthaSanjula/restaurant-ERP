import { Request, Response } from 'express';
import {
  APP_TIME_ZONE,
  addDaysToDateOnlyParts,
  formatDateOnlyParts,
  getZonedMonthRange,
  getZonedTodayRange,
  getZonedWeekRange,
  startOfZonedDay
} from '../utils/timezone';

const Sale = require('../models/Sale').default || require('../models/Sale');
const Product = require('../models/Product').default || require('../models/Product');
const Purchase = require('../models/Purchase').default || require('../models/Purchase');
const PurchaseReturn = require('../models/PurchaseReturn').default || require('../models/PurchaseReturn');
const Expense = require('../models/Expense').default || require('../models/Expense');
const KitchenInventoryProduct = require('../models/KitchenInventoryProduct').default || require('../models/KitchenInventoryProduct');
const { enrichKitchenProductDoc } = require('./kitchen/stockAlertFromProduct');

const CHART_TZ = APP_TIME_ZONE;

export const buildRecentSalesPipeline = () => [
  { $sort: { createdAt: -1 } },
  { $limit: 5 },
  { $addFields: { cId: { $convert: { input: "$customerId", to: "objectId", onError: null, onNull: null } } } },
  { $lookup: { from: "customers", localField: "cId", foreignField: "_id", as: "c" } },
  { $unwind: { path: "$c", preserveNullAndEmptyArrays: true } },
  {
    $project: {
      referenceNumber: { $ifNull: ["$referenceNumber", "N/A"] },
      grandTotal: "$total",
      status: { $ifNull: ["$status", "N/A"] },
      paymentStatus: { $ifNull: ["$paymentStatus", "unpaid"] },
      "customer.name": { $ifNull: ["$c.name", "Walk-in"] }
    }
  }
];

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter = req.query.filter || 'daily';
    const now = new Date();
    const { today, start: startOfToday, end: endOfToday } = getZonedTodayRange(now, CHART_TZ);
    const startOfPeriodParts = addDaysToDateOnlyParts(today, filter === 'daily' ? -7 : -28);
    const startOfPeriod = startOfZonedDay(startOfPeriodParts, CHART_TZ);
    const { weekStart, start: weekStartDate, end: effectiveWeekEnd } = getZonedWeekRange(now, CHART_TZ);
    const { year: currYear, month: currMonth, start: monthStartColombo, end: monthEndColombo } = getZonedMonthRange(now, CHART_TZ);

    const weekOfMonthSwitch = {
      $switch: {
        branches: [
          { case: { $lte: ['$dayColombo', 7] }, then: 1 },
          { case: { $lte: ['$dayColombo', 14] }, then: 2 },
          { case: { $lte: ['$dayColombo', 21] }, then: 3 }
        ],
        default: 4
      }
    };

    const [
      salesRaw,
      purchasesRaw,
      salesByDateRaw,
      purchasesByDateRaw,
      salesByWeekOfMonthRaw,
      purchasesByWeekOfMonthRaw,
      totalSalesAgg,
      todaySalesAgg,
      todayPurchasesAgg,
      totalPurchasesAgg,
      todayPurchaseReturnsAgg,
      todayExpensesAgg
    ] = await Promise.all([
      Sale.aggregate([
        { $match: { createdAt: { $gte: startOfPeriod } } },
        { $group: { _id: filter === 'daily' ? { $dayOfWeek: '$createdAt' } : { $week: '$createdAt' }, total: { $sum: '$total' } } }
      ]),
      Purchase.aggregate([
        { $match: { createdAt: { $gte: startOfPeriod } } },
        { $group: { _id: filter === 'daily' ? { $dayOfWeek: '$createdAt' } : { $week: '$createdAt' }, total: { $sum: '$grandTotal' } } }
      ]),
      filter === 'daily'
        ? Sale.aggregate([
            { $match: { createdAt: { $gte: weekStartDate, $lte: effectiveWeekEnd } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: CHART_TZ } }, total: { $sum: '$total' } } }
          ])
        : Promise.resolve([]),
      filter === 'daily'
        ? Purchase.aggregate([
            { $match: { createdAt: { $gte: weekStartDate, $lte: effectiveWeekEnd } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: CHART_TZ } }, total: { $sum: '$grandTotal' } } }
          ])
        : Promise.resolve([]),
      filter === 'weekly'
        ? Sale.aggregate([
            { $match: { createdAt: { $gte: monthStartColombo, $lte: monthEndColombo } } },
            { $addFields: { dayColombo: { $toInt: { $dateToString: { format: '%d', date: '$createdAt', timezone: CHART_TZ } } } } },
            { $addFields: { weekOfMonth: weekOfMonthSwitch } },
            { $group: { _id: '$weekOfMonth', total: { $sum: '$total' } } }
          ])
        : Promise.resolve([]),
      filter === 'weekly'
        ? Purchase.aggregate([
            { $match: { createdAt: { $gte: monthStartColombo, $lte: monthEndColombo } } },
            { $addFields: { dayColombo: { $toInt: { $dateToString: { format: '%d', date: '$createdAt', timezone: CHART_TZ } } } } },
            { $addFields: { weekOfMonth: weekOfMonthSwitch } },
            { $group: { _id: '$weekOfMonth', total: { $sum: '$grandTotal' } } }
          ])
        : Promise.resolve([]),
      Sale.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]),
      Sale.aggregate([
        { $match: { createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Purchase.aggregate([
        { $match: { createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' } } }
      ]),
      Purchase.aggregate([{ $group: { _id: null, total: { $sum: '$grandTotal' } } }]),
      PurchaseReturn.aggregate([
        { $match: { returnDate: { $gte: startOfToday, $lte: endOfToday } } },
        { $group: { _id: null, total: { $sum: '$totalReturnAmount' } } }
      ]).catch(() => [{ total: 0 }]),
      Expense.aggregate([
        { $match: { date: { $gte: startOfToday, $lte: endOfToday } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]).catch(() => [{ total: 0 }])
    ]);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let weeklySales: { _id: string; date?: string; label?: string; sales: number; purchases: number }[];

    if (filter === 'daily') {
      // Daily view: this week's 7 calendar days (Sun–Sat) in same TZ as aggregation (Asia/Colombo)
      const salesByDate: Record<string, number> = {};
      const purchasesByDate: Record<string, number> = {};
      (salesByDateRaw as { _id: string; total: number }[]).forEach((d: any) => { salesByDate[d._id] = d.total; });
      (purchasesByDateRaw as { _id: string; total: number }[]).forEach((d: any) => { purchasesByDate[d._id] = d.total; });
      weeklySales = dayNames.map((day, index) => {
        const dateStr = formatDateOnlyParts(addDaysToDateOnlyParts(weekStart, index));
        return {
          _id: day,
          date: dateStr,
          sales: salesByDate[dateStr] ?? 0,
          purchases: purchasesByDate[dateStr] ?? 0
        };
      });
    } else {
      // Weekly view: current month only — W1 (1–7), W2 (8–14), W3 (15–21), W4 (22–end)
      const salesByWeek: Record<number, number> = {};
      const purchasesByWeek: Record<number, number> = {};
      (salesByWeekOfMonthRaw as { _id: number; total: number }[]).forEach((d: any) => { salesByWeek[d._id] = d.total; });
      (purchasesByWeekOfMonthRaw as { _id: number; total: number }[]).forEach((d: any) => { purchasesByWeek[d._id] = d.total; });
      const monthName = new Date(currYear, currMonth - 1, 1).toLocaleString('en-US', { month: 'long' });
      weeklySales = [1, 2, 3, 4].map((w) => ({
        _id: `W${w}`,
        label: `W${w} - ${monthName}`,
        sales: salesByWeek[w] ?? 0,
        purchases: purchasesByWeek[w] ?? 0
      }));
    }

    // Top selling products = most quantity sold from Sales (not current stock)
    const topProducts = await Sale.aggregate([
      { $unwind: '$products' },
      { $group: { _id: '$products.productId', name: { $first: '$products.productName' }, quantity: { $sum: '$products.qty' } } },
      { $sort: { quantity: -1 } },
      { $limit: 5 },
      { $project: { name: 1, quantity: 1, _id: 0 } }
    ]);

    // Top customers by total spend; include sales with no/invalid customer as "Walk-in Customer"
    const topCustomers = await Sale.aggregate([
      { $group: { _id: "$customerId", total: { $sum: "$total" } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
      { $addFields: { cId: { $convert: { input: "$_id", to: "objectId", onError: null, onNull: null } } } },
      { $lookup: { from: "customers", localField: "cId", foreignField: "_id", as: "c" } },
      { $unwind: { path: "$c", preserveNullAndEmptyArrays: true } },
      { $project: { name: { $ifNull: ["$c.name", "Walk-in Customer"] }, value: "$total" } }
    ]);

    
    const recentSales = await Sale.aggregate(buildRecentSalesPipeline());

    // Build stock alerts: products where current stock <= stock alert level
    // Include Active and Pending products (Pending might be newly created)
    const products = await Product.find({ 
      warehouse: { $exists: true, $ne: null },
      status: { $in: ['Active', 'Pending'] }
    }).lean();
    
    console.log(`[Stock Alerts] Found ${products.length} products with warehouse data`);
    
    const stockAlert: {
      name: string;
      productCode?: string;
      quantity: number;
      alertLimit: number;
      warehouseName?: string;
    }[] = [];

    for (const product of products) {
      // Skip products without inventory tracking (restaurant-only system)
      if (product.isInventory === false) {
        continue;
      }

      const warehouse = product.warehouse as Record<string, any> | Map<string, any> | undefined;
      if (!warehouse) continue;
      
      // Handle Map or plain object (MongoDB stores Map as object, .lean() returns plain object)
      const whEntries = warehouse instanceof Map 
        ? Array.from((warehouse as Map<string, any>).entries()) 
        : Object.entries(warehouse as Record<string, any>);

      for (const [_whId, whData] of whEntries) {
        if (!whData || typeof whData !== 'object') continue;
        const whName = whData.warehouseName || _whId;

        const checkAlert = (
          qty: number | undefined | null,
          limit: number | undefined | null,
          displayName: string
        ) => {
          const current = Number(qty ?? 0);
          const limitNum = limit !== undefined && limit !== null ? Number(limit) : null;
          // Only add if alert limit is set and current stock is at or below the limit
          if (limitNum !== null && !isNaN(limitNum) && current <= limitNum) {
            console.log(`[Stock Alert] Adding: ${displayName}, Qty: ${current}, Limit: ${limitNum}, Warehouse: ${whName}`);
            stockAlert.push({
              name: displayName,
              productCode: product.code || '',
              quantity: current,
              alertLimit: limitNum,
              warehouseName: whName
            });
          }
        };

        if (whData.batches && Array.isArray(whData.batches) && whData.batches.length > 0) {
          for (const batch of whData.batches) {
            if (batch.variationValues) {
              const varEntries = batch.variationValues instanceof Map
                ? Array.from((batch.variationValues as Map<string, any>).entries())
                : Object.entries(batch.variationValues || {});
              for (const [varName, varVal] of varEntries) {
                if (varVal && typeof varVal === 'object') {
                  const displayName = `${product.name} - ${varName}${batch.batchNumber ? ` (Batch ${batch.batchNumber})` : ''}`;
                  checkAlert(varVal.productQty, varVal.stockAlert, displayName);
                }
              }
            } else {
              const displayName = batch.batchNumber ? `${product.name} (Batch ${batch.batchNumber})` : product.name;
              checkAlert(batch.productQty, batch.stockAlert, displayName);
            }
          }
        } else {
          if (whData.variationValues) {
            const varEntries = whData.variationValues instanceof Map
              ? Array.from((whData.variationValues as Map<string, any>).entries())
              : Object.entries(whData.variationValues || {});
            for (const [varName, varVal] of varEntries) {
              if (varVal && typeof varVal === 'object') {
                checkAlert(varVal.productQty, varVal.stockAlert, `${product.name} - ${varName}`);
              }
            }
          } else {
            // Single product without batches or variations
            checkAlert(whData.productQty, whData.stockAlert, product.name);
          }
        }
      }
    }

    console.log(`[Stock Alerts] Total alerts found: ${stockAlert.length}`);

    // Kitchen Stock Alerts
    const kpList = await KitchenInventoryProduct.find()
      .populate({ path: 'inventoryProductId', select: 'warehouse isInventory ptype' })
      .populate('unitId', 'shortName')
      .lean();
    const kitchenStockAlert = kpList
      .map((p: any) => enrichKitchenProductDoc(p))
      .filter((p: any) => {
        const min = p.minStockLevelEffective;
        return min != null && p.currentStock <= min;
      })
      .map((p: any) => ({
        name: p.name,
        quantity: p.currentStock,
        alertLimit: p.minStockLevelEffective,
        unit: p.unitId?.shortName || ''
      }));

    res.json({
      status: 'success',
      data: {
        cards: { 
          sales: totalSalesAgg[0]?.total || 0, 
          todaySales: todaySalesAgg[0]?.total || 0,
          todayPurchases: todayPurchasesAgg[0]?.total || 0,
          totalPurchases: totalPurchasesAgg[0]?.total || 0,
          todayPurchaseReturns: todayPurchaseReturnsAgg[0]?.total ?? 0,
          todaySaleReturns: 0,
          saleReturns: 0,
          todayExpenses: todayExpensesAgg[0]?.total ?? 0
        },
        weeklySales,
        topProducts,
        topCustomers,
        recentSales,
        stockAlert,
        kitchenStockAlert
      }
    });

  } catch (error: any) {
    console.error("Dashboard Error:", error.message);
    res.status(500).json({ status: 'error', message: error.message });
  }
};
