"use strict";
/**
 * Credit Packages Service — PeliPlus Reseller System
 *
 * CRUD for credit packages and the applyPackage logic.
 * Admin can apply packages for free; non-admin users pay baseCredits from their balance.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreditPackagesService = void 0;
const prisma_1 = require("../../shared/config/prisma");
const error_handler_1 = require("../../shared/middleware/error-handler");
class CreditPackagesService {
    static async getActivePackages() {
        return prisma_1.prisma.creditPackage.findMany({
            where: { isActive: true },
            orderBy: { baseCredits: 'asc' },
        });
    }
    static async getAllPackages() {
        return prisma_1.prisma.creditPackage.findMany({
            orderBy: { baseCredits: 'asc' },
        });
    }
    static async getById(id) {
        const pkg = await prisma_1.prisma.creditPackage.findUnique({ where: { id } });
        if (!pkg)
            throw new error_handler_1.AppError(404, 'Credit package not found', 'NOT_FOUND');
        return pkg;
    }
    static async create(data) {
        return prisma_1.prisma.creditPackage.create({
            data: {
                name: data.name,
                baseCredits: data.baseCredits,
                bonusCredits: data.bonusCredits ?? 0,
                isPromo: data.isPromo ?? false,
                sortOrder: data.sortOrder ?? 0,
            },
        });
    }
    static async update(id, data) {
        await this.getById(id);
        return prisma_1.prisma.creditPackage.update({ where: { id }, data });
    }
    static async toggle(id) {
        const pkg = await this.getById(id);
        return prisma_1.prisma.creditPackage.update({
            where: { id },
            data: { isActive: !pkg.isActive },
        });
    }
    static async remove(id) {
        await this.getById(id);
        return prisma_1.prisma.creditPackage.delete({ where: { id } });
    }
    static async applyPackage(packageId, fromUserId, fromRole, toUserId) {
        const pkg = await this.getById(packageId);
        if (!pkg.isActive) {
            throw new error_handler_1.AppError(400, 'Package is not active', 'PACKAGE_INACTIVE');
        }
        const toUser = await prisma_1.prisma.user.findUnique({ where: { id: toUserId } });
        if (!toUser)
            throw new error_handler_1.AppError(404, 'Target user not found', 'NOT_FOUND');
        const isAdmin = fromRole === 'ADMIN';
        // Hierarchy check: SUPER_VENDOR can only apply packages to themselves or their direct child vendors
        if (fromRole === 'SUPER_VENDOR' && toUserId !== fromUserId && toUser.parentId !== fromUserId) {
            throw new error_handler_1.AppError(403, 'You can only apply packages to yourself or your own vendors', 'FORBIDDEN');
        }
        const totalCreditsToGive = pkg.baseCredits + pkg.bonusCredits;
        return prisma_1.prisma.$transaction(async (tx) => {
            let fromUserName = 'Admin';
            if (!isAdmin) {
                const fromUser = await tx.user.findUnique({ where: { id: fromUserId } });
                if (!fromUser)
                    throw new error_handler_1.AppError(404, 'Sender user not found', 'NOT_FOUND');
                if (fromUser.credits < pkg.baseCredits) {
                    throw new error_handler_1.AppError(400, `Insufficient credits. You have ${fromUser.credits}, need ${pkg.baseCredits}`, 'INSUFFICIENT_CREDITS');
                }
                fromUserName = fromUser.name || fromUser.phone;
                const senderBefore = fromUser.credits;
                const senderAfter = senderBefore - pkg.baseCredits;
                await tx.user.update({
                    where: { id: fromUserId },
                    data: { credits: senderAfter },
                });
                await tx.creditTransaction.create({
                    data: {
                        userId: fromUserId,
                        type: 'PACKAGE_PURCHASE',
                        amount: -pkg.baseCredits,
                        balanceBefore: senderBefore,
                        balanceAfter: senderAfter,
                        description: `Applied package "${pkg.name}" to user`,
                        relatedUserId: toUserId,
                        packageId: pkg.id,
                        createdById: fromUserId,
                    },
                });
            }
            const receiver = await tx.user.findUnique({ where: { id: toUserId } });
            const receiverBefore = receiver.credits;
            const receiverAfter = receiverBefore + totalCreditsToGive;
            await tx.user.update({
                where: { id: toUserId },
                data: { credits: receiverAfter },
            });
            await tx.creditTransaction.create({
                data: {
                    userId: toUserId,
                    type: isAdmin ? 'ADMIN_GRANT' : 'PACKAGE_PURCHASE',
                    amount: totalCreditsToGive,
                    balanceBefore: receiverBefore,
                    balanceAfter: receiverAfter,
                    description: isAdmin
                        ? `Received credits from package "${pkg.name}" (Admin grant)`
                        : `Received credits from package "${pkg.name}" (Assigned by ${fromUserName})`,
                    relatedUserId: fromUserId,
                    packageId: pkg.id,
                    createdById: fromUserId,
                },
            });
            return {
                package: pkg,
                creditsGiven: totalCreditsToGive,
                receiverBalance: receiverAfter,
            };
        }, { timeout: 15000 });
    }
}
exports.CreditPackagesService = CreditPackagesService;
//# sourceMappingURL=credit-packages.service.js.map