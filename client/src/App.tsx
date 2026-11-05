import React from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import SpecialOffers from './components/SpecialOffers';

// Contexts
import { CurrencyProvider } from './contexts/CurrencyContext';
import { PermissionProvider, usePermissions } from './contexts/PermissionContext';
import { DemoInteractions } from './components/common/DemoMode';
import { permissionForPath } from './utils/permissionRoutes';
import ThemeToggle from './components/common/ThemeToggle';

// Auth Components
import ForgotPassword from './components/auth/ForgotPassword';
import Login from './components/auth/Login';
import ResetPassword from './components/auth/ResetPassword';
import SystemTypeInitialization from './components/auth/SystemTypeInitialization';
import ActivityLogs from './components/settings/ActivityLogs';
import EditCurrency from './components/settings/EditCurrency';
import MailSettings from './components/settings/MailSettings';
import PrefixSettings from './components/settings/PrefixSettings';
import ReceiptSettings from './components/settings/ReceiptSettings';
import SystemSettings from './components/settings/SystemSettings';
import { showSuccessToast } from './utils/toast';

// POS Components
import CashInModal from './components/pos/CashInModal';
import POSGate from './components/pos/POSGate';

// Layout & Dashboard
import Dashboard from './components/Dashboard';
import DashboardLayout from './components/layout/DashboardLayout';

// Feature Components
import CreateUser from './components/users/createUser';
import EditUser from './components/users/editUser';
import ViewUsers from './components/users/viewUsers';

import CreateRole from './components/roles&Permissions/createRole';
import EditRole from './components/roles&Permissions/editRole';
import ViewRoles from './components/roles&Permissions/viewRoles';

import CreatePermission from './components/roles&Permissions/createPermission';
import EditPermission from './components/roles&Permissions/editPermission';
import ViewPermissions from './components/roles&Permissions/viewPermissions';

import CreateWarehouse from './components/warehouse/createWarehouse';
import EditWarehouse from './components/warehouse/editWarehouse';
import ViewWarehouses from './components/warehouse/viewWarehouses';
import NewDish from './components/products/NewDish';

import CreateProduct from './components/products/createProduct';
import EditProduct from './components/products/editProduct';
import ViewProducts from './components/products/viewProducts';
import WarehouseStock from './components/warehouse/WarehouseStock';

import CreateBaseUnit from './components/baseUnits/createBaseUnit';
import EditBaseUnit from './components/baseUnits/editBaseUnit';
import ViewBaseUnits from './components/baseUnits/viewBaseUnits';

import CreateUnit from './components/units/createUnit';
import EditUnit from './components/units/editUnit';
import ViewUnits from './components/units/viewUnits';

import CreateCategory from './components/categories/createCategory';
import EditCategory from './components/categories/editCategory';
import ViewCategories from './components/categories/viewCategories';

import CreateKitchenProduct from './components/kitchen/CreateKitchenProduct';
import EditKitchenProduct from './components/kitchen/EditKitchenProduct';
import RecipeConfigurationPage from './components/kitchen/RecipeConfigurationPage';
import ViewKitchenInventory from './components/kitchen/ViewKitchenInventory';

import CreateBrand from './components/brands/createBrand';
import EditBrand from './components/brands/editBrand';
import ViewBrands from './components/brands/viewBrands';

import CreateVariation from './components/variations/createVariation';
import EditVariation from './components/variations/editVariation';
import ViewVariations from './components/variations/viewVariations';

import BarcodePrint from './components/barcode/BarcodePrint';

import CreateSupplier from './components/suppliers/createSupplier';
import EditSupplier from './components/suppliers/editSupplier';
import ViewSuppliers from './components/suppliers/viewSuppliers';

import CreateCustomer from './components/customers/createCustomer';
import EditCustomer from './components/customers/editCustomer';
import ImportCustomer from './components/customers/importCustomer';
import ViewCustomers from './components/customers/viewCustomers';

import CreateSale from './components/sales/CreateSale';
import EditSale from './components/sales/EditSale';
import SaleInvoice from './components/sales/SaleInvoice';
import ViewSales from './components/sales/ViewSales';



// Purchase Component Import
import CreatePurchase from './components/purchases/CreatePurchase';
import EditPurchase from './components/purchases/EditPurchase';
import ViewPurchases from './components/purchases/ViewPurchases';

// Sale Return Components Import
import CreateSaleReturn from './components/sales/CreateSaleReturn';
import ViewSaleReturns from './components/sales/ViewSaleReturns';

// Purchase Return Components Import
import CreatePurchaseReturn from './components/purchaseReturns/CreatePurchaseReturn';
import EditPurchaseReturn from './components/purchaseReturns/EditPurchaseReturn';
import PurchaseReturnDetails from './components/purchaseReturns/PurchaseReturnDetails';
import ViewPurchaseReturns from './components/purchaseReturns/ViewPurchaseReturns';

// Adjustment Components Import
import CreateAdjustment from './components/adjustments/CreateAdjustment';
import EditAdjustment from './components/adjustments/EditAdjustment';
import ViewAdjustments from './components/adjustments/ViewAdjustments';
// Expenses
import CreateExpense from './components/expenses/CreateExpense';
import CreateExpenseCategory from './components/expenses/CreateExpenseCategory';
import EditExpense from './components/expenses/EditExpense';
import EditExpenseCategory from './components/expenses/EditExpenseCategory';
import ViewExpenseCategories from './components/expenses/ViewExpenseCategories';
import ViewExpenses from './components/expenses/ViewExpenses';

// Transfers
import CreateTransfer from './components/transfers/CreateTransfer';
import EditTransfer from './components/transfers/EditTransfer';
import ViewTransfers from './components/transfers/ViewTransfers';

// Quotations
import CreateQuotation from './components/quotations/CreateQuotation';
import EditQuotation from './components/quotations/EditQuotation';
import ViewQuotations from './components/quotations/ViewQuotations';
import CustomerReport from './components/reports/CustomerReport';
import ExpenseReport from './components/reports/ExpenseReport';
import InventoryReport from './components/reports/InventoryReport';
import KitchenWasteReport from './components/reports/KitchenWasteReport';
import PurchaseReport from './components/reports/PurchaseReport';
import SalesReport from './components/reports/SalesReport';
import SupplierReport from './components/reports/SupplierReport';
import ZBillReport from './components/reports/ZBillReport';

//Reporting

// Private Route Component with prefix-setup guard
const isTokenValid = (token: string | null) => {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

const PrivateRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const location = useLocation();
  const { hasPermission, loading, isDemo } = usePermissions();
  const requirePrefixSetup = typeof window !== 'undefined' ? localStorage.getItem('requirePrefixSetup') === 'true' : false;

  if (!isTokenValid(token)) {
    if (token) localStorage.removeItem('token');
    return <Navigate to="/" replace />;
  }

  // If prefix setup is required, force user to PrefixSettings before anything else
  if (!isDemo && requirePrefixSetup && location.pathname !== '/PrefixSettings') {
    return <Navigate to="/PrefixSettings" replace />;
  }

  const required = permissionForPath(location.pathname);
  if (required && loading) return <div className="p-6">Loading permissions...</div>;
  const demoReadPreview = isDemo && required && hasPermission(required.component,
    ({ manageRolesAndPermissions: 'view_role', manageUsers: 'view_user', manageProducts: 'read' } as Record<string, string>)[required.component] || required.action);
  if (required && !hasPermission(required.component, required.action) && !demoReadPreview) {
    return <div role="alert" className="p-6">Access denied.
      <button className="ml-3 underline" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/'; }}>Sign out</button>
    </div>;
  }
  return children;
};

const StandaloneThemeControl = () => {
  const { pathname } = useLocation();
  if (!['/', '/forgot-password', '/reset-password', '/system-type-initialization'].includes(pathname)) return null;
  return <div className="ss-theme-dock"><ThemeToggle /></div>;
};

const App: React.FC = () => {
  return (
    <CurrencyProvider>
      <PermissionProvider>
        <BrowserRouter>
          <DemoInteractions />
          <StandaloneThemeControl />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Login />} />

            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/system-type-initialization" element={<SystemTypeInitialization />} />
            {/* Public demo route for the premium POS UI */}
            <Route path="/pos" element={<PrivateRoute><POSGate /></PrivateRoute>} />

            {/* POS Full Screen Flow (Private) */}
            <Route path="/pos-checkout" element={<PrivateRoute><POSEntry /></PrivateRoute>} />

            {/* Dashboard & Admin Routes (Private) */}
            <Route element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="SystemSettings" element={<SystemSettings />} />
              <Route path="editCurrency/:id" element={<EditCurrency />} />
              <Route path="mail-settings" element={<MailSettings />} />
              <Route path="activity-logs" element={<ActivityLogs />} />
              <Route path="PrefixSettings" element={<PrefixSettings />} />
              <Route path="ReceiptSettings" element={<ReceiptSettings />} />


              {/* Users */}
              <Route path="/viewUsers" element={<ViewUsers />} />
              <Route path="/createUser" element={<CreateUser />} />
              <Route path="/editUser/:id" element={<EditUser />} />

              {/* Roles & Permissions */}
              <Route path="/viewRoles" element={<ViewRoles />} />
              <Route path="/createRole" element={<CreateRole />} />
              <Route path="/editRole/:id" element={<EditRole />} />
              <Route path="/viewPermissions" element={<ViewPermissions />} />
              <Route path="/createPermission" element={<CreatePermission />} />
              <Route path="/editPermission/:id" element={<EditPermission />} />

              {/* Warehouses */}
              <Route path="/viewWarehouses" element={<ViewWarehouses />} />
              <Route path="/warehouses/:id/stock" element={<WarehouseStock />} />
              <Route path="/createWarehouse" element={<CreateWarehouse />} />
              <Route path="/editWarehouse/:id" element={<EditWarehouse />} />

              {/* Products */}
              <Route path="/pos-products" element={<ViewProducts key="pos-products" />} />
              <Route path="/inventory-items" element={<ViewProducts key="inventory-items" />} />
              <Route path="/inventory-items/needs-review" element={<ViewProducts key="inventory-review" />} />
              <Route path="/pos-products/new" element={<CreateProduct key="new-pos-product" />} />
              <Route path="/pos-products/new-dish" element={<NewDish />} />
              <Route path="/inventory-items/new" element={<CreateProduct key="new-inventory-item" />} />
              <Route path="/pos-products/:id/edit" element={<EditProduct key="edit-pos-product" />} />
              <Route path="/inventory-items/:id/edit" element={<EditProduct key="edit-inventory-item" />} />
              <Route path="/viewProducts" element={<Navigate to="/pos-products" replace />} />
              <Route path="/createProduct" element={<Navigate to="/pos-products/new" replace />} />
              <Route path="/editProduct/:id" element={<EditProduct />} />

              {/* Base Units */}
              <Route path="/viewBaseUnits" element={<ViewBaseUnits />} />
              <Route path="/createBaseUnit" element={<CreateBaseUnit />} />
              <Route path="/editBaseUnit/:id" element={<EditBaseUnit />} />

              {/* Units */}
              <Route path="/viewUnits" element={<ViewUnits />} />
              <Route path="/createUnit" element={<CreateUnit />} />
              <Route path="/editUnit/:id" element={<EditUnit />} />

              {/* Categories & kitchen (nested in sidebar under Categories) */}
              <Route path="/viewCategories" element={<ViewCategories />} />
              <Route path="/createCategory" element={<CreateCategory />} />
              <Route path="/editCategory/:id" element={<EditCategory />} />
              <Route path="/kitchen/inventory" element={<ViewKitchenInventory />} />
              <Route path="/kitchen/inventory/create" element={<CreateKitchenProduct />} />
              <Route path="/kitchen/inventory/edit/:id" element={<EditKitchenProduct />} />
              <Route path="/kitchen/recipes" element={<RecipeConfigurationPage />} />

              {/* Brands */}
              <Route path="/viewBrands" element={<ViewBrands />} />
              <Route path="/createBrand" element={<CreateBrand />} />
              <Route path="/editBrand/:id" element={<EditBrand />} />

              {/* Variations */}
              <Route path="/viewVariations" element={<ViewVariations />} />
              <Route path="/createVariation" element={<CreateVariation />} />
              <Route path="/editVariation/:id" element={<EditVariation />} />

              {/* Barcode Print */}
              <Route path="/barcode-print" element={<BarcodePrint />} />

              {/* Suppliers */}
              <Route path="/viewSuppliers" element={<ViewSuppliers />} />
              <Route path="/createSupplier" element={<CreateSupplier />} />
              <Route path="/editSupplier/:id" element={<EditSupplier />} />

              {/* Customers */}
              <Route path="/viewCustomers" element={<ViewCustomers />} />
              <Route path="/createCustomer" element={<CreateCustomer />} />
              <Route path="/editCustomer/:id" element={<EditCustomer />} />
              <Route path="/importCustomer" element={<ImportCustomer />} />

              {/* Sales */}
              <Route path="/viewSales" element={<ViewSales />} />
              <Route path="/createSale" element={<CreateSale />} />
              <Route path="/editSale/:id" element={<EditSale />} />
              <Route path="/saleInvoice/:id" element={<SaleInvoice />} />
              <Route path="/saleReturns" element={<ViewSaleReturns />} />
              <Route path="/createSaleReturn" element={<CreateSaleReturn />} />

              {/* Purchase Routes */}
              <Route path="/purchases" element={<ViewPurchases />} />
              <Route path="/createPurchase" element={<CreatePurchase />} />
              <Route path="/editPurchase/:id" element={<EditPurchase />} />
              <Route path="/createPurchaseReturn" element={<CreatePurchaseReturn />} />
              <Route path="/viewPurchaseReturns" element={<ViewPurchaseReturns />} />
              <Route path="/editPurchaseReturn/:id" element={<EditPurchaseReturn />} />
              <Route path="/purchaseReturnDetails/:id" element={<PurchaseReturnDetails />} />
              <Route path="/return_to_supplier" element={<ViewPurchaseReturns />} /> {/* Missing route placeholder */}

              {/* Inventory Adjustment Routes */}
              <Route path="/createAdjustment" element={<CreateAdjustment />} />
              <Route path="/viewAdjustments" element={<ViewAdjustments />} />
              <Route path="/editAdjustment/:id" element={<EditAdjustment />} />
              {/* Expenses */}
              <Route path="/expenses" element={<ViewExpenses />} />
              <Route path="/createExpense" element={<CreateExpense />} />
              <Route path="/editExpense/:id" element={<EditExpense />} />
              <Route path="/expense-categories" element={<ViewExpenseCategories />} />
              <Route path="/createExpenseCategory" element={<CreateExpenseCategory />} />
              <Route path="/editExpenseCategory/:id" element={<EditExpenseCategory />} />

              {/* Transfers */}
              <Route path="/transfers" element={<ViewTransfers />} />
              <Route path="/createTransfer" element={<CreateTransfer />} />
              <Route path="/editTransfer/:id" element={<EditTransfer />} />

              {/* offer */}
              <Route path="/SpecialOffers" element={<SpecialOffers />} />

              {/* Quotations */}
              <Route path="/quotations" element={<ViewQuotations />} />
              <Route path="/createQuotation" element={<CreateQuotation />} />
              <Route path="/editQuotation/:id" element={<EditQuotation />} />
              {/* Reports */}
              <Route path="/reports_sales" element={<SalesReport />} />
              <Route path="/reports/purchase" element={<PurchaseReport />} />
              <Route path="/reports/expense" element={<ExpenseReport />} />
              <Route path="/reports_customer" element={<CustomerReport />} />
              <Route path="/reports/supplier" element={<SupplierReport />} />
              <Route path="/reports/inventory" element={<InventoryReport />} />
              <Route path="/reports/kitchen-waste" element={<KitchenWasteReport />} />
              <Route path="/reports/z-bill" element={<ZBillReport />} />
              <Route path="/reports_z-report" element={<ZBillReport />} />
              <Route path="/reports_register" element={<div className="ss-card p-6"><h1 className="text-xl font-bold">Register Reports</h1><p className="mt-3 text-muted">This directory is not connected yet. Saved register summaries are available under Reports → Z-bill.</p><Link to="/reports/z-bill" className="ss-button mt-4">View Z-bills</Link></div>} />
            </Route>

            {/* Fallback Route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="auto"
          />
        </BrowserRouter>
      </PermissionProvider>
    </CurrencyProvider>
  );
};

const POSEntry: React.FC = () => {
  const { isDemo } = usePermissions();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(true);
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  // On mount, check if there's already an active session before showing CashInModal
  React.useEffect(() => {
    if (isDemo) { setChecking(false); return; }
    const _token = localStorage.getItem('token');
    const _api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
    fetch(`${_api}/pos/active`, {
      headers: { 'Content-Type': 'application/json', ...(_token ? { Authorization: `Bearer ${_token}` } : {}) }
    })
      .then(r => r.json())
      .then(data => {
        // Backend returns { status, data: { _id, ... } | null }
        const session = data?.data;
        if (session?._id) {
          const id = String(session._id);
          sessionStorage.setItem('posSessionId', id);
          setSessionId(id);
        } else {
          // Check sessionStorage as fallback
          const stored = sessionStorage.getItem('posSessionId');
          if (stored) setSessionId(stored);
        }
      })
      .catch(() => {
        const stored = sessionStorage.getItem('posSessionId');
        if (stored) setSessionId(stored);
      })
      .finally(() => setChecking(false));
  }, [isDemo]);

  const openSession = async (_cashInHand: number, denominations?: Record<string, number>) => {
    try {
      const res = await fetch(`${api}/pos/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ denominations: denominations || {} })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to open POS session');
      const id = data?.data?._id || data?.data?.sessionId;
      if (!id) throw new Error('Missing session id');
      sessionStorage.setItem('posSessionId', String(id));
      setSessionId(String(id));
      showSuccessToast('Register entry added successfully.');
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-foreground font-semibold text-sm">Loading POS…</p>
      </div>
    );
  }

  if (isDemo) return <POSGate />;
  if (!sessionId) {
    return <CashInModal onSubmit={openSession} onCancel={() => window.location.assign('/dashboard')} />;
  }
  return <POSGate />;
};

export default App;
