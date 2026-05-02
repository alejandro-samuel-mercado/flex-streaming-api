"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentService = void 0;
const prisma_1 = require("../../shared/config/prisma");
const tmdb_service_1 = require("../../services/tmdb.service");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("../../shared/config/env");
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
    videoFiles: { select: { status: true } },
};
class ContentService {
    static async getAllContent(filters) {
        const { page, limit, search, type, status, genreId, platformId, sort } = filters;
        const skip = (page - 1) * limit;
        // 1. Initialize an empty AND array
        const conditions = [
            { deletedAt: null }
        ];
        // 2. Status condition
        if (status) {
            conditions.push({ status: status });
        }
        else {
            conditions.push({ status: { in: ['READY', 'ACTIVE', 'PENDING', 'PROCESSING', 'UPLOADING', 'DRAFT'] } });
        }
        // 3. Type condition
        if (type)
            conditions.push({ type: type });
        // 4. Platform filter - THE IMPORTANT ONE
        if (platformId && platformId !== 'null' && platformId !== 'undefined' && platformId !== '') {
            console.log(`[DEBUG] PLATFORM FILTER DETECTED: "${platformId}"`);
            conditions.push({ platformId: platformId });
        }
        // 5. Genre filter
        if (genreId)
            conditions.push({ genres: { some: { genreId } } });
        // 6. Search filter
        if (search) {
            conditions.push({
                translations: { some: { title: { contains: search, mode: 'insensitive' } } }
            });
        }
        // 7. Assemble the final where
        const where = {
            AND: conditions
        };
        console.log('[DEBUG] Final Prisma Where:', JSON.stringify(where, null, 2));
        const orderBy = sort === 'popular' ? { viewCount: 'desc' } :
            sort === 'rating' ? { rating: 'desc' } :
                sort === 'az' ? { slug: 'asc' } :
                    sort === 'za' ? { slug: 'desc' } :
                        sort === 'oldest' ? { createdAt: 'asc' } :
                            { createdAt: 'desc' };
        const [data, total] = await Promise.all([
            prisma_1.prisma.content.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                select: {
                    ...CONTENT_LIST_SELECT,
                    platform: { select: { id: true, name: true, logoUrl: true } }
                }
            }),
            prisma_1.prisma.content.count({ where }),
        ]);
        return { data, total, page, limit };
    }
    static async getContentById(id, lang = 'es') {
        return prisma_1.prisma.content.findFirst({
            where: { id, deletedAt: null },
            include: {
                translations: { where: { language: { in: [lang, 'es'] } } },
                genres: { include: { genre: true } },
                tags: { include: { tag: true } },
                actors: { include: { actor: true }, orderBy: { order: 'asc' } },
                directors: { include: { director: true } },
                platform: true,
                ageRating: true,
                thumbnails: true,
                videoFiles: {
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
        const { genreIds, tagIds, actorIds, directorIds, translations, originalTitle, ...contentData } = data;
        // Generate slug if missing
        if (!contentData.slug) {
            const title = originalTitle || translations?.[0]?.title;
            if (title) {
                contentData.slug = title.toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '');
                // Add a small random suffix for uniqueness
                contentData.slug += '-' + Math.random().toString(36).substring(2, 6);
            }
            else {
                contentData.slug = 'content-' + Date.now();
            }
        }
        // Map synopsis to description (schema uses description)
        const processedTranslations = translations?.map((t) => ({
            language: t.language,
            title: t.title,
            description: t.description || t.synopsis || '',
            tagline: t.tagline
        }));
        const { posterPath, backdropPath, ...finalContentData } = contentData;
        const content = await prisma_1.prisma.content.create({
            data: {
                ...finalContentData,
                translations: processedTranslations ? { create: processedTranslations } : undefined,
                genres: genreIds ? { create: genreIds.map((id) => ({ genreId: id })) } : undefined,
                tags: tagIds ? { create: tagIds.map((id) => ({ tagId: id })) } : undefined,
                actors: actorIds ? { create: actorIds.map((id, idx) => ({ actorId: id, order: idx })) } : undefined,
                directors: directorIds ? { create: directorIds.map((id) => ({ directorId: id })) } : undefined,
            },
        });
        // ─── Post-Creation: TMDB Image Import ────────────────────────────────
        if (posterPath || backdropPath) {
            const mediaFolder = path_1.default.join(env_1.env.MEDIA_PATH, 'thumbnails', content.id);
            if (!fs_1.default.existsSync(mediaFolder))
                fs_1.default.mkdirSync(mediaFolder, { recursive: true });
            if (posterPath) {
                const localPosterPath = path_1.default.join(mediaFolder, 'poster.jpg');
                await tmdb_service_1.TMDBService.downloadImage(posterPath, localPosterPath);
                await prisma_1.prisma.thumbnail.create({
                    data: {
                        contentId: content.id,
                        type: 'POSTER',
                        url: `/media/thumbnails/${content.id}/poster.jpg`
                    }
                });
            }
            if (backdropPath) {
                const localBackdropPath = path_1.default.join(mediaFolder, 'backdrop.jpg');
                await tmdb_service_1.TMDBService.downloadImage(backdropPath, localBackdropPath);
                await prisma_1.prisma.thumbnail.create({
                    data: {
                        contentId: content.id,
                        type: 'BACKDROP',
                        url: `/media/thumbnails/${content.id}/backdrop.jpg`
                    }
                });
            }
        }
        return content;
    }
    static async updateContent(id, data) {
        const { genreIds, tagIds, actorIds, directorIds, translations, originalTitle, ...contentData } = data;
        const processedTranslations = translations?.map((t) => ({
            language: t.language,
            title: t.title,
            description: t.description || t.synopsis || '',
            tagline: t.tagline
        }));
        return prisma_1.prisma.content.update({
            where: { id },
            data: {
                ...contentData,
                translations: processedTranslations ? {
                    deleteMany: {},
                    create: processedTranslations
                } : undefined,
                genres: genreIds ? {
                    deleteMany: {},
                    create: genreIds.map((id) => ({ genreId: id }))
                } : undefined,
                tags: tagIds ? {
                    deleteMany: {},
                    create: tagIds.map((id) => ({ tagId: id }))
                } : undefined,
                actors: actorIds ? {
                    deleteMany: {},
                    create: actorIds.map((id, idx) => ({ actorId: id, order: idx }))
                } : undefined,
                directors: directorIds ? {
                    deleteMany: {},
                    create: directorIds.map((id) => ({ directorId: id }))
                } : undefined,
            },
            include: {
                translations: true,
                genres: { include: { genre: true } },
                tags: { include: { tag: true } },
                actors: { include: { actor: true }, orderBy: { order: 'asc' } },
                directors: { include: { director: true } },
                thumbnails: true,
                videoFiles: { include: { qualities: true } }
            }
        });
    }
    static async deleteContent(id) {
        return prisma_1.prisma.content.update({ where: { id }, data: { deletedAt: new Date() } });
    }
}
exports.ContentService = ContentService;
//# sourceMappingURL=content.service.js.map