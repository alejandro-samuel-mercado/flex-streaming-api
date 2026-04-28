import { Router, RequestHandler } from 'express';
import { FavoritesService } from './favorites.service';
import { authenticate, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';

export const favoritesRouter = Router();
favoritesRouter.use(authenticate as RequestHandler);

favoritesRouter.get('/', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const profileId = req.headers['x-profile-id'] as string;
    if (!profileId) {
      res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
      return;
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const results = await FavoritesService.getProfileFavorites(profileId, page, limit);
    ok(res, results);
  } catch (err) { next(err); }
}) as RequestHandler);

favoritesRouter.post('/toggle', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const profileId = req.headers['x-profile-id'] as string;
    if (!profileId) {
      res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
      return;
    }
    const { contentId } = req.body;
    if (!contentId) {
      res.status(400).json({ success: false, error: 'contentId is required' });
      return;
    }
    const result = await FavoritesService.toggleFavorite(profileId, contentId);
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);
