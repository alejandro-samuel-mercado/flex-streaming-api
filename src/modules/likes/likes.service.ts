import { prisma } from '../../shared/config/prisma';

export class LikesService {
  static async toggleLike(profileId: string, contentId: string) {
    const existing = await prisma.like.findUnique({
      where: { profileId_contentId: { profileId, contentId } },
    });

    try {
      if (existing) {
        await prisma.like.delete({
          where: { profileId_contentId: { profileId, contentId } },
        });
        return { liked: false };
      } else {
        await prisma.like.create({ data: { profileId, contentId } });
        return { liked: true };
      }
    } catch (error: any) {
      if (error.code === 'P2003') {
        console.warn(`[LikesService] P2003: Profile ${profileId} or Content ${contentId} not found.`);
        return { liked: false, error: 'invalid_reference' };
      }
      throw error;
    }
  }

  static async checkLike(profileId: string, contentId: string) {
    const like = await prisma.like.findUnique({
      where: { profileId_contentId: { profileId, contentId } },
    });
    return !!like;
  }
}
