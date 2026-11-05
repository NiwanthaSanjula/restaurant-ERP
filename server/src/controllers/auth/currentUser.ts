import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { clientPermissionMap, resolveRoleAccess } from '../../config/rbac';

export async function getCurrentUser(req: AuthRequest, res: Response) {
  if (!req.user) { return res.status(401).json({ status: 'error', message: 'Authentication required.' }); }
  try {
    const access = await resolveRoleAccess(req.user);
    if (!access) return res.status(403).json({ status: 'error', message: 'An active, valid assigned role is required.' });
    return res.json({ status: 'success', data: { user: {
      id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role,
      roleId: access.roleId, roleName: access.roleName, permissions: clientPermissionMap(access.permissions), isDemo: req.isDemo === true
    } } });
  } catch {
    return res.status(500).json({ status: 'error', message: 'Unable to load permissions.' });
  }
}
