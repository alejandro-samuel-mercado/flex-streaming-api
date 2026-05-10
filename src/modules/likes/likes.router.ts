import { Router, RequestHandler } from 'express';
import { LikesService } from './likes.service';
import { authenticate, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';

export const likesRouter = Router();
likesRouter.use(authenticate as RequestHandler);

likesRouter.get('/check/:contentId', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const profileId = req.headers['x-profile-id'] as string;
    const { contentId } = req.params;
    if (!profileId) {
      res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
      return;
    }
    const liked = await LikesService.checkLike(profileId, contentId);
    ok(res, { isLiked: liked });
  } catch (err) { next(err); }
}) as RequestHandler);

likesRouter.post('/toggle', (async (req: AuthenticatedRequest, res, next) => {
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
    const result = await LikesService.toggleLike(profileId, contentId);
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);
