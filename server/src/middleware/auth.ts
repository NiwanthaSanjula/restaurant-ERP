import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import { resolveRoleAccess } from '../config/rbac';

export interface AuthRequest extends Request {
  user?: IUser;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({
        status: 'error',
        message: 'Access denied. No token provided.'
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user) {
      res.status(401).json({
        status: 'error',
        message: 'Invalid token. User not found.'
      });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({
        status: 'error',
        message: 'Account is deactivated.'
      });
      return;
    }

    if (!await resolveRoleAccess(user)) {
      res.status(403).json({ status: 'error', message: 'An active, valid assigned role is required.' });
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      status: 'error',
      message: 'Invalid token.'
    });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Access denied. User not authenticated.'
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied. Insufficient permissions.'
      });
      return;
    }

    next();
  };
};
