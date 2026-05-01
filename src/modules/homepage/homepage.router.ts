import { Router, RequestHandler } from 'express';
import { HomepageService } from './homepage.service';
import { cacheMiddleware } from '../../shared/middleware/cache.middleware';

export const homepageRouter = Router();

// GET /api/homepage — Public: aggregated homepage data
homepageRouter.get('/', cacheMiddleware('homepage'), (async (_req, res, next) => {
  try {
    const data = await HomepageService.getHomepageData();
    res.json({ success: true, data });
  } catch (error) { next(error); }
}) as RequestHandler);
