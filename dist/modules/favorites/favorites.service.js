"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FavoritesService = void 0;
const prisma_1 = require("../../shared/config/prisma");
const CONTENT_SELECT = {
    id: true,
    type: true,
    slug: true,
    releaseYear: true,
    rating: true,
    translations: { select: { language: true, title: true, description: true } },
    thumbnails: { where: { type: 'POSTER' }, take: 1 },
};
class FavoritesService {
    static async toggleFavorite(profileId, contentId) {
        const existing = await prisma_1.prisma.favorite.findUnique({
            where: { profileId_contentId: { profileId, contentId } },
        });
        try {
            if (existing) {
                await prisma_1.prisma.favorite.delete({
                    where: { profileId_contentId: { profileId, contentId } },
                });
                return { favorited: false };
            }
            else {
                await prisma_1.prisma.favorite.create({ data: { profileId, contentId } });
                return { favorited: true };
            }
        }
        catch (error) {
            if (error.code === 'P2025') {
                // Record was already deleted by another request, just return success
                return { favorited: false };
            }
            if (error.code === 'P2003') {
                console.warn(`[FavoritesService] P2003: Profile ${profileId} or Content ${contentId} not found.`);
                return { favorited: false, error: 'invalid_reference' };
            }
            throw error;
        }
    }
    static async checkFavorite(profileId, contentId) {
        const favorite = await prisma_1.prisma.favorite.findUnique({
            where: { profileId_contentId: { profileId, contentId } },
        });
        return !!favorite;
    }
    /** Batch-check: ONE DB query for ALL content IDs. Returns a map { [contentId]: boolean } */
    static async batchCheckFavorites(profileId, contentIds) {
        const favorites = await prisma_1.prisma.favorite.findMany({
            where: { profileId, contentId: { in: contentIds } },
            select: { contentId: true },
        });
        const favSet = new Set(favorites.map(f => f.contentId));
        const result = {};
        for (const id of contentIds)
            result[id] = favSet.has(id);
        return result;
    }
    static async getProfileFavorites(profileId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [total, favorites] = await Promise.all([
            prisma_1.prisma.favorite.count({ where: { profileId } }),
            prisma_1.prisma.favorite.findMany({
                where: { profileId },
                include: { content: { select: CONTENT_SELECT } },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
        ]);
        return {
            total,
            pages: Math.ceil(total / limit),
            data: favorites.map((f) => f.content),
        };
    }
    static async syncFavorites(profileId, contentIds) {
        if (!contentIds || contentIds.length === 0)
            return { synced: 0 };
        // Get existing favorites to avoid duplicates
        const existing = await prisma_1.prisma.favorite.findMany({
            where: { profileId, contentId: { in: contentIds } },
            select: { contentId: true }
        });
        const existingIds = new Set(existing.map(f => f.contentId));
        const newIds = contentIds.filter(id => !existingIds.has(id));
        if (newIds.length === 0)
            return { synced: 0 };
        try {
            await prisma_1.prisma.favorite.createMany({
                data: newIds.map(contentId => ({ profileId, contentId })),
                skipDuplicates: true,
            });
        }
        catch (error) {
            if (error.code === 'P2003') {
                console.warn(`[FavoritesService] P2003 during sync for Profile ${profileId}`);
                return { synced: 0, error: 'invalid_reference' };
            }
            throw error;
        }
        return { synced: newIds.length };
    }
}
exports.FavoritesService = FavoritesService;
//# sourceMappingURL=favorites.service.js.map