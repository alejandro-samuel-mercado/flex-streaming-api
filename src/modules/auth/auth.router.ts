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
import { ok } from '../../shared/utils/api-response';
import {
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    refreshTokenSchema,
} from './auth.schemas';
import * as authService from './auth.service';

export const authRouter = Router();


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
        const { phone } = forgotPasswordSchema.parse(req.body);
        await authService.forgotPassword(phone);
        ok(res, { message: 'If the phone exists, a reset link was sent' });
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
        const userId = authReq.user!.id;

        // Handle virtual end-user accounts (their JWT sub is VIRTUAL_<accountId>)
        if (userId.startsWith('VIRTUAL_')) {
            const accountId = userId.replace('VIRTUAL_', '');
            const account = await prisma.endUserAccount.findUnique({
                where: { id: accountId },
                select: {
                    id: true,
                    username: true,
                    status: true,
                    type: true,
                    planId: true,
                    endDate: true,
                    maxDevices: true,
                    plan: { select: { id: true, name: true, durationDays: true, bonusDays: true } },
                    profiles: {
                        select: { id: true, name: true, avatar: true, isKids: true, language: true },
                        orderBy: { createdAt: 'asc' },
                    },
                },
            });
            if (!account) return next(new Error('Account not found'));
            // Shape the response to match the regular user structure
            return ok(res, {
                id: `VIRTUAL_${account.id}`,
                name: account.username,
                email: null,
                role: 'END_USER',
                profiles: account.profiles,
                endUserAccount: {
                    id: account.id,
                    status: account.status,
                    type: account.type,
                    planId: account.planId,
                    endDate: account.endDate,
                    maxDevices: account.maxDevices,
                    plan: account.plan,
                },
            });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                phone: true,
                name: true,
                role: true,
                credits: true,
                preferredLang: true,
                createdAt: true,
                profiles: {
                    select: { id: true, name: true, avatar: true, isKids: true, language: true },
                    orderBy: { createdAt: 'asc' },
                },
                endUserAccount: {
                    select: {
                        id: true,
                        status: true,
                        type: true,
                        planId: true,
                        endDate: true,
                        maxDevices: true,
                        plan: { select: { id: true, name: true, durationDays: true, bonusDays: true } }
                    }
                }
            },
        });
        ok(res, user);
    } catch (err) {
        next(err);
    }
});
