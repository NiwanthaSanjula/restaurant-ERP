import express from 'express';
import { downloadActivityLogs, getActivityLogs } from '../controllers/activityLog';
import { getBaseUnitById, getBaseUnits } from '../controllers/baseUnit';
import { checkBrandInUse, getBrandById, getBrands } from '../controllers/brand';
import { getCart } from '../controllers/cart';
import { checkCategoryInUse, getCategories, getCategoryById } from '../controllers/category';
import { getCurrencies } from '../controllers/currencyController';
import { downloadTemplate, getCustomerById, getCustomers } from '../controllers/customer';
import { getDashboardStats } from '../controllers/dashboard';
import { checkExpenseCategoryInUse, getExpenseById, getExpenseCategories, getExpenseCategoryById, getExpenses } from '../controllers/expense';
import { getAdjustmentById, getAdjustments, getAdjustmentSummary } from '../controllers/inventory';
import {
  getKitchenProductById,
  getKitchenProductMovements,
  getKitchenProducts
} from '../controllers/kitchen';
import { getRecipeByProductId, getRecipesList } from '../controllers/kitchen/recipe';
import { getKitchenWasteReport, getLowStockAlerts, getRecipeCostAnalysis } from '../controllers/kitchen/reports';
import { getOrderById, getOrders } from '../controllers/order';
import { getActiveSession, getCatalog, getRegisterReport, getZBillBySessionId, getZBills } from '../controllers/pos';
import { getProductById, getProducts } from '../controllers/product';
import { getPurchaseById, getPurchases } from '../controllers/purchaseController';
import { getPurchaseReturnById, getPurchaseReturns } from '../controllers/purchaseReturnController';
import { getQuotationById, getQuotations } from '../controllers/quotation';
import { getPermissions, getPermissionsByComponent, getRoleById, getRoles } from '../controllers/roles&Permissions';
import { getSaleById, getSales } from '../controllers/sale';
import { getSaleReturnById, getSaleReturns } from '../controllers/saleReturn';
import { checkSupplierInUse, getSupplierById, getSuppliers } from '../controllers/supplier';
import { getTransferById, getTransfers } from '../controllers/transfer';
import { getUnitById, getUnits } from '../controllers/unit';
import { getUserById, getUsers } from '../controllers/user';
import { checkVariationInUse, getVariationById, getVariations } from '../controllers/variation';
import { getWarehouseById, getWarehouses } from '../controllers/warehouse';
import { getAdjustmentByIdValidator, getAdjustmentSummaryValidators, getAdjustmentsValidators } from '../middleware/adjustmentValidation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAnyPermission, requirePermission } from '../middleware/permissions';

const router = express.Router();

// Health check (keep consistent with server)
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'ServeSmart API is running', timestamp: new Date().toISOString() });
});

// Auth - Current user
router.get('/auth/me', authenticate, (req: AuthRequest, res) => {
  if (!req.user) {
    res.status(401).json({ status: 'error', message: 'User not authenticated' });
    return;
  }
  res.json({ 
    status: 'success', 
    data: { 
      user: { 
        id: req.user._id, 
        name: req.user.name, 
        email: req.user.email, 
        role: req.user.role,
        roleId: req.user.roleId
      } 
    } 
  });
});

// POS - catalog (categories, brands, items)
router.get('/pos/catalog', authenticate, requirePermission('managePOS', 'view_pos'), getCatalog);
router.get('/pos/active', authenticate, requirePermission('managePOS', 'view_pos'), getActiveSession);
router.get('/pos/report/:sessionId', authenticate, requirePermission('managePOS', 'view_cashier_report'), getRegisterReport);
router.get('/pos/z-bills', authenticate, requirePermission('managePOS', 'view_sales'), getZBills);
router.get('/pos/z-bills/:sessionId', authenticate, requirePermission('managePOS', 'view_sales'), getZBillBySessionId);

// Users
router.get('/users', authenticate, requirePermission('manageUsers', 'view_user'), getUsers);
router.get('/users/:id', authenticate, requirePermission('manageUsers', 'view_user'), getUserById);

// Roles & Permissions
router.get('/roles', authenticate, requirePermission('manageRolesAndPermissions', 'view_role'), getRoles);
router.get('/roles/:id', authenticate, requirePermission('manageRolesAndPermissions', 'view_role'), getRoleById);
router.get('/permissions', authenticate, requirePermission('manageRolesAndPermissions', 'view_role'), getPermissions);
router.get('/permissions/component/:component', authenticate, requirePermission('manageRolesAndPermissions', 'view_role'), getPermissionsByComponent);

// Warehouses
router.get('/warehouses', ...getWarehouses);
router.get('/warehouses/:id', ...getWarehouseById);
router.get('/products', getProducts);
router.get('/products/:id', getProductById);
router.get('/baseUnits', getBaseUnits);
router.get('/baseUnits/:id', getBaseUnitById);
router.get('/units', getUnits);
router.get('/units/:id', getUnitById);

// Kitchen inventory (ingredients)
router.get('/kitchen/products', authenticate, requirePermission('manageKitchen', 'view_kitchen_inventory'), getKitchenProducts);
router.get('/kitchen/products/:id', authenticate, requirePermission('manageKitchen', 'view_kitchen_inventory'), getKitchenProductById);
router.get('/kitchen/products/:id/movements', authenticate, requirePermission('manageKitchen', 'view_kitchen_inventory'), getKitchenProductMovements);
router.get('/kitchen/recipes', authenticate, requirePermission('manageKitchen', 'view_recipe'), getRecipesList);
router.get('/kitchen/recipes/:productId', authenticate, requirePermission('manageKitchen', 'view_recipe'), getRecipeByProductId);
router.get('/kitchen/reports/waste', authenticate, requirePermission('manageKitchen', 'view_kitchen_orders'), getKitchenWasteReport);
router.get('/kitchen/reports/costing', authenticate, requirePermission('manageKitchen', 'view_kitchen_orders'), getRecipeCostAnalysis);
router.get('/kitchen/reports/low-stock', authenticate, requirePermission('manageKitchen', 'view_kitchen_inventory'), getLowStockAlerts);

router.get('/categories', ...getCategories);
router.get('/categories/:id', ...getCategoryById);
router.get('/categories/:id/check-in-use', checkCategoryInUse);
router.get('/brands', ...getBrands);
router.get('/brands/:id', ...getBrandById);
router.get('/brands/:id/check-in-use', checkBrandInUse);
router.get('/variations', ...getVariations);
router.get('/variations/:id', ...getVariationById);
router.get('/variations/:id/check-in-use', checkVariationInUse);
router.get('/suppliers', ...getSuppliers);
router.get('/suppliers/:id', ...getSupplierById);
router.get('/suppliers/:id/check-in-use', checkSupplierInUse);
router.get('/customers', authenticate, requirePermission('manageCustomers', 'view_customer'), getCustomers);
router.get('/customers/:id', authenticate, requirePermission('manageCustomers', 'view_customer'), getCustomerById);
router.get('/customers/template/download', authenticate, requirePermission('manageCustomers', 'import_customer'), downloadTemplate);

// Sales
router.get('/sales', getSales);
router.get('/sales/:id', getSaleById);

// Orders
router.get('/orders', authenticate, requirePermission('manageOrders', 'view_order'), getOrders);
router.get('/orders/:id', authenticate, requirePermission('manageOrders', 'view_order'), getOrderById);

// Purchases
router.get('/purchases', getPurchases);
router.get('/purchases/:id', getPurchaseById);

// Purchase Returns
router.get('/purchase-returns', getPurchaseReturns);
router.get('/purchase-returns/:id', getPurchaseReturnById);

// Sale Returns
router.get('/sale-returns', getSaleReturns);
router.get('/sale-returns/:id', getSaleReturnById);

// Inventory Adjustments
router.get('/adjustments', getAdjustmentsValidators, getAdjustments);
router.get('/adjustments/summary', getAdjustmentSummaryValidators, getAdjustmentSummary);
router.get('/adjustments/:id', getAdjustmentByIdValidator, getAdjustmentById);
router.get('/sales/:id', ...getSaleById);

// Expenses
router.get('/expenses', ...getExpenses);
router.get('/expenses/:id', ...getExpenseById);
router.get('/expense-categories', ...getExpenseCategories);
router.get('/expense-categories/:id', ...getExpenseCategoryById);
router.get('/expense-categories/:id/check-in-use', ...checkExpenseCategoryInUse);

// Transfers
router.get('/transfers', getTransfers);
router.get('/transfers/:id', getTransferById);

// Quotations
router.get('/quotations', authenticate, getQuotations);
router.get('/quotations/:id', authenticate, getQuotationById);

router.get('/dashboard/stats', authenticate, requireAnyPermission([
  { component: 'manageReports', action: 'view_reports' },
  { component: 'manageUsers', action: 'view_user' }
]), getDashboardStats);

// Cart
router.get('/cart', ...getCart);

// Currencies
router.get('/currencies', getCurrencies);

// Activity logs
router.get('/activity-logs', authenticate, getActivityLogs);
router.get('/activity-logs/download', authenticate, downloadActivityLogs);

export default router;


