import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './error-handler';
import { UserRole } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
  };
}

export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    next(new AppError(401, 'No authentication token provided', 'UNAUTHORIZED'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
      sub: string;
      email: string;
      role: UserRole;
    };

    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN'));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, 'Insufficient permissions', 'FORBIDDEN'));
      return;
    }
    next();
  };
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
      sub: string;
      email: string;
      role: UserRole;
    };
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
  } catch {
    // token inválido — continúa como invitado
  }

  next();
}

export function requireAnyRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'Authentication required', 'UNAUTHORIZED'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, 'Insufficient permissions', 'FORBIDDEN'));
      return;
    }
    next();
  };
}

export const requireAdmin = requireRole('ADMIN');
export const requireSuperVendorOrAbove = requireAnyRole('ADMIN', 'SUPER_VENDOR');
export const requireVendorOrAbove = requireAnyRole('ADMIN', 'SUPER_VENDOR', 'VENDOR');
