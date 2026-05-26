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
    originalTitle: true,
    trailerUrl: true,
    createdAt: true,
    isFreeWithMembership: true,
    translations: { select: { language: true, title: true, description: true, tagline: true } },
    thumbnails: { where: { type: 'POSTER' }, take: 1 },
    genres: { include: { genre: { select: { id: true, name: true, slug: true } } } },
    platform: { select: { name: true, logoUrl: true } },
    ageRating: { select: { id: true, code: true, label: true } },
    videoFiles: { select: { type: true, status: true, qualities: { select: { resolution: true } } } },
};
class ContentService {
    static async getAllContent(filters) {
        const { page, limit, search, type, status, genreId, tagId, platformId, isFree, featured, sort, incomplete, minYear } = filters;
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
        // 5b. Tag filter
        if (tagId)
            conditions.push({ tags: { some: { tagId } } });
        // 5c. Free / Featured
        if (isFree !== undefined) {
            conditions.push({ isFreeWithMembership: !isFree });
        }
        if (featured !== undefined) {
            conditions.push({ featured });
        }
        if (minYear !== undefined) {
            conditions.push({ releaseYear: { gte: minYear } });
        }
        // 5d. Incomplete filter
        if (incomplete) {
            conditions.push({
                status: 'PENDING',
                OR: [
                    { translations: { none: {} } },
                    { translations: { every: { description: { equals: '' } } } },
                    { thumbnails: { none: { type: 'POSTER' } } }
                ]
            });
        }
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
                sort === 'az' ? { title: 'asc' } :
                    sort === 'za' ? { title: 'desc' } :
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
        // Attach episode count for series to show in the admin list
        const dataWithCounts = await Promise.all(data.map(async (item) => {
            if (item.type === 'SERIES' || item.type === 'ANIME') {
                const count = await prisma_1.prisma.episode.count({
                    where: {
                        season: { contentId: item.id },
                        videoFiles: { some: { status: 'COMPLETED' } }
                    }
                });
                return { ...item, episodeCount: count };
            }
            return item;
        }));
        return { data: dataWithCounts, total, page, limit };
    }
    static async getContentById(idOrSlug, lang = 'es') {
        return prisma_1.prisma.content.findFirst({
            where: {
                OR: [
                    { id: idOrSlug },
                    { slug: idOrSlug }
                ],
                deletedAt: null
            },
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
        const { genreIds, tagIds, actorIds, directorIds, translations, ...contentData } = data;
        const originalTitle = data.originalTitle;
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
        const mainTitle = processedTranslations?.find((t) => t.language === 'es' && t.title)?.title
            || processedTranslations?.find((t) => t.title)?.title
            || originalTitle;
        const content = await prisma_1.prisma.content.create({
            data: {
                ...finalContentData,
                originalTitle: originalTitle || null,
                title: mainTitle,
                translations: processedTranslations ? { create: processedTranslations } : undefined,
                genres: genreIds ? { create: genreIds.map((id) => ({ genreId: id })) } : undefined,
                tags: tagIds ? { create: tagIds.map((id) => ({ tagId: id })) } : undefined,
                actors: data.actors ? {
                    create: data.actors.map((actor, idx) => ({
                        order: idx,
                        character: actor.character || null,
                        actor: {
                            connectOrCreate: {
                                where: { tmdbId: actor.tmdbId?.toString() || `temp-${Date.now()}-${idx}` },
                                create: {
                                    name: actor.name,
                                    tmdbId: actor.tmdbId?.toString() || null,
                                    photoUrl: actor.photoUrl || null
                                }
                            }
                        }
                    }))
                } : actorIds ? { create: actorIds.map((id, idx) => ({ actorId: id, order: idx })) } : undefined,
                directors: data.directors ? {
                    create: data.directors.map((director) => ({
                        director: {
                            connectOrCreate: {
                                where: { tmdbId: director.tmdbId?.toString() || `temp-${Date.now()}` },
                                create: {
                                    name: director.name,
                                    tmdbId: director.tmdbId?.toString() || null,
                                    photoUrl: director.photoUrl || null
                                }
                            }
                        }
                    }))
                } : directorIds ? { create: directorIds.map((id) => ({ directorId: id })) } : undefined,
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
        const { genreIds, tagIds, actorIds, directorIds, translations, ...contentData } = data;
        const originalTitle = data.originalTitle;
        const processedTranslations = translations?.map((t) => ({
            language: t.language,
            title: t.title,
            description: t.description || t.synopsis || '',
            tagline: t.tagline
        }));
        // Handle raw actors/directors for updates if passed (for TMDB import on edit)
        let actorsOperation = undefined;
        if (data.actors) {
            actorsOperation = {
                deleteMany: {},
                create: data.actors.map((actor, idx) => ({
                    order: idx,
                    character: actor.character || null,
                    actor: {
                        connectOrCreate: {
                            where: { tmdbId: actor.tmdbId?.toString() || `temp-${Date.now()}-${idx}` },
                            create: {
                                name: actor.name,
                                tmdbId: actor.tmdbId?.toString() || null,
                                photoUrl: actor.photoUrl || null
                            }
                        }
                    }
                }))
            };
        }
        else if (actorIds) {
            actorsOperation = {
                deleteMany: {},
                create: actorIds.map((id, idx) => ({ actorId: id, order: idx }))
            };
        }
        let directorsOperation = undefined;
        if (data.directors) {
            directorsOperation = {
                deleteMany: {},
                create: data.directors.map((director) => ({
                    director: {
                        connectOrCreate: {
                            where: { tmdbId: director.tmdbId?.toString() || `temp-${Date.now()}` },
                            create: {
                                name: director.name,
                                tmdbId: director.tmdbId?.toString() || null,
                                photoUrl: director.photoUrl || null
                            }
                        }
                    }
                }))
            };
        }
        else if (directorIds) {
            directorsOperation = {
                deleteMany: {},
                create: directorIds.map((id) => ({ directorId: id }))
            };
        }
        const mainTitle = processedTranslations?.find((t) => t.language === 'es' && t.title)?.title
            || processedTranslations?.find((t) => t.title)?.title
            || originalTitle;
        // Clean up contentData and handle BigInts
        const { platformId, budget, revenue, ...cleanContentData } = contentData;
        return prisma_1.prisma.content.update({
            where: { id },
            data: {
                ...cleanContentData,
                originalTitle: originalTitle !== undefined ? originalTitle : undefined,
                budget: budget !== undefined ? (budget ? BigInt(budget) : null) : undefined,
                revenue: revenue !== undefined ? (revenue ? BigInt(revenue) : null) : undefined,
                title: mainTitle !== undefined ? mainTitle : undefined,
                platform: platformId !== undefined ? (platformId ? { connect: { id: platformId } } : { disconnect: true }) : undefined,
                translations: (processedTranslations && processedTranslations.length > 0) ? {
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
                actors: actorsOperation,
                directors: directorsOperation,
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