import { createHash } from 'crypto';
import { normalizePermissions, RolePermission } from './permissionDefinitions';

const id = (name: string) => createHash('sha256').update(`latavola-public-demo-v1/${name}`).digest('hex').slice(0, 24);
export const PUBLIC_DEMO_USER_ID = id('visitor');
export const PUBLIC_DEMO_ROLE_ID = id('read-role');
export const PUBLIC_DEMO_EMAIL = 'public.visitor@example.com';
// Existing canonical actions only. In particular, no create/edit/pay/import/admin grants.
const reads: Record<string, string[]> = {
  manageProducts: ['read'], manageWarehouses: ['read'], manageBaseUnits: ['read'], manageUnits: ['read'],
  manageCategories: ['read'], manageBrands: ['read'], manageVariations: ['read'], managePurchases: ['read'],
  managePOS: ['view_pos', 'view_sales', 'view_cashier_report'],
  manageKitchen: ['view_kitchen_inventory', 'view_recipe', 'view_kitchen_orders'],
  manageCustomers: ['view_customer', 'view_customer_orders', 'view_customer_history'],
  manageUsers: ['view_user', 'view_staff_report'], manageRolesAndPermissions: ['view_role'],
  manageReports: ['view_reports', 'view_sales_report', 'view_kitchen_report', 'view_inventory_report', 'view_customer_report', 'view_staff_report', 'export_report', 'view_analytics'],
  manageActivityLogs: ['read_activity_logs', 'download_activity_logs'], manageSettings: ['view_settings', 'view_mail_settings'],
  manageMenu: ['view_menu', 'view_menu_item'], manageOrders: ['view_order', 'view_order_status'], manageTables: ['view_table'],
  manageReservations: ['view_reservation', 'view_reservation_list'],
};
export const PUBLIC_DEMO_PERMISSIONS: RolePermission[] = Object.entries(reads).map(([component, actions]) => ({ component, actions: Object.fromEntries(actions.map(action => [action, true])) }));
export function isPublicDemoUser(user: { _id?: unknown; isPublicDemo?: unknown }) {
  return String(user._id) === PUBLIC_DEMO_USER_ID || user.isPublicDemo === true;
}
export function validPublicDemoIdentity(user: { _id?: unknown; roleId?: unknown; isActive?: unknown; isPublicDemo?: unknown }, access: { roleId: string; permissions: Record<string, Record<string, boolean>> } | null) {
  if (String(user._id) !== PUBLIC_DEMO_USER_ID || String(user.roleId) !== PUBLIC_DEMO_ROLE_ID || user.isActive !== true || user.isPublicDemo !== true || access?.roleId !== PUBLIC_DEMO_ROLE_ID) return false;
  const expected = normalizePermissions(PUBLIC_DEMO_PERMISSIONS);
  const normalize = (value: Record<string, Record<string, boolean>>) => Object.entries(value).flatMap(([component, actions]) => Object.entries(actions).filter(([, granted]) => granted).map(([action]) => `${component}:${action}`)).sort();
  const planned = Object.fromEntries(expected.permissions.map(entry => [entry.component, entry.actions]));
  return !expected.issues.length && JSON.stringify(normalize(access.permissions)) === JSON.stringify(normalize(planned));
}
