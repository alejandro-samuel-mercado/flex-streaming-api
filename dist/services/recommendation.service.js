"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recommendationService = exports.RecommendationService = void 0;
const prisma_1 = require("../shared/config/prisma");
const redis_1 = require("../shared/config/redis");
class RecommendationService {
    async getRecommendationsForProfile(profileId) {
        const recentHistory = await prisma_1.prisma.watchHistory.findMany({
            where: { profileId },
            orderBy: { updatedAt: 'desc' },
            take: 5,
            include: { content: { include: { genres: true } } },
        });
        const genreIds = recentHistory
            .flatMap((h) => h.content?.genres.map((g) => g.genreId) || []);
        const watchedContentIds = recentHistory
            .map((h) => h.contentId)
            .filter((id) => id !== null);
        // Based on genres watched but not already seen
        const becauseYouWatched = genreIds.length > 0
            ? await prisma_1.prisma.content.findMany({
                where: {
                    status: 'READY',
                    genres: { some: { genreId: { in: genreIds } } },
                    id: { notIn: watchedContentIds },
                },
                take: 20,
                orderBy: { viewCount: 'desc' },
            })
            : [];
        // Trending (most viewed last 48h from Redis)
        let trending = [];
        try {
            const trendingIds = await redis_1.redis.zrevrange('trending:content', 0, 19);
            if (trendingIds.length > 0) {
                trending = await prisma_1.prisma.content.findMany({
                    where: { id: { in: trendingIds }, status: 'READY' },
                });
            }
        }
        catch {
            // Redis unavailable
        }
        // New content
        const newContent = await prisma_1.prisma.content.findMany({
            where: { status: 'READY' },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        // Deduplicate
        const all = [...trending, ...becauseYouWatched, ...newContent];
        return [...new Map(all.map((c) => [c.id, c])).values()];
    }
    async incrementViewCount(contentId) {
        try {
            await redis_1.redis.zincrby('trending:content', 1, contentId);
            await redis_1.redis.expire('trending:content', 48 * 60 * 60);
        }
        catch {
            // Redis unavailable
        }
        await prisma_1.prisma.content.update({
            where: { id: contentId },
            data: { viewCount: { increment: 1 } },
        });
    }
}
exports.RecommendationService = RecommendationService;
exports.recommendationService = new RecommendationService();
//# sourceMappingURL=recommendation.service.js.map