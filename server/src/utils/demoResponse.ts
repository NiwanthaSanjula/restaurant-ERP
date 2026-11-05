import { SYSTEM_ROLE_DATA } from '../config/permissionDefinitions';

// Public DTO contract. Unknown fields (including newly added private fields) are
// excluded by default. Free-form audit snapshots and contact details are absent.
const common = new Set(`_id id name code status isActive createdAt updatedAt description
  page limit total totalPages pages hasMore hasNextPage hasPrevPage nextPage prevPage count results totalRecords totalItems
  date value label quantity qty unit unitId shortName unitName BaseUnitName baseUnit baseUnitId operator operationValue
  category categoryId brand brandId brandName barcode image ptype hasBatches isWeight isInventory isSellable guidedDishDraft
  productId productName productCode productCost productPrice productQty productProfit profitMargin stockAlert stockUnit
  price cost subtotal subTotal totalProductWeight orderTax discount discountType tax taxType expiryDate batch batchNumber
  variation variationId variationName variationType variationValues values warehouse warehouseId warehouseName warehouseQuantity
  warehouseIssueConversion sourceUnitId sourceShort kitchenUnitId kitchenShort kitchenQuantity factor revision confirmedAt
  saleUnit purchase weightLimitation quantityLimit inventoryProductId currentStock minStockLevel minStockLevelEffective stockAlertSource
  averageCost lastPurchasePrice ingredientId kitchenProductId kitchenName source sourceBefore sourceQuantity
  onHand incoming alertLimit alertEditable legacyKey needsReview available availableQuantity isLowStock
  purchaseId supplierId supplierName purchaseDate purchaseStatus stockReceiptVersion stockReceivedAt paymentStatus paymentMethod
  grandTotal paid paidAmount amountPaid totalPaid due dueAmount paymentAmountsKnown receivedAt
  returnId returnDate returnQuantity returnQty originalQty originalSubtotal totalReturnAmount refundAmount unitPrice reason
  adjustmentId adjustmentType adjustmentDate adjustmentQuantity totalAdjustmentValue newStock approvalDate
  fromWarehouse toWarehouse fromWarehouseName toWarehouseName reference referenceNumber
  invoiceId customerId customerName businessType saleType saleDiscountValue saleDiscountType saleTaxValue shippingCost
  balance profit cashAmount cardAmount bankTransferAmount cashTendered changeAmount specialOfferDiscount specialOfferId
  paymentType amount serviceType tableId cancelledAt kitchenDeductionAppliedAt mainStockDeductionAppliedAt
  posSessionId sessionId username cashierName openTime closeTime openingCash closingCash cashVariance
  userSales todayTotalSales totalDiscount cashPayments cardPayments bankTransferPayments
  title quotationId validUntil discountValue taxValue shipping
  startDate endDate offerName offerType percentage discountValue discountPercentage minimumAmount maximumDiscount usageLimit usageCount applicableTo
  categoryBreakdown transactions
  action entityType entityId displayEntityId
  sales todaySales todayPurchases totalPurchases todayPurchaseReturns todaySaleReturns saleReturns todayExpenses
  totalSales totalReturns totalRevenue totalCost totalProfit totalExpenses totalQuantity totalAmount totalDue totalPaidAmount totalDueAmount
  revenue salesCount purchaseCount expenseCount averageOrderValue month day week year unitCost totalCostPerServing costPerServing
  dishName dishCode ingredientProductId ingredientName recipeCost sellPrice margin totalWasteValue costAtTime type
  incomingNote issueSupported reorderSupported onOrderOnly batchLabel stockStatus kitchenStockSource alertState variant sourceKey trackingNeedsReview
  servings yieldQuantity quantityPerServing yieldUnit recipeUnit stockDeducted isPrepared isReady missingSetup
  country city location locations defaultWarehouseId symbol currency supplier categoryName customer inUse isUsed canDelete
  totalItemsSold totalPurchaseAmount totalReturnQuantity stockValue costValue sellingValue
  quantityBefore quantityAfter movementType receiptAvailable kitchenTicketAvailable ticketStatus saleId orderedAt displayTime
`.split(/\s+/));
const containers = new Set(`items products categories brands variations batches ingredients recipe recipes payments
  results pagination summary totals cards weeklySales topProducts topCustomers recentSales stockAlert kitchenStockAlert
  warehouseIssues movements warehouses options conversion warnings checks reasons setupMissing kitchenTicket
  waste stockIn stockOut salesByDay salesByMonth paymentSummary lowStockAlerts data
`.split(/\s+/));
const userFields = new Set('_id id name role roleName roleId isActive createdAt updatedAt isDemo permissions'.split(' '));
const systemFields = new Set('companyName companyLogo currency country city dateFormat defaultPosWarehouseId'.split(' '));
const receiptFields = new Set('showNote showAddress showBarcode showTax showPhone showEmail showLogo showCustomer showDiscountShipping showProductCode logoUrl'.split(' '));
const prefixFields = new Set('salePrefix saleReturnPrefix purchasePrefix purchaseReturnPrefix expensePrefix invoicePrefix orderPrefix customerPrefix'.split(' '));

function plain(value: unknown): any { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function pick(value: any, fields: Set<string>, depth = 0): any {
  if (value == null || typeof value !== 'object') return value;
  if (depth > 18) return null;
  if (Array.isArray(value)) return value.map(v => pick(v, fields, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!fields.has(key) && !containers.has(key)) continue;
    if (key === 'permissions') { out[key] = permissions(item); continue; }
    if (key === 'roleId') { out[key] = pick(item, new Set(['_id', 'id', 'name']), depth + 1); continue; }
    if (key === 'categoryBreakdown' && item && typeof item === 'object') {
      out[key] = Object.fromEntries(Object.entries(item).map(([name, row]) => [name, pick(row, new Set(['amount', 'transactions']), depth + 1)])); continue;
    }
    if (key === 'warehouse' && item && typeof item === 'object' && !Array.isArray(item) && !('_id' in item) && !('name' in item)) {
      // Warehouse and variation Maps have dynamic keys but fixed public values.
      out[key] = Object.fromEntries(Object.entries(item).map(([id, row]) => [id, pick(row, common, depth + 1)])); continue;
    }
    if (key === 'variationValues' && item && typeof item === 'object') {
      out[key] = Object.fromEntries(Object.entries(item).map(([id, row]) => [id, pick(row, common, depth + 1)])); continue;
    }
    out[key] = pick(item, fields, depth + 1);
  }
  return out;
}
function permissions(value: any): any {
  if (Array.isArray(value)) return value.filter(v => v && SYSTEM_ROLE_DATA[v.component]).map(v => ({ component: v.component, actions: Object.fromEntries(Object.entries(v.actions || {}).filter(([k, x]) => SYSTEM_ROLE_DATA[v.component].includes(k) && typeof x === 'boolean')) }));
  return Object.fromEntries(Object.entries(value || {}).filter(([k]) => !!SYSTEM_ROLE_DATA[k]).map(([k, actions]) => [k, Object.fromEntries(Object.entries(actions || {}).filter(([a, x]) => SYSTEM_ROLE_DATA[k].includes(a) && typeof x === 'boolean'))]));
}
function projectData(value: any, resource: string): any {
  if (['me', 'profile', 'user'].includes(resource)) {
    if (value?.user) return { user: pick(value.user, userFields) };
    return pick(value, userFields);
  }
  if (resource === 'role' || resource === 'permission') return pick(value, new Set([...userFields, 'description', 'component', 'actions', ...Object.keys(SYSTEM_ROLE_DATA), ...Object.values(SYSTEM_ROLE_DATA).flat()]));
  if (resource === 'permissionCatalog') return value; // Static code-owned catalog, no stored configuration.
  if (resource === 'systemSettings') return { system: pick(value?.system, systemFields) };
  if (resource === 'mail') return { credentialsRedacted: true }; // No SMTP topology or account identifiers in the public demo.
  if (resource === 'receiptSettings') return pick(value, receiptFields);
  if (resource === 'prefix') return pick(value, prefixFields);
  return pick(value, common);
}
export function demoResponse(body: unknown, resource: string, statusCode = 200): any {
  const value = plain(body);
  if (statusCode >= 400) return { status: 'error', success: false, message: statusCode >= 500 ? 'This screen is temporarily unavailable.' : 'This read could not be completed.', code: 'demo_read_failed' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return projectData(value, resource);
  const out: Record<string, unknown> = {};
  for (const key of ['status', 'success', 'pagination', 'summary', 'total', 'page', 'limit', 'totalPages']) if (key in value) out[key] = pick(value[key], common);
  if ('data' in value) out.data = projectData(value.data, resource);
  else if ('user' in value) out.user = pick(value.user, userFields);
  else return projectData(value, resource);
  return out;
}
