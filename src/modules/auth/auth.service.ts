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

function generateTokens(userId: string, email: string, role: string) {
  const accessToken = jwt.sign(
    { sub: userId, email, role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any }
  );

  const refreshToken = uuidv4();

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);

  const refreshTtlSeconds = 30 * 24 * 60 * 60; // 30 days
  await redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, refreshTtlSeconds, user.id);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
    },
  });

  return { user, accessToken, refreshToken };
}

export async function login(input: LoginInput) {
  // 1. Try finding in normal User table (identifier as email)
  let user = await prisma.user.findUnique({ where: { email: input.username } });

  // 2. If not found, try finding in EndUserAccount table (identifier as username)
  if (!user) {
    const endUser = await prisma.endUserAccount.findUnique({
      where: { username: input.username },
      include: { user: true },
    });

    if (endUser) {
      // If endUser exists but has no linked User record, we treat it as a virtual user for JWT
      // Or we can check password against endUser.passwordHash
      const passwordValid = await bcrypt.compare(input.password, endUser.passwordHash);
      if (!passwordValid) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
      
      if (endUser.status === 'INACTIVE' || endUser.status === 'PAUSED' || endUser.status === 'EXPIRED') {
         throw new AppError(403, `Account is ${endUser.status.toLowerCase()}`, 'ACCOUNT_RESTRICTED');
      }

      // Return a virtual user object for the token
      const { accessToken, refreshToken } = generateTokens(endUser.id, endUser.username, 'END_USER');
      
      const refreshTtlSeconds = 30 * 24 * 60 * 60;
      await redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, refreshTtlSeconds, endUser.id);
      
      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: endUser.userId || 'VIRTUAL_' + endUser.id, // Handle cases without linked user
          expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
        },
      });

      return {
        user: { id: endUser.id, email: endUser.username, name: endUser.username, role: 'END_USER' as const },
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

  const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role);

  const refreshTtlSeconds = 30 * 24 * 60 * 60;
  await redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, refreshTtlSeconds, user.id);

  await prisma.refreshToken.create({
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

export async function refreshAccessToken(refreshToken: string) {
  const userId = await redis.get(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
  if (!userId) {
    throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    throw new AppError(401, 'User not found or inactive', 'INVALID_REFRESH_TOKEN');
  }

  // Rotate refresh token
  await redis.del(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.email, user.role);

  const refreshTtlSeconds = 30 * 24 * 60 * 60;
  await redis.setex(`${REFRESH_TOKEN_PREFIX}${newRefreshToken}`, refreshTtlSeconds, user.id);

  await prisma.refreshToken.create({
    data: {
      token: newRefreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
    },
  });

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string): Promise<void> {
  await redis.del(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // Silent — don't reveal if email exists

  const resetToken = uuidv4();
  await redis.setex(`${RESET_TOKEN_PREFIX}${resetToken}`, RESET_TOKEN_TTL, user.id);

  // TODO: send email with resetToken link when SMTP is configured
  console.log(`[Auth] Password reset token for ${email}: ${resetToken}`);
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
    user = await prisma.user.findUnique({ where: { email: googleProfile.email } });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: googleProfile.id },
      });
    } else {
      user = await prisma.user.create({
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
  await redis.setex(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, refreshTtlSeconds, user.id);
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
    },
  });

  return { user, accessToken, refreshToken };
}
