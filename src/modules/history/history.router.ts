import { Router, RequestHandler } from 'express';
import { HistoryService } from './history.service';
import { authenticate, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';

export const historyRouter = Router();
historyRouter.use(authenticate as RequestHandler);

historyRouter.get('/', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const profileId = req.headers['x-profile-id'] as string;
    if (!profileId) {
      res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
      return;
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const results = await HistoryService.getProfileHistory(profileId, page, limit);
    ok(res, results);
  } catch (err) { next(err); }
}) as RequestHandler);

historyRouter.get('/continue', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const profileId = req.headers['x-profile-id'] as string;
    if (!profileId) {
      res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
      return;
    }
    const results = await HistoryService.getContinueWatching(profileId);
    ok(res, results);
  } catch (err) { next(err); }
}) as RequestHandler);

historyRouter.get('/:contentId', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const profileId = req.headers['x-profile-id'] as string;
    if (!profileId) {
      res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
      return;
    }
    const episodeId = req.query.episodeId as string | undefined;
    
    const { prisma } = await import('../../shared/config/prisma');
    const result = await prisma.watchHistory.findUnique({
      where: {
        profileId_contentId_episodeId: {
          profileId,
          contentId: req.params.contentId,
          episodeId: episodeId || '',
        }
      }
    });
    
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);

historyRouter.post('/progress', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const profileId = req.headers['x-profile-id'] as string;
    if (!profileId) {
      res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
      return;
    }
    const { contentId, progress, duration, episodeId } = req.body;
    if (!contentId || progress === undefined) {
      res.status(400).json({ success: false, error: 'contentId and progress are required' });
      return;
    }
    const result = await HistoryService.updateWatchProgress(profileId, contentId, progress, duration, episodeId);
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);
