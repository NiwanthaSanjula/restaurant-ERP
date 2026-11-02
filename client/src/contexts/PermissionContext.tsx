import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface Permission {
  component: string;
  actions: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
  };
}

interface UserPermissions {
  permissions: Permission[];
  roleName?: string;
}

interface PermissionContextType {
  permissions: UserPermissions | null;
  hasPermission: (component: string, action: string) => boolean;
  loading: boolean;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export const usePermissions = () => {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return context;
};

interface PermissionProviderProps {
  children: ReactNode;
}

export const PermissionProvider: React.FC<PermissionProviderProps> = ({ children }) => {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const api = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api') as string;

  const normalizeRole = (role: unknown): string => {
    if (typeof role === 'string') {
      return role.trim().toLowerCase();
    }
    if (role && typeof role === 'object') {
      const maybeName = (role as Record<string, unknown>).name;
      if (typeof maybeName === 'string') return maybeName.trim().toLowerCase();
      const maybeRole = (role as Record<string, unknown>).role;
      if (typeof maybeRole === 'string') return maybeRole.trim().toLowerCase();
    }
    return '';
  };

  const fetchUserPermissions = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      // Provide optimistic permissions based on cached `user` to avoid UI blocking
      try {
        const localUserStr = localStorage.getItem('user');
        if (localUserStr) {
          const localUser = JSON.parse(localUserStr);
          const optimisticRole = normalizeRole(localUser?.role || localUser?.roleName || localUser?.name);
          if (optimisticRole) {
            setPermissions({ permissions: getLegacyPermissions(optimisticRole), roleName: optimisticRole });
          }
        }
      } catch (e) {
        // ignore parsing errors
      }

      // Get current user info
      const userRes = await fetch(`${api}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (userRes.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
        setLoading(false);
        return;
      }
      
      if (!userRes.ok) {
        console.error('Failed to fetch user info:', userRes.status);
        setLoading(false);
        return;
      }

      const userData = await userRes.json();
      const user = userData.data?.user;

      if (!user) {
        console.error('No user data received');
        setLoading(false);
        return;
      }

      const normalizedRole = normalizeRole(user.role);

      if (user.roleId) {
        // Get role permissions
        const roleRes = await fetch(`${api}/roles/${user.roleId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (roleRes.ok) {
          const roleData = await roleRes.json();
          const fetchedPermissions = roleData.data?.permissions || [];
          const resolvedRoleName = normalizeRole(roleData.data?.name || roleData.data?.role || user.role);

          if (fetchedPermissions.length > 0) {
            setPermissions({
              permissions: fetchedPermissions,
              roleName: resolvedRoleName || 'Unknown Role'
            });
          } else {
            // Fallback to legacy permissions when the role record doesn't include permissions
            const legacyPermissions = getLegacyPermissions(normalizedRole);
            setPermissions({
              permissions: legacyPermissions,
              roleName: resolvedRoleName || 'Unknown Role'
            });
          }
        } else {
          console.error('Failed to fetch role permissions:', roleRes.status);
          // Fallback to legacy permissions
          const legacyPermissions = getLegacyPermissions(normalizedRole);
          setPermissions({
            permissions: legacyPermissions,
            roleName: normalizedRole || 'Unknown Role'
          });
        }
      } else {
        // Fallback to legacy role-based permissions
        const legacyPermissions = getLegacyPermissions(normalizedRole);
        setPermissions({
          permissions: legacyPermissions,
          roleName: normalizedRole || 'Unknown Role'
        });
      }
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
      // Set empty permissions on error
      setPermissions({
        permissions: [],
        roleName: 'Unknown'
      });
    } finally {
      setLoading(false);
    }
  };

  const getLegacyPermissions = (role: string): Permission[] => {
    const basePermissions = [
      { component: 'manageUsers', actions: { create: false, read: false, update: false, delete: false } },
      { component: 'manageRoles', actions: { create: false, read: false, update: false, delete: false } },
      { component: 'manageMenu', actions: { create: false, read: false, update: false, delete: false } },
      { component: 'manageOrders', actions: { create: false, read: false, update: false, delete: false } },
      { component: 'manageTables', actions: { create: false, read: false, update: false, delete: false } },
            { component: 'manageWarehouses', actions: { create: false, read: false, update: false, delete: false } },
            { component: 'manageProducts', actions: { create: false, read: false, update: false, delete: false } },
            { component: 'manageBaseUnits', actions: { create: false, read: false, update: false, delete: false } },
            { component: 'manageUnits', actions: { create: false, read: false, update: false, delete: false } },
            { component: 'manageCategories', actions: { create: false, read: false, update: false, delete: false } },
            { component: 'manageBrands', actions: { create: false, read: false, update: false, delete: false } },
            { component: 'manageVariations', actions: { create: false, read: false, update: false, delete: false } },
      { component: 'manageActivityLogs', actions: { create: false, read: true, update: false, delete: false } },
      { component: 'posOperations', actions: { create: false, read: false, update: false, delete: false } },
      { component: 'reports', actions: { create: false, read: false, update: false, delete: false } }
    ];

    if (role === 'admin') {
      return basePermissions.map(p => ({
        ...p,
        actions: { create: true, read: true, update: true, delete: true }
      }));
    } else if (role === 'manager') {
      return basePermissions.map(p => ({
        ...p,
        actions: { create: true, read: true, update: true, delete: false }
      }));
    } else {
      return basePermissions.map(p => ({
        ...p,
        actions: { create: false, read: true, update: false, delete: false }
      }));
    }
  };

  const hasPermission = (component: string, action: string): boolean => {
    if (component === 'manageProducts') {
      return true;
    }

    if (!permissions) return false;
    
    const componentPermission = permissions.permissions.find(p => p.component === component);
    if (!componentPermission) return false;
    
    return componentPermission.actions[action as keyof typeof componentPermission.actions] || false;
  };

  useEffect(() => {
    fetchUserPermissions();
  }, []);

  const value = {
    permissions,
    hasPermission,
    loading
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};
