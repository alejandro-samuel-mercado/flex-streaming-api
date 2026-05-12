import { prisma } from '../../shared/config/prisma';
import { Prisma } from '@prisma/client';

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
  isFreeWithMembership: true,
  createdAt: true,
  translations: { select: { language: true, title: true, description: true, tagline: true } },
  thumbnails: true,
  genres: { include: { genre: { select: { id: true, name: true, slug: true } } } },
  ageRating: { select: { id: true, code: true, label: true } },
  platform: { select: { id: true, name: true, slug: true, logoUrl: true } },
} satisfies Prisma.ContentSelect;

export class HomepageService {
  /**
   * Aggregated endpoint that gathers all data needed for the homepage in one round-trip.
   */
  static async getHomepageData() {
    const activeContentWhere = {
      status: { in: ['READY', 'ACTIVE'] as any },
      deletedAt: null,
    };

    // 1. Fetch config first to decide strategy
    const siteConfig = await prisma.siteConfig.findMany();
    const config = Object.fromEntries(siteConfig.map(c => [c.key, c.value]));

    const bannerStrategy = config['home_banner_strategy'] || 'MANUAL';
    const bannerLimit = parseInt(config['home_banner_limit']) || 8;

    // 2. Fetch all other sections in parallel
    const [
      trending,
      recent,
      estrenos,
      freeContent,
      platforms,
      genres,
      contentTypes,
      plans,
      faqItems,
    ] = await Promise.all([
      // Trending content
      prisma.content.findMany({
        where: activeContentWhere,
        orderBy: { viewCount: 'desc' },
        take: 15,
        select: CONTENT_LIST_SELECT,
      }),
      // Recent / new releases
      prisma.content.findMany({
        where: activeContentWhere,
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: CONTENT_LIST_SELECT,
      }),
      // Estrenos / releases (sorted by releaseYear)
      prisma.content.findMany({
        where: activeContentWhere,
        orderBy: { releaseYear: 'desc' },
        take: 15,
        select: CONTENT_LIST_SELECT,
      }),
      // Free content (no membership required)
      prisma.content.findMany({
        where: { ...activeContentWhere, isFreeWithMembership: false },
        orderBy: { viewCount: 'desc' },
        take: 15,
        select: CONTENT_LIST_SELECT,
      }),
      // Platforms with their content count
      prisma.platform.findMany({
        orderBy: { isFeatured: 'desc' },
        include: {
          contents: {
            where: activeContentWhere,
            take: 10,
            orderBy: { viewCount: 'desc' },
            select: {
              id: true,
              slug: true,
              translations: { select: { title: true, language: true }, take: 1 },
              thumbnails: { where: { type: 'POSTER' }, take: 1 },
            },
          },
        },
      }),
      // All genres
      prisma.genre.findMany({ orderBy: { name: 'asc' } }),
      // Content type counts
      prisma.content.groupBy({
        by: ['type'],
        where: activeContentWhere,
        _count: true,
      }),
      // Active plans
      prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { price: 'asc' },
      }),
      // FAQ from site config
      prisma.siteConfig.findFirst({ where: { key: 'faq_items' } }),
    ]);

    // 3. Fetch Featured Content based on Strategy
    let featured: any[] = [];
    const explicitIds = config['home_banner_ids'] ? JSON.parse(config['home_banner_ids']) : [];

    if (bannerStrategy === 'MANUAL' || (bannerStrategy === 'COMBINED' && explicitIds.length > 0)) {
      if (explicitIds.length > 0) {
        const manualItems = await prisma.content.findMany({
          where: { id: { in: explicitIds }, ...activeContentWhere },
          select: CONTENT_LIST_SELECT,
        });
        
        // Sort manualItems to match explicitIds order and remove duplicates
        const seenIds = new Set();
        featured = explicitIds
          .map((id: string) => {
            if (seenIds.has(id)) return null;
            seenIds.add(id);
            return manualItems.find(m => m.id === id);
          })
          .filter(Boolean);
      } else if (bannerStrategy === 'MANUAL') {
        // Fallback to legacy featured boolean if no explicit IDs
        featured = await prisma.content.findMany({
          where: { ...activeContentWhere, featured: true },
          take: bannerLimit,
          orderBy: { createdAt: 'desc' },
          select: CONTENT_LIST_SELECT,
        });
      }
    }

    if (bannerStrategy === 'AUTO_LATEST') {
      featured = recent.slice(0, bannerLimit);
    } else if (bannerStrategy === 'AUTO_TRENDING') {
      featured = trending.slice(0, bannerLimit);
    } else if (bannerStrategy === 'COMBINED') {
      // Logic for combined: Priority Explicit > Legacy Featured > Latest > Trending
      const combinedSet = new Set(featured.map(m => m.id));

      // Add legacy featured if space
      if (featured.length < bannerLimit) {
        const legacy = await prisma.content.findMany({
          where: { ...activeContentWhere, featured: true, id: { notIn: Array.from(combinedSet) } },
          take: bannerLimit - featured.length,
          orderBy: { createdAt: 'desc' },
          select: CONTENT_LIST_SELECT,
        });
        for (const item of legacy) {
          featured.push(item);
          combinedSet.add(item.id);
        }
      }

      // Add latest
      for (const item of recent) {
        if (featured.length >= bannerLimit) break;
        if (!combinedSet.has(item.id)) {
          featured.push(item);
          combinedSet.add(item.id);
        }
      }

      // Add trending
      for (const item of trending) {
        if (featured.length >= bannerLimit) break;
        if (!combinedSet.has(item.id)) {
          featured.push(item);
          combinedSet.add(item.id);
        }
      }
    }

    // Parse FAQ items (stored as JSON string in SiteConfig)
    let faq: { question: string; answer: string }[] = [];
    if (faqItems?.value) {
      try { faq = JSON.parse(faqItems.value); } catch { faq = []; }
    }

    return {
      featured,
      trending,
      recent,
      estrenos,
      freeContent,
      platforms,
      genres,
      contentTypes: contentTypes.map(ct => ({ type: ct.type, count: ct._count })),
      plans,
      faq,
      config,
    };
  }
}
