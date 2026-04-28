"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformsService = void 0;
const prisma_1 = require("../../shared/config/prisma");
class PlatformsService {
    static async getAll() {
        return prisma_1.prisma.platform.findMany({
            orderBy: { isFeatured: 'desc' },
        });
    }
    static async getBySlug(slug) {
        return prisma_1.prisma.platform.findUnique({
            where: { slug },
            include: {
                contents: {
                    include: { translations: true }
                }
            }
        });
    }
    static async create(data) {
        return prisma_1.prisma.platform.create({ data });
    }
}
exports.PlatformsService = PlatformsService;
//# sourceMappingURL=platforms.service.js.map