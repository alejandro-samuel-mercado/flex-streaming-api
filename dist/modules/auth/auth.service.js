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
// 180 días — sesión persistente por meses
const REFRESH_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;
function generateTokens(userId, phone, role) {
    const accessToken = jsonwebtoken_1.default.sign({ sub: userId, phone, role }, env_1.env.JWT_ACCESS_SECRET, { expiresIn: env_1.env.JWT_ACCESS_EXPIRES_IN });
    const refreshToken = (0, uuid_1.v4)();
    return { accessToken, refreshToken };
}
async function register(input) {
    const existing = await prisma_1.prisma.user.findUnique({ where: { phone: input.phone } });
    if (existing) {
        throw new error_handler_1.AppError(409, 'Phone already registered', 'PHONE_EXISTS');
    }
    const passwordHash = await bcrypt_1.default.hash(input.password, BCRYPT_ROUNDS);
    const user = await prisma_1.prisma.user.create({
        data: {
            name: input.name,
            phone: input.phone,
            passwordHash,
        },
        select: { id: true, phone: true, name: true, role: true },
    });
    const { accessToken, refreshToken } = generateTokens(user.id, user.phone, user.role);
    await redis_1.redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, REFRESH_TOKEN_TTL_SECONDS, user.id);
    await prisma_1.prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        },
    });
    return { user, accessToken, refreshToken };
}
async function login(input) {
    // 1. Try finding in normal User table (identifier as username OR phone)
    let user = await prisma_1.prisma.user.findFirst({
        where: {
            OR: [
                { username: input.username },
                { phone: input.username }
            ],
            deletedAt: null
        }
    });
    // 2. If not found, try finding in EndUserAccount table (identifier as username)
    if (!user) {
        const endUser = await prisma_1.prisma.endUserAccount.findUnique({
            where: { username: input.username },
            include: { user: true },
        });
        if (endUser) {
            // If endUser exists but has no linked User record, we treat it as a virtual user for JWT
            // Or we can check password against endUser.passwordHash
            const passwordValid = await bcrypt_1.default.compare(input.password, endUser.passwordHash);
            if (!passwordValid)
                throw new error_handler_1.AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
            // Handle INACTIVE accounts with a plan: activate on first login
            if (endUser.status === 'INACTIVE' && endUser.planId) {
                const plan = await prisma_1.prisma.subscriptionPlan.findUnique({ where: { id: endUser.planId } });
                if (plan) {
                    const now = new Date();
                    const totalDays = plan.durationDays + (plan.bonusDays ?? 0);
                    const endDate = new Date(now.getTime() + totalDays * 24 * 60 * 60 * 1000);
                    await prisma_1.prisma.endUserAccount.update({
                        where: { id: endUser.id },
                        data: {
                            status: 'ACTIVE',
                            startDate: now,
                            endDate,
                        },
                    });
                    // Update local reference for the response
                    endUser.status = 'ACTIVE';
                }
            }
            // Handle DEMO accounts: check if demo period has expired
            if (endUser.status === 'DEMO' && endUser.endDate && new Date(endUser.endDate) < new Date()) {
                await prisma_1.prisma.endUserAccount.update({
                    where: { id: endUser.id },
                    data: { status: 'EXPIRED' },
                });
                throw new error_handler_1.AppError(403, 'Demo period has expired', 'ACCOUNT_RESTRICTED');
            }
            // Block other restricted statuses
            if (endUser.status === 'PAUSED' || endUser.status === 'EXPIRED') {
                throw new error_handler_1.AppError(403, `Account is ${endUser.status.toLowerCase()}`, 'ACCOUNT_RESTRICTED');
            }
            // Block INACTIVE accounts without a plan
            if (endUser.status === 'INACTIVE') {
                throw new error_handler_1.AppError(403, 'Account has no active plan', 'ACCOUNT_RESTRICTED');
            }
            // Check if active account has expired
            if (endUser.status === 'ACTIVE' && endUser.endDate && new Date(endUser.endDate) < new Date()) {
                await prisma_1.prisma.endUserAccount.update({
                    where: { id: endUser.id },
                    data: { status: 'EXPIRED' },
                });
                throw new error_handler_1.AppError(403, 'Account has expired', 'ACCOUNT_RESTRICTED');
            }
            // Device limits & Auto-disconnect logic
            const deviceToken = input.deviceId || (0, uuid_1.v4)();
            const deviceName = input.deviceName || 'Web Browser';
            const deviceType = input.deviceType || 'WEB';
            const activeSessions = await prisma_1.prisma.deviceSession.findMany({
                where: { endUserAccountId: endUser.id, isActive: true },
                orderBy: { lastSeen: 'asc' },
            });
            if (activeSessions.length >= endUser.maxDevices) {
                const numToDisconnect = activeSessions.length - endUser.maxDevices + 1;
                const sessionsToDisconnect = activeSessions.slice(0, numToDisconnect);
                await prisma_1.prisma.deviceSession.updateMany({
                    where: { id: { in: sessionsToDisconnect.map((s) => s.id) } },
                    data: { isActive: false },
                });
            }
            await prisma_1.prisma.deviceSession.upsert({
                where: { deviceToken },
                create: {
                    deviceToken,
                    deviceName,
                    deviceType,
                    isActive: true,
                    lastSeen: new Date(),
                    endUserAccountId: endUser.id,
                },
                update: {
                    isActive: true,
                    deviceName,
                    lastSeen: new Date(),
                    endUserAccountId: endUser.id,
                },
            });
            // Ensure the endUser has a linked User record to support profiles, history, etc.
            if (!endUser.userId) {
                const clientEmail = `${endUser.username}@client.flex`;
                // Check if user with this phone already exists (edge case)
                let linkedUser = await prisma_1.prisma.user.findUnique({ where: { phone: clientEmail } });
                if (!linkedUser) {
                    linkedUser = await prisma_1.prisma.user.create({
                        data: {
                            phone: clientEmail,
                            name: endUser.username,
                            role: 'END_USER',
                            isActive: true,
                            profiles: {
                                create: {
                                    name: endUser.username,
                                    isKids: false,
                                }
                            }
                        }
                    });
                }
                await prisma_1.prisma.endUserAccount.update({
                    where: { id: endUser.id },
                    data: { userId: linkedUser.id }
                });
                endUser.userId = linkedUser.id;
                endUser.user = linkedUser;
            }
            else {
                // Ensure they have at least one profile
                const profileCount = await prisma_1.prisma.profile.count({ where: { userId: endUser.userId } });
                if (profileCount === 0) {
                    await prisma_1.prisma.profile.create({
                        data: {
                            userId: endUser.userId,
                            name: endUser.username,
                        }
                    });
                }
            }
            // Return a virtual user object for the token
            // JWT sub = real User.id (not endUserAccount.id) so /auth/me can look up the User
            const { accessToken, refreshToken } = generateTokens(endUser.userId, endUser.username, 'END_USER');
            // Redis key stores VIRTUAL_<endUserAccount.id> so refresh can identify the account
            await redis_1.redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, REFRESH_TOKEN_TTL_SECONDS, `VIRTUAL_${endUser.id}`);
            await prisma_1.prisma.refreshToken.create({
                data: {
                    token: refreshToken,
                    userId: endUser.userId, // real User.id for FK constraint
                    endUserAccountId: endUser.id, // endUserAccount.id for account association
                    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
                },
            });
            return {
                user: { id: endUser.id, phone: endUser.username, name: endUser.username, role: 'END_USER' },
                accessToken,
                refreshToken,
            };
        }
    }
    // 3. Fallback to normal user logic if found in step 1
    if (!user || !user.passwordHash || !user.isActive) {
        throw new error_handler_1.AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }
    const passwordValid = await bcrypt_1.default.compare(input.password, user.passwordHash);
    if (!passwordValid) {
        throw new error_handler_1.AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }
    const { accessToken, refreshToken } = generateTokens(user.id, user.username || user.phone, user.role);
    await redis_1.redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, REFRESH_TOKEN_TTL_SECONDS, user.id);
    await prisma_1.prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        },
    });
    const safeUser = {
        id: user.id,
        phone: user.phone,
        username: user.username,
        name: user.name,
        role: user.role,
    };
    return { user: safeUser, accessToken, refreshToken };
}
async function refreshAccessToken(refreshToken) {
    // Redis stores the "owner" of this refresh token.
    // For END_USERs: "VIRTUAL_<endUserAccount.id>"
    // For normal users: "<User.id>"
    const storedValue = await redis_1.redis.get(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
    if (!storedValue) {
        throw new error_handler_1.AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }
    let jwtSubject; // the `sub` claim for the new accessToken
    let phone;
    let role;
    let dbUserId = null; // real User.id for Prisma FK
    let dbEndUserAccountId = null; // EndUserAccount.id for Prisma FK
    if (storedValue.startsWith('VIRTUAL_')) {
        // END_USER path — storedValue = "VIRTUAL_<endUserAccount.id>"
        const accountId = storedValue.replace('VIRTUAL_', '');
        const account = await prisma_1.prisma.endUserAccount.findUnique({
            where: { id: accountId },
            select: { id: true, username: true, status: true, userId: true },
        });
        if (!account || account.status === 'EXPIRED' || account.status === 'PAUSED') {
            throw new error_handler_1.AppError(401, 'Account restricted or not found', 'INVALID_REFRESH_TOKEN');
        }
        // JWT sub must be the real User.id so /auth/me can resolve the User record
        jwtSubject = account.userId ?? accountId;
        phone = account.username;
        role = 'END_USER';
        dbUserId = account.userId ?? null;
        dbEndUserAccountId = account.id;
    }
    else {
        // Normal user path — storedValue = "<User.id>"
        const realUser = await prisma_1.prisma.user.findUnique({
            where: { id: storedValue },
            select: { id: true, phone: true, username: true, role: true, isActive: true },
        });
        if (!realUser || !realUser.isActive) {
            throw new error_handler_1.AppError(401, 'User not found or inactive', 'INVALID_REFRESH_TOKEN');
        }
        jwtSubject = realUser.id;
        phone = realUser.username || realUser.phone;
        role = realUser.role;
        dbUserId = realUser.id;
    }
    // Rotate refresh token — invalidate old one
    await redis_1.redis.del(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
    await prisma_1.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    // Generate new token pair
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(jwtSubject, phone, role);
    // Store new refresh token in Redis with 180-day TTL
    const redisValue = dbEndUserAccountId ? `VIRTUAL_${dbEndUserAccountId}` : jwtSubject;
    await redis_1.redis.setex(`${REFRESH_TOKEN_PREFIX}${newRefreshToken}`, REFRESH_TOKEN_TTL_SECONDS, redisValue);
    // Store in DB with correct FK references
    await prisma_1.prisma.refreshToken.create({
        data: {
            token: newRefreshToken,
            userId: dbUserId,
            endUserAccountId: dbEndUserAccountId,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        },
    });
    return { accessToken, refreshToken: newRefreshToken };
}
async function logout(refreshToken) {
    await redis_1.redis.del(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
    await prisma_1.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}
async function forgotPassword(phone) {
    const user = await prisma_1.prisma.user.findUnique({ where: { phone } });
    if (!user)
        return; // Silent — don't reveal if phone exists
    const resetToken = (0, uuid_1.v4)();
    await redis_1.redis.setex(`${RESET_TOKEN_PREFIX}${resetToken}`, RESET_TOKEN_TTL, user.id);
    // TODO: send sms with resetToken link
    console.log(`[Auth] Password reset token for ${phone}: ${resetToken}`);
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
        user = await prisma_1.prisma.user.findUnique({ where: { phone: googleProfile.email } });
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
                    phone: googleProfile.email,
                    name: googleProfile.name,
                },
            });
        }
    }
    const { accessToken, refreshToken } = generateTokens(user.id, user.phone, user.role);
    await redis_1.redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, REFRESH_TOKEN_TTL_SECONDS, user.id);
    await prisma_1.prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        },
    });
    return { user, accessToken, refreshToken };
}
//# sourceMappingURL=auth.service.js.map