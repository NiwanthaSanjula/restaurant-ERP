export type PermissionMap = Record<string, Record<string, boolean>>;

export function parseEffectivePermissions(value: unknown): PermissionMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid effective permissions');
  const result: PermissionMap = {};
  for (const [component, actions] of Object.entries(value)) {
    if (!actions || typeof actions !== 'object' || Array.isArray(actions)) throw new Error('Invalid effective permissions');
    const grants: Record<string, boolean> = {};
    for (const [action, granted] of Object.entries(actions)) {
      if (typeof granted !== 'boolean') throw new Error('Invalid effective permission');
      if (granted === true) Object.defineProperty(grants, action, { value: true, enumerable: true });
    }
    Object.defineProperty(result, component, { value: grants, enumerable: true });
  }
  return result;
}

export function checkEffectivePermission(map: PermissionMap | null | undefined, component: string, action: string): boolean {
  return !!map && Object.hasOwn(map, component) && Object.hasOwn(map[component], action) && map[component][action] === true;
}
