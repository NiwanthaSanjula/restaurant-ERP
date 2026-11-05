import React from 'react';
import type { ReactNode } from 'react';
import { usePermissions } from '../../contexts/PermissionContext';

interface PermissionGateProps {
  component: string;
  action: string;
  children: ReactNode;
  fallback?: ReactNode;
  mode?: 'hide' | 'disable';
}

const PermissionGate: React.FC<PermissionGateProps> = ({ 
  component, 
  action, 
  children, 
  fallback = null,
  mode = 'hide'
}) => {
  const { hasPermission, loading, isDemo } = usePermissions();
  
  // Show loading state while permissions are being fetched
  if (loading) {
    return <>{fallback}</>;
  }
  
  const hasAccess = hasPermission(component, action);
  
  if (!hasAccess) {
    if (isDemo) return <span data-demo-write aria-disabled="true" title="Read-only demo: changes are disabled." className="inline-flex opacity-50 [&>*]:pointer-events-none">{children}</span>;
    if (mode === 'disable' && React.isValidElement(children)) {
      // Type-safe cloning with proper type checking
      const element = children as React.ReactElement<any>;
      return React.cloneElement(element, { 
        disabled: true,
        className: `${element.props.className || ''} opacity-50 cursor-not-allowed`
      });
    }
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
};

export default PermissionGate;
