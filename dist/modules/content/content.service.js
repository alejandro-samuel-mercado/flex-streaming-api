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
    isPinned: true,
    translations: { select: { language: true, title: true, description: true, tagline: true } },
    thumbnails: { where: { type: 'POSTER' }, take: 1 },
    genres: { include: { genre: { select: { id: true, name: true, slug: true } } } },
    platform: { select: { name: true, logoUrl: true } },
    ageRating: { select: { id: true, code: true, label: true } },
    videoFiles: { select: { type: true, status: true, qualities: { select: { resolution: true } } } },
};
class ContentService {
    static async getAllContent(filters) {
        const { page, limit, search, type, status, genreId, tagId, platformId, isFree, featured, sort, incomplete, minYear, isPublic } = filters;
        const skip = (page - 1) * limit;
        // 1. Initialize an empty AND array
        const conditions = [
            { deletedAt: null }
        ];
        if (status === 'WITH_ERRORS') {
            // Filtro especial: series con al menos un episodio fallido o sin videos
            conditions.push({
                seasons: {
                    some: {
                        episodes: {
                            some: {
                                OR: [
                                    { videoFiles: { some: { status: 'FAILED' } } },
                                    { videoFiles: { none: {} } }
                                ]
                            }
                        }
                    }
                }
            });
        }
        else if (status) {
            // Admin pasando un status explícito: respetar lo que pide
            conditions.push({ status: status });
        }
        else if (isPublic) {
            // Llamada pública sin filtro de status: solo mostrar contenido listo
            conditions.push({ status: { in: ['READY', 'ACTIVE'] } });
        }
        // Si es Admin y no hay filtro de status explícito, no aplicamos ningún filtro de status
        // para que pueda ver todo (ERROR, INACTIVE, UPCOMING, etc.)
        // 2b. En llamadas públicas, filtrar por contenido que tenga video disponible
        if (isPublic) {
            conditions.push({
                OR: [
                    // Películas / contenido directo con al menos un video listo
                    { videoFiles: { some: { status: 'COMPLETED' } } },
                    // Series / Anime: al menos un episodio con video listo
                    {
                        seasons: {
                            some: {
                                episodes: {
                                    some: {
                                        videoFiles: { some: { status: 'COMPLETED' } }
                                    }
                                }
                            }
                        }
                    }
                ]
            });
        }
        // 3. Type condition
        if (type) {
            if (type === 'KIDS' || type === 'ANIMATION') {
                conditions.push({
                    OR: [
                        { type: 'ANIMATION' },
                        { type: 'KIDS' },
                        { genres: { some: { genre: { name: { contains: 'Animac', mode: 'insensitive' } } } } },
                        { genres: { some: { genre: { name: { contains: 'Infant', mode: 'insensitive' } } } } },
                        { genres: { some: { genre: { name: { contains: 'Kids', mode: 'insensitive' } } } } }
                    ]
                });
            }
            else {
                conditions.push({ type: type });
            }
        }
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
        // Attach episode/failed counts for all series types
        const SERIES_TYPES_LIST = ['SERIES', 'ANIME', 'ANIMATION', 'NOVELA', 'REALITY_SHOW', 'DOCUMENTARY', 'KIDS', 'FAMILY'];
        const dataWithCounts = await Promise.all(data.map(async (item) => {
            if (SERIES_TYPES_LIST.includes(item.type)) {
                const [episodeCount, failedCount, emptyEpisodesCount] = await Promise.all([
                    prisma_1.prisma.episode.count({
                        where: {
                            season: { contentId: item.id },
                            videoFiles: { some: { status: 'COMPLETED' } }
                        }
                    }),
                    prisma_1.prisma.videoFile.count({
                        where: {
                            status: 'FAILED',
                            episode: { season: { contentId: item.id } }
                        }
                    }),
                    prisma_1.prisma.episode.count({
                        where: {
                            season: { contentId: item.id },
                            videoFiles: { none: {} }
                        }
                    })
                ]);
                return { ...item, episodeCount, failedCount, emptyEpisodesCount };
            }
            return item;
        }));
        return { data: dataWithCounts, total, page, limit };
    }
    static async getContentById(idOrSlug, lang = 'es', isAdmin = false) {
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
                            where: isAdmin ? undefined : {
                                videoFiles: { some: { status: 'COMPLETED' } }
                            },
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
        // Prevent frontend from wiping out TMDB ID on edit, which breaks scanner linkage
        if (!cleanContentData.tmdbId || cleanContentData.tmdbId === '' || cleanContentData.tmdbId === 'null') {
            delete cleanContentData.tmdbId;
        }
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
    static async bulkAction(action, ids, status) {
        if (!ids || ids.length === 0)
            return { count: 0 };
        const whereClause = {
            id: { in: ids },
            ...((action === 'delete' || action === 'changeStatus') ? { isPinned: false } : {})
        };
        if (action === 'delete') {
            return prisma_1.prisma.content.updateMany({
                where: whereClause,
                data: { deletedAt: new Date() }
            });
        }
        else if (action === 'changeStatus' && status) {
            return prisma_1.prisma.content.updateMany({
                where: whereClause,
                data: { status }
            });
        }
        else if (action === 'pin') {
            return prisma_1.prisma.content.updateMany({
                where: { id: { in: ids } },
                data: { isPinned: true }
            });
        }
        else if (action === 'unpin') {
            return prisma_1.prisma.content.updateMany({
                where: { id: { in: ids } },
                data: { isPinned: false }
            });
        }
        return { count: 0 };
    }
}
exports.ContentService = ContentService;
//# sourceMappingURL=content.service.js.map