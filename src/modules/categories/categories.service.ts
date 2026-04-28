import { prisma } from '../../shared/config/prisma';
import { ContentType } from '@prisma/client';

export class CategoriesService {
  // ─── Content Types ────────────────────────────────────────────────────────
  static async getAllContentTypes() {
    return Object.values(ContentType);
  }

  // ─── Genres ─────────────────────────────────────────────────────────────
  static async getAllGenres() {
    return prisma.genre.findMany({ orderBy: { name: 'asc' } });
  }

  static async createGenre(data: { name: string; slug: string }) {
    return prisma.genre.create({ data });
  }

  static async updateGenre(id: string, data: { name?: string; slug?: string }) {
    return prisma.genre.update({ where: { id }, data });
  }

  static async deleteGenre(id: string) {
    return prisma.genre.delete({ where: { id } });
  }

  // ─── Age Ratings ────────────────────────────────────────────────────────
  static async getAllAgeRatings() {
    return prisma.ageRating.findMany({ orderBy: { code: 'asc' } });
  }

  static async createAgeRating(data: { code: string; label: string }) {
    return prisma.ageRating.create({ data });
  }

  static async updateAgeRating(id: string, data: { code?: string; label?: string }) {
    return prisma.ageRating.update({ where: { id }, data });
  }

  static async deleteAgeRating(id: string) {
    return prisma.ageRating.delete({ where: { id } });
  }

  // ─── Tags ───────────────────────────────────────────────────────────────
  static async getAllTags() {
    return prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }

  static async createTag(data: { name: string; slug: string }) {
    return prisma.tag.create({ data });
  }

  static async updateTag(id: string, data: { name?: string; slug?: string }) {
    return prisma.tag.update({ where: { id }, data });
  }

  static async deleteTag(id: string) {
    return prisma.tag.delete({ where: { id } });
  }
}
