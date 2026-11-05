import { useEffect, useState } from 'react';
import { usePermissions } from '../../contexts/PermissionContext';

export const DEMO_EXPLANATION = 'Read-only demo: changes are disabled. Search, filters, cart preview and printing remain available.';

export function DemoBadge() {
  const { isDemo } = usePermissions();
  const [exiting, setExiting] = useState(false);
  const [error, setError] = useState('');
  if (!isDemo) return null;
  const exit = async () => {
    setExiting(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/demo/exit`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok && res.status !== 401) throw new Error('Could not end the session. Please retry.');
      localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.removeItem('requirePrefixSetup');
      window.location.assign('/');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not exit demo.'); setExiting(false); }
  };
  return <div className="ss-demo-badge" role="status">
    <span title={DEMO_EXPLANATION}>Read-only demo</span>
    <button type="button" data-demo-allow onClick={exit} disabled={exiting}>{exiting ? 'Exiting…' : 'Exit Demo'}</button>
    {error && <span role="alert">{error}</span>}
  </div>;
}

/** Accessibility for legacy controls. API enforcement remains authoritative. */
export function DemoInteractions() {
  const { isDemo } = usePermissions();
  useEffect(() => {
    if (!isDemo) return;
    const blocked = (element: Element) => {
      if (element.closest('[data-demo-allow]')) return false;
      if (element.matches('[data-demo-write], [data-demo-disabled], input[type="file"], button[type="submit"], input[type="submit"]')) return true;
      const label = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''} ${element.textContent || ''}`.trim();
      if (element.closest('.pos-workspace, [data-pos-dialog]')) return /^(close register|submit payment|submit.*print|open register)/i.test(label);
      if (element.querySelector('.lucide-trash, .lucide-trash-2, .lucide-upload, .lucide-save')) return true;
      return /^(?:\+\s*)?(?:save\b|update\b|create\b|new (?:dish|item|supplier|product|purchase|sale|user|role|transfer|expense|customer|recipe)|add\b|delete\b|remove\b|receive stock|issue to kitchen|complete (?:sale|transfer)|cancel sale|record payment|(?:set|make) (?:as )?default|activate\b|deactivate\b|import\b|upload\b|reset password)/i.test(label);
    };
    const disable = () => {
      document.querySelectorAll<HTMLElement>('button, a, input[type="file"], input[type="submit"], [role="switch"], [data-demo-write]').forEach(element => {
        if (!blocked(element)) return;
        if (!element.hasAttribute('data-demo-disabled')) {
          element.setAttribute('data-demo-disabled', ''); element.setAttribute('aria-disabled', 'true');
          element.setAttribute('title', DEMO_EXPLANATION);
        }
        if ((element instanceof HTMLButtonElement || element instanceof HTMLInputElement) && !element.disabled) element.disabled = true;
      });
    };
    const prevent = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-demo-allow]')) return;
      const control = target?.closest('button, a, [data-demo-write], [data-demo-disabled]');
      if (event.type === 'submit' || (control && blocked(control))) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const observer = new MutationObserver(disable);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] }); disable();
    document.addEventListener('click', prevent, true); document.addEventListener('submit', prevent, true);
    return () => { observer.disconnect(); document.removeEventListener('click', prevent, true); document.removeEventListener('submit', prevent, true); };
  }, [isDemo]);
  return null;
}
