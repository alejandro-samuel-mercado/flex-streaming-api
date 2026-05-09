"use strict";
/**
 * End Users Service — PeliPlus Reseller System
 *
 * Manages end-user accounts created by vendors/super-vendors.
 * Handles: CRUD, plan activation (cumulative), pause/resume,
 * device management, password changes, and plan history.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EndUsersService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../../shared/config/prisma");
const error_handler_1 = require("../../shared/middleware/error-handler");
const BCRYPT_ROUNDS = 12;
async function canAccessAccount(managedById, userId, userRole, _isWrite = false) {
    if (userRole === 'ADMIN') {
        return true; // Admin has full access (read + write)
    }
    if (managedById === userId)
        return true;
    if (userRole === 'SUPER_VENDOR') {
        // Check if the account is managed by one of this super vendor's child vendors
        const childVendor = await prisma_1.prisma.user.findFirst({
            where: { id: managedById, parentId: userId, role: 'VENDOR' },
        });
        return !!childVendor;
    }
    return false;
}
class EndUsersService {
    static async list(userId, userRole, query) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;
        const where = {
            deletedAt: null,
        };
        if (userRole === 'ADMIN') {
            // Admin only sees accounts they directly created
            where.managedById = userId;
        }
        else if (userRole === 'SUPER_VENDOR') {
            const childVendorIds = await prisma_1.prisma.user.findMany({
                where: { parentId: userId, role: 'VENDOR', deletedAt: null },
                select: { id: true },
            });
            const childIds = childVendorIds.map(v => v.id);
            if (query.managedByMeOnly) {
                where.managedById = userId;
            }
            else if (query.managedByOthersOnly) {
                where.managedById = { in: childIds };
            }
            else {
                where.managedById = { in: [userId, ...childIds] };
            }
        }
        else if (userRole === 'VENDOR') {
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
        if (query.expiringInDays !== undefined) {
            const now = new Date();
            const futureDate = new Date(now.getTime() + query.expiringInDays * 24 * 60 * 60 * 1000);
            where.endDate = {
                gte: now,
                lte: futureDate,
            };
            where.status = 'ACTIVE';
        }
        const [accounts, total] = await Promise.all([
            prisma_1.prisma.endUserAccount.findMany({
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
                    managedBy: { select: { id: true, name: true, phone: true, username: true, role: true, parent: { select: { name: true, username: true } } } },
                    plan: { select: { id: true, name: true, durationDays: true } },
                    _count: { select: { connectedDevices: { where: { isActive: true } } } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.endUserAccount.count({ where }),
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
    static async create(managedById, userRole, data) {
        const existing = await prisma_1.prisma.endUserAccount.findUnique({
            where: { username: data.username },
        });
        if (existing) {
            throw new error_handler_1.AppError(409, 'Username already exists', 'USERNAME_EXISTS');
        }
        const passwordHash = await bcrypt_1.default.hash(data.password, BCRYPT_ROUNDS);
        // If a planId is provided, create account + apply plan atomically
        if (data.planId) {
            const plan = await prisma_1.prisma.subscriptionPlan.findUnique({ where: { id: data.planId } });
            if (!plan || !plan.isActive) {
                throw new error_handler_1.AppError(404, 'Plan not found or inactive', 'PLAN_NOT_FOUND');
            }
            // Restricción: No se puede asignar demo si ya tiene contenido activo o ya es una demo
            if (plan.isDemo) {
                // En creación de cuenta, el 'existing' ya se comprobó arriba (username exists), 
                // así que aquí siempre es una cuenta nueva, por lo que la demo es válida.
            }
            const creditsCost = plan.isDemo ? 0 : plan.creditCost;
            // Check credits for non-admin users
            if (creditsCost > 0 && userRole !== 'ADMIN') {
                const caller = await prisma_1.prisma.user.findUnique({ where: { id: managedById } });
                if (!caller || caller.credits < creditsCost) {
                    throw new error_handler_1.AppError(400, `Insufficient credits. You have ${caller?.credits ?? 0}, need ${creditsCost}`, 'INSUFFICIENT_CREDITS');
                }
            }
            return prisma_1.prisma.$transaction(async (tx) => {
                // Create the account
                const account = await tx.endUserAccount.create({
                    data: {
                        username: data.username,
                        password: data.password,
                        passwordHash,
                        managedById,
                        country: data.country,
                        notes: data.notes,
                        planId: plan.id,
                        type: plan.isDemo ? 'DEMO' : 'FORMAL',
                        status: plan.isDemo ? 'DEMO' : 'INACTIVE',
                        startDate: plan.isDemo ? new Date() : null,
                        endDate: plan.isDemo ? new Date(Date.now() + (plan.demoHours ?? 24) * 60 * 60 * 1000) : null,
                        maxDevices: plan.maxDevices,
                    },
                });
                // Deduct credits for non-admin
                if (creditsCost > 0 && userRole !== 'ADMIN') {
                    const caller = await tx.user.findUnique({ where: { id: managedById } });
                    const callerBefore = caller.credits;
                    const callerAfter = callerBefore - creditsCost;
                    await tx.user.update({
                        where: { id: managedById },
                        data: { credits: callerAfter },
                    });
                    await tx.creditTransaction.create({
                        data: {
                            userId: managedById,
                            type: 'PLAN_ACTIVATION',
                            amount: -creditsCost,
                            balanceBefore: callerBefore,
                            balanceAfter: callerAfter,
                            description: `Plan "${plan.name}" applied to new account "${data.username}"`,
                            relatedUserId: account.id,
                            planId: plan.id,
                            createdById: managedById,
                        },
                    });
                }
                // Record plan history
                await tx.endUserPlanHistory.create({
                    data: {
                        endUserAccountId: account.id,
                        planId: plan.id,
                        daysAdded: plan.isDemo ? 0 : plan.durationDays + (plan.bonusDays ?? 0),
                        creditsCost,
                        appliedById: managedById,
                    },
                });
                return {
                    id: account.id,
                    username: account.username,
                    password: account.password,
                    status: account.status,
                    type: account.type,
                    planName: plan.name,
                    creditsCost,
                    createdAt: account.createdAt,
                };
            });
        }
        // No plan: simple creation
        const account = await prisma_1.prisma.endUserAccount.create({
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
        return account;
    }
    static async getById(accountId, userId, userRole) {
        const account = await prisma_1.prisma.endUserAccount.findUnique({
            where: { id: accountId },
            include: {
                managedBy: { select: { id: true, name: true, phone: true, username: true, role: true, parent: { select: { name: true, username: true } } } },
                plan: true,
                connectedDevices: { where: { isActive: true } },
            },
        });
        if (!account || account.deletedAt) {
            throw new error_handler_1.AppError(404, 'End user account not found', 'NOT_FOUND');
        }
        if (!(await canAccessAccount(account.managedById, userId, userRole, false))) {
            throw new error_handler_1.AppError(403, 'You can only view your own clients', 'FORBIDDEN');
        }
        return {
            ...account,
            connectedDevicesCount: account.connectedDevices.length,
        };
    }
    static async changePassword(accountId, userId, userRole, newPassword) {
        const account = await prisma_1.prisma.endUserAccount.findUnique({ where: { id: accountId } });
        if (!account || account.deletedAt) {
            throw new error_handler_1.AppError(404, 'End user account not found', 'NOT_FOUND');
        }
        if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
            throw new error_handler_1.AppError(403, 'You can only modify your own clients', 'FORBIDDEN');
        }
        const passwordHash = await bcrypt_1.default.hash(newPassword, BCRYPT_ROUNDS);
        // Security: Disconnect devices and revoke tokens when password changes
        await this.revokeAccess(accountId, account.userId);
        return prisma_1.prisma.endUserAccount.update({
            where: { id: accountId },
            data: { password: newPassword, passwordHash },
            select: { id: true, username: true, password: true },
        });
    }
    static async deleteAccount(accountId, userId, userRole, forceDelete = false) {
        const account = await prisma_1.prisma.endUserAccount.findUnique({ where: { id: accountId } });
        if (!account || account.deletedAt) {
            throw new error_handler_1.AppError(404, 'End user account not found', 'NOT_FOUND');
        }
        if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
            throw new error_handler_1.AppError(403, 'You do not have permission to delete this client', 'FORBIDDEN');
        }
        if (account.status === 'ACTIVE' && userRole !== 'ADMIN') {
            throw new error_handler_1.AppError(400, 'Cannot delete an active account. Deactivate it first.', 'ACCOUNT_ACTIVE');
        }
        if (account.status === 'ACTIVE' && userRole === 'ADMIN' && !forceDelete) {
            throw new error_handler_1.AppError(400, 'Account is active. Set forceDelete=true to confirm.', 'CONFIRM_FORCE_DELETE');
        }
        // Security: Ensure we disconnect devices and revoke all tokens
        await this.revokeAccess(accountId, account.userId);
        return prisma_1.prisma.endUserAccount.update({
            where: { id: accountId },
            data: { deletedAt: new Date(), status: 'INACTIVE' },
        });
    }
    static async addPlan(accountId, userId, userRole, planId) {
        const account = await prisma_1.prisma.endUserAccount.findUnique({ where: { id: accountId } });
        if (!account || account.deletedAt) {
            throw new error_handler_1.AppError(404, 'End user account not found', 'NOT_FOUND');
        }
        if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
            throw new error_handler_1.AppError(403, 'You can only modify your own clients', 'FORBIDDEN');
        }
        const plan = await prisma_1.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan || !plan.isActive) {
            throw new error_handler_1.AppError(404, 'Plan not found or inactive', 'PLAN_NOT_FOUND');
        }
        const now = new Date();
        let newEndDate = null;
        let newType = account.type;
        let newStatus = account.status;
        let newStartDate = account.startDate;
        let creditsCost = 0;
        if (plan.isDemo) {
            // 1. Si ya tiene una demo activa
            if (account.type === 'DEMO' && account.status === 'DEMO' && account.endDate && account.endDate > now) {
                throw new error_handler_1.AppError(400, 'El usuario ya tiene una demo activa.', 'DEMO_ALREADY_ACTIVE');
            }
            // 2. Si tiene un plan formal activo
            if (account.type === 'FORMAL' && account.endDate && account.endDate > now) {
                throw new error_handler_1.AppError(400, 'No se puede asignar una demo a un usuario con un plan activo.', 'FORMAL_PLAN_ACTIVE');
            }
            const hoursMs = (plan.demoHours ?? 24) * 60 * 60 * 1000;
            newEndDate = new Date(now.getTime() + hoursMs);
            newType = 'DEMO';
            newStatus = 'DEMO';
            newStartDate = now;
            creditsCost = 0;
        }
        else {
            creditsCost = plan.creditCost;
            if (userRole !== 'ADMIN') {
                const caller = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
                if (!caller || caller.credits < creditsCost) {
                    throw new error_handler_1.AppError(400, `Insufficient credits. You have ${caller?.credits ?? 0}, need ${creditsCost}`, 'INSUFFICIENT_CREDITS');
                }
            }
            const currentEndDate = account.endDate;
            const base = currentEndDate && currentEndDate > now ? currentEndDate : now;
            const totalDays = plan.durationDays + (plan.bonusDays ?? 0);
            newEndDate = new Date(base.getTime() + totalDays * 24 * 60 * 60 * 1000);
            newType = 'FORMAL';
            if (account.status === 'INACTIVE') {
                // Newly created account: do not activate yet. Lifetime begins on first login.
                newStartDate = null;
                newEndDate = null;
                newStatus = 'INACTIVE';
            }
            else if (account.status === 'EXPIRED') {
                newStartDate = now;
                newStatus = 'ACTIVE';
            }
            else {
                newStatus = 'ACTIVE';
            }
        }
        return prisma_1.prisma.$transaction(async (tx) => {
            if (creditsCost > 0 && userRole !== 'ADMIN') {
                const caller = await tx.user.findUnique({ where: { id: userId } });
                const callerBefore = caller.credits;
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
    static async togglePause(accountId, userId, userRole) {
        const account = await prisma_1.prisma.endUserAccount.findUnique({ where: { id: accountId } });
        if (!account || account.deletedAt) {
            throw new error_handler_1.AppError(404, 'End user account not found', 'NOT_FOUND');
        }
        if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
            throw new error_handler_1.AppError(403, 'You can only modify your own clients', 'FORBIDDEN');
        }
        let newStatus;
        if (account.status === 'ACTIVE') {
            newStatus = 'PAUSED';
            // Security: Kick the user out when pausing
            await this.revokeAccess(accountId, account.userId);
        }
        else if (account.status === 'PAUSED') {
            newStatus = 'ACTIVE';
        }
        else {
            throw new error_handler_1.AppError(400, `Cannot toggle pause for account with status "${account.status}"`, 'INVALID_STATUS');
        }
        return prisma_1.prisma.endUserAccount.update({
            where: { id: accountId },
            data: { status: newStatus },
            select: { id: true, username: true, status: true },
        });
    }
    static async listDevices(accountId, userId, userRole) {
        const account = await prisma_1.prisma.endUserAccount.findUnique({ where: { id: accountId } });
        if (!account || account.deletedAt) {
            throw new error_handler_1.AppError(404, 'End user account not found', 'NOT_FOUND');
        }
        if (!(await canAccessAccount(account.managedById, userId, userRole, false))) {
            throw new error_handler_1.AppError(403, 'You can only view your own clients\' devices', 'FORBIDDEN');
        }
        return prisma_1.prisma.deviceSession.findMany({
            where: { endUserAccountId: accountId, isActive: true },
            orderBy: { lastSeen: 'desc' },
        });
    }
    static async disconnectAllDevices(accountId, userId, userRole) {
        const account = await prisma_1.prisma.endUserAccount.findUnique({ where: { id: accountId } });
        if (!account || account.deletedAt) {
            throw new error_handler_1.AppError(404, 'End user account not found', 'NOT_FOUND');
        }
        if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
            throw new error_handler_1.AppError(403, 'You can only manage your own clients\' devices', 'FORBIDDEN');
        }
        await prisma_1.prisma.deviceSession.updateMany({
            where: { endUserAccountId: accountId },
            data: { isActive: false },
        });
        if (account.userId) {
            await prisma_1.prisma.refreshToken.deleteMany({
                where: { userId: account.userId },
            });
        }
        return { message: 'All devices disconnected' };
    }
    static async disconnectDevice(accountId, deviceId, userId, userRole) {
        const account = await prisma_1.prisma.endUserAccount.findUnique({ where: { id: accountId } });
        if (!account || account.deletedAt) {
            throw new error_handler_1.AppError(404, 'End user account not found', 'NOT_FOUND');
        }
        if (!(await canAccessAccount(account.managedById, userId, userRole, true))) {
            throw new error_handler_1.AppError(403, 'You can only manage your own clients\' devices', 'FORBIDDEN');
        }
        const device = await prisma_1.prisma.deviceSession.findUnique({ where: { id: deviceId } });
        if (!device || device.endUserAccountId !== accountId) {
            throw new error_handler_1.AppError(404, 'Device not found for this account', 'NOT_FOUND');
        }
        await prisma_1.prisma.deviceSession.update({
            where: { id: deviceId },
            data: { isActive: false },
        });
        return { message: 'Device disconnected' };
    }
    static async getPlanHistory(accountId, userId, userRole) {
        const account = await prisma_1.prisma.endUserAccount.findUnique({ where: { id: accountId } });
        if (!account || account.deletedAt) {
            throw new error_handler_1.AppError(404, 'End user account not found', 'NOT_FOUND');
        }
        if (!(await canAccessAccount(account.managedById, userId, userRole, false))) {
            throw new error_handler_1.AppError(403, 'You can only view your own clients\' history', 'FORBIDDEN');
        }
        return prisma_1.prisma.endUserPlanHistory.findMany({
            where: { endUserAccountId: accountId },
            include: {
                plan: { select: { id: true, name: true, durationDays: true, creditCost: true, isDemo: true } },
            },
            orderBy: { appliedAt: 'desc' },
        });
    }
    /**
     * Revokes all active sessions for an account (PostgreSQL + Redis).
     * Also disconnects all active devices.
     */
    static async revokeAccess(accountId, userId) {
        const REFRESH_TOKEN_PREFIX = 'refresh:';
        // 1. Disconnect all active devices
        await prisma_1.prisma.deviceSession.updateMany({
            where: { endUserAccountId: accountId, isActive: true },
            data: { isActive: false },
        });
        // 2. Revoke tokens for the linked real user (if any)
        if (userId) {
            const tokens = await prisma_1.prisma.refreshToken.findMany({ where: { userId }, select: { token: true } });
            for (const t of tokens) {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { redis } = require('../../shared/config/redis');
                await redis.del(`${REFRESH_TOKEN_PREFIX}${t.token}`);
            }
            await prisma_1.prisma.refreshToken.deleteMany({ where: { userId } });
        }
        // 3. Revoke tokens for virtual user accounts (reseller clients)
        const virtualTokens = await prisma_1.prisma.refreshToken.findMany({ where: { endUserAccountId: accountId }, select: { token: true } });
        for (const t of virtualTokens) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { redis } = require('../../shared/config/redis');
            await redis.del(`${REFRESH_TOKEN_PREFIX}${t.token}`);
        }
        await prisma_1.prisma.refreshToken.deleteMany({ where: { endUserAccountId: accountId } });
    }
}
exports.EndUsersService = EndUsersService;
//# sourceMappingURL=end-users.service.js.map