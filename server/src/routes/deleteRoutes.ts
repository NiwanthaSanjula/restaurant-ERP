import express from 'express';
import { requirePermission } from '../middleware/permissions';
import { deleteBaseUnit, deleteBaseUnitValidators } from '../controllers/baseUnit';
import { deleteBrand, deleteBrandValidators } from '../controllers/brand';
import { clearCart, clearCartValidators, removeCartItem, removeCartItemValidators } from '../controllers/cart';
import { deleteCategory, deleteCategoryValidators } from '../controllers/category';
import { deleteCustomer, deleteCustomerValidators } from '../controllers/customer';
import { deleteExpense, deleteExpenseCategory } from '../controllers/expense';
import { deleteAdjustment } from '../controllers/inventory';
import { deleteKitchenProduct, deleteKitchenProductValidators } from '../controllers/kitchen';
import { deleteRecipeById } from '../controllers/kitchen/recipe';
import { deleteZBillBySessionId } from '../controllers/pos';
import { deleteProduct, deleteProductValidators } from '../controllers/product';
import { deletePurchase } from '../controllers/purchaseController';
import { bulkDeletePurchaseReturns, deletePurchaseReturn } from '../controllers/purchaseReturnController';
import { bulkDeleteQuotations, deleteQuotation } from '../controllers/quotation';
import { deletePermission, deletePermissionValidators, deleteRole, deleteRoleValidators } from '../controllers/roles&Permissions';
import { deletePayment, deletePaymentValidators, deleteSale, deleteSaleValidators } from '../controllers/sale';
import { bulkDeleteSaleReturns, deleteSaleReturn } from '../controllers/saleReturn';
import { deleteSupplier, deleteSupplierValidators } from '../controllers/supplier';
import { deleteTransfer } from '../controllers/transfer';
import { deleteUnit, deleteUnitValidators } from '../controllers/unit';
import { deleteUser, deleteUserValidators } from '../controllers/user';
import { deleteVariation, deleteVariationValidators } from '../controllers/variation';
import { deleteWarehouse, deleteWarehouseValidators } from '../controllers/warehouse';
import { deleteAdjustmentValidators } from '../middleware/adjustmentValidation';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// Roles & Permissions
router.delete('/roles/:id', ...deleteRoleValidators, deleteRole);
router.delete('/permissions/:id', ...deletePermissionValidators, deletePermission);

// Users
router.delete('/users/:id', ...deleteUserValidators, deleteUser);

// Warehouses
router.delete('/warehouses/:id', ...deleteWarehouseValidators, deleteWarehouse);
router.delete('/products/:id', ...deleteProductValidators, deleteProduct);
router.delete('/baseUnits/:id', ...deleteBaseUnitValidators, deleteBaseUnit);
router.delete('/units/:id', ...deleteUnitValidators, deleteUnit);
router.delete('/categories/:id', ...deleteCategoryValidators, deleteCategory);
router.delete('/kitchen/products/:id', ...deleteKitchenProductValidators, deleteKitchenProduct);
router.delete('/kitchen/recipes/:id', ...deleteRecipeById);
router.delete('/brands/:id', ...deleteBrandValidators, deleteBrand);
router.delete('/variations/:id', ...deleteVariationValidators, deleteVariation);
router.delete('/suppliers/:id', ...deleteSupplierValidators, deleteSupplier);
router.delete('/customers/:id', ...deleteCustomerValidators, deleteCustomer);

// Sales
router.delete('/sales/:id', ...deleteSaleValidators, deleteSale);
router.delete('/sales/:id/payments/:index', ...deletePaymentValidators, deletePayment);

// Purchases
router.delete('/purchases/:id', authenticate, requirePermission('managePurchases', 'read'), requirePermission('manageProducts', 'update'), deletePurchase);

// Purchase Returns (bulk-delete before :id so route matches first)
router.delete('/purchase-returns/bulk-delete', bulkDeletePurchaseReturns);
router.delete('/purchase-returns/:id', deletePurchaseReturn);

// Sale Returns (bulk-delete before :id so route matches first)
router.delete('/sale-returns/bulk-delete', bulkDeleteSaleReturns);
router.delete('/sale-returns/:id', deleteSaleReturn);

// Expenses
router.delete('/expenses/:id', ...deleteExpense);
router.delete('/expense-categories/:id', ...deleteExpenseCategory);

// Transfers
router.delete('/transfers/:id', deleteTransfer);

// Inventory Adjustments
router.delete('/adjustments/:id', ...deleteAdjustmentValidators, deleteAdjustment);
// Quotations
router.delete('/quotations/bulk-delete', authenticate, bulkDeleteQuotations);
router.delete('/quotations/:id', authenticate, deleteQuotation);
router.delete('/pos/z-bills/:sessionId', ...deleteZBillBySessionId);

// Cart
router.delete('/cart/item/:cartKey', ...removeCartItemValidators, removeCartItem);
router.delete('/cart', ...clearCartValidators, clearCart);

export default router;


