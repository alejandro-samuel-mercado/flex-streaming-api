"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryService = void 0;
const prisma_1 = require("../../shared/config/prisma");
class HistoryService {
    static async updateWatchProgress(profileId, contentId, progress, duration, episodeId) {
        const completed = duration ? progress >= duration * 0.9 : false;
        return prisma_1.prisma.watchHistory.upsert({
            where: {
                profileId_contentId_episodeId: { profileId, contentId, episodeId: episodeId || '' },
            },
            update: { progress, duration, completed, watchedAt: new Date() },
            create: { profileId, contentId, episodeId: episodeId || null, progress, duration, completed },
        });
    }
    static async getProfileHistory(profileId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [total, history] = await Promise.all([
            prisma_1.prisma.watchHistory.count({ where: { profileId } }),
            prisma_1.prisma.watchHistory.findMany({
                where: { profileId },
                include: {
                    content: {
                        select: {
                            id: true,
                            type: true,
                            slug: true,
                            duration: true,
                            translations: { select: { language: true, title: true } },
                            thumbnails: { where: { type: 'POSTER' }, take: 1 },
                        },
                    },
                    episode: {
                        select: {
                            id: true,
                            number: true,
                            translations: { select: { language: true, title: true } },
                        },
                    },
                },
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limit,
            }),
        ]);
        return { total, pages: Math.ceil(total / limit), data: history };
    }
    static async getContinueWatching(profileId, limit = 10) {
        return prisma_1.prisma.watchHistory.findMany({
            where: { profileId, completed: false, progress: { gt: 0 } },
            include: {
                content: {
                    select: {
                        id: true,
                        type: true,
                        slug: true,
                        duration: true,
                        translations: { select: { language: true, title: true } },
                        thumbnails: { where: { type: 'POSTER' }, take: 1 },
                    },
                },
            },
            orderBy: { updatedAt: 'desc' },
            take: limit,
        });
    }
    static async getGlobalHistory(page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [total, history] = await Promise.all([
            prisma_1.prisma.watchHistory.count(),
            prisma_1.prisma.watchHistory.findMany({
                include: {
                    profile: {
                        select: {
                            id: true,
                            name: true,
                            user: { select: { email: true, name: true, role: true } }
                        }
                    },
                    content: {
                        select: {
                            id: true,
                            type: true,
                            slug: true,
                            translations: { select: { language: true, title: true } },
                        },
                    },
                    episode: {
                        select: {
                            id: true,
                            number: true,
                            translations: { select: { language: true, title: true } },
                        },
                    },
                },
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limit,
            }),
        ]);
        return { total, pages: Math.ceil(total / limit), data: history };
    }
}
exports.HistoryService = HistoryService;
//# sourceMappingURL=history.service.js.map