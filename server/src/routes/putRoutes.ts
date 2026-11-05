import express from 'express';
import { putResetPassword, resetPasswordValidators } from '../controllers/auth';
import { updateBaseUnit, updateBaseUnitValidators } from '../controllers/baseUnit';
import { updateBrand, updateBrandValidators } from '../controllers/brand';
import { updateCartItem, updateCartItemValidators, updateCartSettings, updateCartSettingsValidators } from '../controllers/cart';
import { updateCategory, updateCategoryValidators } from '../controllers/category';
import { updateCustomer, updateCustomerValidators } from '../controllers/customer';
import { updateExpense, updateExpenseCategory, updateExpenseCategoryValidators, updateExpenseValidators } from '../controllers/expense';
import { cancelAdjustment, updateAdjustment } from '../controllers/inventory';
import { updateKitchenProduct, updateKitchenProductValidators } from '../controllers/kitchen';
import { updateOrderStatus, updateOrderStatusValidators } from '../controllers/order';
import { updateProduct, updateProductValidators } from '../controllers/product';
import { updatePurchase } from '../controllers/purchaseController';
import { updatePurchaseReturn } from '../controllers/purchaseReturnController';
import { quotationValidators, updateQuotation, updateQuotationStatus } from '../controllers/quotation';
import { updatePermission, updatePermissionValidators, updateRole, updateRoleValidators } from '../controllers/roles&Permissions';
import { cancelSale, completeSale, updatePayment, updatePaymentValidators, updateSale, updateSaleValidators } from '../controllers/sale';
import { updateSaleReturn } from '../controllers/saleReturn';
import { updateSupplier, updateSupplierValidators } from '../controllers/supplier';
import { updateTransfer, updateTransferValidators } from '../controllers/transfer';
import { updateUnit, updateUnitValidators } from '../controllers/unit';
import { updateUser, updateUserValidators } from '../controllers/user';
import { updateVariation, updateVariationValidators } from '../controllers/variation';
import { updateWarehouse, updateWarehouseValidators } from '../controllers/warehouse';
import { cancelAdjustmentValidators, updateAdjustmentValidators } from '../middleware/adjustmentValidation';
import { authenticate } from '../middleware/auth';
import { putKitchenIssueConversion } from '../controllers/warehouse/kitchenIssue';
import { putWarehouseStockAlert } from '../controllers/warehouse/stock';
import { checkPermission, requirePermission } from '../middleware/permissions';

const router = express.Router();

// Auth - Reset password using OTP
router.put('/auth/reset-password', ...resetPasswordValidators, putResetPassword);

// Roles & Permissions
router.put('/roles/:id', authenticate, requirePermission('manageRolesAndPermissions', 'edit_role'), updateRoleValidators, updateRole);
router.put('/permissions/:id', authenticate, requirePermission('manageRolesAndPermissions', 'edit_role'), updatePermissionValidators, updatePermission);

// Warehouses
router.put('/warehouses/:id/stock/:productId/alert', authenticate, requirePermission('manageProducts', 'update'), putWarehouseStockAlert);
router.put('/warehouses/:id', authenticate, requirePermission('manageSettings', 'edit_restaurant_settings'), updateWarehouseValidators, updateWarehouse);
router.put('/products/:id/kitchen-issue-conversion', authenticate, requirePermission('manageProducts', 'update'), requirePermission('manageKitchen', 'edit_kitchen_inventory'), putKitchenIssueConversion);
router.put('/users/:id', authenticate, requirePermission('manageUsers', 'edit_user'), updateUserValidators, updateUser);
router.put('/products/:id', ...updateProductValidators, updateProduct);
router.put('/baseUnits/:id', ...updateBaseUnitValidators, updateBaseUnit);
router.put('/units/:id', ...updateUnitValidators, updateUnit);
router.put('/categories/:id', authenticate, requirePermission('manageSettings', 'edit_restaurant_settings'), updateCategoryValidators, updateCategory);
router.put('/kitchen/products/:id', authenticate, requirePermission('manageKitchen', 'edit_kitchen_inventory'), updateKitchenProductValidators, updateKitchenProduct);
router.put('/brands/:id', ...updateBrandValidators, updateBrand);
router.put('/variations/:id', ...updateVariationValidators, updateVariation);
router.put('/suppliers/:id', ...updateSupplierValidators, updateSupplier);
router.put('/customers/:id', ...updateCustomerValidators, updateCustomer);

// Sales
router.put('/sales/:id', authenticate, requirePermission('managePOS', 'edit_sale'), updateSaleValidators, updateSale);
router.put('/sales/:id/complete', authenticate, requirePermission('managePOS', 'complete_sale'), completeSale);
router.put('/sales/:id/cancel', authenticate, requirePermission('managePOS', 'cancel_sale'), cancelSale);
router.patch('/sales/:id/payments/:index', authenticate, requirePermission('managePOS', 'process_payment'), updatePaymentValidators, updatePayment);

// Orders
router.put('/orders/:id/status', authenticate, requirePermission('manageOrders', 'edit_order'), updateOrderStatusValidators, updateOrderStatus);

// Purchases
router.put('/purchases/:id', authenticate, requirePermission('managePurchases', 'read'), requirePermission('manageProducts', 'update'), updatePurchase);

// Purchase Returns
router.put('/purchase-returns/:id', authenticate, updatePurchaseReturn);

// Sale Returns
router.put('/sale-returns/:id', authenticate, updateSaleReturn);

// Inventory Adjustments (cancel route first so /adjustments/:id/cancel matches)
router.put('/adjustments/:id/cancel', ...cancelAdjustmentValidators, cancelAdjustment);
router.put('/adjustments/:id', ...updateAdjustmentValidators, updateAdjustment);
// Expenses
router.put('/expenses/:id', ...updateExpenseValidators, updateExpense);
router.put('/expense-categories/:id', ...updateExpenseCategoryValidators, updateExpenseCategory);

// Transfers
router.put('/transfers/:id', ...updateTransferValidators, updateTransfer);

// Quotations
router.put('/quotations/:id', authenticate, ...quotationValidators, updateQuotation);
router.patch('/quotations/:id/status', authenticate, checkPermission('manageQuotations', 'update'), updateQuotationStatus);

// Cart
router.put('/cart/item', ...updateCartItemValidators, updateCartItem);
router.put('/cart/settings', ...updateCartSettingsValidators, updateCartSettings);

export default router;


