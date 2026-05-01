import { prisma } from '../../shared/config/prisma';

export class PlansService {
  static async getActivePlans() {
    return prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
  }
}
