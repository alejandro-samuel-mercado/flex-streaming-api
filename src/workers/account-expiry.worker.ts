/**
 * Account Expiry Worker — PeliPlus
 *
 * Periodically checks for end-user accounts that have passed their endDate
 * and marks them as EXPIRED. Also disconnects their active devices and
 * revokes refresh tokens to enforce the expiration immediately.
 *
 * Runs every 60 seconds.
 */

import { prisma } from '../shared/config/prisma';
import { redis } from '../shared/config/redis';

const CHECK_INTERVAL_MS = 60 * 1000; // 60 seconds
const REFRESH_TOKEN_PREFIX = 'refresh:';

export class AccountExpiryWorker {
  private static intervalId: ReturnType<typeof setInterval> | null = null;

  static start() {
    if (this.intervalId) return;

    console.log('⏰ [AccountExpiry] Worker started — checking every 60s for expired accounts');

    // Run immediately on startup, then every interval
    this.check();
    this.intervalId = setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('⏰ [AccountExpiry] Worker stopped');
    }
  }

  private static async check() {
    try {
      const now = new Date();

      // Find all accounts that should be expired
      const expiredAccounts = await prisma.endUserAccount.findMany({
        where: {
          status: { in: ['ACTIVE', 'DEMO'] },
          endDate: { not: null, lt: now },
          deletedAt: null,
        },
        select: {
          id: true,
          username: true,
          userId: true,
          status: true,
        },
      });

      if (expiredAccounts.length === 0) return;

      console.log(`⏰ [AccountExpiry] Expiring ${expiredAccounts.length} account(s)`);

      for (const account of expiredAccounts) {
        try {
          await prisma.$transaction(async (tx) => {
            // Mark as expired
            await tx.endUserAccount.update({
              where: { id: account.id },
              data: { status: 'EXPIRED' },
            });

            // Disconnect all active devices
            await tx.deviceSession.updateMany({
              where: { endUserAccountId: account.id, isActive: true },
              data: { isActive: false },
            });
          });

          // Revoke refresh tokens from Redis (outside transaction)
          if (account.userId) {
            const tokens = await prisma.refreshToken.findMany({
              where: { userId: account.userId },
              select: { token: true },
            });

            for (const t of tokens) {
              await redis.del(`${REFRESH_TOKEN_PREFIX}${t.token}`);
            }

            await prisma.refreshToken.deleteMany({
              where: { userId: account.userId },
            });
          }

          // Also try with VIRTUAL_ prefix for accounts without linked user
          const virtualTokens = await prisma.refreshToken.findMany({
            where: { userId: `VIRTUAL_${account.id}` },
            select: { token: true },
          });

          for (const t of virtualTokens) {
            await redis.del(`${REFRESH_TOKEN_PREFIX}${t.token}`);
          }

          await prisma.refreshToken.deleteMany({
            where: { userId: `VIRTUAL_${account.id}` },
          });

          console.log(`  ⏰ Expired: "${account.username}" (was ${account.status})`);
        } catch (err) {
          console.error(`  ❌ [AccountExpiry] Error expiring "${account.username}":`, err);
        }
      }
    } catch (err) {
      console.error('❌ [AccountExpiry] Worker error:', err);
    }
  }
}
