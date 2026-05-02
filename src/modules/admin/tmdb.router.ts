import { Router, RequestHandler } from 'express';
import { TMDBService } from '../../services/tmdb.service';
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';

export const tmdbRouter = Router();

// Protect all TMDB routes for admins only
tmdbRouter.use(authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler);

/**
 * GET /api/admin/tmdb/search?query=...&type=movie|tv
 */
tmdbRouter.get('/search', (async (req, res, next) => {
  try {
    const { query, type } = req.query;
    if (!query) {
      res.status(400).json({ success: false, error: 'Query is required' });
      return;
    }

    const results = await TMDBService.search(
      query as string, 
      (type as any) || 'multi'
    );
    ok(res, results);
  } catch (err) { next(err); }
}) as RequestHandler);

/**
 * GET /api/admin/tmdb/details/:type/:id
 */
tmdbRouter.get('/details/:type/:id', (async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const details = await TMDBService.getDetails(id, type as any);
    ok(res, details);
  } catch (err) { next(err); }
}) as RequestHandler);
