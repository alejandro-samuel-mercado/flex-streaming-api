"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentService = void 0;
const prisma_1 = require("../../shared/config/prisma");
const CONTENT_LIST_SELECT = {
    id: true,
    type: true,
    status: true,
    slug: true,
    releaseYear: true,
    duration: true,
    rating: true,
    viewCount: true,
    featured: true,
    country: true,
    trailerUrl: true,
    createdAt: true,
    translations: { select: { language: true, title: true, description: true, tagline: true } },
    thumbnails: { where: { type: 'POSTER' }, take: 1 },
    genres: { include: { genre: { select: { id: true, name: true, slug: true } } } },
    ageRating: { select: { id: true, code: true, label: true } },
};
class ContentService {
    static async getAllContent(filters) {
        const { page, limit, search, type, status, genreId, tagId, actorId, year, sort } = filters;
        const skip = (page - 1) * limit;
        const where = {
            deletedAt: null,
            status: status || { in: ['READY', 'ACTIVE'] },
        };
        if (type)
            where.type = type;
        if (year)
            where.releaseYear = year;
        if (genreId)
            where.genres = { some: { genreId } };
        if (tagId)
            where.tags = { some: { tagId } };
        if (actorId)
            where.actors = { some: { actorId } };
        if (search) {
            where.translations = { some: { title: { contains: search, mode: 'insensitive' } } };
        }
        const orderBy = sort === 'popular' ? { viewCount: 'desc' } :
            sort === 'rating' ? { rating: 'desc' } :
                sort === 'az' ? { slug: 'asc' } :
                    sort === 'za' ? { slug: 'desc' } :
                        { createdAt: 'desc' };
        const [data, total] = await Promise.all([
            prisma_1.prisma.content.findMany({ where, skip, take: limit, orderBy, select: CONTENT_LIST_SELECT }),
            prisma_1.prisma.content.count({ where }),
        ]);
        return { data, total, page, limit };
    }
    static async getContentById(id, lang = 'es') {
        return prisma_1.prisma.content.findFirst({
            where: { id, deletedAt: null },
            include: {
                translations: { where: { language: { in: [lang, 'es'] } } },
                videoFiles: {
                    where: { status: 'COMPLETED' },
                    include: { qualities: true, audioTracks: true, subtitleTracks: true },
                },
                seasons: {
                    include: {
                        translations: true,
                        episodes: {
                            include: {
                                translations: true,
                                thumbnails: true,
                                videoFiles: { include: { qualities: true } },
                            },
                            orderBy: { number: 'asc' },
                        },
                    },
                    orderBy: { number: 'asc' },
                },
                thumbnails: true,
                genres: { include: { genre: true } },
                tags: { include: { tag: true } },
                actors: { include: { actor: true }, orderBy: { order: 'asc' } },
                directors: { include: { director: true } },
                ageRating: true,
                _count: { select: { reviews: true, watchHistory: true } },
            },
        });
    }
    static async getFeaturedContent() {
        return prisma_1.prisma.content.findMany({
            where: { featured: true, status: { in: ['READY', 'ACTIVE'] }, deletedAt: null },
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: CONTENT_LIST_SELECT,
        });
    }
    static async getTrendingContent() {
        return prisma_1.prisma.content.findMany({
            where: { status: { in: ['READY', 'ACTIVE'] }, deletedAt: null },
            orderBy: { viewCount: 'desc' },
            take: 12,
            select: CONTENT_LIST_SELECT,
        });
    }
    static async getRecentContent() {
        return prisma_1.prisma.content.findMany({
            where: { status: { in: ['READY', 'ACTIVE'] }, deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 12,
            select: CONTENT_LIST_SELECT,
        });
    }
    static async getRelatedContent(contentId) {
        const content = await prisma_1.prisma.content.findUnique({
            where: { id: contentId },
            include: { genres: true },
        });
        if (!content)
            return [];
        const genreIds = content.genres.map((g) => g.genreId);
        return prisma_1.prisma.content.findMany({
            where: {
                id: { not: contentId },
                status: { in: ['READY', 'ACTIVE'] },
                deletedAt: null,
                genres: genreIds.length > 0 ? { some: { genreId: { in: genreIds } } } : undefined,
            },
            take: 12,
            orderBy: { viewCount: 'desc' },
            select: CONTENT_LIST_SELECT,
        });
    }
    static async createContent(data) {
        const { genreIds, tagIds, actorIds, directorIds, translations, ...contentData } = data;
        return prisma_1.prisma.content.create({
            data: {
                ...contentData,
                translations: translations ? { create: translations } : undefined,
                genres: genreIds ? { create: genreIds.map((id) => ({ genreId: id })) } : undefined,
                tags: tagIds ? { create: tagIds.map((id) => ({ tagId: id })) } : undefined,
                actors: actorIds ? { create: actorIds.map((id, idx) => ({ actorId: id, order: idx })) } : undefined,
                directors: directorIds ? { create: directorIds.map((id) => ({ directorId: id })) } : undefined,
            },
        });
    }
    static async updateContent(id, data) {
        const { genreIds, tagIds, actorIds, directorIds, translations, ...contentData } = data;
        const updateData = { ...contentData };
        if (genreIds) {
            await prisma_1.prisma.contentGenre.deleteMany({ where: { contentId: id } });
            updateData.genres = { create: genreIds.map((gid) => ({ genreId: gid })) };
        }
        if (tagIds) {
            await prisma_1.prisma.contentTag.deleteMany({ where: { contentId: id } });
            updateData.tags = { create: tagIds.map((tid) => ({ tagId: tid })) };
        }
        if (actorIds) {
            await prisma_1.prisma.contentActor.deleteMany({ where: { contentId: id } });
            updateData.actors = { create: actorIds.map((aid, idx) => ({ actorId: aid, order: idx })) };
        }
        if (directorIds) {
            await prisma_1.prisma.contentDirector.deleteMany({ where: { contentId: id } });
            updateData.directors = { create: directorIds.map((did) => ({ directorId: did })) };
        }
        return prisma_1.prisma.content.update({ where: { id }, data: updateData });
    }
    static async deleteContent(id) {
        return prisma_1.prisma.content.update({ where: { id }, data: { deletedAt: new Date() } });
    }
}
exports.ContentService = ContentService;
//# sourceMappingURL=content.service.js.map