import { Router, RequestHandler } from 'express';
import { PlatformsService } from './platforms.service';
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware';

export const platformsRouter = Router();

platformsRouter.get('/', async (_req, res, next) => {
  try {
    const platforms = await PlatformsService.getAll();
    res.json({ success: true, data: platforms });
  } catch (error) { next(error); }
});

platformsRouter.get('/:slug', async (req, res, next) => {
  try {
    const platform = await PlatformsService.getBySlug(req.params.slug);
    if (!platform) {
      res.status(404).json({ success: false, error: 'Platform not found' });
      return;
    }
    res.json({ success: true, data: platform });
  } catch (error) { next(error); }
});

// Admin Only
platformsRouter.post('/', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, async (req, res, next) => {
  try {
    const { name, slug, logoUrl } = req.body;
    const platform = await PlatformsService.create({ name, slug, logoUrl });
    res.status(201).json({ success: true, data: platform });
  } catch (error) { next(error); }
});

platformsRouter.put('/:id', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, async (req, res, next) => {
  try {
    const platform = await PlatformsService.update(req.params.id, req.body);
    res.json({ success: true, data: platform });
  } catch (error) { next(error); }
});

platformsRouter.delete('/:id', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, async (req, res, next) => {
  try {
    await PlatformsService.delete(req.params.id);
    res.json({ success: true, deleted: true });
  } catch (error) { next(error); }
});
