export interface PermissionEntry { component: string; actions: Record<string, boolean> }

export function permissionArea(component: string): string {
  if (component === 'manageRolesAndPermissions') return 'Roles & Permissions';
  if (component === 'managePOS') return 'POS';
  return component.replace(/^manage/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function permissionAction(action: string): string {
  const words = action.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function permissionLabel(key: string): string {
  const [component, action] = key.split(':');
  return `${permissionArea(component)} → ${permissionAction(action)}`;
}

export function permissionDiff(saved: PermissionEntry[], selected: PermissionEntry[]) {
  const keys = (entries: PermissionEntry[]) => new Set(entries.flatMap(entry =>
    Object.entries(entry.actions).filter(([, granted]) => granted === true).map(([action]) => `${entry.component}:${action}`)));
  const before = keys(saved), after = keys(selected);
  return { added: [...after].filter(key => !before.has(key)), removed: [...before].filter(key => !after.has(key)) };
}
