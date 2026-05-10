import { prisma } from '../../shared/config/prisma';

const CONTENT_SELECT = {
  id: true,
  type: true,
  slug: true,
  releaseYear: true,
  rating: true,
  translations: { select: { language: true, title: true, description: true } },
  thumbnails: { where: { type: 'POSTER' as const }, take: 1 },
};

export class FavoritesService {
  static async toggleFavorite(profileId: string, contentId: string) {
    const existing = await prisma.favorite.findUnique({
      where: { profileId_contentId: { profileId, contentId } },
    });

    try {
      if (existing) {
        await prisma.favorite.delete({
          where: { profileId_contentId: { profileId, contentId } },
        });
        return { favorited: false };
      } else {
        await prisma.favorite.create({ data: { profileId, contentId } });
        return { favorited: true };
      }
    } catch (error: any) {
      if (error.code === 'P2003') {
        console.warn(`[FavoritesService] P2003: Profile ${profileId} or Content ${contentId} not found.`);
        return { favorited: false, error: 'invalid_reference' };
      }
      throw error;
    }
  }

  static async checkFavorite(profileId: string, contentId: string) {
    const favorite = await prisma.favorite.findUnique({
      where: { profileId_contentId: { profileId, contentId } },
    });
    return !!favorite;
  }

  static async getProfileFavorites(profileId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [total, favorites] = await Promise.all([
      prisma.favorite.count({ where: { profileId } }),
      prisma.favorite.findMany({
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

  static async syncFavorites(profileId: string, contentIds: string[]) {
    if (!contentIds || contentIds.length === 0) return { synced: 0 };

    // Get existing favorites to avoid duplicates
    const existing = await prisma.favorite.findMany({
      where: { profileId, contentId: { in: contentIds } },
      select: { contentId: true }
    });
    
    const existingIds = new Set(existing.map(f => f.contentId));
    const newIds = contentIds.filter(id => !existingIds.has(id));

    if (newIds.length === 0) return { synced: 0 };

    try {
      await prisma.favorite.createMany({
        data: newIds.map(contentId => ({ profileId, contentId })),
        skipDuplicates: true,
      });
    } catch (error: any) {
      if (error.code === 'P2003') {
        console.warn(`[FavoritesService] P2003 during sync for Profile ${profileId}`);
        return { synced: 0, error: 'invalid_reference' };
      }
      throw error;
    }

    return { synced: newIds.length };
  }
}
