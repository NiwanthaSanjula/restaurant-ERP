export type ApiPolicy = { reads: [string, string][]; writes?: [string, string][]; anyRead?: boolean; anyWrite?: boolean; resource: string };
const permission = (component: string, action: string): [string, string][] => [[component, action]];
export function apiPolicy(path: string, method: string): ApiPolicy | null {
  const reading = ['GET', 'HEAD'].includes(method), action = reading ? 'read' : method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update';
  if (path === '/auth/me') return { reads: [], resource: 'me' };
  if (/^\/users\/(profile|update-profile)$/.test(path)) return { reads: [], writes: [], resource: 'profile' };
  if (path.startsWith('/settings/')) {
    if (/^\/settings\/mail\/?$/.test(path)) return { reads: permission('manageSettings', 'view_mail_settings'), writes: permission('manageSettings', 'edit_notification_settings'), resource: 'mail' };
    if (/^\/settings\/prefixes\/?$/.test(path)) return { reads: permission('manageSettings', 'view_settings'), writes: permission('manageSettings', 'edit_prefix_settings'), resource: 'prefix' };
    if (/^\/settings\/receipt(?:-config|-logo)?\/?$/.test(path)) return { reads: permission('manageSettings', 'view_settings'), writes: permission('manageSettings', 'edit_restaurant_settings'), resource: 'receiptSettings' };
    if (path === '/settings/system') return { reads: [], writes: permission('manageSettings', 'edit_restaurant_settings'), resource: 'systemSettings' };
  }
  if (path === '/upload') return { reads: [], writes: [['manageSettings', 'edit_restaurant_settings'], ['manageProducts', 'create'], ['manageProducts', 'update']], anyWrite: true, resource: 'upload' };
  if (/^\/currencies(?:\/|$)/.test(path)) return { reads: [], writes: permission('manageSettings', 'edit_restaurant_settings'), resource: 'currency' };
  if (path === '/roles/permission-catalog') return { reads: [['manageRolesAndPermissions', 'view_role'], ['manageRolesAndPermissions', 'create_role'], ['manageRolesAndPermissions', 'edit_role']], anyRead: true, resource: 'permissionCatalog' };
  if (/^\/roles(?:\/|$)|^\/permissions(?:\/|$)/.test(path)) return { reads: permission('manageRolesAndPermissions', 'view_role'), writes: permission('manageRolesAndPermissions', action === 'delete' ? 'delete_role' : action === 'create' ? 'create_role' : 'edit_role'), resource: path.includes('permission-catalog') ? 'permissionCatalog' : path.startsWith('/permissions') ? 'permission' : 'role' };
  if (/^\/users(?:\/|$)/.test(path)) return { reads: permission('manageUsers', 'view_user'), writes: permission('manageUsers', action === 'delete' ? 'delete_user' : action === 'create' ? 'create_user' : 'edit_user'), resource: 'user' };
  if (/^\/pos\//.test(path)) {
    if (path === '/pos/locations') return { reads: [['managePOS', 'view_pos'], ['manageSettings', 'view_settings']], anyRead: true, resource: 'posLocations' };
    const read = path.includes('z-bills') ? 'view_sales' : path.includes('/report/') ? 'view_cashier_report' : 'view_pos';
    const write = path.includes('z-bills') ? 'cancel_sale' : path.endsWith('/sale') ? 'create_sale' : path.endsWith('/close') ? 'close_session' : 'open_session';
    return { reads: permission('managePOS', read), writes: permission('managePOS', write), resource: path.includes('catalog') ? 'catalog' : 'register' };
  }
  if (/^\/kitchen\//.test(path)) {
    const recipe = path.includes('/recipes'), report = path.includes('/reports');
    return { reads: permission('manageKitchen', recipe ? 'view_recipe' : report && !path.endsWith('low-stock') ? 'view_kitchen_orders' : 'view_kitchen_inventory'), writes: permission('manageKitchen', recipe ? method === 'DELETE' ? 'delete_recipe' : 'create_recipe' : 'edit_kitchen_inventory'), resource: recipe ? 'recipe' : report ? 'kitchenReport' : path.endsWith('/movements') ? 'movement' : 'ingredient' };
  }
  if (/^\/warehouses\/[^/]+\/kitchen-issue/.test(path)) return { reads: [...permission('manageProducts', 'read'), ...permission('manageKitchen', 'view_kitchen_inventory')], writes: [...permission('manageProducts', 'update'), ...permission('manageKitchen', 'edit_kitchen_inventory')], resource: 'issue' };
  if (/^\/warehouses\/[^/]+\/stock/.test(path)) return { reads: permission('manageProducts', 'read'), writes: permission('manageProducts', 'update'), resource: 'stock' };
  const masters: Record<string, string> = { products: 'manageProducts', warehouses: 'manageWarehouses', baseUnits: 'manageBaseUnits', units: 'manageUnits', categories: 'manageCategories', brands: 'manageBrands', variations: 'manageVariations' };
  const first = path.split('/')[1];
  if (method === 'PUT' && /^\/(warehouses|categories)\/[^/]+$/.test(path)) return { reads: [], writes: permission('manageSettings', 'edit_restaurant_settings'), resource: first === 'warehouses' ? 'warehouse' : 'master' };
  if (masters[first]) return { reads: permission(masters[first], 'read'), writes: permission(masters[first], action), resource: first === 'products' ? 'product' : first === 'warehouses' ? 'warehouse' : 'master' };
  if (first === 'customers') return { reads: permission('manageCustomers', 'view_customer'), writes: permission('manageCustomers', action === 'delete' ? 'delete_customer' : action === 'create' ? path.endsWith('/import') ? 'import_customer' : 'create_customer' : 'edit_customer'), resource: 'customer' };
  if (first === 'suppliers') return { reads: permission('manageProducts', 'read'), writes: permission('manageProducts', 'update'), resource: 'supplier' };
  if (first === 'sales') return { reads: permission('managePOS', 'view_sales'), writes: permission('managePOS', path.includes('/payments') ? 'process_payment' : path.endsWith('/complete') ? 'complete_sale' : path.endsWith('/cancel') || method === 'DELETE' ? 'cancel_sale' : method === 'POST' ? 'create_sale' : 'edit_sale'), resource: 'sale' };
  if (first === 'sale-returns') return { reads: permission('managePOS', 'view_sales'), writes: permission('managePOS', 'cancel_sale'), resource: 'saleReturn' };
  if (first === 'purchases' || first === 'purchase-returns') return { reads: permission('managePurchases', 'read'), writes: first === 'purchases' && path.endsWith('/quick-product') ? permission('manageProducts', 'create') : [...permission('managePurchases', 'read'), ...permission('manageProducts', 'update')], resource: first === 'purchases' ? 'purchase' : 'purchaseReturn' };
  if (first === 'orders') return { reads: permission('manageOrders', 'view_order'), writes: permission('manageOrders', method === 'POST' ? 'create_order' : 'edit_order'), resource: 'order' };
  if (first === 'transfers' || first === 'adjustments') return { reads: permission('manageProducts', 'read'), writes: permission('manageProducts', 'update'), resource: first === 'transfers' ? 'transfer' : 'adjustment' };
  if (first === 'expenses' || first === 'expense-categories') return { reads: permission('manageReports', 'view_reports'), writes: permission('manageSettings', 'edit_restaurant_settings'), resource: first === 'expenses' ? 'expense' : 'master' };
  if (first === 'quotations') return { reads: permission('manageProducts', 'read'), writes: permission('manageQuotations', 'update'), resource: 'quotation' };
  if (first === 'special-offers') return { reads: permission('manageProducts', 'read'), writes: permission('manageSpecialOffers', action === 'delete' ? 'delete' : action === 'create' ? 'create' : 'update'), resource: 'offer' };
  if (first === 'dashboard') return { reads: [['manageReports', 'view_reports'], ['manageUsers', 'view_user']], anyRead: true, resource: 'dashboard' };
  if (first === 'activity-logs') return { reads: permission('manageActivityLogs', path.endsWith('/download') ? 'download_activity_logs' : 'read_activity_logs'), resource: 'activity' };
  if (first === 'cart') return { reads: permission('managePOS', 'view_pos'), writes: permission('managePOS', 'create_sale'), resource: 'cart' };
  return null;
}
export const safePreview = (path: string, method: string) => method === 'POST' && /^\/warehouses\/[^/]+\/kitchen-issues\/preview$/.test(path);
