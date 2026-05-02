import { Router, RequestHandler, Response, NextFunction } from 'express';
import { authenticate, requireRole, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';
import { prisma } from '../../shared/config/prisma';

export const adminRouter = Router();

// All admin routes require ADMIN role
adminRouter.use(authenticate as RequestHandler);
adminRouter.use(requireRole('ADMIN') as RequestHandler);

// ─── Dashboard KPIs ──────────────────────────────────────────────────────────

adminRouter.get('/dashboard', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [
      totalUsers,
      totalContent,
      activeMembers,
      totalViews,
      recentContent,
      processingVideos,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.content.count({ where: { deletedAt: null } }),
      prisma.userMembership.count({ where: { isActive: true } }),
      prisma.content.aggregate({ _sum: { viewCount: true } }),
      prisma.content.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, slug: true, type: true, status: true, createdAt: true },
      }),
      prisma.videoFile.count({ where: { status: { in: ['PENDING', 'QUEUED', 'PROCESSING'] } } }),
    ]);

    ok(res, {
      kpis: {
        totalUsers,
        totalContent,
        activeMembers,
        totalViews: totalViews._sum.viewCount?.toString() || '0',
        processingVideos,
      },
      recentContent,
    });
  } catch (err) { next(err); }
}) as RequestHandler);

// ─── Users Management ────────────────────────────────────────────────────────

adminRouter.get('/users', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const role = req.query.role as string | undefined;

    const where: Record<string, unknown> = { deletedAt: null };
    if (role) where.role = role;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, name: true, role: true, isActive: true, createdAt: true,
          _count: { select: { profiles: true, memberships: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    ok(res, { users, total, page, limit });
  } catch (err) { next(err); }
}) as RequestHandler);

adminRouter.put('/users/:id', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { role, isActive } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { ...(role ? { role } : {}), ...(isActive !== undefined ? { isActive } : {}) },
    });
    ok(res, user);
  } catch (err) { next(err); }
}) as RequestHandler);

// ─── Site Config ─────────────────────────────────────────────────────────────

adminRouter.get('/settings', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const configs = await prisma.siteConfig.findMany();
    const settings = Object.fromEntries(configs.map((c) => [c.key, c.value]));
    ok(res, settings);
  } catch (err) { next(err); }
}) as RequestHandler);

adminRouter.put('/settings', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const entries = Object.entries(req.body as Record<string, string>);
    await Promise.all(
      entries.map(([key, value]) =>
        prisma.siteConfig.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    );

    // Invalidate homepage cache when settings change
    const { invalidateCache } = await import('../../shared/middleware/cache.middleware');
    await invalidateCache('*homepage*');

    ok(res, { updated: entries.length });
  } catch (err) { next(err); }
}) as RequestHandler);

// ─── Video Processing Status ─────────────────────────────────────────────────

adminRouter.get('/videos/status', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const videos = await prisma.videoFile.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        content: { select: { id: true, slug: true } },
        qualities: { select: { resolution: true } },
      },
    });
    ok(res, videos);
  } catch (err) { next(err); }
}) as RequestHandler);
// ─── Watch History ─────────────────────────────────────────────────────────────

adminRouter.get('/history', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string | undefined;
    
    // Dynamically import HistoryService to avoid circular dependencies
    const { HistoryService } = await import('../history/history.service');
    const results = await HistoryService.getGlobalHistory(page, limit, search);
    
    ok(res, results);
  } catch (err) { next(err); }
}) as RequestHandler);

// ─── Comments & Reviews Moderation ───────────────────────────────────────────

adminRouter.get('/reviews', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (status) where.status = status;

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          profile: { select: { id: true, name: true } },
          content: { select: { id: true, slug: true, type: true } },
        },
      }),
      prisma.review.count({ where }),
    ]);

    ok(res, { reviews, total, page, limit });
  } catch (err) { next(err); }
}) as RequestHandler);

adminRouter.put('/reviews/:id/status', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: { status },
    });

    // Re-calculate average if status changes to/from APPROVED
    if (!review.parentId) {
      const avg = await prisma.review.aggregate({
        where: { contentId: review.contentId, isHidden: false, status: 'APPROVED', rating: { not: null } },
        _avg: { rating: true },
        _count: true,
      });
      await prisma.content.update({
        where: { id: review.contentId },
        data: { rating: avg._avg.rating || 0, reviewCount: avg._count },
      });
    }

    ok(res, review);
  } catch (err) { next(err); }
}) as RequestHandler);

adminRouter.delete('/reviews/:id', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) { res.status(404).json({ success: false, error: 'Review not found' }); return; }

    await prisma.review.delete({ where: { id: req.params.id } });

    if (!review.parentId) {
      const avg = await prisma.review.aggregate({
        where: { contentId: review.contentId, isHidden: false, status: 'APPROVED', rating: { not: null } },
        _avg: { rating: true },
        _count: true,
      });
      await prisma.content.update({
        where: { id: review.contentId },
        data: { rating: avg._avg.rating || 0, reviewCount: avg._count },
      });
    }

    ok(res, { deleted: true });
  } catch (err) { next(err); }
}) as RequestHandler);
