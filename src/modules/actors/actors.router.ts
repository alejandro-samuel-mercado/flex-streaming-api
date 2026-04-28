import { Router, RequestHandler } from 'express';
import { ActorsService } from './actors.service';
import { ActorSchema, DirectorSchema } from './actors.schemas';
import { authenticate, requireRole, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok, created, paginate } from '../../shared/utils/api-response';

export const actorsRouter = Router();

// ==========================================
// PUBLIC ENDPOINTS
// ==========================================

// Actors
actorsRouter.get('/', (async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string | undefined;

    const { data, total } = await ActorsService.getAllActors(page, limit, search);
    ok(res, data, paginate(page, limit, total));
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

actorsRouter.get('/:id', (async (req, res, next) => {
  try {
    const data = await ActorsService.getActorById(req.params.id);
    if (!data) {
      res.status(404).json({ success: false, error: 'Actor not found' });
      return;
    }
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

// Directors
actorsRouter.get('/directors/list', (async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string | undefined;

    const { data, total } = await ActorsService.getAllDirectors(page, limit, search);
    ok(res, data, paginate(page, limit, total));
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

actorsRouter.get('/directors/:id', (async (req, res, next) => {
  try {
    const data = await ActorsService.getDirectorById(req.params.id);
    if (!data) {
      res.status(404).json({ success: false, error: 'Director not found' });
      return;
    }
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

// ==========================================
// ADMIN ENDPOINTS
// ==========================================
actorsRouter.use(authenticate as RequestHandler);
actorsRouter.use(requireRole('ADMIN') as RequestHandler);

// Actors
actorsRouter.post('/', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const validatedData = ActorSchema.parse(req.body);
    const data = await ActorsService.createActor(validatedData);
    created(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

actorsRouter.put('/:id', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const validatedData = ActorSchema.partial().parse(req.body);
    const data = await ActorsService.updateActor(req.params.id, validatedData);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

actorsRouter.delete('/:id', (async (req: AuthenticatedRequest, res, next) => {
  try {
    await ActorsService.deleteActor(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

// Directors
actorsRouter.post('/directors', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const validatedData = DirectorSchema.parse(req.body);
    const data = await ActorsService.createDirector(validatedData);
    created(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

actorsRouter.put('/directors/:id', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const validatedData = DirectorSchema.partial().parse(req.body);
    const data = await ActorsService.updateDirector(req.params.id, validatedData);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

actorsRouter.delete('/directors/:id', (async (req: AuthenticatedRequest, res, next) => {
  try {
    await ActorsService.deleteDirector(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}) as RequestHandler);
