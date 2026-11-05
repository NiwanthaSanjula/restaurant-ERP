import { NextFunction, Response } from 'express';
import { AuthRequest, authenticate } from './auth';
import { apiPolicy, safePreview } from './apiPolicy';
import { checkPermissionInMap, getRolePermissions } from '../config/rbac';
import { demoResponse } from '../utils/demoResponse';

const publicReads = new Set(['/health', '/branding']);
const publicAuth = new Set(['POST /auth/login', 'POST /auth/demo', 'POST /auth/forgot-password', 'POST /auth/initial-run', 'PUT /auth/reset-password']);

/** Mounted before every business router, validators and multipart parsers. */
export async function publicApiBoundary(req: AuthRequest, res: Response, next: NextFunction) {
  const path = req.path.replace(/\/$/, '') || '/';
  const reading = ['GET', 'HEAD'].includes(req.method);
  if (reading && publicReads.has(path)) return next();
  const publicAuthentication = publicAuth.has(`${req.method} ${path}`);
  if (publicAuthentication && !req.header('Authorization')) return next();
  await authenticate(req, res, async () => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.isDemo && path !== '/auth/demo/exit' && !(req.method === 'POST' && path === '/auth/demo') && !reading && !safePreview(path, req.method)) {
      res.status(403).json({ status: 'error', code: 'demo_read_only', message: 'Read-only demo: changes, uploads and external actions are disabled.' }); return;
    }
    if (publicAuthentication || (path === '/auth/demo/exit' && req.method === 'POST')) return next();
    const policy = apiPolicy(path, req.method);
    if (!policy) { res.status(404).json({ status: 'error', message: 'Route not found' }); return; }
    const isRead = reading || safePreview(path, req.method);
    const requirements = isRead ? policy.reads : policy.writes;
    if (!requirements) { res.status(403).json({ status: 'error', message: 'This operation is not permitted.' }); return; }
    try {
      const grants = await getRolePermissions(req.user!);
      const checks = requirements.map(([component, action]) => checkPermissionInMap(grants, component, action));
      if (!grants || ((isRead ? policy.anyRead : policy.anyWrite) ? !checks.some(Boolean) : checks.some(v => !v))) {
        res.status(403).json({ status: 'error', message: 'Access denied. The required permission is not granted.' }); return;
      }
      if (req.isDemo) {
        req.demoReadAuthorized = true;
        const send = res.json.bind(res);
        res.json = (body: unknown) => send(demoResponse(body, policy.resource, res.statusCode));
        // A visitor previews POS without opening, joining or changing a real register.
        if (path === '/pos/active') { res.json({ status: 'success', data: null }); return; }
      }
      next();
    } catch { res.status(500).json({ status: 'error', message: 'Access could not be verified.' }); }
  });
}
