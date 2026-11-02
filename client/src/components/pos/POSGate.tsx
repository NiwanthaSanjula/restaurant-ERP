import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CashInModal from './CashInModal';
import POSCheckout from './POSCheckout';
import PosSessionBackdrop from './PosSessionBackdrop';
import { fetchActivePosSession, openPosSession, type PosDenominations } from '../../services/posSessionService';

const POSGate: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    // Token is stored in localStorage by the auth flow
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/', { replace: true });
      return;
    }
    setLoading(true);
    try {
      const json = await fetchActivePosSession();
      // Backend returns: { status: "success", data: { _id, userId, status, ... } | null }
      const session = json?.data;
      if (session?._id) {
        sessionStorage.setItem('posSessionId', String(session._id));
        setSessionId(String(session._id));
      } else {
        sessionStorage.removeItem('posSessionId');
        setSessionId(null);
      }
    } catch {
      sessionStorage.removeItem('posSessionId');
      setSessionId(null);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const handleOpenSession = async (openingCash: number, denominations: PosDenominations) => {
    const json = await openPosSession({ openingCash, denominations });
    // Backend returns sessionId or _id depending on the route
    const id = json?.data?.sessionId ?? json?.data?._id;
    if (id) {
      sessionStorage.setItem('posSessionId', String(id));
      setSessionId(String(id));
    }
  };

  const handleSessionEnded = () => {
    sessionStorage.removeItem('posSessionId');
    setSessionId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-foreground font-semibold text-sm">Loading POS…</p>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <>
        <PosSessionBackdrop />
        <CashInModal onSubmit={handleOpenSession} />
      </>
    );
  }

  return <POSCheckout onSessionClosed={handleSessionEnded} />;
};

export default POSGate;
