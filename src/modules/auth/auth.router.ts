/**
 * Auth Router — PeliPlus
 *
 * Routes: POST /auth/register, /auth/login, /auth/logout, /auth/refresh,
 *         /auth/forgot-password, /auth/reset-password, GET /auth/me
 *
 * All inputs validated via Zod schemas. Responses use shared api-response helpers.
 */

import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { authenticate, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok, created } from '../../shared/utils/api-response';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from './auth.schemas';
import * as authService from './auth.service';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input);
    created(res, result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input);
    ok(res, result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    await authService.logout(refreshToken);
    ok(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    const result = await authService.refreshAccessToken(refreshToken);
    ok(res, result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(email);
    ok(res, { message: 'If the email exists, a reset link was sent' });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    ok(res, { message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate as RequestHandler, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { prisma } = await import('../../shared/config/prisma');
    const user = await prisma.user.findUnique({
      where: { id: authReq.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        preferredLang: true,
        createdAt: true,
        profiles: {
          select: { id: true, name: true, avatar: true, isKids: true, language: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    ok(res, user);
  } catch (err) {
    next(err);
  }
});
