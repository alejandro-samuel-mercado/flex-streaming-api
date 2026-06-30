/**
 * Auth Service — PeliPlus
 *
 * Handles: user registration, login, JWT generation/rotation, refresh tokens stored in Redis,
 * Google OAuth, and password reset via email token.
 *
 * Dependencies: Prisma (users, refreshTokens), Redis (token storage), bcrypt, jsonwebtoken, nodemailer
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../shared/config/prisma';
import { redis } from '../../shared/config/redis';
import { env } from '../../shared/config/env';
import { AppError } from '../../shared/middleware/error-handler';
import type { RegisterInput, LoginInput } from './auth.schemas';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_PREFIX = 'refresh:';
const RESET_TOKEN_PREFIX = 'reset:';
const RESET_TOKEN_TTL = 60 * 60; // 1 hour

// 180 días — sesión persistente por meses
const REFRESH_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;

function generateTokens(userId: string, phone: string, role: string) {
  const accessToken = jwt.sign(
    { sub: userId, phone, role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any }
  );

  const refreshToken = uuidv4();

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) {
    throw new AppError(409, 'Phone already registered', 'PHONE_EXISTS');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      phone: input.phone,
      passwordHash,
    },
    select: { id: true, phone: true, name: true, role: true },
  });

  const { accessToken, refreshToken } = generateTokens(user.id, user.phone, user.role);

  await redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, REFRESH_TOKEN_TTL_SECONDS, user.id);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  return { user, accessToken, refreshToken };
}

export async function login(input: LoginInput) {
  // 1. Try finding in normal User table (identifier as username OR phone)
  let user = await prisma.user.findFirst({
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
    const endUser = await prisma.endUserAccount.findUnique({
      where: { username: input.username },
      include: { user: true },
    });

    if (endUser && endUser.deletedAt) {
      throw new AppError(401, 'Account has been deleted', 'INVALID_CREDENTIALS');
    }

    if (endUser) {
      // If endUser exists but has no linked User record, we treat it as a virtual user for JWT
      // Or we can check password against endUser.passwordHash
      const passwordValid = await bcrypt.compare(input.password, endUser.passwordHash);
      if (!passwordValid) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
      
      // Handle INACTIVE accounts with a plan: activate on first login
      if (endUser.status === 'INACTIVE' && endUser.planId) {
        const plan = await prisma.subscriptionPlan.findUnique({ where: { id: endUser.planId } });
        if (plan) {
          const now = new Date();
          const totalDays = plan.durationDays + (plan.bonusDays ?? 0);
          const endDate = new Date(now.getTime() + totalDays * 24 * 60 * 60 * 1000);

          await prisma.endUserAccount.update({
            where: { id: endUser.id },
            data: {
              status: 'ACTIVE',
              startDate: now,
              endDate,
            },
          });
          // Update local reference for the response
          endUser.status = 'ACTIVE' as any;
        }
      }

      // Handle DEMO accounts: check if demo period has expired
      if (endUser.status === 'DEMO' && endUser.endDate && new Date(endUser.endDate) < new Date()) {
        await prisma.endUserAccount.update({
          where: { id: endUser.id },
          data: { status: 'EXPIRED' },
        });
        throw new AppError(403, 'Demo period has expired', 'ACCOUNT_RESTRICTED');
      }

      // Block other restricted statuses
      if (endUser.status === 'PAUSED' || endUser.status === 'EXPIRED') {
         throw new AppError(403, `Account is ${endUser.status.toLowerCase()}`, 'ACCOUNT_RESTRICTED');
      }

      // Block INACTIVE accounts without a plan
      if (endUser.status === 'INACTIVE') {
        throw new AppError(403, 'Account has no active plan', 'ACCOUNT_RESTRICTED');
      }

      // Check if active account has expired
      if (endUser.status === 'ACTIVE' && endUser.endDate && new Date(endUser.endDate) < new Date()) {
        await prisma.endUserAccount.update({
          where: { id: endUser.id },
          data: { status: 'EXPIRED' },
        });
        throw new AppError(403, 'Account has expired', 'ACCOUNT_RESTRICTED');
      }

      // Device limits & Auto-disconnect logic
      const deviceToken = input.deviceId || uuidv4();
      const deviceName = input.deviceName || 'Web Browser';
      const deviceType = (input.deviceType as any) || 'WEB';

      const activeSessions = await prisma.deviceSession.findMany({
        where: { endUserAccountId: endUser.id, isActive: true },
        orderBy: { lastSeen: 'asc' },
      });

      if (activeSessions.length >= endUser.maxDevices) {
        const numToDisconnect = activeSessions.length - endUser.maxDevices + 1;
        const sessionsToDisconnect = activeSessions.slice(0, numToDisconnect);

        await prisma.deviceSession.updateMany({
          where: { id: { in: sessionsToDisconnect.map((s) => s.id) } },
          data: { isActive: false },
        });
      }

      await prisma.deviceSession.upsert({
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
        let linkedUser = await prisma.user.findUnique({ where: { phone: clientEmail } });
        
        if (!linkedUser) {
          linkedUser = await prisma.user.create({
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

        await prisma.endUserAccount.update({
          where: { id: endUser.id },
          data: { userId: linkedUser.id }
        });
        endUser.userId = linkedUser.id;
        endUser.user = linkedUser;
      } else {
          // Ensure they have at least one profile
          const profileCount = await prisma.profile.count({ where: { userId: endUser.userId } });
          if (profileCount === 0) {
              await prisma.profile.create({
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
      await redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, REFRESH_TOKEN_TTL_SECONDS, `VIRTUAL_${endUser.id}`);
      
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: endUser.userId,           // real User.id for FK constraint
          endUserAccountId: endUser.id,     // endUserAccount.id for account association
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        },
      });

      return {
        user: { id: endUser.id, phone: endUser.username, name: endUser.username, role: 'END_USER' as const },
        accessToken,
        refreshToken,
      };
    }
  }

  // 3. Fallback to normal user logic if found in step 1
  if (!user || !user.passwordHash || !user.isActive) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordValid) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const { accessToken, refreshToken } = generateTokens(user.id, user.username || user.phone, user.role);

  await redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, REFRESH_TOKEN_TTL_SECONDS, user.id);

  await prisma.refreshToken.create({
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

export async function refreshAccessToken(refreshToken: string) {
  // Redis stores the "owner" of this refresh token.
  // For END_USERs: "VIRTUAL_<endUserAccount.id>"
  // For normal users: "<User.id>"
  const storedValue = await redis.get(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
  if (!storedValue) {
    throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  let jwtSubject: string; // the `sub` claim for the new accessToken
  let phone: string;
  let role: string;
  let dbUserId: string | null = null;          // real User.id for Prisma FK
  let dbEndUserAccountId: string | null = null; // EndUserAccount.id for Prisma FK

  if (storedValue.startsWith('VIRTUAL_')) {
    // END_USER path — storedValue = "VIRTUAL_<endUserAccount.id>"
    const accountId = storedValue.replace('VIRTUAL_', '');

    const account = await prisma.endUserAccount.findUnique({
      where: { id: accountId },
      select: { id: true, username: true, status: true, userId: true },
    });

    if (!account || account.status === 'EXPIRED' || account.status === 'PAUSED') {
      throw new AppError(401, 'Account restricted or not found', 'INVALID_REFRESH_TOKEN');
    }

    // JWT sub must be the real User.id so /auth/me can resolve the User record
    jwtSubject = account.userId ?? accountId;
    phone = account.username;
    role = 'END_USER';
    dbUserId = account.userId ?? null;
    dbEndUserAccountId = account.id;
  } else {
    // Normal user path — storedValue = "<User.id>"
    const realUser = await prisma.user.findUnique({
      where: { id: storedValue },
      select: { id: true, phone: true, username: true, role: true, isActive: true },
    });

    if (!realUser || !realUser.isActive) {
      throw new AppError(401, 'User not found or inactive', 'INVALID_REFRESH_TOKEN');
    }

    jwtSubject = realUser.id;
    phone = realUser.username || realUser.phone;
    role = realUser.role;
    dbUserId = realUser.id;
  }

  // Rotate refresh token — invalidate old one
  await redis.del(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });

  // Generate new token pair
  const { accessToken, refreshToken: newRefreshToken } = generateTokens(jwtSubject, phone, role);

  // Store new refresh token in Redis with 180-day TTL
  const redisValue = dbEndUserAccountId ? `VIRTUAL_${dbEndUserAccountId}` : jwtSubject;
  await redis.setex(`${REFRESH_TOKEN_PREFIX}${newRefreshToken}`, REFRESH_TOKEN_TTL_SECONDS, redisValue);

  // Store in DB with correct FK references
  await prisma.refreshToken.create({
    data: {
      token: newRefreshToken,
      userId: dbUserId,
      endUserAccountId: dbEndUserAccountId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string): Promise<void> {
  await redis.del(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}

export async function forgotPassword(phone: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return; // Silent — don't reveal if phone exists

  const resetToken = uuidv4();
  await redis.setex(`${RESET_TOKEN_PREFIX}${resetToken}`, RESET_TOKEN_TTL, user.id);

  // TODO: send sms with resetToken link
  console.log(`[Auth] Password reset token for ${phone}: ${resetToken}`);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const userId = await redis.get(`${RESET_TOKEN_PREFIX}${token}`);
  if (!userId) {
    throw new AppError(400, 'Invalid or expired reset token', 'INVALID_RESET_TOKEN');
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await redis.del(`${RESET_TOKEN_PREFIX}${token}`);
}

export async function findOrCreateGoogleUser(googleProfile: {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}) {
  let user = await prisma.user.findUnique({ where: { googleId: googleProfile.id } });

  if (!user) {
    user = await prisma.user.findUnique({ where: { phone: googleProfile.email } });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: googleProfile.id },
      });
    } else {
      user = await prisma.user.create({
        data: {
          googleId: googleProfile.id,
          phone: googleProfile.email,
          name: googleProfile.name,
        },
      });
    }
  }

  const { accessToken, refreshToken } = generateTokens(user.id, user.phone, user.role);

  await redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, REFRESH_TOKEN_TTL_SECONDS, user.id);
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  return { user, accessToken, refreshToken };
}
