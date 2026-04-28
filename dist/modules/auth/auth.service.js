"use strict";
/**
 * Auth Service — PeliPlus
 *
 * Handles: user registration, login, JWT generation/rotation, refresh tokens stored in Redis,
 * Google OAuth, and password reset via email token.
 *
 * Dependencies: Prisma (users, refreshTokens), Redis (token storage), bcrypt, jsonwebtoken, nodemailer
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.refreshAccessToken = refreshAccessToken;
exports.logout = logout;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
exports.findOrCreateGoogleUser = findOrCreateGoogleUser;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const prisma_1 = require("../../shared/config/prisma");
const redis_1 = require("../../shared/config/redis");
const env_1 = require("../../shared/config/env");
const error_handler_1 = require("../../shared/middleware/error-handler");
const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_PREFIX = 'refresh:';
const RESET_TOKEN_PREFIX = 'reset:';
const RESET_TOKEN_TTL = 60 * 60; // 1 hour
function generateTokens(userId, email, role) {
    const accessToken = jsonwebtoken_1.default.sign({ sub: userId, email, role }, env_1.env.JWT_ACCESS_SECRET, { expiresIn: env_1.env.JWT_ACCESS_EXPIRES_IN });
    const refreshToken = (0, uuid_1.v4)();
    return { accessToken, refreshToken };
}
async function register(input) {
    const existing = await prisma_1.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
        throw new error_handler_1.AppError(409, 'Email already registered', 'EMAIL_EXISTS');
    }
    const passwordHash = await bcrypt_1.default.hash(input.password, BCRYPT_ROUNDS);
    const user = await prisma_1.prisma.user.create({
        data: {
            name: input.name,
            email: input.email,
            passwordHash,
        },
        select: { id: true, email: true, name: true, role: true },
    });
    const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);
    const refreshTtlSeconds = 30 * 24 * 60 * 60; // 30 days
    await redis_1.redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, refreshTtlSeconds, user.id);
    await prisma_1.prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
        },
    });
    return { user, accessToken, refreshToken };
}
async function login(input) {
    const user = await prisma_1.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.passwordHash || !user.isActive) {
        throw new error_handler_1.AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }
    const passwordValid = await bcrypt_1.default.compare(input.password, user.passwordHash);
    if (!passwordValid) {
        throw new error_handler_1.AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }
    const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);
    const refreshTtlSeconds = 30 * 24 * 60 * 60;
    await redis_1.redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, refreshTtlSeconds, user.id);
    await prisma_1.prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
        },
    });
    const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
    };
    return { user: safeUser, accessToken, refreshToken };
}
async function refreshAccessToken(refreshToken) {
    const userId = await redis_1.redis.get(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
    if (!userId) {
        throw new error_handler_1.AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) {
        throw new error_handler_1.AppError(401, 'User not found or inactive', 'INVALID_REFRESH_TOKEN');
    }
    // Rotate refresh token
    await redis_1.redis.del(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
    await prisma_1.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.email, user.role);
    const refreshTtlSeconds = 30 * 24 * 60 * 60;
    await redis_1.redis.setex(`${REFRESH_TOKEN_PREFIX}${newRefreshToken}`, refreshTtlSeconds, user.id);
    await prisma_1.prisma.refreshToken.create({
        data: {
            token: newRefreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
        },
    });
    return { accessToken, refreshToken: newRefreshToken };
}
async function logout(refreshToken) {
    await redis_1.redis.del(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
    await prisma_1.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}
async function forgotPassword(email) {
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user)
        return; // Silent — don't reveal if email exists
    const resetToken = (0, uuid_1.v4)();
    await redis_1.redis.setex(`${RESET_TOKEN_PREFIX}${resetToken}`, RESET_TOKEN_TTL, user.id);
    // TODO: send email with resetToken link when SMTP is configured
    console.log(`[Auth] Password reset token for ${email}: ${resetToken}`);
}
async function resetPassword(token, newPassword) {
    const userId = await redis_1.redis.get(`${RESET_TOKEN_PREFIX}${token}`);
    if (!userId) {
        throw new error_handler_1.AppError(400, 'Invalid or expired reset token', 'INVALID_RESET_TOKEN');
    }
    const passwordHash = await bcrypt_1.default.hash(newPassword, BCRYPT_ROUNDS);
    await prisma_1.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await redis_1.redis.del(`${RESET_TOKEN_PREFIX}${token}`);
}
async function findOrCreateGoogleUser(googleProfile) {
    let user = await prisma_1.prisma.user.findUnique({ where: { googleId: googleProfile.id } });
    if (!user) {
        user = await prisma_1.prisma.user.findUnique({ where: { email: googleProfile.email } });
        if (user) {
            user = await prisma_1.prisma.user.update({
                where: { id: user.id },
                data: { googleId: googleProfile.id },
            });
        }
        else {
            user = await prisma_1.prisma.user.create({
                data: {
                    googleId: googleProfile.id,
                    email: googleProfile.email,
                    name: googleProfile.name,
                },
            });
        }
    }
    const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);
    const refreshTtlSeconds = 30 * 24 * 60 * 60;
    await redis_1.redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, refreshTtlSeconds, user.id);
    await prisma_1.prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
        },
    });
    return { user, accessToken, refreshToken };
}
//# sourceMappingURL=auth.service.js.map