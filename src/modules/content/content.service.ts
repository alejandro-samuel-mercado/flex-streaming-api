import { prisma } from '../../shared/config/prisma';
import { ContentStatus, ContentType, Prisma } from '@prisma/client';

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
  trailerUrl: true,
  createdAt: true,
  translations: { select: { language: true, title: true, description: true, tagline: true } },
  thumbnails: { where: { type: 'POSTER' }, take: 1 },
  genres: { include: { genre: { select: { id: true, name: true, slug: true } } } },
  ageRating: { select: { id: true, code: true, label: true } },
} satisfies Prisma.ContentSelect;

export class ContentService {
  static async getAllContent(filters: {
    page: number;
    limit: number;
    search?: string;
    type?: string;
    status?: string;
    genreId?: string;
    tagId?: string;
    actorId?: string;
    platformId?: string;
    isFree?: boolean;
    minYear?: number;
    maxYear?: number;
    minDuration?: number;
    maxDuration?: number;
    sort: string;
    lang: string;
  }) {
    const { 
      page, limit, search, type, status, genreId, tagId, actorId, 
      platformId, isFree, minYear, maxYear, minDuration, maxDuration, sort 
    } = filters;
    
    const skip = (page - 1) * limit;

    // 1. Initialize an empty AND array
    const conditions: Prisma.ContentWhereInput[] = [
      { deletedAt: null }
    ];

    // 2. Status condition
    if (status) {
      conditions.push({ status: status as ContentStatus });
    } else {
      conditions.push({ status: { in: ['READY', 'ACTIVE', 'PENDING', 'PROCESSING', 'UPLOADING', 'DRAFT'] } });
    }

    // 3. Type condition
    if (type) conditions.push({ type: type as ContentType });
    
    // 4. Platform filter - THE IMPORTANT ONE
    if (platformId && platformId !== 'null' && platformId !== 'undefined' && platformId !== '') {
      console.log(`[DEBUG] PLATFORM FILTER DETECTED: "${platformId}"`);
      conditions.push({ platformId: platformId });
    }

    // 5. Genre filter
    if (genreId) conditions.push({ genres: { some: { genreId } } });
    
    // 6. Search filter
    if (search) {
      conditions.push({
        translations: { some: { title: { contains: search, mode: 'insensitive' } } }
      });
    }

    // 7. Assemble the final where
    const where: Prisma.ContentWhereInput = {
      AND: conditions
    };

    console.log('[DEBUG] Final Prisma Where:', JSON.stringify(where, null, 2));

    const orderBy: Prisma.ContentOrderByWithRelationInput =
      sort === 'popular' ? { viewCount: 'desc' } :
      sort === 'rating' ? { rating: 'desc' } :
      sort === 'az' ? { slug: 'asc' } :
      sort === 'za' ? { slug: 'desc' } :
      sort === 'oldest' ? { createdAt: 'asc' } :
      { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      prisma.content.findMany({ 
        where, 
        skip, 
        take: limit, 
        orderBy, 
        select: {
          ...CONTENT_LIST_SELECT,
          platform: { select: { id: true, name: true, logoUrl: true } }
        } 
      }),
      prisma.content.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  static async getContentById(id: string, lang: string = 'es') {
    return prisma.content.findFirst({
      where: { id, deletedAt: null },
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
    return prisma.content.findMany({
      where: { featured: true, status: { in: ['READY', 'ACTIVE'] }, deletedAt: null },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: CONTENT_LIST_SELECT,
    });
  }

  static async getTrendingContent() {
    return prisma.content.findMany({
      where: { status: { in: ['READY', 'ACTIVE'] }, deletedAt: null },
      orderBy: { viewCount: 'desc' },
      take: 12,
      select: CONTENT_LIST_SELECT,
    });
  }

  static async getRecentContent() {
    return prisma.content.findMany({
      where: { status: { in: ['READY', 'ACTIVE'] }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: CONTENT_LIST_SELECT,
    });
  }

  static async getRelatedContent(contentId: string) {
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: { genres: true },
    });
    if (!content) return [];

    const genreIds = content.genres.map((g) => g.genreId);
    return prisma.content.findMany({
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

  static async createContent(data: Record<string, unknown>) {
    const { genreIds, tagIds, actorIds, directorIds, translations, originalTitle, ...contentData } = data as any;

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
      } else {
        contentData.slug = 'content-' + Date.now();
      }
    }

    // Map synopsis to description (schema uses description)
    const processedTranslations = translations?.map((t: any) => ({
      language: t.language,
      title: t.title,
      description: t.description || t.synopsis || '',
      tagline: t.tagline
    }));

    return prisma.content.create({
      data: {
        ...(contentData as Prisma.ContentCreateInput),
        translations: processedTranslations ? { create: processedTranslations } : undefined,
        genres: genreIds ? { create: genreIds.map((id: string) => ({ genreId: id })) } : undefined,
        tags: tagIds ? { create: tagIds.map((id: string) => ({ tagId: id })) } : undefined,
        actors: actorIds ? { create: actorIds.map((id: string, idx: number) => ({ actorId: id, order: idx })) } : undefined,
        directors: directorIds ? { create: directorIds.map((id: string) => ({ directorId: id })) } : undefined,
      },
    });
  }

  static async updateContent(id: string, data: Record<string, unknown>) {
    const { genreIds, tagIds, actorIds, directorIds, translations, originalTitle, ...contentData } = data as any;

    const processedTranslations = translations?.map((t: any) => ({
      language: t.language,
      title: t.title,
      description: t.description || t.synopsis || '',
      tagline: t.tagline
    }));

    return prisma.content.update({
      where: { id },
      data: {
        ...(contentData as Prisma.ContentUpdateInput),
        translations: processedTranslations ? {
          deleteMany: {},
          create: processedTranslations
        } : undefined,
        genres: genreIds ? {
          deleteMany: {},
          create: genreIds.map((id: string) => ({ genreId: id }))
        } : undefined,
        tags: tagIds ? {
          deleteMany: {},
          create: tagIds.map((id: string) => ({ tagId: id }))
        } : undefined,
        actors: actorIds ? {
          deleteMany: {},
          create: actorIds.map((id: string, idx: number) => ({ actorId: id, order: idx }))
        } : undefined,
        directors: directorIds ? {
          deleteMany: {},
          create: directorIds.map((id: string) => ({ directorId: id }))
        } : undefined,
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

  static async deleteContent(id: string) {
    return prisma.content.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
