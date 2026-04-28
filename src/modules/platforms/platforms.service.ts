import { prisma } from '../../shared/config/prisma';

export class PlatformsService {
  static async getAll() {
    return prisma.platform.findMany({
      orderBy: { isFeatured: 'desc' },
    });
  }

  static async getBySlug(slug: string) {
    return prisma.platform.findUnique({
      where: { slug },
      include: {
        contents: {
          include: { translations: true }
        }
      }
    });
  }

  static async create(data: { name: string; slug: string; logoUrl?: string }) {
    return prisma.platform.create({ data });
  }
}
