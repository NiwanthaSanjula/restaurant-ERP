import ActivityLog from '../models/ActivityLog';
import { AuthRequest } from '../middleware/auth';

type LogParams = {
  req?: AuthRequest;
  user?: { userId?: string; username?: string; role?: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: any;
  after?: any;
};

export const logActivity = async (params: LogParams): Promise<void> => {
  try {
    const { req, user, action, entityType, entityId, before, after } = params;
    const authUser = user || (req?.user as any) || null;

    const metadata: any = {
      ip: req?.ip || null,
      userAgent: req?.get?.('User-Agent') || null,
      headers: req ? { 'x-forwarded-for': req.headers['x-forwarded-for'] || null } : {}
    };

    await ActivityLog.create({
      userId: authUser?.userId || authUser?._id || authUser?.id
        ? String(authUser.userId || authUser._id || authUser.id)
        : undefined,
      username: authUser?.username || authUser?.name || authUser?.email,
      role: authUser?.role,
      action,
      entityType,
      entityId: String(entityId),
      before,
      after,
      metadata
    });
  } catch (err) {
    console.error('logActivity failed:', err);
  }
};

export default logActivity;
