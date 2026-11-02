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

// These modules already use CRUD action keys in validators and role contracts.
for (const component of ['manageProducts', 'manageWarehouses', 'manageBaseUnits', 'manageUnits', 'manageCategories', 'manageBrands', 'manageVariations']) {
  SYSTEM_ROLE_DATA[component] = ['create', 'read', 'update', 'delete'];
}
SYSTEM_ROLE_DATA.manageSpecialOffers = ['create', 'update', 'delete'];
SYSTEM_ROLE_DATA.manageQuotations = ['update'];
// Purchase list, detail and report reads share one explicit grant. No implicit grants.
SYSTEM_ROLE_DATA.managePurchases = ['read'];

export type PermissionMap = Record<string, Record<string, boolean>>;
export interface RolePermission { component: string; actions: Record<string, boolean> }
const COMPONENT_ALIASES: Record<string, string> = {
  manageRoles: 'manageRolesAndPermissions', posOperations: 'managePOS',
  reports: 'manageReports', manageCategory: 'manageCategories'
};
const CRUD_ALIASES: Record<string, Record<string, string>> = {
  manageUsers: { create: 'create_user', read: 'view_user', update: 'edit_user', delete: 'delete_user' },
  manageRolesAndPermissions: { create: 'create_role', read: 'view_role', update: 'edit_role', delete: 'delete_role' },
  manageMenu: { create: 'create_menu', read: 'view_menu', update: 'edit_menu', delete: 'delete_menu' },
  manageOrders: { create: 'create_order', read: 'view_order', update: 'edit_order', delete: 'delete_order' },
  manageTables: { create: 'create_table', read: 'view_table', update: 'edit_table', delete: 'delete_table' },
  managePOS: { create: 'create_sale', read: 'view_pos' },
  manageReports: { read: 'view_reports' }
};
export const RBAC_COMPONENTS = [...Object.keys(SYSTEM_ROLE_DATA), ...Object.keys(COMPONENT_ALIASES)];

export function canonicalPermission(component: string, action: string): { component: string; action: string } | null {
  const canonical = Object.prototype.hasOwnProperty.call(COMPONENT_ALIASES, component) ? COMPONENT_ALIASES[component] : component;
  if (!Object.prototype.hasOwnProperty.call(SYSTEM_ROLE_DATA, canonical)) return null;
  const mapped = Object.prototype.hasOwnProperty.call(CRUD_ALIASES[canonical] || {}, action) ? CRUD_ALIASES[canonical][action] : action;
  return SYSTEM_ROLE_DATA[canonical].includes(mapped) ? { component: canonical, action: mapped } : null;
}

/** Unknown keys are denied individually; contradictory aliases deny that permission. */
export function normalizePermissions(value: unknown): { permissions: RolePermission[]; issues: string[] } {
  const map: PermissionMap = {};
  const issues: string[] = [];
  const conflicts = new Set<string>();
  if (!Array.isArray(value)) return { permissions: [], issues: ['Permissions must be an array.'] };
  for (const entry of value) {
    if (!entry || typeof entry.component !== 'string' || !entry.actions || typeof entry.actions !== 'object' || Array.isArray(entry.actions)) {
      issues.push('Invalid permission entry.'); continue;
    }
    if (!RBAC_COMPONENTS.includes(entry.component)) { issues.push(`Unmapped component: ${entry.component}`); continue; }
    for (const [action, granted] of Object.entries(entry.actions)) {
      const target = canonicalPermission(entry.component, action);
      if (!target || typeof granted !== 'boolean') {
        issues.push(`Unmapped or invalid permission: ${entry.component}:${action}`); continue;
      }
      map[target.component] ??= {};
      const previous = map[target.component][target.action];
      if (previous !== undefined && previous !== granted) {
        issues.push(`Conflicting permission: ${target.component}:${target.action}`);
        conflicts.add(target.component + ':' + target.action);
      }
      map[target.component][target.action] = granted;
    }
  }
  for (const conflict of conflicts) {
    const [component, action] = conflict.split(':');
    map[component][action] = false;
  }
  return { permissions: Object.entries(map).map(([component, actions]) => ({ component, actions })), issues };
}

export function permissionMap(entries: RolePermission[]): PermissionMap {
  return Object.fromEntries(entries.map(({ component, actions }) => [component, { ...actions }]));
}
/** Compatibility for the existing, unexecuted seed script. This is not an authorization fallback. */
export function buildPermissionMap(data: Record<string, string[]>): PermissionMap {
  const normalized = normalizePermissions(Object.entries(data).map(([component, actions]) => ({ component, actions: Object.fromEntries(actions.map(action => [action, true])) })));
  if (normalized.issues.length) throw new Error('Unmapped permission definitions require review.');
  return permissionMap(normalized.permissions);
}
export function checkPermissionInMap(permissions: PermissionMap | null, component: string, action: string): boolean {
  const target = canonicalPermission(component, action);
  return !!target && permissions?.[target.component]?.[target.action] === true;
}
/** Expand only explicit aliases for existing frontend PermissionGate callers. */
export function clientPermissionMap(permissions: PermissionMap): PermissionMap {
  const result: PermissionMap = {};
  for (const component of RBAC_COMPONENTS) {
    const canonical = COMPONENT_ALIASES[component] || component;
    for (const action of [...SYSTEM_ROLE_DATA[canonical], ...Object.keys(CRUD_ALIASES[canonical] || {})]) {
      if (checkPermissionInMap(permissions, component, action)) (result[component] ??= {})[action] = true;
    }
  }
  return result;
}
// Only the secret-protected first-user provisioning path uses this; never an authorization fallback.
export function administratorPermissions(): RolePermission[] {
  return Object.entries(SYSTEM_ROLE_DATA).map(([component, actions]) => ({ component, actions: Object.fromEntries(actions.map(action => [action, true])) }));
}
