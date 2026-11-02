import express from 'express';
import { initialRunValidators, loginValidators, postInitialRun, postLogin, postRequestOtp, requestOtpValidators } from '../controllers/auth';
import { createBaseUnit, createBaseUnitValidators } from '../controllers/baseUnit';
import { createBrand, createBrandValidators } from '../controllers/brand';
import { addToCart, addToCartValidators } from '../controllers/cart';
import { createCategory, createCategoryValidators } from '../controllers/category';
import { createCurrency } from '../controllers/currencyController';
import { createCustomer, createCustomerValidators, importCustomers } from '../controllers/customer';
import { createExpense, createExpenseCategory, createExpenseCategoryValidators, createExpenseValidators } from '../controllers/expense';
import { approveAdjustment, createAdjustment } from '../controllers/inventory';
import { createKitchenProduct, createKitchenProductValidators, stockIn, stockInValidators, stockOut, stockOutValidators } from '../controllers/kitchen';
import { normalizeRecipeBody, upsertRecipe, upsertRecipeValidators } from '../controllers/kitchen/recipe';
import { createOrder, createOrderValidators } from '../controllers/order';
import { bulkDeleteZBills, postCloseSession, postOpenSession, postSale } from '../controllers/pos';
import { createProduct, createProductValidators } from '../controllers/product';
import { createPurchase, createQuickProductForPurchase } from '../controllers/purchaseController';
import { createPurchaseReturn } from '../controllers/purchaseReturnController';
import { createQuotation, createQuotationValidators } from '../controllers/quotation';
import { createPermission, createPermissionValidators, createRole, createRoleValidators } from '../controllers/roles&Permissions';
import { createSale, createSaleValidators } from '../controllers/sale';
import { createSupplier, createSupplierValidators } from '../controllers/supplier';
import { createTransfer, createTransferValidators } from '../controllers/transfer';
import { createUnit, createUnitValidators } from '../controllers/unit';
import { createUser, createUserValidators } from '../controllers/user';
import { createVariation, createVariationValidators } from '../controllers/variation';
import { createWarehouse, createWarehouseValidators } from '../controllers/warehouse';
import { approveAdjustmentValidators, createAdjustmentValidators } from '../middleware/adjustmentValidation';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = express.Router();

// Auth - Login
router.post('/auth/login', ...loginValidators, postLogin);

// Auth - Request OTP for password reset
router.post('/auth/forgot-password', ...requestOtpValidators, postRequestOtp);

// Auth - Initial run to create first admin user (only when no users exist)
router.post('/auth/initial-run', ...initialRunValidators, postInitialRun);

// POS
router.post('/pos/session', authenticate, requirePermission('managePOS', 'open_session'), postOpenSession);
router.post('/pos/open', authenticate, requirePermission('managePOS', 'open_session'), postOpenSession);
router.post('/pos/sale', authenticate, requirePermission('managePOS', 'create_sale'), postSale);
router.post('/pos/session/close', authenticate, requirePermission('managePOS', 'close_session'), postCloseSession);
router.post('/pos/close', authenticate, requirePermission('managePOS', 'close_session'), postCloseSession);
router.post('/pos/z-bills/bulk-delete', authenticate, requirePermission('managePOS', 'view_sales'), bulkDeleteZBills);

// Cart
router.post('/cart', ...addToCartValidators, addToCart);

// Users
router.post('/users', authenticate, requirePermission('manageUsers', 'create_user'), createUserValidators, createUser);

// Roles & Permissions
router.post('/roles', authenticate, requirePermission('manageRolesAndPermissions', 'create_role'), createRoleValidators, createRole);
router.post('/permissions', authenticate, requirePermission('manageRolesAndPermissions', 'create_role'), createPermissionValidators, createPermission);

// Master Data
router.post('/warehouses', ...createWarehouseValidators, createWarehouse);
router.post('/products', ...createProductValidators, createProduct);
router.post('/baseUnits', ...createBaseUnitValidators, createBaseUnit);
router.post('/units', ...createUnitValidators, createUnit);
router.post('/categories', ...createCategoryValidators, createCategory);
router.post('/brands', ...createBrandValidators, createBrand);
router.post('/variations', ...createVariationValidators, createVariation);
router.post('/suppliers', ...createSupplierValidators, createSupplier);
router.post('/customers', ...createCustomerValidators, createCustomer);
router.post('/customers/import', importCustomers);

// Sales
router.post('/sales', ...createSaleValidators, createSale);

// Orders
router.post('/orders', authenticate, requirePermission('manageOrders', 'create_order'), createOrderValidators, createOrder);

// Purchase
router.post('/purchases', createPurchase);
router.post('/purchases/quick-product', authenticate, createQuickProductForPurchase);

// Purchase Return
router.post('/purchase-returns', authenticate, createPurchaseReturn);

// Inventory Adjustment
router.post('/adjustments', authenticate, ...createAdjustmentValidators, createAdjustment);
router.post('/adjustments/:id/approve', authenticate, ...approveAdjustmentValidators, approveAdjustment);

// Expenses
router.post('/expenses', ...createExpenseValidators, createExpense);
router.post('/expense-categories', ...createExpenseCategoryValidators, createExpenseCategory);

// Transfers
router.post('/transfers', ...createTransferValidators, createTransfer);

// Quotations
router.post('/quotations', authenticate, ...createQuotationValidators, createQuotation);

// Kitchen
router.post('/kitchen/products', authenticate, requirePermission('manageKitchen', 'view_kitchen_inventory'), createKitchenProductValidators, createKitchenProduct);
router.post('/kitchen/products/:id/stock-in', authenticate, requirePermission('manageKitchen', 'edit_kitchen_inventory'), stockInValidators, stockIn);
router.post('/kitchen/products/:id/stock-out', authenticate, requirePermission('manageKitchen', 'edit_kitchen_inventory'), stockOutValidators, stockOut);
router.post('/kitchen/recipes', authenticate, requirePermission('manageKitchen', 'create_recipe'), normalizeRecipeBody, upsertRecipeValidators, upsertRecipe);

// Currency
router.post('/currencies', createCurrency);

export default router;