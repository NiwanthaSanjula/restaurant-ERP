import { Request, Response } from 'express';
import User from '../models/User';
import { PUBLIC_DEMO_USER_ID, validPublicDemoIdentity } from '../config/publicDemo';
import { clientPermissionMap, resolveRoleAccess } from '../config/rbac';
import { allowDemoLogin, createDemoSession, revokeDemoSession } from '../services/publicDemoSessions';
import { AuthRequest } from '../middleware/auth';
import { isIP } from 'net';

export function demoClientAddress(req: Request) {
  // Vercel overwrites these forwarding headers at its own ingress. A direct local
  // Express request must never be able to choose its own throttling address.
  const forwarded = process.env.VERCEL === '1' ? req.get('x-forwarded-for')?.split(',')[0]?.trim() : undefined;
  return forwarded && isIP(forwarded) ? forwarded : req.ip || req.socket.remoteAddress || 'local';
}

export async function postPublicDemo(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!await allowDemoLogin(demoClientAddress(req))) { res.setHeader('Retry-After', '900'); return res.status(429).json({ status: 'error', message: 'Too many demo requests. Please try again later.' }); }
  } catch { return res.status(503).json({ status: 'error', message: 'Public demo session storage is unavailable. Please try again later.' }); }
  if (req.body && Object.keys(req.body).length) return res.status(400).json({ status: 'error', message: 'Try Demo does not accept identity, role or permission input.' });
  try {
    const user = await User.findById(PUBLIC_DEMO_USER_ID).select('_id name role roleId isActive isPublicDemo');
    const access = user ? await resolveRoleAccess(user) : null;
    if (!user || !validPublicDemoIdentity(user, access) || !access) return res.status(503).json({ status: 'error', message: 'The public demo is not configured. Please contact the project owner.' });
    const token = await createDemoSession();
    return res.json({ status: 'success', data: { token, prefixSetupRequired: false, user: { id: user._id, name: user.name, role: 'staff', roleId: access.roleId, roleName: access.roleName, permissions: clientPermissionMap(access.permissions), isDemo: true } } });
  } catch { return res.status(503).json({ status: 'error', message: 'The public demo is temporarily unavailable.' }); }
}
export async function exitPublicDemo(req: AuthRequest, res: Response) {
  if (!req.isDemo || !req.demoSessionId) return res.status(400).json({ status: 'error', message: 'No demo session is active.' });
  try { await revokeDemoSession(req.demoSessionId); return res.json({ status: 'success', message: 'Demo session ended.' }); }
  catch { return res.status(503).json({ status: 'error', message: 'The demo session could not be ended. Please retry.' }); }
}
