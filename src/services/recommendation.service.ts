import { prisma } from '../shared/config/prisma';
import { redis } from '../shared/config/redis';
import { Content } from '@prisma/client';

export class RecommendationService {
  async getRecommendationsForProfile(profileId: string): Promise<Content[]> {
    const recentHistory = await prisma.watchHistory.findMany({
      where: { profileId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { content: { include: { genres: true } } },
    });

    const genreIds = recentHistory
      .flatMap((h) => h.content?.genres.map((g) => g.genreId) || []);

    const watchedContentIds = recentHistory
      .map((h) => h.contentId)
      .filter((id): id is string => id !== null);

    // Based on genres watched but not already seen
    const becauseYouWatched = genreIds.length > 0
      ? await prisma.content.findMany({
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
    let trending: Content[] = [];
    try {
      const trendingIds = await redis.zrevrange('trending:content', 0, 19);
      if (trendingIds.length > 0) {
        trending = await prisma.content.findMany({
          where: { id: { in: trendingIds }, status: 'READY' },
        });
      }
    } catch {
      // Redis unavailable
    }

    // New content
    const newContent = await prisma.content.findMany({
      where: { status: 'READY' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Deduplicate
    const all = [...trending, ...becauseYouWatched, ...newContent];
    return [...new Map(all.map((c) => [c.id, c])).values()];
  }

  async incrementViewCount(contentId: string): Promise<void> {
    try {
      await redis.zincrby('trending:content', 1, contentId);
      await redis.expire('trending:content', 48 * 60 * 60);
    } catch {
      // Redis unavailable
    }

    await prisma.content.update({
      where: { id: contentId },
      data: { viewCount: { increment: 1 } },
    });
  }
}

export const recommendationService = new RecommendationService();
