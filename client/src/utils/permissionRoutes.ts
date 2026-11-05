export interface RoutePermission { component: string; action: string }
/** Existing protected areas; other routes retain their existing policies. */
export function permissionForPath(path: string): RoutePermission | null {
  let pathname: string;
  try { pathname = decodeURI(path).replace(/\/+$/, '') || '/'; } catch { return null; }
  const rules: [RegExp, string, string][] = [
    [/^\/(viewProducts|barcode-print)\/?$/, 'manageProducts', 'read'],
    [/^\/createProduct\/?$/, 'manageProducts', 'create'],
    [/^\/editProduct\//, 'manageProducts', 'update'],
    [/^\/(pos-products|inventory-items(?:\/needs-review)?)$/, 'manageProducts', 'read'],
    [/^\/(pos-products|inventory-items)\/new$/, 'manageProducts', 'create'],
    [/^\/pos-products\/new-dish$/, 'manageProducts', 'create'],
    [/^\/(pos-products|inventory-items)\/[^/]+\/edit$/, 'manageProducts', 'update'],
    [/^\/(viewRoles|viewPermissions)\/?$/, 'manageRolesAndPermissions', 'view_role'],
    [/^\/(createRole|createPermission)\/?$/, 'manageRolesAndPermissions', 'create_role'],
    [/^\/(editRole|editPermission)\//, 'manageRolesAndPermissions', 'edit_role'],
    [/^\/viewUsers\/?$/, 'manageUsers', 'view_user'],
    [/^\/createUser\/?$/, 'manageUsers', 'create_user'],
    [/^\/editUser\//, 'manageUsers', 'edit_user'],
    [/^\/(SystemSettings|ReceiptSettings)\/?$/, 'manageSettings', 'view_settings'],
    [/^\/mail-settings\/?$/, 'manageSettings', 'view_mail_settings'],
    [/^\/(pos|pos-checkout)\/?$/, 'managePOS', 'view_pos'],
    [/^\/(purchases|reports\/purchase|viewPurchaseReturns|return_to_supplier)\/?$/, 'managePurchases', 'read'],
    [/^\/purchaseReturnDetails\//, 'managePurchases', 'read'],
    [/^\/warehouses\/[^/]+\/stock$/, 'manageProducts', 'read'],
    [/^\/(createPurchase|editPurchase\/[^/]+)$/, 'manageProducts', 'update']
  ];
  const matched = rules.find(([pattern]) => new RegExp(pattern.source, 'i').test(pathname));
  return matched ? { component: matched[1], action: matched[2] } : null;
}
