/**
 * End Users Service — PeliPlus Reseller System
 *
 * Manages end-user accounts created by vendors/super-vendors.
 * Handles: CRUD, plan activation (cumulative), pause/resume,
 * device management, password changes, and plan history.
 */

import bcrypt from 'bcrypt';
import { prisma } from '../../shared/config/prisma';
import { AppError } from '../../shared/middleware/error-handler';
import { UserRole } from '@prisma/client';

const BCRYPT_ROUNDS = 12;

async function canAccessAccount(managedById: string, userId: string, userRole: UserRole, isWrite = false): Promise<boolean> {
  if (userRole === 'ADMIN') {
    return !isWrite; // Admin can read but not write
  }
  if (managedById === userId) return true;
  if (userRole === 'SUPER_VENDOR') {
    // Check if the account is managed by one of this super vendor's child vendors
    const childVendor = await prisma.user.findFirst({
      where: { id: managedById, parentId: userId, role: 'VENDOR' },
    });
    return !!childVendor;
  }
  return false;
}

export class EndUsersService {
  static async list(userId: string, userRole: UserRole, query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    type?: string;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (userRole === 'SUPER_VENDOR') {
      // SUPER_VENDOR sees accounts managed by themselves and their child vendors
      const childVendorIds = await prisma.user.findMany({
        where: { parentId: userId, role: 'VENDOR', deletedAt: null },
        select: { id: true },
      });
      const managerIds = [userId, ...childVendorIds.map(v => v.id)];
      where.managedById = { in: managerIds };
    } else if (userRole === 'VENDOR') {
      where.managedById = userId;
    }

    if (query.search) {
      where.username = { contains: query.search, mode: 'insensitive' };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    const [accounts, total] = await Promise.all([
      prisma.endUserAccount.findMany({
        where,
        select: {
          id: true,
          username: true,
          password: true,
          status: true,
          type: true,
          startDate: true,
          endDate: true,
          maxDevices: true,
          createdAt: true,
          managedBy: { select: { id: true, name: true, email: true } },
          plan: { select: { id: true, name: true, durationDays: true } },
          _count: { select: { connectedDevices: { where: { isActive: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.endUserAccount.count({ where }),
    ]);

    const mapped = accounts.map(a => ({
      ...a,
      connectedDevicesCount: a._count.connectedDevices,
      _count: undefined,
    }));

    return {
      users: mapped,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async create(managedById: string, data: {
    username: string;
    password: string;
    country?: string;
    notes?: string;
  }) {
    const existing = await prisma.endUserAccount.findUnique({
      where: { username: data.username },
    });
    if (existing) {
      throw new AppError(409, 'Username already exists', 'USERNAME_EXISTS');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    return prisma.endUserAccount.create({
      data: {
        username: data.username,
        password: data.password,
        passwordHash,
        managedById,
        country: data.country,
        notes: data.notes,
      },
      select: {
        id: true,
        username: true,
        password: true,
        status: true,
        type: true,
        createdAt: true,
      },
    });
  }

  static async getById(accountId: string, userId: string, userRole: UserRole) {
    const account = await prisma.endUserAccount.findUnique({
      where: { id: accountId },
      include: {
        managedBy: { select: { id: true, name: true, email: true } },
        plan: true,
        connectedDevices: { where: { isActive: true } },
      },
    });

    if (!account || account.deletedAt) {
      throw new AppError(404, 'End user account not found', 'NOT_FOUND');
    }

    if (!(await canAccessAccount(account.managedById, userId, userRole, false))) {
      throw new AppError(403, 'You can only view your own clients', 'FORBIDDEN');
    }

    return {
      ...account,
      connectedDevicesCount: account.connectedDevices.length,
    };
  }

  static async changePassword(accountId: string, userId: string, userRole: UserRole, newPassword: string) {
    const account = await prisma.endUserAccount.findUnique({ where: { id: accountId } });
    if (!account || account.deletedAt) {
      throw new AppError(404, 'End user account not found', 'NOT_FOUND');
    }

    if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
      throw new AppError(403, 'You can only modify your own clients', 'FORBIDDEN');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    return prisma.endUserAccount.update({
      where: { id: accountId },
      data: { password: newPassword, passwordHash },
      select: { id: true, username: true, password: true },
    });
  }

  static async deleteAccount(accountId: string, userId: string, userRole: UserRole, forceDelete = false) {
    const account = await prisma.endUserAccount.findUnique({ where: { id: accountId } });
    if (!account || account.deletedAt) {
      throw new AppError(404, 'End user account not found', 'NOT_FOUND');
    }

    if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
      throw new AppError(403, 'You do not have permission to delete this client', 'FORBIDDEN');
    }

    if (account.status === 'ACTIVE' && userRole !== 'ADMIN') {
      throw new AppError(400, 'Cannot delete an active account. Deactivate it first.', 'ACCOUNT_ACTIVE');
    }

    if (account.status === 'ACTIVE' && userRole === 'ADMIN' && !forceDelete) {
      throw new AppError(400, 'Account is active. Set forceDelete=true to confirm.', 'CONFIRM_FORCE_DELETE');
    }

    await prisma.deviceSession.updateMany({
      where: { endUserAccountId: accountId },
      data: { isActive: false },
    });

    if (account.userId) {
      await prisma.refreshToken.deleteMany({
        where: { userId: account.userId },
      });
    }

    return prisma.endUserAccount.update({
      where: { id: accountId },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
  }

  static async addPlan(accountId: string, userId: string, userRole: UserRole, planId: string) {
    const account = await prisma.endUserAccount.findUnique({ where: { id: accountId } });
    if (!account || account.deletedAt) {
      throw new AppError(404, 'End user account not found', 'NOT_FOUND');
    }

    if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
      throw new AppError(403, 'You can only modify your own clients', 'FORBIDDEN');
    }

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      throw new AppError(404, 'Plan not found or inactive', 'PLAN_NOT_FOUND');
    }

    const now = new Date();
    let newEndDate: Date | null = null;
    let newType = account.type;
    let newStatus = account.status;
    let newStartDate: Date | null = account.startDate;
    let creditsCost = 0;

    if (plan.isDemo) {
      const hoursMs = (plan.demoHours ?? 24) * 60 * 60 * 1000;
      newEndDate = new Date(now.getTime() + hoursMs);
      newType = 'DEMO';
      newStatus = 'DEMO';
      newStartDate = now;
      creditsCost = 0;
    } else {
      creditsCost = plan.creditCost;

      if (userRole !== 'ADMIN') {
        const caller = await prisma.user.findUnique({ where: { id: userId } });
        if (!caller || caller.credits < creditsCost) {
          throw new AppError(400, `Insufficient credits. You have ${caller?.credits ?? 0}, need ${creditsCost}`, 'INSUFFICIENT_CREDITS');
        }
      }

      const currentEndDate = account.endDate;
      const base = currentEndDate && currentEndDate > now ? currentEndDate : now;
      newEndDate = new Date(base.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

      newType = 'FORMAL';
      if (account.status === 'INACTIVE') {
        // Newly created account: do not activate yet. Lifetime begins on first login.
        newStartDate = null;
        newEndDate = null;
        newStatus = 'INACTIVE';
      } else if (account.status === 'EXPIRED') {
        newStartDate = now;
        newStatus = 'ACTIVE';
      } else {
        newStatus = 'ACTIVE';
      }
    }

    return prisma.$transaction(async (tx) => {
      if (creditsCost > 0 && userRole !== 'ADMIN') {
        const caller = await tx.user.findUnique({ where: { id: userId } });
        const callerBefore = caller!.credits;
        const callerAfter = callerBefore - creditsCost;

        await tx.user.update({
          where: { id: userId },
          data: { credits: callerAfter },
        });

        await tx.creditTransaction.create({
          data: {
            userId: userId,
            type: 'PLAN_ACTIVATION',
            amount: -creditsCost,
            balanceBefore: callerBefore,
            balanceAfter: callerAfter,
            description: `Plan "${plan.name}" applied to "${account.username}"`,
            relatedUserId: account.id,
            planId: plan.id,
            createdById: userId,
          },
        });
      }

      await tx.endUserPlanHistory.create({
        data: {
          endUserAccountId: accountId,
          planId: plan.id,
          daysAdded: plan.isDemo ? 0 : plan.durationDays,
          creditsCost,
          appliedById: userId,
        },
      });

      const updated = await tx.endUserAccount.update({
        where: { id: accountId },
        data: {
          planId: plan.id,
          status: newStatus,
          type: newType,
          startDate: newStartDate,
          endDate: newEndDate,
          maxDevices: plan.maxDevices,
        },
        include: {
          plan: { select: { id: true, name: true, durationDays: true } },
        },
      });

      return updated;
    });
  }

  static async togglePause(accountId: string, userId: string, userRole: UserRole) {
    const account = await prisma.endUserAccount.findUnique({ where: { id: accountId } });
    if (!account || account.deletedAt) {
      throw new AppError(404, 'End user account not found', 'NOT_FOUND');
    }

    if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
      throw new AppError(403, 'You can only modify your own clients', 'FORBIDDEN');
    }

    let newStatus: 'ACTIVE' | 'PAUSED';
    if (account.status === 'ACTIVE') {
      newStatus = 'PAUSED';
    } else if (account.status === 'PAUSED') {
      newStatus = 'ACTIVE';
    } else {
      throw new AppError(400, `Cannot toggle pause for account with status "${account.status}"`, 'INVALID_STATUS');
    }

    return prisma.endUserAccount.update({
      where: { id: accountId },
      data: { status: newStatus },
      select: { id: true, username: true, status: true },
    });
  }

  static async listDevices(accountId: string, userId: string, userRole: UserRole) {
    const account = await prisma.endUserAccount.findUnique({ where: { id: accountId } });
    if (!account || account.deletedAt) {
      throw new AppError(404, 'End user account not found', 'NOT_FOUND');
    }

    if (!(await canAccessAccount(account.managedById, userId, userRole, false))) {
      throw new AppError(403, 'You can only view your own clients\' devices', 'FORBIDDEN');
    }

    return prisma.deviceSession.findMany({
      where: { endUserAccountId: accountId, isActive: true },
      orderBy: { lastSeen: 'desc' },
    });
  }

  static async disconnectAllDevices(accountId: string, userId: string, userRole: UserRole) {
    const account = await prisma.endUserAccount.findUnique({ where: { id: accountId } });
    if (!account || account.deletedAt) {
      throw new AppError(404, 'End user account not found', 'NOT_FOUND');
    }

    if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
      throw new AppError(403, 'You can only manage your own clients\' devices', 'FORBIDDEN');
    }

    await prisma.deviceSession.updateMany({
      where: { endUserAccountId: accountId },
      data: { isActive: false },
    });

    if (account.userId) {
      await prisma.refreshToken.deleteMany({
        where: { userId: account.userId },
      });
    }

    return { message: 'All devices disconnected' };
  }

  static async disconnectDevice(accountId: string, deviceId: string, userId: string, userRole: UserRole) {
    const account = await prisma.endUserAccount.findUnique({ where: { id: accountId } });
    if (!account || account.deletedAt) {
      throw new AppError(404, 'End user account not found', 'NOT_FOUND');
    }

    if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
      throw new AppError(403, 'You can only manage your own clients\' devices', 'FORBIDDEN');
    }

    const device = await prisma.deviceSession.findUnique({ where: { id: deviceId } });
    if (!device || device.endUserAccountId !== accountId) {
      throw new AppError(404, 'Device not found for this account', 'NOT_FOUND');
    }

    await prisma.deviceSession.update({
      where: { id: deviceId },
      data: { isActive: false },
    });

    return { message: 'Device disconnected' };
  }

  static async getPlanHistory(accountId: string, userId: string, userRole: UserRole) {
    const account = await prisma.endUserAccount.findUnique({ where: { id: accountId } });
    if (!account || account.deletedAt) {
      throw new AppError(404, 'End user account not found', 'NOT_FOUND');
    }

    if (!(await canAccessAccount(account.managedById, userId, userRole, false))) {
      throw new AppError(403, 'You can only view your own clients\' history', 'FORBIDDEN');
    }

    return prisma.endUserPlanHistory.findMany({
      where: { endUserAccountId: accountId },
      include: {
        plan: { select: { id: true, name: true, durationDays: true, creditCost: true, isDemo: true } },
      },
      orderBy: { appliedAt: 'desc' },
    });
  }
}
