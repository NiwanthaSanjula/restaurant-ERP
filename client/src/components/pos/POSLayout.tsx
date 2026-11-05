import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Calculator, LayoutDashboard, Maximize, Minimize, MoreHorizontal, Power, ReceiptText, ShoppingBag, X } from 'lucide-react';
import ThemeToggle from '../common/ThemeToggle';
import { DemoBadge } from '../common/DemoMode';
import { usePermissions } from '../../contexts/PermissionContext';
import { useBranding } from '../../contexts/BrandingProvider';
import CompanyMark from '../common/CompanyMark';
import './pos.css';

const desktopQuery = '(min-width: 1200px)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};

interface Props {
  catalog: ReactNode;
  order: ReactNode;
  quantity: number;
  total: string;
  isFullScreen: boolean;
  onDashboard: () => void;
  onSales: () => void;
  onCalculator: () => void;
  onFullScreen: () => void;
  onCloseRegister: () => void;
}

export default function POSLayout(props: Props) {
  const { isDemo } = usePermissions();
  const { companyName } = useBranding();
  const [orderOpen, setOrderOpen] = useState(false);
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(desktopQuery).matches, () => true);
  const drawer = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tools = useRef<HTMLDetailsElement>(null);
  const modal = orderOpen && !desktop;

  useEffect(() => {
    if (!modal) return;
    const returnFocus = trigger.current;
    let frame = 0;
    const focusClose = () => {
      const close = drawer.current?.querySelector<HTMLElement>('[aria-label="Close order"]');
      if (close && getComputedStyle(close).visibility === 'visible') close.focus();
      else frame = requestAnimationFrame(focusClose);
    };
    frame = requestAnimationFrame(focusClose);
    const keyboard = (event: KeyboardEvent) => {
      // Payment/variation dialogs above the drawer retain their own controls.
      if (document.querySelector('[data-pos-dialog]')) return;
      if (event.key === 'Escape') setOrderOpen(false);
      if (event.key !== 'Tab') return;
      const nodes = Array.from(drawer.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, summary, [tabindex="0"]') || [])
        .filter(element => element.getClientRects().length && getComputedStyle(element).visibility === 'visible');
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!drawer.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', keyboard); returnFocus?.focus(); };
  }, [modal]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !tools.current?.contains(event.target)) tools.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);

  const tool = (callback: () => void) => { tools.current?.removeAttribute('open'); callback(); };
  return <section className="pos-workspace" aria-label="Point of sale">
    <nav className="pos-rail" data-theme="dark" aria-label="POS navigation" inert={modal}>
      <CompanyMark className="pos-mark" />
      <button type="button" className="pos-rail-action" aria-label="Dashboard" title="Dashboard" onClick={props.onDashboard}><LayoutDashboard size={21} /><span className="pos-tooltip">Dashboard</span></button>
      <span className="pos-rail-current" aria-label="Point of sale" aria-current="page"><ShoppingBag size={21} /><span className="pos-tooltip">Point of sale</span></span>
      <button type="button" className="pos-rail-action" aria-label="Sales history" title="Sales history" onClick={props.onSales}><ReceiptText size={21} /><span className="pos-tooltip">Sales history</span></button>
    </nav>
    <main className="pos-catalog" inert={modal}>
      <header className="pos-header">
        <div className="min-w-0"><p className="pos-eyebrow truncate max-w-56" title={companyName}>{companyName}</p><h1>POINT OF SALE</h1></div>
        <div className="pos-header-actions">
          <DemoBadge />
          <ThemeToggle />
          <details className="pos-tools" ref={tools} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.removeAttribute('open'); event.currentTarget.querySelector('summary')?.focus(); } }}>
            <summary aria-label="More POS tools" title="More POS tools"><MoreHorizontal size={22} /></summary>
            <div className="pos-tools-menu" aria-label="Secondary POS tools">
              <button type="button" onClick={() => tool(props.onCalculator)}><Calculator size={17} />Calculator</button>
              <button type="button" onClick={() => tool(props.onFullScreen)}>{props.isFullScreen ? <Minimize size={17} /> : <Maximize size={17} />}{props.isFullScreen ? 'Exit fullscreen' : 'Enter fullscreen'}</button>
              <button type="button" disabled={isDemo} title={isDemo ? 'Read-only demo: register changes are disabled.' : undefined} onClick={() => tool(props.onCloseRegister)}><Power size={17} />Close register</button>
              <div className="pos-unavailable"><span>Hold order</span><small>Unavailable — saving held orders is not implemented.</small></div>
              <div className="pos-unavailable"><span>View menu</span><small>Unavailable — this destination is not connected.</small></div>
            </div>
          </details>
        </div>
      </header>
      <div className="pos-catalog-panel">{props.catalog}</div>
      <button ref={trigger} type="button" className="pos-cart-trigger" aria-controls="pos-order-panel" aria-expanded={orderOpen} onClick={() => setOrderOpen(true)}>
        <span className="pos-cart-count">{props.quantity}</span><span>View order</span><strong>{props.total}</strong><ShoppingBag size={19} aria-hidden="true" />
      </button>
    </main>
    {modal && <button type="button" className="pos-drawer-backdrop" aria-label="Close order backdrop" tabIndex={-1} onClick={() => setOrderOpen(false)} />}
    <aside ref={drawer} id="pos-order-panel" className={`pos-order ${modal ? 'is-open' : ''}`} inert={!desktop && !orderOpen}
      role={modal ? 'dialog' : undefined} aria-modal={modal ? true : undefined} aria-label="Current order">
      {modal && isDemo && <div className="px-4 pt-3"><DemoBadge /></div>}
      <div className="pos-order-heading"><div><span className="pos-eyebrow">Current order</span><h2>Order details <span>{props.quantity}</span></h2></div>
        <button type="button" className="pos-order-close" aria-label="Close order" onClick={() => setOrderOpen(false)}><X size={21} /><span className="sr-only">Back to catalog</span></button>
      </div>
      {props.order}
    </aside>
  </section>;
}
