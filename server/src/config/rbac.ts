import RolePermissions, { PermissionMap } from '../models/RolePermissions';

/**
 * All permissions available in the system.
 * Sourced from ROLE_DATA env variable at runtime.
 * This export is used as a fallback / reference when the env var is not parsed yet.
 * 
 * Restaurant POS modules with standard action naming conventions.
 */
export const SYSTEM_ROLE_DATA: Record<string, string[]> = {
  // Menu Management
  manageMenu:              ['create_menu', 'edit_menu', 'delete_menu', 'view_menu', 'create_menu_item', 'edit_menu_item', 'delete_menu_item', 'view_menu_item'],
  
  // Table Management
  manageTables:            ['create_table', 'edit_table', 'delete_table', 'view_table', 'mark_occupied', 'mark_available', 'merge_table', 'transfer_order'],
  
  // Order Management
  manageOrders:            ['create_order', 'edit_order', 'delete_order', 'view_order', 'cancel_order', 'complete_order', 'modify_order', 'view_order_status', 'add_order_item', 'remove_order_item'],
  
  // Kitchen Management
  manageKitchen:           ['view_kitchen_orders', 'mark_preparing', 'mark_ready', 'mark_served', 'view_kitchen_inventory', 'edit_kitchen_inventory', 'create_recipe', 'edit_recipe', 'delete_recipe', 'view_recipe', 'manage_kitchen_staff'],
  
  // Reservation Management
  manageReservations:      ['create_reservation', 'edit_reservation', 'delete_reservation', 'view_reservation', 'check_in_reservation', 'cancel_reservation', 'view_reservation_list'],
  
  // POS Operations
  managePOS:               ['view_pos', 'create_sale', 'edit_sale', 'cancel_sale', 'complete_sale', 'process_payment', 'apply_discount', 'view_sales', 'open_session', 'close_session', 'register_open', 'view_cashier_report'],
  
  // Customer Management
  manageCustomers:         ['create_customer', 'edit_customer', 'delete_customer', 'view_customer', 'import_customer', 'manage_loyalty', 'view_customer_orders', 'view_customer_history'],
  
  // User Management
  manageUsers:             ['create_user', 'edit_user', 'delete_user', 'view_user', 'edit_staff_schedule', 'view_staff_report', 'deactivate_user'],
  
  // Roles & Permissions
  manageRolesAndPermissions: ['create_role', 'edit_role', 'delete_role', 'view_role', 'assign_permissions'],
  
  // Reports & Analytics
  manageReports:           ['view_reports', 'view_sales_report', 'view_kitchen_report', 'view_inventory_report', 'view_customer_report', 'view_staff_report', 'export_report', 'view_analytics'],

  // Activity Logs
  manageActivityLogs:      ['read_activity_logs', 'download_activity_logs'],
  
  // Settings
  manageSettings:          ['view_settings', 'edit_restaurant_settings', 'edit_tax_settings', 'edit_payment_settings', 'edit_notification_settings', 'edit_prefix_settings', 'view_mail_settings']
};

// Backwards-compatibility: some parts of the app reference older component keys.
// Ensure common legacy names map to the canonical components when building permissions.
if (!SYSTEM_ROLE_DATA['manageRoles'] && SYSTEM_ROLE_DATA['manageRolesAndPermissions']) {
  // allow older code that expects 'manageRoles' to work
  (SYSTEM_ROLE_DATA as any)['manageRoles'] = SYSTEM_ROLE_DATA['manageRolesAndPermissions'];
}
if (!SYSTEM_ROLE_DATA['posOperations'] && SYSTEM_ROLE_DATA['managePOS']) {
  (SYSTEM_ROLE_DATA as any)['posOperations'] = SYSTEM_ROLE_DATA['managePOS'];
}

// Convenience list of components for validators/enums elsewhere in the codebase
export const RBAC_COMPONENTS: string[] = Array.from(new Set(Object.keys(SYSTEM_ROLE_DATA)));

/**
 * Parse ROLE_DATA from the environment variable (JSON string).
 * Falls back to SYSTEM_ROLE_DATA if the env var is absent or malformed.
 */
export function parseRoleDataFromEnv(): Record<string, string[]> {
  const raw = process.env.ROLE_DATA;
  if (!raw) return SYSTEM_ROLE_DATA;
  try {
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    console.warn('ROLE_DATA env var is not valid JSON — using built-in defaults.');
    return SYSTEM_ROLE_DATA;
  }
}

/**
 * Convert a flat ROLE_DATA map (component → string[]) into a nested PermissionMap.
 * e.g. { manageProducts: ['view_product'] } → { manageProducts: { view_product: true } }
 */
export function buildPermissionMap(roleData: Record<string, string[]>): PermissionMap {
  const map: PermissionMap = {};
  for (const [component, actions] of Object.entries(roleData)) {
    map[component] = {};
    for (const action of actions) {
      map[component][action] = true;
    }
  }
  return map;
}

/**
 * Fetch permission map for a given role name from the database.
 * Returns null if the role is not found.
 */
export async function getRolePermissions(roleName: string): Promise<PermissionMap | null> {
  // .lean() returns a plain JS object so nested booleans are native JS primitives,
  // not BSON types — required for `=== true` checks in checkPermissionInMap.
  const roleDoc = await RolePermissions.findOne({ roleName }).lean();
  return roleDoc ? (roleDoc.permissions as PermissionMap) : null;
}

/**
 * Check whether a permission map grants access to a specific component + action.
 */
export function checkPermissionInMap(permissions: PermissionMap, component: string, action: string): boolean {
  return permissions?.[component]?.[action] === true;
}
