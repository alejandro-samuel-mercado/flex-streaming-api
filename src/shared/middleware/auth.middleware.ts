import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { AppError } from './error-handler';
import { UserRole } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    phone: string;
    role: UserRole;
  };
}

export const authenticate = async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    next(new AppError(401, 'No authentication token provided', 'UNAUTHORIZED'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
      sub: string;
      phone: string;
      role: UserRole;
    };

    // Instant session invalidation check
    if (payload.role === 'END_USER' || (payload.role as string) === 'CLIENT') {
       const user = await prisma.endUserAccount.findFirst({ where: { userId: payload.sub }, select: { deletedAt: true, status: true } });
       if (!user || user.deletedAt || !['ACTIVE', 'DEMO'].includes(user.status)) {
           next(new AppError(401, 'Account inactive or deleted', 'UNAUTHORIZED'));
           return;
       }
    } else {
       const sysUser = await prisma.user.findUnique({ where: { id: payload.sub }, select: { deletedAt: true, isActive: true } });
       if (!sysUser || sysUser.deletedAt || !sysUser.isActive) {
           next(new AppError(401, 'Account inactive or deleted', 'UNAUTHORIZED'));
           return;
       }
    }

    req.user = { id: payload.sub, phone: payload.phone, role: payload.role };
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN'));
  }
};

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

export const optionalAuth = async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
      sub: string;
      phone: string;
      role: UserRole;
    };

    // For optional auth, we don't strictly block if DB check fails, we just don't set req.user
    // But we still want to not authenticate deleted users.
    if (payload.role === 'END_USER' || (payload.role as string) === 'CLIENT') {
       const user = await prisma.endUserAccount.findFirst({ where: { userId: payload.sub }, select: { deletedAt: true, status: true } });
       if (user && !user.deletedAt && ['ACTIVE', 'DEMO'].includes(user.status)) {
           req.user = { id: payload.sub, phone: payload.phone, role: payload.role };
       }
    } else {
       const sysUser = await prisma.user.findUnique({ where: { id: payload.sub }, select: { deletedAt: true, isActive: true } });
       if (sysUser && !sysUser.deletedAt && sysUser.isActive) {
           req.user = { id: payload.sub, phone: payload.phone, role: payload.role };
       }
    }
  } catch {
    // token inválido — continúa como invitado
  }

  next();
};

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
