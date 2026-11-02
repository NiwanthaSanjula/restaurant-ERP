import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { settingService } from '../../services/settingService';
import { showErrorToast, showSuccessToast } from '../../utils/toast';
import CashInModal from '../pos/CashInModal';

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const user = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const [companyLogo, setCompanyLogo] = React.useState<string>('');
  const [showCashInModal, setShowCashInModal] = React.useState(false);
  const [hasActiveSession, setHasActiveSession] = React.useState<boolean>(
    Boolean(sessionStorage.getItem('posSessionId'))
  );

  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const resolveLogoUrl = React.useCallback(
    (logo: string) => {
      const trimmed = logo.trim();
      if (!trimmed) return '';
      if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
        return trimmed;
      }
      const backendOrigin = apiBase.replace(/\/api\/?$/, '');
      return `${backendOrigin}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
    },
    [apiBase]
  );

  React.useEffect(() => {
    let mounted = true;

    const loadSystemLogo = async () => {
      try {
        const response = await settingService.getSettings();
        const logo = response?.data?.system?.companyLogo;

        if (mounted && typeof logo === 'string') {
          setCompanyLogo(resolveLogoUrl(logo));
        }
      } catch {
        // Keep default fallback mark when logo is not available.
      }
    };

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

    loadSystemLogo();
    checkSession();

    return () => {
      mounted = false;
    };
  }, [resolveLogoUrl, apiBase]);

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
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4">
        <div className="flex items-center space-x-3">
          <button className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded bg-[#001F54] text-white">
            ☰
          </button>
          <Link
            to="/dashboard"
            className="flex items-center gap-3"
          >
            {companyLogo ? (
              <img
                src={companyLogo}
                className="w-9 h-9 object-contain border rounded"
                onError={() => setCompanyLogo('')}
              />
            ) : (
              <div className="w-9 h-9 bg-[#001F54] text-white flex items-center justify-center rounded">
                SS
              </div>
            )}

            <div>
              <div className="text-[#001F54] font-semibold">
                ServeSmart
              </div>
              <div className="text-xs text-gray-500">
                Restaurant POS
              </div>
            </div>
          </Link>
        </div>

        {/* RIGHT */}
        <div className="flex items-center space-x-4">
          <button
            onClick={handlePosClick}
            className="px-3 h-10 bg-[#003366] text-white rounded"
          >
            POS 🧾
          </button>

          <div className="w-9 h-9 rounded-full bg-[#4A90E2] text-white flex items-center justify-center">
            🔔
          </div>

          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-full bg-[#003366] text-white flex items-center justify-center">
              {user?.name ? user.name[0]?.toUpperCase() : 'U'}
            </div>

            <div className="hidden sm:block">
              <div className="text-sm font-medium">
                {user?.name || 'User'}
              </div>
              <div className="text-xs text-gray-500">
                {user?.role || 'staff'}
              </div>
            </div>
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