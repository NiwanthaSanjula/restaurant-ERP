export const DEFAULT_COMPANY_NAME = 'ServeSmart';
export const BRANDING_STORAGE_KEY = 'servesmart.branding';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export type Branding = { companyName: string; companyLogo: string };

export function normalizeBranding(value: unknown, previous: Branding = { companyName: DEFAULT_COMPANY_NAME, companyLogo: '' }): Branding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return previous;
  const source = value as Record<string, unknown>;
  return {
    companyName: typeof source.companyName === 'string' ? source.companyName.trim() || DEFAULT_COMPANY_NAME : previous.companyName,
    companyLogo: typeof source.companyLogo === 'string' ? source.companyLogo.trim() : previous.companyLogo,
  };
}

export function brandInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase();
  const capitals = name.match(/\p{Lu}/gu) || [];
  return (capitals.length > 1 ? capitals.slice(0, 2).join('') : Array.from(name).slice(0, 2).join('')).toLocaleUpperCase();
}

export function resolveBrandLogo(logo: string): string {
  if (!logo) return '';
  if (logo.startsWith('/portfolio-assets/')) return logo;
  if (/^https?:\/\//i.test(logo) || logo.startsWith('data:')) return logo;
  return `${API_URL.replace(/\/api\/?$/, '')}${logo.startsWith('/') ? '' : '/'}${logo}`;
}

let branding: Branding = { companyName: DEFAULT_COMPANY_NAME, companyLogo: '' };
try { branding = normalizeBranding(JSON.parse(localStorage.getItem(BRANDING_STORAGE_KEY) || 'null')); } catch { /* Storage is optional. */ }
let revision = 0;
const listeners = new Set<() => void>();
export const getBranding = (): Branding => branding;
export const getBrandingRevision = (): number => revision;
export const subscribeBranding = (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Accept saved/read settings only. An older in-flight read cannot undo a save. */
export function syncBranding(value: unknown, expectedRevision = revision, persist = true): void {
  if (expectedRevision !== revision) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const source = value as Record<string, unknown>;
  if (typeof source.companyName !== 'string' && typeof source.companyLogo !== 'string') return;
  const next = normalizeBranding(value, branding);
  revision += 1;
  if (next.companyName === branding.companyName && next.companyLogo === branding.companyLogo) return;
  branding = next;
  if (persist) {
    try { localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(branding)); } catch { /* Continue in memory. */ }
  }
  listeners.forEach(listener => listener());
}

export const escapeBrandText = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
