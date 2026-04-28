import { prisma } from '../../shared/config/prisma';

export class SearchService {
  /**
   * Global platform search across content translations, actors, and directors.
   */
  static async globalSearch(query: string, limitPerCategory = 5) {
    if (!query || query.trim().length < 2) {
      return { content: [], actors: [], directors: [] };
    }

    const searchTerm = query.trim();

    const [content, actors, directors] = await Promise.all([
      prisma.content.findMany({
        where: {
          status: { in: ['READY', 'ACTIVE'] },
          deletedAt: null,
          OR: [
            { translations: { some: { title: { contains: searchTerm, mode: 'insensitive' } } } },
            { translations: { some: { description: { contains: searchTerm, mode: 'insensitive' } } } },
            { genres: { some: { genre: { name: { contains: searchTerm, mode: 'insensitive' } } } } },
            { tags: { some: { tag: { name: { contains: searchTerm, mode: 'insensitive' } } } } },
          ],
        },
        take: limitPerCategory * 2,
        select: {
          id: true,
          type: true,
          slug: true,
          releaseYear: true,
          rating: true,
          translations: { select: { language: true, title: true } },
          thumbnails: { where: { type: 'POSTER' }, take: 1 },
          ageRating: { select: { code: true, label: true } },
        },
      }),

      prisma.actor.findMany({
        where: { name: { contains: searchTerm, mode: 'insensitive' } },
        take: limitPerCategory,
        select: { id: true, name: true, photoUrl: true },
      }),

      prisma.director.findMany({
        where: { name: { contains: searchTerm, mode: 'insensitive' } },
        take: limitPerCategory,
        select: { id: true, name: true, photoUrl: true },
      }),
    ]);

    return { content, actors, directors };
  }

  static async suggest(query: string) {
    if (!query || query.length < 2) return [];

    return prisma.content.findMany({
      where: {
        status: { in: ['READY', 'ACTIVE'] },
        deletedAt: null,
        translations: { some: { title: { startsWith: query, mode: 'insensitive' } } },
      },
      take: 8,
      select: {
        id: true,
        slug: true,
        type: true,
        translations: { select: { language: true, title: true }, take: 1 },
        thumbnails: { where: { type: 'POSTER' }, take: 1 },
      },
      orderBy: { viewCount: 'desc' },
    });
  }
}
