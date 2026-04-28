import { Router, RequestHandler } from 'express';
import { SearchService } from './search.service';
import { ok } from '../../shared/utils/api-response';

export const searchRouter = Router();

// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

searchRouter.get('/', (async (req, res, next) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 5;

    const data = await SearchService.globalSearch(query, limit);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

searchRouter.get('/suggest', (async (req, res, next) => {
  try {
    const query = req.query.q as string;
    const data = await SearchService.suggest(query);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);
