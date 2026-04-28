"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesService = void 0;
const prisma_1 = require("../../shared/config/prisma");
const client_1 = require("@prisma/client");
class CategoriesService {
    // ─── Content Types ────────────────────────────────────────────────────────
    static async getAllContentTypes() {
        return Object.values(client_1.ContentType);
    }
    // ─── Genres ─────────────────────────────────────────────────────────────
    static async getAllGenres() {
        return prisma_1.prisma.genre.findMany({ orderBy: { name: 'asc' } });
    }
    static async createGenre(data) {
        return prisma_1.prisma.genre.create({ data });
    }
    static async updateGenre(id, data) {
        return prisma_1.prisma.genre.update({ where: { id }, data });
    }
    static async deleteGenre(id) {
        return prisma_1.prisma.genre.delete({ where: { id } });
    }
    // ─── Age Ratings ────────────────────────────────────────────────────────
    static async getAllAgeRatings() {
        return prisma_1.prisma.ageRating.findMany({ orderBy: { code: 'asc' } });
    }
    static async createAgeRating(data) {
        return prisma_1.prisma.ageRating.create({ data });
    }
    static async updateAgeRating(id, data) {
        return prisma_1.prisma.ageRating.update({ where: { id }, data });
    }
    static async deleteAgeRating(id) {
        return prisma_1.prisma.ageRating.delete({ where: { id } });
    }
    // ─── Tags ───────────────────────────────────────────────────────────────
    static async getAllTags() {
        return prisma_1.prisma.tag.findMany({ orderBy: { name: 'asc' } });
    }
    static async createTag(data) {
        return prisma_1.prisma.tag.create({ data });
    }
    static async updateTag(id, data) {
        return prisma_1.prisma.tag.update({ where: { id }, data });
    }
    static async deleteTag(id) {
        return prisma_1.prisma.tag.delete({ where: { id } });
    }
}
exports.CategoriesService = CategoriesService;
//# sourceMappingURL=categories.service.js.map