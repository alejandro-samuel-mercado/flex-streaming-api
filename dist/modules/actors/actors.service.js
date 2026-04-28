"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActorsService = void 0;
const prisma_1 = require("../../shared/config/prisma");
class ActorsService {
    // ─── Actors ─────────────────────────────────────────────────────────────────
    static async getAllActors(page = 1, limit = 50, search) {
        const skip = (page - 1) * limit;
        const where = search ? { name: { contains: search, mode: 'insensitive' } } : {};
        const [data, total] = await Promise.all([
            prisma_1.prisma.actor.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
            prisma_1.prisma.actor.count({ where }),
        ]);
        return { data, total, page, limit };
    }
    static async getActorById(id) {
        return prisma_1.prisma.actor.findUnique({
            where: { id },
            include: {
                contents: {
                    include: {
                        content: {
                            select: { id: true, slug: true, releaseYear: true, type: true },
                        },
                    },
                },
            },
        });
    }
    static async createActor(data) {
        return prisma_1.prisma.actor.create({ data });
    }
    static async updateActor(id, data) {
        return prisma_1.prisma.actor.update({ where: { id }, data });
    }
    static async deleteActor(id) {
        return prisma_1.prisma.actor.delete({ where: { id } });
    }
    // ─── Directors ──────────────────────────────────────────────────────────────
    static async getAllDirectors(page = 1, limit = 50, search) {
        const skip = (page - 1) * limit;
        const where = search ? { name: { contains: search, mode: 'insensitive' } } : {};
        const [data, total] = await Promise.all([
            prisma_1.prisma.director.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
            prisma_1.prisma.director.count({ where }),
        ]);
        return { data, total, page, limit };
    }
    static async getDirectorById(id) {
        return prisma_1.prisma.director.findUnique({
            where: { id },
            include: {
                contents: {
                    include: {
                        content: {
                            select: { id: true, slug: true, releaseYear: true, type: true },
                        },
                    },
                },
            },
        });
    }
    static async createDirector(data) {
        return prisma_1.prisma.director.create({ data });
    }
    static async updateDirector(id, data) {
        return prisma_1.prisma.director.update({ where: { id }, data });
    }
    static async deleteDirector(id) {
        return prisma_1.prisma.director.delete({ where: { id } });
    }
}
exports.ActorsService = ActorsService;
//# sourceMappingURL=actors.service.js.map