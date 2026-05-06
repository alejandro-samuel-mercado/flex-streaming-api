/**
 * Reseller Service — PeliPlus Reseller System
 *
 * Manages the vendor hierarchy: ADMIN → SUPER_VENDOR → VENDOR.
 * Handles vendor creation, credit assignment, and status management.
 */

import bcrypt from 'bcrypt';
import { prisma } from '../../shared/config/prisma';
import { AppError } from '../../shared/middleware/error-handler';
import { UserRole } from '@prisma/client';
import { EndUsersService } from '../end-users/end-users.service';

const BCRYPT_ROUNDS = 12;

export class ResellerService {
  static async createSuperVendor(adminId: string, data: {
    email: string;
    name: string;
    password: string;
    credits?: number;
    planId?: string;
  }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const initialCredits = data.credits ?? 0;

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash,
          role: 'SUPER_VENDOR',
          parentId: adminId,
          credits: initialCredits,
        },
        select: { id: true, email: true, name: true, role: true, credits: true, createdAt: true },
      });

      if (initialCredits > 0) {
        await tx.creditTransaction.create({
          data: {
            userId: user.id,
            type: 'ADMIN_GRANT',
            amount: initialCredits,
            balanceBefore: 0,
            balanceAfter: initialCredits,
            description: 'Initial credits on creation',
            createdById: adminId,
          },
        });
      }

      if (data.planId) {
        await this.assignPlanToVendor(user.id, adminId, 'ADMIN', data.planId);
      }

      return user;
    });
  }

  static async createVendor(creatorId: string, creatorRole: UserRole, data: {
    email: string;
    name: string;
    password: string;
    credits?: number;
    planId?: string;
  }) {
    if (creatorRole !== 'ADMIN' && creatorRole !== 'SUPER_VENDOR') {
      throw new AppError(403, 'Only ADMIN or SUPER_VENDOR can create vendors', 'FORBIDDEN');
    }

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const initialCredits = data.credits ?? 0;

    return prisma.$transaction(async (tx) => {
      // If not admin, check credits inside transaction
      if (creatorRole !== 'ADMIN' && initialCredits > 0) {
        const creator = await tx.user.findUnique({ where: { id: creatorId } });
        if (!creator || creator.credits < initialCredits) {
          throw new AppError(400, 'Insufficient credits to assign to new vendor', 'INSUFFICIENT_CREDITS');
        }

        const creatorBefore = creator.credits;
        const creatorAfter = creatorBefore - initialCredits;

        await tx.user.update({
          where: { id: creatorId },
          data: { credits: creatorAfter },
        });

        // We create the log for the creator later, after the vendor is created to have the ID
      }

      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash,
          role: 'VENDOR',
          parentId: creatorId,
          credits: initialCredits,
        },
        select: { id: true, email: true, name: true, role: true, credits: true, createdAt: true },
      });

      if (initialCredits > 0) {
        if (creatorRole !== 'ADMIN') {
          // Now fetch the creator again to get the balance after update or just use the calculated one
          const creator = await tx.user.findUnique({ where: { id: creatorId } });
          
          await tx.creditTransaction.create({
            data: {
              userId: creatorId,
              type: 'TRANSFER',
              amount: -initialCredits,
              balanceBefore: creator!.credits + initialCredits,
              balanceAfter: creator!.credits,
              description: `Credits assigned to new vendor "${data.name}"`,
              relatedUserId: user.id,
              createdById: creatorId,
            },
          });
        }

        await tx.creditTransaction.create({
          data: {
            userId: user.id,
            type: creatorRole === 'ADMIN' ? 'ADMIN_GRANT' : 'TRANSFER',
            amount: initialCredits,
            balanceBefore: 0,
            balanceAfter: initialCredits,
            description: 'Initial credits on creation',
            relatedUserId: creatorId,
            createdById: creatorId,
          },
        });
      }

      if (data.planId) {
        await this.assignPlanToVendor(user.id, creatorId, creatorRole, data.planId);
      }

      return user;
    });
  }

  static async listVendors(userId: string, userRole: UserRole) {
    const where: Record<string, unknown> = {
      role: { in: ['SUPER_VENDOR', 'VENDOR'] },
      deletedAt: null,
    };

    if (userRole === 'SUPER_VENDOR') {
      where.parentId = userId;
    } else if (userRole === 'ADMIN') {
      // Admins only manage Super Resellers
      where.role = 'SUPER_VENDOR';
    }

    const vendors = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        credits: true,
        isActive: true,
        createdAt: true,
        parentId: true,
        parent: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            children: true,
            managedEndUsers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return vendors;
  }

  static async getVendorDetail(vendorId: string, requesterId: string, requesterRole: UserRole) {
    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        credits: true,
        isActive: true,
        createdAt: true,
        parentId: true,
        parent: { select: { id: true, name: true, email: true } },
        _count: {
          select: { children: true, managedEndUsers: true },
        },
      },
    });

    if (!vendor) throw new AppError(404, 'Vendor not found', 'NOT_FOUND');

    if (requesterRole === 'SUPER_VENDOR' && vendor.parentId !== requesterId) {
      throw new AppError(403, 'You can only view your own vendors', 'FORBIDDEN');
    }

    if (requesterRole === 'ADMIN' && vendor.role !== 'SUPER_VENDOR') {
      throw new AppError(403, 'Admins can only manage Super Resellers', 'FORBIDDEN');
    }

    return vendor;
  }

  static async updateVendorStatus(vendorId: string, requesterId: string, requesterRole: UserRole, isActive: boolean) {
    const vendor = await prisma.user.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new AppError(404, 'Vendor not found', 'NOT_FOUND');

    if (requesterRole === 'SUPER_VENDOR' && vendor.parentId !== requesterId) {
      throw new AppError(403, 'You can only manage your own vendors', 'FORBIDDEN');
    }

    if (requesterRole === 'ADMIN' && vendor.role !== 'SUPER_VENDOR') {
      throw new AppError(403, 'Admins can only manage Super Resellers', 'FORBIDDEN');
    }

    return prisma.user.update({
      where: { id: vendorId },
      data: { isActive },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
  }

  static async deleteVendor(vendorId: string, requesterId: string, requesterRole: UserRole) {
    const vendor = await prisma.user.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new AppError(404, 'Vendor not found', 'NOT_FOUND');

    if (requesterRole === 'SUPER_VENDOR' && vendor.parentId !== requesterId) {
      throw new AppError(403, 'You can only delete your own vendors', 'FORBIDDEN');
    }

    if (requesterRole === 'ADMIN' && vendor.role !== 'SUPER_VENDOR') {
      throw new AppError(403, 'Admins can only manage Super Resellers', 'FORBIDDEN');
    }

    const activeClients = await prisma.endUserAccount.count({
      where: { managedById: vendorId, status: 'ACTIVE' },
    });

    if (activeClients > 0) {
      throw new AppError(400, `Cannot delete vendor with ${activeClients} active clients`, 'HAS_ACTIVE_CLIENTS');
    }

    return prisma.user.update({
      where: { id: vendorId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  static async assignCredits(fromUserId: string, fromRole: UserRole, toUserId: string, amount: number) {
    if (amount <= 0) {
      throw new AppError(400, 'Amount must be positive', 'VALIDATION_ERROR');
    }

    const toUser = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!toUser) throw new AppError(404, 'Target user not found', 'NOT_FOUND');

    const isAdmin = fromRole === 'ADMIN';

    // Hierarchy check: SUPER_VENDOR can only give to their direct child vendors
    if (fromRole === 'SUPER_VENDOR' && toUser.parentId !== fromUserId) {
      throw new AppError(403, 'You can only assign credits to your own vendors', 'FORBIDDEN');
    }

    if (fromRole === 'ADMIN' && toUser.role !== 'SUPER_VENDOR') {
      throw new AppError(403, 'Admins can only assign credits to Super Resellers', 'FORBIDDEN');
    }

    return prisma.$transaction(async (tx) => {
      let fromUserName = 'Admin';

      if (!isAdmin) {
        const fromUser = await tx.user.findUnique({ where: { id: fromUserId } });
        if (!fromUser) throw new AppError(404, 'Sender user not found', 'NOT_FOUND');
        if (fromUser.credits < amount) {
          throw new AppError(400, `Insufficient credits. You have ${fromUser.credits}, trying to send ${amount}`, 'INSUFFICIENT_CREDITS');
        }
        fromUserName = fromUser.name || fromUser.email;

        const senderBefore = fromUser.credits;
        const senderAfter = senderBefore - amount;

        await tx.user.update({
          where: { id: fromUserId },
          data: { credits: senderAfter },
        });

        await tx.creditTransaction.create({
          data: {
            userId: fromUserId,
            type: 'TRANSFER',
            amount: -amount,
            balanceBefore: senderBefore,
            balanceAfter: senderAfter,
            description: `Credits transferred to "${toUser.name || toUser.email}"`,
            relatedUserId: toUserId,
            createdById: fromUserId,
          },
        });
      }

      const receiver = await tx.user.findUnique({ where: { id: toUserId } });
      const receiverBefore = receiver!.credits;
      const receiverAfter = receiverBefore + amount;

      await tx.user.update({
        where: { id: toUserId },
        data: { credits: receiverAfter },
      });

      await tx.creditTransaction.create({
        data: {
          userId: toUserId,
          type: isAdmin ? 'ADMIN_GRANT' : 'TRANSFER',
          amount: amount,
          balanceBefore: receiverBefore,
          balanceAfter: receiverAfter,
          description: isAdmin
            ? `Credits granted by admin`
            : `Credits received from "${fromUserName}"`,
          relatedUserId: fromUserId,
          createdById: fromUserId,
        },
      });

      return {
        recipientId: toUserId,
        creditsAssigned: amount,
        recipientNewBalance: receiverAfter,
      };
    });
  }

  static async getCreditHistory(targetUserId: string, requesterId: string, requesterRole: UserRole, page = 1, limit = 20) {
    if (requesterRole !== 'ADMIN' && targetUserId !== requesterId) {
      const target = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!target || target.parentId !== requesterId) {
        throw new AppError(403, 'You can only view credit history for yourself or your vendors', 'FORBIDDEN');
      }
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.creditTransaction.count({ where: { userId: targetUserId } }),
    ]);

    return {
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async assignPlanToVendor(vendorId: string, requesterId: string, requesterRole: UserRole, planId: string) {
    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
      include: { endUserAccount: true }
    });
    if (!vendor) throw new AppError(404, 'Vendor not found', 'NOT_FOUND');

    if (requesterRole === 'SUPER_VENDOR' && vendor.parentId !== requesterId) {
      throw new AppError(403, 'You can only assign plans to your own vendors', 'FORBIDDEN');
    }

    if (requesterRole === 'ADMIN' && vendor.role !== 'SUPER_VENDOR') {
      throw new AppError(403, 'Admins can only assign plans to Super Resellers', 'FORBIDDEN');
    }

    let accountId = vendor.endUserAccount?.id;


    if (!accountId) {
      // Create own end user account for the vendor
      const username = `v_${vendor.email.split('@')[0]}_${Math.random().toString(36).substring(7)}`;
      const password = 'password123';
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const account = await prisma.endUserAccount.create({
        data: {
          username,
          password,
          passwordHash,
          managedById: requesterId,
          userId: vendor.id,
        }
      });
      accountId = account.id;
    }

    return EndUsersService.addPlan(accountId, requesterId, requesterRole, planId);
  }

  static async resetVendorPassword(vendorId: string, requesterId: string, requesterRole: UserRole, newPassword: string) {
    const vendor = await prisma.user.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new AppError(404, 'Vendor not found', 'NOT_FOUND');

    if (requesterRole === 'SUPER_VENDOR' && vendor.parentId !== requesterId) {
      throw new AppError(403, 'You can only manage your own vendors', 'FORBIDDEN');
    }

    if (requesterRole === 'ADMIN' && vendor.role !== 'SUPER_VENDOR') {
      throw new AppError(403, 'Admins can only manage Super Resellers', 'FORBIDDEN');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    
    // Revoke tokens if vendor has a connected endUserAccount, or just the user token
    await prisma.refreshToken.deleteMany({
      where: { userId: vendorId },
    });

    return prisma.user.update({
      where: { id: vendorId },
      data: { passwordHash },
      select: { id: true, email: true, name: true, role: true },
    });
  }
}
