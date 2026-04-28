import { prisma } from '../../shared/config/prisma';

export class HistoryService {
  static async updateWatchProgress(profileId: string, contentId: string, progress: number, duration?: number, episodeId?: string) {
    const completed = duration ? progress >= duration * 0.9 : false;

    return prisma.watchHistory.upsert({
      where: {
        profileId_contentId_episodeId: { profileId, contentId, episodeId: episodeId || '' },
      },
      update: { progress, duration, completed, watchedAt: new Date() },
      create: { profileId, contentId, episodeId: episodeId || null, progress, duration, completed },
    });
  }

  static async getProfileHistory(profileId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [total, history] = await Promise.all([
      prisma.watchHistory.count({ where: { profileId } }),
      prisma.watchHistory.findMany({
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

  static async getContinueWatching(profileId: string, limit = 10) {
    return prisma.watchHistory.findMany({
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
}
