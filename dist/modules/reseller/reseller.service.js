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
const BCRYPT_ROUNDS = 12;
class ResellerService {
    static async createSuperVendor(adminId, data) {
        const existing = await prisma_1.prisma.user.findUnique({ where: { email: data.email } });
        if (existing) {
            throw new error_handler_1.AppError(409, 'Email already registered', 'EMAIL_EXISTS');
        }
        const passwordHash = await bcrypt_1.default.hash(data.password, BCRYPT_ROUNDS);
        const initialCredits = data.credits ?? 0;
        return prisma_1.prisma.$transaction(async (tx) => {
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
            return user;
        });
    }
    static async createVendor(creatorId, creatorRole, data) {
        if (creatorRole !== 'ADMIN' && creatorRole !== 'SUPER_VENDOR') {
            throw new error_handler_1.AppError(403, 'Only ADMIN or SUPER_VENDOR can create vendors', 'FORBIDDEN');
        }
        const existing = await prisma_1.prisma.user.findUnique({ where: { email: data.email } });
        if (existing) {
            throw new error_handler_1.AppError(409, 'Email already registered', 'EMAIL_EXISTS');
        }
        const passwordHash = await bcrypt_1.default.hash(data.password, BCRYPT_ROUNDS);
        const initialCredits = data.credits ?? 0;
        return prisma_1.prisma.$transaction(async (tx) => {
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
            return user;
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
        const vendors = await prisma_1.prisma.user.findMany({
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
    static async getVendorDetail(vendorId, requesterId, requesterRole) {
        const vendor = await prisma_1.prisma.user.findUnique({
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
        if (!vendor)
            throw new error_handler_1.AppError(404, 'Vendor not found', 'NOT_FOUND');
        if (requesterRole === 'SUPER_VENDOR' && vendor.parentId !== requesterId) {
            throw new error_handler_1.AppError(403, 'You can only view your own vendors', 'FORBIDDEN');
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
        return prisma_1.prisma.user.update({
            where: { id: vendorId },
            data: { isActive },
            select: { id: true, email: true, name: true, role: true, isActive: true },
        });
    }
    static async deleteVendor(vendorId) {
        const vendor = await prisma_1.prisma.user.findUnique({ where: { id: vendorId } });
        if (!vendor)
            throw new error_handler_1.AppError(404, 'Vendor not found', 'NOT_FOUND');
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
        return prisma_1.prisma.$transaction(async (tx) => {
            let fromUserName = 'Admin';
            if (!isAdmin) {
                const fromUser = await tx.user.findUnique({ where: { id: fromUserId } });
                if (!fromUser)
                    throw new error_handler_1.AppError(404, 'Sender user not found', 'NOT_FOUND');
                if (fromUser.credits < amount) {
                    throw new error_handler_1.AppError(400, `Insufficient credits. You have ${fromUser.credits}, trying to send ${amount}`, 'INSUFFICIENT_CREDITS');
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
}
exports.ResellerService = ResellerService;
//# sourceMappingURL=reseller.service.js.map