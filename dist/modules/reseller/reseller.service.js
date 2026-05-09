"use strict";
/**
 * Reseller Service — PeliPlus Reseller System
 *
 * Manages the vendor hierarchy: ADMIN → SUPER_VENDOR → VENDOR.
 * Handles vendor creation, credit assignment, and status management.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResellerService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../../shared/config/prisma");
const error_handler_1 = require("../../shared/middleware/error-handler");
const end_users_service_1 = require("../end-users/end-users.service");
const BCRYPT_ROUNDS = 12;
class ResellerService {
    static async createSuperVendor(adminId, data) {
        const existing = await prisma_1.prisma.user.findFirst({
            where: { OR: [{ phone: data.phone }, { username: data.username }] }
        });
        if (existing) {
            throw new error_handler_1.AppError(409, 'Phone or username already registered', 'ALREADY_EXISTS');
        }
        const passwordHash = await bcrypt_1.default.hash(data.password, BCRYPT_ROUNDS);
        const initialCredits = data.credits ?? 0;
        return prisma_1.prisma.$transaction(async (tx) => {
            const existing = await tx.user.findUnique({ where: { phone: data.phone } });
            if (existing) {
                throw new error_handler_1.AppError(409, 'Phone already registered', 'PHONE_EXISTS');
            }
            const user = await tx.user.create({
                data: {
                    phone: data.phone,
                    username: data.username,
                    name: data.name,
                    passwordHash,
                    role: 'SUPER_VENDOR',
                    parentId: adminId,
                    credits: initialCredits,
                },
                select: { id: true, phone: true, username: true, name: true, role: true, credits: true, createdAt: true },
            });
            // ... (rest of the logic remains same, prisma will rollback on any error inside)
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
        }).catch(err => {
            if (err.code === 'P2002')
                throw new error_handler_1.AppError(409, 'Phone already registered', 'PHONE_EXISTS');
            throw err;
        });
    }
    static async createVendor(creatorId, creatorRole, data) {
        if (creatorRole !== 'ADMIN' && creatorRole !== 'SUPER_VENDOR') {
            throw new error_handler_1.AppError(403, 'Only ADMIN or SUPER_VENDOR can create vendors', 'FORBIDDEN');
        }
        const existing = await prisma_1.prisma.user.findFirst({
            where: { OR: [{ phone: data.phone }, { username: data.username }] }
        });
        if (existing) {
            throw new error_handler_1.AppError(409, 'Phone or username already registered', 'ALREADY_EXISTS');
        }
        const passwordHash = await bcrypt_1.default.hash(data.password, BCRYPT_ROUNDS);
        const initialCredits = data.credits ?? 0;
        return prisma_1.prisma.$transaction(async (tx) => {
            const existing = await tx.user.findUnique({ where: { phone: data.phone } });
            if (existing) {
                throw new error_handler_1.AppError(409, 'Phone already registered', 'PHONE_EXISTS');
            }
            // If not admin, check credits inside transaction
            if (creatorRole !== 'ADMIN' && initialCredits > 0) {
                const creator = await tx.user.findUnique({ where: { id: creatorId } });
                if (!creator || creator.credits < initialCredits) {
                    throw new error_handler_1.AppError(400, 'Insufficient credits to assign to new vendor', 'INSUFFICIENT_CREDITS');
                }
                const creatorBefore = creator.credits;
                const creatorAfter = creatorBefore - initialCredits;
                await tx.user.update({
                    where: { id: creatorId },
                    data: { credits: creatorAfter },
                });
            }
            const user = await tx.user.create({
                data: {
                    phone: data.phone,
                    username: data.username,
                    name: data.name,
                    passwordHash,
                    role: 'VENDOR',
                    parentId: creatorId,
                    credits: initialCredits,
                },
                select: { id: true, phone: true, username: true, name: true, role: true, credits: true, createdAt: true },
            });
            if (initialCredits > 0) {
                if (creatorRole !== 'ADMIN') {
                    const creator = await tx.user.findUnique({ where: { id: creatorId } });
                    await tx.creditTransaction.create({
                        data: {
                            userId: creatorId,
                            type: 'TRANSFER',
                            amount: -initialCredits,
                            balanceBefore: creator.credits + initialCredits,
                            balanceAfter: creator.credits,
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
        }).catch(err => {
            if (err.code === 'P2002')
                throw new error_handler_1.AppError(409, 'Phone already registered', 'PHONE_EXISTS');
            throw err;
        });
    }
    static async listVendors(userId, userRole) {
        const where = {
            role: { in: ['SUPER_VENDOR', 'VENDOR'] },
            deletedAt: null,
        };
        if (userRole === 'SUPER_VENDOR') {
            where.parentId = userId;
        }
        else if (userRole === 'ADMIN') {
            // Admins only manage Super Resellers
            where.role = 'SUPER_VENDOR';
        }
        const vendors = await prisma_1.prisma.user.findMany({
            where,
            select: {
                id: true,
                phone: true,
                username: true,
                name: true,
                role: true,
                credits: true,
                isActive: true,
                createdAt: true,
                parentId: true,
                parent: { select: { id: true, name: true, phone: true, username: true } },
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
    static async getVendorDetail(vendorId, requesterId, requesterRole) {
        const vendor = await prisma_1.prisma.user.findUnique({
            where: { id: vendorId },
            select: {
                id: true,
                phone: true,
                username: true,
                name: true,
                role: true,
                credits: true,
                isActive: true,
                createdAt: true,
                parentId: true,
                parent: { select: { id: true, name: true, phone: true, username: true } },
                _count: {
                    select: { children: true, managedEndUsers: true },
                },
            },
        });
        if (!vendor)
            throw new error_handler_1.AppError(404, 'Vendor not found', 'NOT_FOUND');
        if (requesterRole === 'SUPER_VENDOR' && vendor.parentId !== requesterId) {
            throw new error_handler_1.AppError(403, 'You can only view your own vendors', 'FORBIDDEN');
        }
        if (requesterRole === 'ADMIN' && vendor.role !== 'SUPER_VENDOR') {
            throw new error_handler_1.AppError(403, 'Admins can only manage Super Resellers', 'FORBIDDEN');
        }
        return vendor;
    }
    static async updateVendorStatus(vendorId, requesterId, requesterRole, isActive) {
        const vendor = await prisma_1.prisma.user.findUnique({ where: { id: vendorId } });
        if (!vendor)
            throw new error_handler_1.AppError(404, 'Vendor not found', 'NOT_FOUND');
        if (requesterRole === 'SUPER_VENDOR' && vendor.parentId !== requesterId) {
            throw new error_handler_1.AppError(403, 'You can only manage your own vendors', 'FORBIDDEN');
        }
        if (requesterRole === 'ADMIN' && vendor.role !== 'SUPER_VENDOR') {
            throw new error_handler_1.AppError(403, 'Admins can only manage Super Resellers', 'FORBIDDEN');
        }
        return prisma_1.prisma.user.update({
            where: { id: vendorId },
            data: { isActive },
            select: { id: true, phone: true, username: true, name: true, role: true, isActive: true },
        });
    }
    static async deleteVendor(vendorId, requesterId, requesterRole) {
        const vendor = await prisma_1.prisma.user.findUnique({ where: { id: vendorId } });
        if (!vendor)
            throw new error_handler_1.AppError(404, 'Vendor not found', 'NOT_FOUND');
        if (requesterRole === 'SUPER_VENDOR' && vendor.parentId !== requesterId) {
            throw new error_handler_1.AppError(403, 'You can only delete your own vendors', 'FORBIDDEN');
        }
        if (requesterRole === 'ADMIN' && vendor.role !== 'SUPER_VENDOR') {
            throw new error_handler_1.AppError(403, 'Admins can only manage Super Resellers', 'FORBIDDEN');
        }
        const activeClients = await prisma_1.prisma.endUserAccount.count({
            where: { managedById: vendorId, status: 'ACTIVE' },
        });
        if (activeClients > 0) {
            throw new error_handler_1.AppError(400, `Cannot delete vendor with ${activeClients} active clients`, 'HAS_ACTIVE_CLIENTS');
        }
        return prisma_1.prisma.user.update({
            where: { id: vendorId },
            data: { deletedAt: new Date(), isActive: false },
        });
    }
    static async assignCredits(fromUserId, fromRole, toUserId, amount) {
        if (amount <= 0) {
            throw new error_handler_1.AppError(400, 'Amount must be positive', 'VALIDATION_ERROR');
        }
        const toUser = await prisma_1.prisma.user.findUnique({ where: { id: toUserId } });
        if (!toUser)
            throw new error_handler_1.AppError(404, 'Target user not found', 'NOT_FOUND');
        const isAdmin = fromRole === 'ADMIN';
        // Hierarchy check: SUPER_VENDOR can only give to their direct child vendors
        if (fromRole === 'SUPER_VENDOR' && toUser.parentId !== fromUserId) {
            throw new error_handler_1.AppError(403, 'You can only assign credits to your own vendors', 'FORBIDDEN');
        }
        if (fromRole === 'ADMIN' && toUser.role !== 'SUPER_VENDOR') {
            throw new error_handler_1.AppError(403, 'Admins can only assign credits to Super Resellers', 'FORBIDDEN');
        }
        return prisma_1.prisma.$transaction(async (tx) => {
            let fromUserName = 'Admin';
            if (!isAdmin) {
                const fromUser = await tx.user.findUnique({ where: { id: fromUserId } });
                if (!fromUser)
                    throw new error_handler_1.AppError(404, 'Sender user not found', 'NOT_FOUND');
                if (fromUser.credits < amount) {
                    throw new error_handler_1.AppError(400, `Insufficient credits. You have ${fromUser.credits}, trying to send ${amount}`, 'INSUFFICIENT_CREDITS');
                }
                fromUserName = fromUser.name || fromUser.phone;
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
                        description: `Credits transferred to "${toUser.name || toUser.phone}"`,
                        relatedUserId: toUserId,
                        createdById: fromUserId,
                    },
                });
            }
            const receiver = await tx.user.findUnique({ where: { id: toUserId } });
            const receiverBefore = receiver.credits;
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
    static async getCreditHistory(targetUserId, requesterId, requesterRole, page = 1, limit = 20) {
        if (requesterRole !== 'ADMIN' && targetUserId !== requesterId) {
            const target = await prisma_1.prisma.user.findUnique({ where: { id: targetUserId } });
            if (!target || target.parentId !== requesterId) {
                throw new error_handler_1.AppError(403, 'You can only view credit history for yourself or your vendors', 'FORBIDDEN');
            }
        }
        const skip = (page - 1) * limit;
        const [transactions, total] = await Promise.all([
            prisma_1.prisma.creditTransaction.findMany({
                where: { userId: targetUserId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.creditTransaction.count({ where: { userId: targetUserId } }),
        ]);
        return {
            transactions,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
    static async assignPlanToVendor(vendorId, requesterId, requesterRole, planId) {
        const vendor = await prisma_1.prisma.user.findUnique({
            where: { id: vendorId },
            include: { endUserAccount: true }
        });
        if (!vendor)
            throw new error_handler_1.AppError(404, 'Vendor not found', 'NOT_FOUND');
        if (requesterRole === 'SUPER_VENDOR' && vendor.parentId !== requesterId) {
            throw new error_handler_1.AppError(403, 'You can only assign plans to your own vendors', 'FORBIDDEN');
        }
        if (requesterRole === 'ADMIN' && vendor.role !== 'SUPER_VENDOR') {
            throw new error_handler_1.AppError(403, 'Admins can only assign plans to Super Resellers', 'FORBIDDEN');
        }
        let accountId = vendor.endUserAccount?.id;
        if (!accountId) {
            // Create own end user account for the vendor
            const username = `v_${vendor.username || vendor.phone}_${Math.random().toString(36).substring(7)}`;
            const password = 'password123';
            const passwordHash = await bcrypt_1.default.hash(password, BCRYPT_ROUNDS);
            const account = await prisma_1.prisma.endUserAccount.create({
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
        return end_users_service_1.EndUsersService.addPlan(accountId, requesterId, requesterRole, planId);
    }
    static async resetVendorPassword(vendorId, requesterId, requesterRole, newPassword) {
        const vendor = await prisma_1.prisma.user.findUnique({ where: { id: vendorId } });
        if (!vendor)
            throw new error_handler_1.AppError(404, 'Vendor not found', 'NOT_FOUND');
        if (requesterRole === 'SUPER_VENDOR' && vendor.parentId !== requesterId) {
            throw new error_handler_1.AppError(403, 'You can only manage your own vendors', 'FORBIDDEN');
        }
        if (requesterRole === 'ADMIN' && vendor.role !== 'SUPER_VENDOR') {
            throw new error_handler_1.AppError(403, 'Admins can only manage Super Resellers', 'FORBIDDEN');
        }
        const passwordHash = await bcrypt_1.default.hash(newPassword, BCRYPT_ROUNDS);
        // Revoke tokens if vendor has a connected endUserAccount, or just the user token
        await prisma_1.prisma.refreshToken.deleteMany({
            where: { userId: vendorId },
        });
        return prisma_1.prisma.user.update({
            where: { id: vendorId },
            data: { passwordHash },
            select: { id: true, phone: true, username: true, name: true, role: true },
        });
    }
}
exports.ResellerService = ResellerService;
//# sourceMappingURL=reseller.service.js.map