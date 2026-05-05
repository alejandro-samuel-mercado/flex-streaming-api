/**
 * Subscription Plans Service — PeliPlus Reseller System
 *
 * CRUD for subscription plans used by the reseller flow.
 * These plans define credit cost and duration for end-user accounts.
 * Separate from the existing Plan model used for memberships.
 */

import { prisma } from '../../shared/config/prisma';
import { AppError } from '../../shared/middleware/error-handler';

export class SubscriptionPlansService {
  static async getActivePlans() {
    return prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { durationDays: 'asc' },
    });
  }

  static async getAllPlans() {
    return prisma.subscriptionPlan.findMany({
      orderBy: { durationDays: 'asc' },
    });
  }


  static async getById(id: string) {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new AppError(404, 'Plan not found', 'NOT_FOUND');
    return plan;
  }

  static async create(data: {
    name: string;
    description?: string;
    durationDays: number;
    creditCost: number;
    isDemo?: boolean;
    demoHours?: number | null;
    isPromo?: boolean;
    bonusDays?: number;
    maxDevices?: number;
    sortOrder?: number;
    baseCredits?: number;
  }) {

    if (data.isDemo) {
      data.creditCost = 0;
      if (!data.demoHours || data.demoHours < 1) {
        throw new AppError(400, 'Demo plans require demoHours >= 1', 'VALIDATION_ERROR');
      }
    }

    return prisma.subscriptionPlan.create({
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

  static async update(id: string, data: {
    name?: string;
    description?: string;
    durationDays?: number;
    creditCost?: number;
    isDemo?: boolean;
    demoHours?: number | null;
    isPromo?: boolean;
    bonusDays?: number;
    maxDevices?: number;
    sortOrder?: number;
    baseCredits?: number;
  }) {

    await this.getById(id);

    if (data.isDemo === true) {
      data.creditCost = 0;
      if (data.demoHours !== undefined && data.demoHours !== null && data.demoHours < 1) {
        throw new AppError(400, 'Demo plans require demoHours >= 1', 'VALIDATION_ERROR');
      }
    }

    return prisma.subscriptionPlan.update({
      where: { id },
      data,
    });
  }

  static async toggle(id: string) {
    const plan = await this.getById(id);
    return prisma.subscriptionPlan.update({
      where: { id },
      data: { isActive: !plan.isActive },
    });
  }

  static async remove(id: string) {
    const activeAccounts = await prisma.endUserAccount.count({
      where: { planId: id, status: 'ACTIVE' },
    });

    if (activeAccounts > 0) {
      throw new AppError(400, `Cannot delete plan with ${activeAccounts} active accounts`, 'HAS_ACTIVE_ACCOUNTS');
    }

    return prisma.subscriptionPlan.delete({ where: { id } });
  }
}
