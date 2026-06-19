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

      const accountIds = expiredAccounts.map(a => a.id);
      const userIds = expiredAccounts.map(a => a.userId).filter(Boolean) as string[];
      const virtualIds = accountIds.map(id => `VIRTUAL_${id}`);
      const allUserIdsToRevoke = [...userIds, ...virtualIds];

      // Update Database in bulk to avoid exhausting the connection pool
      await prisma.$transaction([
        prisma.endUserAccount.updateMany({
          where: { id: { in: accountIds } },
          data: { status: 'EXPIRED' },
        }),
        prisma.deviceSession.updateMany({
          where: { endUserAccountId: { in: accountIds }, isActive: true },
          data: { isActive: false },
        }),
      ]);

      // Revoke tokens
      if (allUserIdsToRevoke.length > 0) {
        const tokens = await prisma.refreshToken.findMany({
          where: { userId: { in: allUserIdsToRevoke } },
          select: { token: true },
        });

        if (tokens.length > 0) {
          const redisPipeline = redis.pipeline();
          for (const t of tokens) {
            redisPipeline.del(`${REFRESH_TOKEN_PREFIX}${t.token}`);
          }
          await redisPipeline.exec();
        }

        await prisma.refreshToken.deleteMany({
          where: { userId: { in: allUserIdsToRevoke } },
        });
      }

      expiredAccounts.forEach(account => {
        console.log(`  ⏰ Expired: "${account.username}" (was ${account.status})`);
      });

    } catch (err) {
      console.error('❌ [AccountExpiry] Worker error:', err);
    }
  }
}
