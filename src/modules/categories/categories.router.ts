import { Router, RequestHandler } from 'express';
import { CategoriesService } from './categories.service';
import { GenreSchema, AgeRatingSchema, TagSchema } from './categories.schemas';
import { authenticate, requireRole, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok, created } from '../../shared/utils/api-response';

export const categoriesRouter = Router();

// ==========================================
// PUBLIC ENDPOINTS (Anyone can read)
// ==========================================

categoriesRouter.get('/content-types', (async (_req, res, next) => {
  try {
    const data = await CategoriesService.getAllContentTypes();
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

categoriesRouter.get('/genres', (async (_req, res, next) => {
  try {
    const data = await CategoriesService.getAllGenres();
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

categoriesRouter.get('/age-ratings', (async (_req, res, next) => {
  try {
    const data = await CategoriesService.getAllAgeRatings();
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

categoriesRouter.get('/tags', (async (_req, res, next) => {
  try {
    const data = await CategoriesService.getAllTags();
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

// ==========================================
// ADMIN ENDPOINTS
// ==========================================
categoriesRouter.use(authenticate as RequestHandler);
categoriesRouter.use(requireRole('ADMIN') as RequestHandler);

// Genres
categoriesRouter.post('/genres', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const validatedData = GenreSchema.parse(req.body);
    const data = await CategoriesService.createGenre(validatedData);
    created(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

categoriesRouter.put('/genres/:id', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const validatedData = GenreSchema.partial().parse(req.body);
    const data = await CategoriesService.updateGenre(req.params.id, validatedData);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

categoriesRouter.delete('/genres/:id', (async (req: AuthenticatedRequest, res, next) => {
  try {
    await CategoriesService.deleteGenre(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

// Age Ratings
categoriesRouter.post('/age-ratings', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const validatedData = AgeRatingSchema.parse(req.body);
    const data = await CategoriesService.createAgeRating(validatedData);
    created(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

categoriesRouter.put('/age-ratings/:id', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const validatedData = AgeRatingSchema.partial().parse(req.body);
    const data = await CategoriesService.updateAgeRating(req.params.id, validatedData);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

categoriesRouter.delete('/age-ratings/:id', (async (req: AuthenticatedRequest, res, next) => {
  try {
    await CategoriesService.deleteAgeRating(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

// Tags
categoriesRouter.post('/tags', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const validatedData = TagSchema.parse(req.body);
    const data = await CategoriesService.createTag(validatedData);
    created(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

categoriesRouter.put('/tags/:id', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const validatedData = TagSchema.partial().parse(req.body);
    const data = await CategoriesService.updateTag(req.params.id, validatedData);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

categoriesRouter.delete('/tags/:id', (async (req: AuthenticatedRequest, res, next) => {
  try {
    await CategoriesService.deleteTag(req.params.id);
    ok(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}) as RequestHandler);
