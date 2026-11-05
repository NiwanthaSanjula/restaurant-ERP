import type { ReactNode } from 'react';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { checkEffectivePermission, parseEffectivePermissions, type PermissionMap } from '../utils/permissions';

interface UserPermissions { permissions: PermissionMap; roleName?: string; isDemo?: boolean; userId?: string }
interface PermissionContextType {
  permissions: UserPermissions | null;
  hasPermission: (component: string, action: string) => boolean;
  loading: boolean;
  isDemo: boolean;
  userId: string | null;
  refreshPermissions: () => Promise<void>;
}
const PermissionContext = createContext<PermissionContextType | undefined>(undefined);
export const usePermissions = () => {
  const context = useContext(PermissionContext);
  if (!context) throw new Error('usePermissions must be used within a PermissionProvider');
  return context;
};

export const PermissionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef({ id: 0 });
  const activeToken = useRef<string | null>(null);
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;
  const refreshPermissions = useCallback(async () => {
    const requestId = ++generation.current.id;
    const token = localStorage.getItem('token');
    if (token !== activeToken.current) {
      activeToken.current = token;
      setPermissions(null);
      setLoading(true);
    }
    try {
      if (!token) { setPermissions(null); return; }
      const response = await fetch(api + '/auth/me', { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) throw new Error('Unable to load permissions');
      const result = await response.json();
      const grants = parseEffectivePermissions(result?.data?.user?.permissions);
      if (requestId === generation.current.id) setPermissions({ permissions: grants, roleName: result?.data?.user?.roleName, isDemo: result?.data?.user?.isDemo === true, userId: result?.data?.user?.id });
    } catch {
      if (requestId === generation.current.id) setPermissions(null);
    } finally {
      if (requestId === generation.current.id) setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    const currentGeneration = generation.current;
    void refreshPermissions();
    const refresh = () => { void refreshPermissions(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      currentGeneration.id++;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refreshPermissions]);
  const hasPermission = (component: string, action: string) =>
    checkEffectivePermission(permissions?.permissions, component, action);
  return <PermissionContext.Provider value={{ permissions, hasPermission, loading, refreshPermissions, isDemo: permissions?.isDemo === true, userId: permissions?.userId || null }}>{children}</PermissionContext.Provider>;
};
