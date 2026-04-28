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

    if (existing) {
      await prisma.favorite.delete({
        where: { profileId_contentId: { profileId, contentId } },
      });
      return { favorited: false };
    } else {
      await prisma.favorite.create({ data: { profileId, contentId } });
      return { favorited: true };
    }
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
}
