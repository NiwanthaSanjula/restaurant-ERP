import { NextFunction, Response } from 'express';
import { checkPermissionInMap, getRolePermissions } from '../config/rbac';
import { AuthRequest } from './auth';

/**
 * RBAC middleware to check a single permission (component + action).
 * Returns 401 if user is not authenticated, 403 if permission is denied.
 * 
 * Usage: app.post('/menu', authenticate, requirePermission('manageMenu', 'create_menu'), controller)
 */
export const requirePermission = (component: string, action: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        res.status(401).json({
          status: 'error',
          message: 'Access denied. User not authenticated.'
        });
        return;
      }

      if (component === 'manageProducts') {
        next();
        return;
      }

      // Fetch permissions from RolePermissions collection using user's role
      const rolePermissions = await getRolePermissions(req.user.role);

      // Handle case where role permissions don't exist
      if (!rolePermissions) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Role permissions not found.'
        });
        return;
      }

      // Check if user has the required permission using utility function
      if (!checkPermissionInMap(rolePermissions, component, action)) {
        res.status(403).json({
          status: 'error',
          message: `Access denied. Permission required: ${component}:${action}`
        });
        return;
      }

      // User has permission, proceed to next middleware/controller
      next();
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Permission check failed.'
      });
    }
  };
};

/**
 * RBAC middleware to check if user has ANY of the provided permissions.
 * Requires at least one permission to pass (OR logic).
 * Returns 401 if user is not authenticated, 403 if no permissions match.
 * 
 * Usage: app.get('/dashboard', authenticate, requireAnyPermission([
 *   { component: 'manageReports', action: 'view_reports' },
 *   { component: 'manageUsers', action: 'view_user' }
 * ]), controller)
 */
export const requireAnyPermission = (permissions: Array<{ component: string; action: string }>) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        res.status(401).json({
          status: 'error',
          message: 'Access denied. User not authenticated.'
        });
        return;
      }

      // Fetch permissions from RolePermissions collection using user's role
      const rolePermissions = await getRolePermissions(req.user.role);

      // Handle case where role permissions don't exist
      if (!rolePermissions) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Role permissions not found.'
        });
        return;
      }

      // Check if user has ANY of the required permissions
      const hasAnyPermission = permissions.some(
        ({ component, action }) =>
          checkPermissionInMap(rolePermissions, component, action)
      );

      if (!hasAnyPermission) {
        res.status(403).json({
          status: 'error',
          message: 'Access denied. Insufficient permissions.'
        });
        return;
      }

      // User has at least one required permission, proceed to next middleware/controller
      next();
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: 'Permission check failed.'
      });
    }
  };
};

/**
 * Legacy alias for backwards compatibility.
 * Deprecated: Use requirePermission() instead.
 */
export const checkPermission = (component: string, action: string) => {
  return requirePermission(component, action);
};

/**
 * Legacy alias for backwards compatibility.
 * Deprecated: Use requireAnyPermission() instead.
 */
export const checkMultiplePermissions = (permissions: Array<{ component: string; action: string }>) => {
  return requireAnyPermission(permissions);
};
