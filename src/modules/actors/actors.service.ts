import { prisma } from '../../shared/config/prisma';

export class ActorsService {
  // ─── Actors ─────────────────────────────────────────────────────────────────
  static async getAllActors(page = 1, limit = 50, search?: string) {
    const skip = (page - 1) * limit;
    const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : {};

    const [data, total] = await Promise.all([
      prisma.actor.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.actor.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  static async getActorById(id: string) {
    return prisma.actor.findUnique({
      where: { id },
      include: {
        contents: {
          include: {
            content: {
              select: { id: true, slug: true, releaseYear: true, type: true },
            },
          },
        },
      },
    });
  }

  static async createActor(data: any) {
    return prisma.actor.create({ data });
  }

  static async updateActor(id: string, data: any) {
    return prisma.actor.update({ where: { id }, data });
  }

  static async deleteActor(id: string) {
    return prisma.actor.delete({ where: { id } });
  }

  // ─── Directors ──────────────────────────────────────────────────────────────
  static async getAllDirectors(page = 1, limit = 50, search?: string) {
    const skip = (page - 1) * limit;
    const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : {};

    const [data, total] = await Promise.all([
      prisma.director.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.director.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  static async getDirectorById(id: string) {
    return prisma.director.findUnique({
      where: { id },
      include: {
        contents: {
          include: {
            content: {
              select: { id: true, slug: true, releaseYear: true, type: true },
            },
          },
        },
      },
    });
  }

  static async createDirector(data: any) {
    return prisma.director.create({ data });
  }

  static async updateDirector(id: string, data: any) {
    return prisma.director.update({ where: { id }, data });
  }

  static async deleteDirector(id: string) {
    return prisma.director.delete({ where: { id } });
  }
}
