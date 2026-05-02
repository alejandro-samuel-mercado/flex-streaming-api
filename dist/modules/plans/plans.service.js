"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlansService = void 0;
const prisma_1 = require("../../shared/config/prisma");
class PlansService {
    static async getActivePlans() {
        return prisma_1.prisma.plan.findMany({
            where: { isActive: true },
            orderBy: { price: 'asc' },
        });
    }
}
exports.PlansService = PlansService;
//# sourceMappingURL=plans.service.js.map