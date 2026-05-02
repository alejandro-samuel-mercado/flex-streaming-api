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
exports.authRouter.post('/register', async (req, res, next) => {
    try {
        const input = auth_schemas_1.registerSchema.parse(req.body);
        const result = await authService.register(input);
        (0, api_response_1.created)(res, result);
    }
    catch (err) {
        next(err);
    }
});
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
        const { email } = auth_schemas_1.forgotPasswordSchema.parse(req.body);
        await authService.forgotPassword(email);
        (0, api_response_1.ok)(res, { message: 'If the email exists, a reset link was sent' });
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
exports.authRouter.get('/me', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const authReq = req;
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../../shared/config/prisma')));
        const user = await prisma.user.findUnique({
            where: { id: authReq.user.id },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                credits: true,
                preferredLang: true,
                createdAt: true,
                profiles: {
                    select: { id: true, name: true, avatar: true, isKids: true, language: true },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        (0, api_response_1.ok)(res, user);
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=auth.router.js.map