import { useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { BRANDING_STORAGE_KEY, getBranding, getBrandingRevision, subscribeBranding, syncBranding } from '../services/branding';

export const useBranding = () => useSyncExternalStore(subscribeBranding, getBranding, getBranding);

export default function BrandingProvider({ children }: { children: ReactNode }) {
  const { companyName } = useBranding();
  useEffect(() => { document.title = `${companyName} · Restaurant management`; }, [companyName]);
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const load = async () => {
      const revision = getBrandingRevision();
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/branding`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (mounted && response.ok && body.success) syncBranding(body.data, revision);
      } catch { /* Retain cached branding/defaults while offline. */ }
    };
    const stored = (event: StorageEvent) => {
      if (event.key !== BRANDING_STORAGE_KEY || !event.newValue) return;
      try { syncBranding(JSON.parse(event.newValue), getBrandingRevision(), false); } catch { /* Ignore invalid cache. */ }
    };
    void load();
    window.addEventListener('storage', stored);
    window.addEventListener('focus', load);
    return () => { mounted = false; controller.abort(); window.removeEventListener('storage', stored); window.removeEventListener('focus', load); };
  }, []);
  return children;
}
