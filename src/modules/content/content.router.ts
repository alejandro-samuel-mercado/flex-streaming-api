import { Router, RequestHandler } from 'express';
import { ContentService } from './content.service';
import { authenticate, requireRole, AuthenticatedRequest, optionalAuth } from '../../shared/middleware/auth.middleware';
import { ok, created, paginate } from '../../shared/utils/api-response';
import { cacheMiddleware } from '../../shared/middleware/cache.middleware';
import { z } from 'zod';
import { prisma } from '../../shared/config/prisma';

export const contentRouter = Router();
console.log('🚀 [ContentRouter] Router loaded and routes defined');

const ContentFiltersSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(1000).default(50), // Increased max to support admin duplication checks
  search: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  genreId: z.string().optional(),
  tagId: z.string().optional(),
  actorId: z.string().optional(),
  platformId: z.string().optional(),
  isFree: z.preprocess((v) => v === undefined ? undefined : v === 'true', z.boolean().optional()),
  featured: z.preprocess((v) => v === undefined ? undefined : v === 'true', z.boolean().optional()),
  minYear: z.coerce.number().optional(),
  maxYear: z.coerce.number().optional(),
  minDuration: z.coerce.number().optional(),
  maxDuration: z.coerce.number().optional(),
  sort: z.enum(['recent', 'popular', 'rating', 'az', 'za', 'oldest']).default('recent'),
  lang: z.string().default('es'),
  incomplete: z.preprocess((v) => v === undefined ? undefined : v === 'true', z.boolean().optional()),
  hasMissingFiles: z.preprocess((v) => v === undefined ? undefined : v === 'true', z.boolean().optional()),
});

const ContentBulkActionSchema = z.object({
  action: z.enum(['delete', 'changeStatus', 'pin', 'unpin']),
  ids: z.array(z.string()).min(1),
  status: z.string().optional()
});
// ─── PUBLIC ENDPOINTS ────────────────────────────────────────────────────────

contentRouter.get('/featured', cacheMiddleware('catalog'), (async (_req, res, next) => {
  try {
    const data = await ContentService.getFeaturedContent();
    ok(res, data);
  } catch (err) { next(err); }
}) as RequestHandler);

contentRouter.get('/trending', cacheMiddleware('trending'), (async (_req, res, next) => {
  try {
    const data = await ContentService.getTrendingContent();
    ok(res, data);
  } catch (err) { next(err); }
}) as RequestHandler);

contentRouter.get('/recent', cacheMiddleware('catalog'), (async (_req, res, next) => {
  try {
    const data = await ContentService.getRecentContent();
    ok(res, data);
  } catch (err) { next(err); }
}) as RequestHandler);

contentRouter.get('/', optionalAuth as RequestHandler, (async (req, res, next) => {
  try {
    const filters = ContentFiltersSchema.parse(req.query);
    
    // Si el usuario es ADMIN, ve todo el contenido. Si no (o visitante), solo lo público.
    const isAdmin = (req as AuthenticatedRequest).user?.role === 'ADMIN';
    const isPublic = !isAdmin;

    const { data, total, page, limit } = await ContentService.getAllContent({ ...filters, isPublic });
    ok(res, data, paginate(page, limit, total));
  } catch (err) { next(err); }
}) as RequestHandler);

contentRouter.get('/:id', optionalAuth as RequestHandler, (async (req, res, next) => {
  try {
    const lang = (req.query.lang as string) || 'es';

    console.log(`[DEBUG] GET /:id called with id: "${req.params.id}"`);
    console.log(`[DEBUG] User Role: "${(req as any).user?.role || 'GUEST'}"`);

    // 2. Fetch from DB
    const isAdmin = (req as any).user?.role === 'ADMIN';
    const data = await ContentService.getContentById(req.params.id, lang, isAdmin);
    if (!data) {
      console.log(`[DEBUG] Content NOT FOUND in DB for id: "${req.params.id}"`);
      res.status(404).json({ success: false, error: 'Content not found' });
      return;
    }

    console.log(`[DEBUG] Content FOUND in DB. Returning with ok() envelope.`);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

contentRouter.get('/:id/related', cacheMiddleware('catalog'), (async (req, res, next) => {
  try {
    const data = await ContentService.getRelatedContent(req.params.id);
    ok(res, data);
  } catch (err) { next(err); }
}) as RequestHandler);

// ─── ADMIN ENDPOINTS ─────────────────────────────────────────────────────────

contentRouter.post('/', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await ContentService.createContent(req.body);
    created(res, data);
  } catch (err) { next(err); }
}) as RequestHandler);

contentRouter.put('/:id', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res, next) => {
  try {
    const content = await prisma.content.findUnique({ where: { id: req.params.id } });
    if (content?.isPinned) {
      res.status(403).json({ success: false, error: 'El contenido está fijado y no puede ser modificado.' });
      return;
    }
    const data = await ContentService.updateContent(req.params.id, req.body);
    ok(res, data);
  } catch (err) { next(err); }
}) as RequestHandler);

contentRouter.delete('/episode/:episodeId', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res, next) => {
  try {
    const episodeId = req.params.episodeId;
    
    // Borrar físicamente el HLS si es necesario (opcional)
    const fs = await import('fs');
    const videoFiles = await prisma.videoFile.findMany({ where: { episodeId } });
    
    for (const vf of videoFiles) {
        if (vf.hlsPath && fs.existsSync(vf.hlsPath)) {
            try { fs.rmSync(vf.hlsPath, { recursive: true, force: true }); } catch (e) {}
        }
    }
    
    // Borrar los registros
    await prisma.videoFile.deleteMany({ where: { episodeId } });
    await prisma.episode.delete({ where: { id: episodeId } });

    ok(res, { deleted: true });
  } catch (err) { next(err); }
}) as RequestHandler);

contentRouter.post('/:id/rescan', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res, next) => {
  try {
    const contentId = req.params.id;
    const fs = await import('fs');
    
    // Buscar todos los video files asociados a este contenido (directamente o a través de episodios)
    const content = await prisma.content.findUnique({
        where: { id: contentId },
        include: {
            videoFiles: true,
            seasons: { include: { episodes: { include: { videoFiles: true } } } }
        }
    });

    if (!content) {
        res.status(404).json({ success: false, error: 'Content not found' });
        return;
    }

    const videoFilesToDelete: any[] = [];
    if (content.type === 'MOVIE') {
        videoFilesToDelete.push(...content.videoFiles);
    } else {
        for (const s of content.seasons) {
            for (const e of s.episodes) {
                videoFilesToDelete.push(...e.videoFiles);
            }
        }
    }

    let deletedCount = 0;
    for (const vf of videoFilesToDelete) {
        // Solo borramos la carpeta HLS generada. El originalPath (crudo) se mantiene para el re-escaneo.
        if (vf.hlsPath && fs.existsSync(vf.hlsPath)) {
            try { fs.rmSync(vf.hlsPath, { recursive: true, force: true }); } catch (e) { console.error('Error deleting HLS path:', e); }
        }
        await prisma.videoFile.delete({ where: { id: vf.id } });
        deletedCount++;
    }

    // Actualizar flag para que se note en el panel de una vez
    await prisma.content.update({ where: { id: contentId }, data: { hasMissingFiles: true } as any });

    ok(res, { success: true, deletedVideoFiles: deletedCount, message: 'Videos eliminados correctamente' });
  } catch (err) { next(err); }
}) as RequestHandler);

contentRouter.delete('/:id', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res, next) => {
  try {
    const content = await prisma.content.findUnique({ where: { id: req.params.id } });
    if (content?.isPinned) {
      res.status(403).json({ success: false, error: 'El contenido está fijado y no puede ser borrado.' });
      return;
    }
    const { invalidateCache } = await import('../../shared/middleware/cache.middleware');
    await invalidateCache(`*/content/${req.params.id}*`);
    await invalidateCache(`*catalog*`);
    await ContentService.deleteContent(req.params.id);
    ok(res, { deleted: true });
  } catch (err) { next(err); }
}) as RequestHandler);

contentRouter.patch('/:id/pin', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res, next) => {
  try {
    const { isPinned } = req.body;
    const content = await prisma.content.update({
      where: { id: req.params.id },
      data: { isPinned }
    });
    ok(res, content);
  } catch (err) { next(err); }
}) as RequestHandler);

contentRouter.post('/bulk-action', authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, (async (req: AuthenticatedRequest, res, next) => {
  try {
    const { action, ids, status } = ContentBulkActionSchema.parse(req.body);
    const result = await ContentService.bulkAction(action, ids, status as any);
    
    // Invalidate cache for bulk delete or status change
    if (action === 'delete' || action === 'changeStatus') {
        const { invalidateCache } = await import('../../shared/middleware/cache.middleware');
        await invalidateCache(`*catalog*`);
    }

    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);
