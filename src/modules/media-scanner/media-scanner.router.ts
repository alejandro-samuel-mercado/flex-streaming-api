import { Router, RequestHandler, Response, NextFunction } from 'express';
import { authenticate, requireRole, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';
import { MediaScannerService } from './media-scanner.service';

export const mediaScannerRouter = Router();

// All media-scanner routes require ADMIN role
mediaScannerRouter.use(authenticate as RequestHandler);
mediaScannerRouter.use(requireRole('ADMIN') as RequestHandler);

/**
 * GET /api/admin/media-scanner/directories
 * Returns suggested directories from environment variable
 */
mediaScannerRouter.get('/directories', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const directories = MediaScannerService.getSuggestedDirectories();
    ok(res, { directories });
  } catch (err) { next(err); }
}) as RequestHandler);

/**
 * GET /api/admin/media-scanner/scan?path=/some/path
 * Scans a directory and returns found video files
 */
mediaScannerRouter.get('/scan', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const dirPath = req.query.path as string;
    if (!dirPath) {
      res.status(400).json({ success: false, error: 'Se requiere el parámetro "path"' });
      return;
    }

    const files = await MediaScannerService.scanDirectory(dirPath);
    const newFiles = files.filter(f => !f.alreadyImported);
    const importedFiles = files.filter(f => f.alreadyImported);

    ok(res, {
      total: files.length,
      newCount: newFiles.length,
      importedCount: importedFiles.length,
      files: newFiles,
      importedFiles
    });
  } catch (err: any) {
    if (err.message?.includes('no encontrado') || err.message?.includes('no es un directorio')) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
}) as RequestHandler);

/**
 * POST /api/admin/media-scanner/import
 * Imports selected files: creates content + enqueues video processing
 * Body: { filePaths: string[] }
 */
mediaScannerRouter.post('/import', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { filePaths } = req.body;

    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      res.status(400).json({ success: false, error: 'Se requiere un array de "filePaths"' });
      return;
    }

    // Limit batch size to prevent abuse
    if (filePaths.length > 100) {
      res.status(400).json({ success: false, error: 'Máximo 100 archivos por lote' });
      return;
    }

    console.log(`📂 [MediaScanner] Starting batch import of ${filePaths.length} files`);

    const { results, summary } = await MediaScannerService.batchImport(filePaths);

    console.log(`📂 [MediaScanner] Batch import complete: ${summary.success} success, ${summary.errors} errors`);

    ok(res, { results, summary });
  } catch (err) { next(err); }
}) as RequestHandler);

/**
 * GET /api/admin/media-scanner/status
 * Returns current auto-scanner status
 */
mediaScannerRouter.get('/status', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import('../../shared/config/prisma');
    const configs = await prisma.siteConfig.findMany({
      where: {
        key: { in: ['AUTO_SCAN_ENABLED', 'AUTO_SCAN_PATH', 'AUTO_SCAN_INTERVAL', 'AUTO_SCAN_LAST_RUN', 'AUTO_SCAN_LAST_RESULT'] }
      }
    });

    const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]));

    ok(res, {
      enabled: configMap['AUTO_SCAN_ENABLED'] === 'true',
      path: configMap['AUTO_SCAN_PATH'] || '',
      intervalMinutes: parseInt(configMap['AUTO_SCAN_INTERVAL'] || '30'),
      lastRun: configMap['AUTO_SCAN_LAST_RUN'] || null,
      lastResult: configMap['AUTO_SCAN_LAST_RESULT'] || null
    });
  } catch (err) { next(err); }
}) as RequestHandler);

/**
 * POST /api/admin/media-scanner/apply-tmdb
 * Apply TMDB data to an existing content
 * Body: { contentId: string, tmdbId: number, type: 'movie' | 'tv' }
 */
mediaScannerRouter.post('/apply-tmdb', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { contentId, tmdbId, type } = req.body;

    if (!contentId || !tmdbId || !type) {
      res.status(400).json({ success: false, error: 'Se requiere contentId, tmdbId y type' });
      return;
    }

    const { prisma } = await import('../../shared/config/prisma');
    const { TMDBService } = await import('../../services/tmdb.service');
    const path = await import('path');
    const fs = await import('fs');
    const { env } = await import('../../shared/config/env');

    // Get full TMDB details
    const details = await TMDBService.getFullDetails(tmdbId, type as 'movie' | 'tv');

    // Match genres
    const genreIds: string[] = [];
    for (const name of details.genres) {
      const slug = name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      let genre = await prisma.genre.findFirst({
        where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug }] }
      });

      if (!genre) {
        try {
          genre = await prisma.genre.create({ data: { name, slug } });
        } catch { genre = await prisma.genre.findFirst({ where: { slug } }); }
      }
      if (genre) genreIds.push(genre.id);
    }

    // Match actors
    const actorIds: string[] = [];
    for (const a of details.actors.slice(0, 10)) {
      let actor = await prisma.actor.findFirst({ where: { tmdbId: a.tmdbId } });
      if (!actor) {
        try {
          actor = await prisma.actor.create({ data: { name: a.name, photoUrl: a.photoUrl, tmdbId: a.tmdbId } });
        } catch { actor = await prisma.actor.findFirst({ where: { tmdbId: a.tmdbId } }); }
      }
      if (actor) actorIds.push(actor.id);
    }

    // Match directors
    const directorIds: string[] = [];
    for (const d of details.directors) {
      let director = await prisma.director.findFirst({ where: { tmdbId: d.tmdbId } });
      if (!director) {
        try {
          director = await prisma.director.create({ data: { name: d.name, photoUrl: d.photoUrl, tmdbId: d.tmdbId } });
        } catch { director = await prisma.director.findFirst({ where: { tmdbId: d.tmdbId } }); }
      }
      if (director) directorIds.push(director.id);
    }

    // Update content
    await prisma.content.update({
      where: { id: contentId },
      data: {
        type: details.type,
        status: 'PENDING',
        releaseYear: details.releaseYear,
        duration: details.duration,
        rating: details.rating,
        tmdbId: details.tmdbId,
        imdbId: details.imdbId || undefined,
        country: details.country || undefined,
        languages: details.languages || [],
        translations: {
          deleteMany: {},
          create: [{
            language: 'es',
            title: details.title,
            description: details.synopsis
          }]
        },
        genres: {
          deleteMany: {},
          create: genreIds.map(gId => ({ genreId: gId }))
        },
        actors: {
          deleteMany: {},
          create: actorIds.map((aId, idx) => ({ actorId: aId, order: idx }))
        },
        directors: {
          deleteMany: {},
          create: directorIds.map(dId => ({ directorId: dId }))
        }
      }
    });

    // Download images
    const mediaFolder = path.default.join(env.MEDIA_PATH, 'thumbnails', contentId);
    if (!fs.default.existsSync(mediaFolder)) {
      fs.default.mkdirSync(mediaFolder, { recursive: true });
    }

    if (details.posterPath) {
      const posterFile = path.default.join(mediaFolder, 'poster.jpg');
      await TMDBService.downloadImage(details.posterPath, posterFile);

      const existingPoster = await prisma.thumbnail.findFirst({
        where: { contentId, type: 'POSTER' }
      });
      if (existingPoster) {
        await prisma.thumbnail.update({ where: { id: existingPoster.id }, data: { url: `/media/thumbnails/${contentId}/poster.jpg` } });
      } else {
        await prisma.thumbnail.create({
          data: { contentId, type: 'POSTER', url: `/media/thumbnails/${contentId}/poster.jpg`, width: 500, height: 750 }
        });
      }
    }

    if (details.backdropPath) {
      const backdropFile = path.default.join(mediaFolder, 'backdrop.jpg');
      await TMDBService.downloadImage(details.backdropPath, backdropFile);

      const existingBackdrop = await prisma.thumbnail.findFirst({
        where: { contentId, type: 'BACKDROP' }
      });
      if (existingBackdrop) {
        await prisma.thumbnail.update({ where: { id: existingBackdrop.id }, data: { url: `/media/thumbnails/${contentId}/backdrop.jpg` } });
      } else {
        await prisma.thumbnail.create({
          data: { contentId, type: 'BACKDROP', url: `/media/thumbnails/${contentId}/backdrop.jpg`, width: 1920, height: 1080 }
        });
      }
    }

    // Check if all video files are completed and update status accordingly
    const videos = await prisma.videoFile.findMany({
      where: { contentId },
      select: { status: true }
    });
    const allCompleted = videos.length > 0 && videos.every(v => v.status === 'COMPLETED');
    if (allCompleted) {
      await prisma.content.update({
        where: { id: contentId },
        data: { status: 'READY' }
      });
    }

    // Fetch updated content
    const updated = await prisma.content.findUnique({
      where: { id: contentId },
      include: {
        translations: true,
        genres: { include: { genre: true } },
        actors: { include: { actor: true } },
        directors: { include: { director: true } },
        thumbnails: true,
        videoFiles: { include: { qualities: true } }
      }
    });

    ok(res, updated);
  } catch (err) { next(err); }
}) as RequestHandler);
