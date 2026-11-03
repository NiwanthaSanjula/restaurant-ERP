import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBranding } from '../../contexts/BrandingProvider';
import CompanyMark from '../common/CompanyMark';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import CashInModal from '../pos/CashInModal';
import { Menu, MonitorCheck } from 'lucide-react';
import ThemeToggle from '../common/ThemeToggle';

const Navbar: React.FC<{ onMenuToggle?: () => void; mobileMenuOpen?: boolean }> = ({ onMenuToggle, mobileMenuOpen = false }) => {
  const navigate = useNavigate();
  const headerRef = React.useRef<HTMLElement>(null);
  React.useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('--ss-header-clearance');
    const update = () => {
      const top = parseFloat(getComputedStyle(header).top) || 0;
      root.style.setProperty('--ss-header-clearance', `${Math.ceil(header.getBoundingClientRect().height + top + 12)}px`);
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(header);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      if (previous) root.style.setProperty('--ss-header-clearance', previous);
      else root.style.removeProperty('--ss-header-clearance');
    };
  }, []);
  const user = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const { companyName } = useBranding();
  const [showCashInModal, setShowCashInModal] = React.useState(false);
  const [hasActiveSession, setHasActiveSession] = React.useState<boolean>(
    Boolean(sessionStorage.getItem('posSessionId'))
  );

  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  React.useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const res = await fetch(`${apiBase}/pos/active`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (mounted) {
          // Backend returns { status: "success", data: { _id, ... } | null }
          const session = data?.data;
          const active = Boolean(session?._id);
          setHasActiveSession(active);
          if (active) {
            sessionStorage.setItem('posSessionId', String(session._id));
          } else {
            sessionStorage.removeItem('posSessionId');
          }
        }
      } catch (err) {
        console.error('Failed to check session', err);
      }
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, [apiBase]);

  const handlePosClick = () => {
    const sessId = sessionStorage.getItem('posSessionId');
    if (sessId || hasActiveSession) {
      navigate('/pos');
    } else {
      setShowCashInModal(true);
    }
  };

const handleOpenSession = async (
  _cashInHand: number,
  denominations?: Record<string, number>
) => {
  const token = localStorage.getItem('token');

  try {
    const res = await fetch(`${apiBase}/pos/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        denominations: denominations || {}
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.message || 'Failed to open POS session');
    }

    const id = data?.data?._id || data?.data?.sessionId;

    if (!id) {
      throw new Error('Missing session id');
    }

    sessionStorage.setItem('posSessionId', String(id));

    setHasActiveSession(true);
    setShowCashInModal(false);

    showSuccessToast('POS session opened successfully.');

    navigate('/pos');
  } catch (e) {
    showErrorToast(
      (e as Error)?.message || 'Failed to open POS session'
    );
  }
};

  const handleUseExistingSession = () => {
    const active = Boolean(sessionStorage.getItem('posSessionId')) || hasActiveSession;
    if (!active) {
      showErrorToast('No active POS session found.');
      return;
    }
    setShowCashInModal(false);
    navigate('/pos');
  };  

  return (
    <>
      <header ref={headerRef} className="ss-header flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4 lg:px-5 shadow-sm">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
          <button type="button" onClick={onMenuToggle} aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded={mobileMenuOpen} className="ss-icon-button md:hidden"><Menu size={21} aria-hidden="true" /></button>
          <Link to="/dashboard" className="flex items-center gap-3 min-w-0" aria-label={`${companyName} home`}>
            <CompanyMark />
            <div className="hidden lg:block min-w-0"><div className="ss-company-name text-foreground font-semibold truncate max-w-56" title={companyName}>{companyName}</div><div className="ss-subheading text-xs text-muted">Restaurant workspace</div></div>
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ThemeToggle />
          <button type="button" onClick={handlePosClick} className="ss-button"><MonitorCheck size={18} aria-hidden="true" /><span>OPEN  POS</span></button>
          <div className="flex items-center gap-2 border-l border-line pl-2 sm:pl-4">
            <div className="w-9 h-9 rounded-full bg-secondary-soft text-secondary flex items-center justify-center font-semibold" aria-hidden="true">{user?.name ? user.name[0]?.toUpperCase() : 'U'}</div>
            <div className="hidden lg:block"><div className="text-sm font-medium text-foreground max-w-32 truncate" title={user?.name || 'User'}>{user?.name || 'User'}</div><div className="text-xs text-muted">{user?.role || 'staff'}</div></div>
          </div>
        </div>
      </header>

      {/* MODAL */}
      {showCashInModal && (
        <CashInModal
          onSubmit={handleOpenSession}
          onCancel={() => setShowCashInModal(false)}
          onUseExistingSession={handleUseExistingSession}
          showUseExistingSession={
            hasActiveSession ||
            Boolean(sessionStorage.getItem('posSessionId'))
          }
        />
      )}
    </>
  );
};

export default Navbar;
