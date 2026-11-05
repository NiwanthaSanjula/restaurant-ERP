export interface PosLocation { _id: string; name: string; isActive?: boolean }
export type LocationStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const posLocationStorageKey = (userId: string) => `pos.selling-location.v1:${userId}`;

/** The server-provided active options are the authorization boundary for choices.
 * Do not infer a selling location from array order, names, prices or seed IDs. */
export function validPosLocation(id: unknown, locations: PosLocation[]): id is string {
  return typeof id === 'string' && locations.some(location => String(location._id) === id && location.isActive === true);
}
export function resolvePosLocation(userId: string | null, locations: PosLocation[], defaultId: unknown, storage: LocationStorage): string {
  let saved: string | null = null;
  try { if (userId) saved = storage.getItem(posLocationStorageKey(userId)); } catch { /* Device storage is optional. */ }
  if (validPosLocation(saved, locations)) return saved;
  return validPosLocation(defaultId, locations) ? defaultId : '';
}
export function rememberPosLocation(userId: string | null, id: string, locations: PosLocation[], storage: LocationStorage): boolean {
  if (!userId || !validPosLocation(id, locations)) return false;
  try { storage.setItem(posLocationStorageKey(userId), id); return true; } catch { return false; }
}
export async function fetchPosLocations(signal?: AbortSignal): Promise<{ locations: PosLocation[]; defaultWarehouseId: string | null }> {
  const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/pos/locations`, {
    signal, headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
  });
  const body = await response.json();
  if (!response.ok || body.status !== 'success' || !Array.isArray(body.data?.locations)) throw new Error(body.message || 'Selling locations could not be loaded.');
  return { locations: body.data.locations.filter((location: PosLocation) => location.isActive === true), defaultWarehouseId: body.data.defaultWarehouseId ?? null };
}
