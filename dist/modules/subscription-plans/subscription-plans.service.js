"use strict";
/**
 * Subscription Plans Service — PeliPlus Reseller System
 *
 * CRUD for subscription plans used by the reseller flow.
 * These plans define credit cost and duration for end-user accounts.
 * Separate from the existing Plan model used for memberships.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionPlansService = void 0;
const prisma_1 = require("../../shared/config/prisma");
const error_handler_1 = require("../../shared/middleware/error-handler");
class SubscriptionPlansService {
    static async getActivePlans() {
        return prisma_1.prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: { durationDays: 'asc' },
        });
    }
    static async getAllPlans() {
        return prisma_1.prisma.subscriptionPlan.findMany({
            orderBy: { durationDays: 'asc' },
        });
    }
    static async getById(id) {
        const plan = await prisma_1.prisma.subscriptionPlan.findUnique({ where: { id } });
        if (!plan)
            throw new error_handler_1.AppError(404, 'Plan not found', 'NOT_FOUND');
        return plan;
    }
    static async create(data) {
        if (data.isDemo) {
            data.creditCost = 0;
            if (!data.demoHours || data.demoHours < 1) {
                throw new error_handler_1.AppError(400, 'Demo plans require demoHours >= 1', 'VALIDATION_ERROR');
            }
        }
        return prisma_1.prisma.subscriptionPlan.create({
            data: {
                name: data.name,
                description: data.description,
                durationDays: data.durationDays,
                creditCost: data.isDemo ? 0 : data.creditCost,
                isDemo: data.isDemo ?? false,
                demoHours: data.isDemo ? data.demoHours : null,
                isPromo: data.isPromo ?? false,
                bonusDays: data.bonusDays ?? 0,
                maxDevices: data.maxDevices ?? 1,
                sortOrder: data.sortOrder ?? 0,
                baseCredits: data.baseCredits ?? 0,
            },
        });
    }
    static async update(id, data) {
        await this.getById(id);
        if (data.isDemo === true) {
            data.creditCost = 0;
            if (data.demoHours !== undefined && data.demoHours !== null && data.demoHours < 1) {
                throw new error_handler_1.AppError(400, 'Demo plans require demoHours >= 1', 'VALIDATION_ERROR');
            }
        }
        return prisma_1.prisma.subscriptionPlan.update({
            where: { id },
            data,
        });
    }
    static async toggle(id) {
        const plan = await this.getById(id);
        return prisma_1.prisma.subscriptionPlan.update({
            where: { id },
            data: { isActive: !plan.isActive },
        });
    }
    static async remove(id) {
        const activeAccounts = await prisma_1.prisma.endUserAccount.count({
            where: { planId: id, status: 'ACTIVE' },
        });
        if (activeAccounts > 0) {
            throw new error_handler_1.AppError(400, `Cannot delete plan with ${activeAccounts} active accounts`, 'HAS_ACTIVE_ACCOUNTS');
        }
        return prisma_1.prisma.subscriptionPlan.delete({ where: { id } });
    }
}
exports.SubscriptionPlansService = SubscriptionPlansService;
//# sourceMappingURL=subscription-plans.service.js.map