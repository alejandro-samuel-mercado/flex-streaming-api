"use strict";
/**
 * Auth Router — PeliPlus
 *
 * Routes: POST /auth/register, /auth/login, /auth/logout, /auth/refresh,
 *         /auth/forgot-password, /auth/reset-password, GET /auth/me
 *
 * All inputs validated via Zod schemas. Responses use shared api-response helpers.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
const auth_schemas_1 = require("./auth.schemas");
const authService = __importStar(require("./auth.service"));
exports.authRouter = (0, express_1.Router)();
exports.authRouter.post('/login', async (req, res, next) => {
    try {
        const input = auth_schemas_1.loginSchema.parse(req.body);
        const result = await authService.login(input);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.post('/logout', async (req, res, next) => {
    try {
        const { refreshToken } = auth_schemas_1.refreshTokenSchema.parse(req.body);
        await authService.logout(refreshToken);
        (0, api_response_1.ok)(res, { message: 'Logged out successfully' });
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.post('/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = auth_schemas_1.refreshTokenSchema.parse(req.body);
        const result = await authService.refreshAccessToken(refreshToken);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.post('/forgot-password', async (req, res, next) => {
    try {
        const { phone } = auth_schemas_1.forgotPasswordSchema.parse(req.body);
        await authService.forgotPassword(phone);
        (0, api_response_1.ok)(res, { message: 'If the phone exists, a reset link was sent' });
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.post('/reset-password', async (req, res, next) => {
    try {
        const { token, password } = auth_schemas_1.resetPasswordSchema.parse(req.body);
        await authService.resetPassword(token, password);
        (0, api_response_1.ok)(res, { message: 'Password updated successfully' });
    }
    catch (err) {
        next(err);
    }
});
exports.authRouter.post('/change-password', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const authReq = req;
        const userId = authReq.user.id;
        if (userId.startsWith('VIRTUAL_')) {
            res.status(403).json({ success: false, error: 'End users cannot change password this way' });
            return;
        }
        const { currentPassword, newPassword } = auth_schemas_1.changePasswordSchema.parse(req.body);
        await authService.changePassword(userId, currentPassword, newPassword);
        (0, api_response_1.ok)(res, { message: 'Password changed successfully' });
    }
    catch (err) {
        if (err.message === 'La contraseña actual es incorrecta') {
            res.status(400).json({ success: false, error: err.message });
            return;
        }
        next(err);
    }
});
exports.authRouter.get('/me', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const authReq = req;
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../../shared/config/prisma')));
        const userId = authReq.user.id;
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
                    startDate: true,
                    endDate: true,
                    maxDevices: true,
                    deletedAt: true,
                    plan: { select: { id: true, name: true, durationDays: true, bonusDays: true } },
                },
            });
            if (!account || account.deletedAt)
                return res.status(401).json({ success: false, error: 'Account has been deleted', code: 'UNAUTHORIZED' });
            if (account.plan && account.startDate && account.endDate) {
                const start = account.startDate.getTime();
                const end = account.endDate.getTime();
                const totalDays = Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
                account.plan.durationDays = totalDays;
                account.plan.bonusDays = 0;
            }
            // Shape the response to match the regular user structure
            // End-users don't have profiles (they access content directly)
            return (0, api_response_1.ok)(res, {
                id: `VIRTUAL_${account.id}`,
                name: account.username,
                email: null,
                role: 'END_USER',
                profiles: [],
                endUserAccount: {
                    id: account.id,
                    status: account.status,
                    type: account.type,
                    planId: account.planId,
                    startDate: account.startDate,
                    endDate: account.endDate,
                    maxDevices: account.maxDevices,
                    plan: account.plan ?? null,
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
                        startDate: true,
                        endDate: true,
                        maxDevices: true,
                        plan: { select: { id: true, name: true, durationDays: true, bonusDays: true } }
                    }
                }
            },
        });
        if (user && user.endUserAccount && user.endUserAccount.startDate && user.endUserAccount.endDate && user.endUserAccount.plan) {
            const start = user.endUserAccount.startDate.getTime();
            const end = user.endUserAccount.endDate.getTime();
            const totalDays = Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
            user.endUserAccount.plan.durationDays = totalDays;
            user.endUserAccount.plan.bonusDays = 0;
        }
        (0, api_response_1.ok)(res, user);
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=auth.router.js.map