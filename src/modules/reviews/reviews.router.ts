import { Router, RequestHandler, Response, NextFunction } from 'express';
import { authenticate, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok, created } from '../../shared/utils/api-response';
import { prisma } from '../../shared/config/prisma';
import { z } from 'zod';

export const reviewsRouter = Router();

const CreateReviewSchema = z.object({
  contentId: z.string(),
  rating: z.number().min(1).max(10),
  title: z.string().optional(),
  body: z.string().optional(),
  language: z.string().default('es'),
});

// Get reviews for a content item (public)
reviewsRouter.get('/content/:contentId', (async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const reviews = await prisma.review.findMany({
      where: { contentId: req.params.contentId, isHidden: false },
      include: { profile: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    ok(res, reviews);
  } catch (err) { next(err); }
}) as RequestHandler);

// Create/update a review (requires auth + profileId header)
reviewsRouter.post('/', authenticate as RequestHandler, (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const profileId = req.headers['x-profile-id'] as string;
    if (!profileId) {
      res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
      return;
    }

    const input = CreateReviewSchema.parse(req.body);

    const review = await prisma.review.upsert({
      where: { profileId_contentId: { profileId, contentId: input.contentId } },
      update: { rating: input.rating, title: input.title, body: input.body },
      create: { profileId, ...input },
    });

    // Update content average rating
    const avg = await prisma.review.aggregate({
      where: { contentId: input.contentId, isHidden: false },
      _avg: { rating: true },
      _count: true,
    });
    await prisma.content.update({
      where: { id: input.contentId },
      data: { rating: avg._avg.rating, reviewCount: avg._count },
    });

    created(res, review);
  } catch (err) { next(err); }
}) as RequestHandler);

// Delete own review
reviewsRouter.delete('/:id', authenticate as RequestHandler, (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const profileId = req.headers['x-profile-id'] as string;
    const result = await prisma.review.deleteMany({
      where: { id: req.params.id, profileId },
    });
    if (result.count === 0) {
      res.status(404).json({ success: false, error: 'Review not found' });
      return;
    }
    ok(res, { deleted: true });
  } catch (err) { next(err); }
}) as RequestHandler);
