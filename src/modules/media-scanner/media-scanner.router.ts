import { Router, RequestHandler, Response, NextFunction } from 'express';
import { authenticate, requireRole, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';
import { MediaScannerService } from './media-scanner.service';
import fs from 'fs';

export const mediaScannerRouter = Router();

// All media-scanner routes require ADMIN role
mediaScannerRouter.use(authenticate as RequestHandler);
mediaScannerRouter.use(requireRole('ADMIN') as RequestHandler);

// ─── In-memory scan state (single admin operation at a time) ─────────────────
interface ScanState {
  status: 'idle' | 'scanning' | 'done' | 'error';
  moviePath?: string;
  seriesPath?: string;
  startedAt?: string;
  files?: any[];
  importedFiles?: any[];
  total?: number;
  newCount?: number;
  importedCount?: number;
  error?: string;
}

let currentScan: ScanState = { status: 'idle' };

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
 * GET /api/admin/media-scanner/scan
 * Scans one or two directories and returns found video files.
 *
 * Supports two modes:
 *   - Dual folder: ?moviePath=/path/movies&seriesPath=/path/series
 *   - Legacy single: ?path=/some/path  (treated as movies)
 *
 * The scan runs asynchronously. This endpoint starts the scan and returns
 * immediately with { status: 'scanning' }. The frontend can poll
 * GET /api/admin/media-scanner/scan-result to get the results when ready.
 */
mediaScannerRouter.get('/scan', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const moviePath = (req.query.moviePath || req.query.path) as string | undefined;
    const seriesPath = req.query.seriesPath as string | undefined;

    if (!moviePath && !seriesPath) {
      res.status(400).json({ success: false, error: 'Se requiere al menos un parámetro de ruta ("moviePath" o "seriesPath")' });
      return;
    }

    // If a scan is already running, return its status
    if (currentScan.status === 'scanning') {
      ok(res, { status: 'scanning', startedAt: currentScan.startedAt, moviePath: currentScan.moviePath, seriesPath: currentScan.seriesPath });
      return;
    }

    // Start async scan
    currentScan = {
      status: 'scanning',
      moviePath: moviePath || undefined,
      seriesPath: seriesPath || undefined,
      startedAt: new Date().toISOString()
    };

    console.log(`📂 [MediaScanner] Async scan started — movies: "${moviePath || 'N/A'}", series: "${seriesPath || 'N/A'}"`);

    // Return immediately — scan runs in the background
    ok(res, { status: 'scanning', startedAt: currentScan.startedAt });

    // Execute scan in background (after response is sent)
    setImmediate(async () => {
      try {
        const files = await MediaScannerService.scanDirectories(
          moviePath || undefined,
          seriesPath || undefined
        );

        const newFiles = files.filter(f => !f.alreadyImported);
        const importedFiles = files.filter(f => f.alreadyImported);

        currentScan = {
          status: 'done',
          moviePath: moviePath || undefined,
          seriesPath: seriesPath || undefined,
          startedAt: currentScan.startedAt,
          total: files.length,
          newCount: newFiles.length,
          importedCount: importedFiles.length,
          files: newFiles,
          importedFiles
        };

        console.log(`📂 [MediaScanner] Scan complete: ${files.length} total, ${newFiles.length} new, ${importedFiles.length} imported`);

        // Emit via Socket.IO if available
        try {
          const { io } = await import('../../index');
          io?.emit('scan-complete', {
            total: files.length,
            newCount: newFiles.length,
            importedCount: importedFiles.length
          });
        } catch { /* socket may not be available */ }
      } catch (err: any) {
        console.error(`❌ [MediaScanner] Scan error:`, err.message);
        currentScan = {
          status: 'error',
          error: err.message,
          moviePath: moviePath || undefined,
          seriesPath: seriesPath || undefined,
          startedAt: currentScan.startedAt
        };
      }
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
 * GET /api/admin/media-scanner/scan-result
 * Returns the result of the last async scan. Poll this after starting a scan.
 */
mediaScannerRouter.get('/scan-result', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (currentScan.status === 'idle') {
      ok(res, { status: 'idle', message: 'No se ha iniciado ningún escaneo' });
      return;
    }

    if (currentScan.status === 'scanning') {
      ok(res, { status: 'scanning', startedAt: currentScan.startedAt, moviePath: currentScan.moviePath, seriesPath: currentScan.seriesPath });
      return;
    }

    if (currentScan.status === 'error') {
      ok(res, { status: 'error', error: currentScan.error, startedAt: currentScan.startedAt });
      return;
    }

    // status === 'done'
    ok(res, {
      status: 'done',
      total: currentScan.total,
      newCount: currentScan.newCount,
      importedCount: currentScan.importedCount,
      files: currentScan.files,
      importedFiles: currentScan.importedFiles
    });
  } catch (err) { next(err); }
}) as RequestHandler);

/**
 * POST /api/admin/media-scanner/import
 * Imports selected files: creates content + enqueues video processing
 * Body: { files: { filePath: string; contentType: 'MOVIE' | 'SERIES' }[] }
 * Also accepts legacy: { filePaths: string[] } (all treated as MOVIE)
 */
mediaScannerRouter.post('/import', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    let files: { filePath: string; contentType: 'MOVIE' | 'SERIES' }[];

    if (req.body.files && Array.isArray(req.body.files)) {
      // New format: [{ filePath, contentType, episode? }]
      files = req.body.files;
    } else if (req.body.filePaths && Array.isArray(req.body.filePaths)) {
      // Legacy format — treat all as MOVIE
      files = req.body.filePaths.map((fp: string) => ({ filePath: fp, contentType: 'MOVIE' as const }));
    } else {
      res.status(400).json({ success: false, error: 'Se requiere un array "files" con { filePath, contentType } o "filePaths"' });
      return;
    }

    if (files.length === 0) {
      res.status(400).json({ success: false, error: 'No se enviaron archivos para importar' });
      return;
    }

    // Limit batch size to prevent abuse (increased for library restoration)
    if (files.length > 5000) {
      res.status(400).json({ success: false, error: 'Máximo 5000 archivos por lote' });
      return;
    }

    console.log(`📂 [MediaScanner] Starting batch import of ${files.length} files`);

    const { results, summary } = await MediaScannerService.batchImport(files);

    console.log(`📂 [MediaScanner] Batch import complete: ${summary.success} success, ${summary.errors} errors`);

    ok(res, { results, summary });
  } catch (err) { next(err); }
}) as RequestHandler);

/**
 * GET /api/admin/media-scanner/status
 * Returns current auto-scanner status and configured paths
 */
mediaScannerRouter.get('/status', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import('../../shared/config/prisma');
    const configs = await prisma.siteConfig.findMany({
      where: {
        key: {
          in: [
            'AUTO_SCAN_ENABLED',
            'AUTO_SCAN_PATH',        // legacy
            'AUTO_SCAN_MOVIE_PATH',
            'AUTO_SCAN_SERIES_PATH',
            'AUTO_SCAN_INTERVAL',
            'AUTO_SCAN_LAST_RUN',
            'AUTO_SCAN_LAST_RESULT'
          ]
        }
      }
    });

    const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]));

    ok(res, {
      enabled: configMap['AUTO_SCAN_ENABLED'] === 'true',
      // Dual-folder paths (new)
      moviePath: configMap['AUTO_SCAN_MOVIE_PATH'] || '',
      seriesPath: configMap['AUTO_SCAN_SERIES_PATH'] || '',
      // Legacy single path (kept for backwards compat)
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

    // Ensure unique IDs to avoid Prisma P2002 on nested creates
    const uniqueGenreIds = Array.from(new Set(genreIds));
    const uniqueActorIds = Array.from(new Set(actorIds));
    const uniqueDirectorIds = Array.from(new Set(directorIds));

    // Check if tmdbId is already used by ANOTHER content
    const tmdbConflict = await prisma.content.findFirst({
      where: {
        tmdbId: String(details.tmdbId),
        id: { not: contentId }
      }
    });

    // Check if imdbId is already used by ANOTHER content (if provided)
    if (details.imdbId) {
      const imdbConflict = await prisma.content.findFirst({
        where: {
          imdbId: details.imdbId,
          id: { not: contentId }
        }
      });

      if (imdbConflict) {
        // Instead of throwing an error, we "steal" the imdbId from the conflicting content
        await prisma.content.update({
          where: { id: imdbConflict.id },
          data: { imdbId: null }
        });
        console.log(`[MediaScanner] Removed conflicting IMDB ID ${details.imdbId} from content ${imdbConflict.id}`);
      }
    }

    if (tmdbConflict) {
      // Instead of throwing an error, we "steal" the tmdbId from the conflicting content
      await prisma.content.update({
        where: { id: tmdbConflict.id },
        data: { tmdbId: null }
      });
      console.log(`[MediaScanner] Removed conflicting TMDB ID ${details.tmdbId} from content ${tmdbConflict.id}`);
    }

    // Update content
    await prisma.content.update({
      where: { id: contentId },
      data: {
        type: details.type,
        status: 'PENDING',
        originalTitle: details.originalTitle || null,
        title: details.title,
        releaseYear: details.releaseYear,
        duration: details.duration,
        rating: details.rating,
        tmdbId: details.tmdbId,
        imdbId: details.imdbId || undefined,
        country: details.country || undefined,
        languages: details.languages || [],
        originalLanguage: details.originalLanguage || undefined,
        budget: details.budget ? BigInt(Math.floor(details.budget)) : undefined,
        revenue: details.revenue ? BigInt(Math.floor(details.revenue)) : undefined,
        isAdult: details.isAdult || false,
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
          create: uniqueGenreIds.map(gId => ({ genreId: gId }))
        },
        actors: {
          deleteMany: {},
          create: uniqueActorIds.map((aId, idx) => ({ actorId: aId, order: idx }))
        },
        directors: {
          deleteMany: {},
          create: uniqueDirectorIds.map(dId => ({ directorId: dId }))
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

    // Keep PENDING content as PENDING for admin review
    const currentContent = await prisma.content.findUnique({ where: { id: contentId }, select: { status: true } });
    if (currentContent && currentContent.status !== 'PENDING') {
      const videos = await prisma.videoFile.findMany({
        where: { contentId },
        select: { status: true }
      });
      const allCompleted = videos.length > 0 && videos.every(v => v.status === 'COMPLETED');
      if (allCompleted && (currentContent.status === 'PROCESSING' || currentContent.status === 'DRAFT')) {
        await prisma.content.update({
          where: { id: contentId },
          data: { status: 'PENDING' }
        });
      }
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
  } catch (err: any) {
    console.error('❌ [MediaScanner] Error in apply-tmdb:', err);
    next(err);
  }
}) as RequestHandler);

/**
 * POST /api/admin/media-scanner/cleanup-stuck
 * Limpia VideoFiles atascados en estado QUEUED o PROCESSING:
 *   - Si el archivo físico YA NO EXISTE → elimina el registro de la BD.
 *   - Si el archivo físico SÍ EXISTE → re-encola el job de procesamiento.
 * Útil para recuperarse de fallos de Redis o reinicios inesperados del servidor.
 */
mediaScannerRouter.post('/cleanup-stuck', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import('../../shared/config/prisma');
    const { addVideoJob } = await import('../../services/queue.service');

    // Fetch all jobs stuck in QUEUED or PROCESSING
    const stuckJobs = await prisma.videoFile.findMany({
      where: { status: { in: ['QUEUED', 'PROCESSING'] } },
      select: {
        id: true,
        originalPath: true,
        status: true,
        type: true,
        contentId: true,
        episodeId: true,
      }
    });

    let deleted = 0;
    let requeued = 0;
    let skipped = 0;

    for (const vf of stuckJobs) {
      const fileExists = vf.originalPath && fs.existsSync(vf.originalPath);

      if (!fileExists) {
        // Ghost record: file is gone, clean up the DB entry
        await prisma.videoFile.delete({ where: { id: vf.id } }).catch(() => {});
        deleted++;
        console.log(`[cleanup-stuck] Deleted ghost videoFile ${vf.id} — path missing: ${vf.originalPath}`);
      } else {
        // File exists but job is stuck: reset to QUEUED and re-enqueue
        await prisma.videoFile.update({
          where: { id: vf.id },
          data: { status: 'QUEUED', processingJobId: null }
        });

        try {
          const ownerContentId = vf.episodeId || vf.contentId;
          if (!ownerContentId) { skipped++; continue; }

          const job = await addVideoJob({
            videoFileId: vf.id,
            contentId: ownerContentId,
            type: vf.type,
            videoPath: vf.originalPath!,
          });
          await prisma.videoFile.update({ where: { id: vf.id }, data: { processingJobId: job.id } });
          requeued++;
          console.log(`[cleanup-stuck] Re-queued videoFile ${vf.id} → new job ${job.id}`);
        } catch (qErr: any) {
          console.error(`[cleanup-stuck] Failed to re-queue ${vf.id}: ${qErr.message}`);
          skipped++;
        }
      }
    }

    ok(res, {
      message: 'Limpieza completada',
      total: stuckJobs.length,
      deleted,
      requeued,
      skipped,
    });
  } catch (err) { next(err); }
}) as RequestHandler);

/**
 * POST /api/admin/media-scanner/drain-and-reset
 * NUCLEAR RESET: Vacía toda la cola de BullMQ (Redis) y elimina todos los registros
 * VideoFile en estado QUEUED o PROCESSING de la base de datos.
 *
 * Resultado: el auto-scanner detectará los archivos físicos como "nuevos" en el
 * próximo ciclo y los re-encolará con la configuración actual (incluido el fast-path FFmpeg).
 *
 * ⚠️ USAR CON CUIDADO: cancela TODOS los trabajos en curso.
 */
mediaScannerRouter.post('/drain-and-reset', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import('../../shared/config/prisma');
    const { videoQueue } = await import('../../services/queue.service');

    // 1. Obliterate the BullMQ queue: removes ALL jobs (waiting, active, delayed, failed)
    await videoQueue.obliterate({ force: true });

    // 2. Delete all QUEUED, PROCESSING, FAILED, and PENDING videoFile records from the DB
    //    so the auto-scanner sees the physical files as "new" again
    const deleted = await prisma.videoFile.deleteMany({
      where: { status: { in: ['QUEUED', 'PROCESSING', 'FAILED', 'PENDING'] } }
    });

    // 3. Reset any content stuck in ERROR or PROCESSING back to PENDING
    const resetContent = await prisma.content.updateMany({
      where: { status: { in: ['ERROR', 'PROCESSING'] } },
      data: { status: 'PENDING' }
    });

    console.log(`[drain-and-reset] Queue obliterated. Deleted ${deleted.count} videoFile records. Reset ${resetContent.count} content records to PENDING.`);

    // 4. Publish nuclear-restart message to Redis PubSub to notify all worker servers
    try {
      const { env } = await import('../../shared/config/env');
      const Redis = (await import('ioredis')).default;
      const pub = new Redis(env.REDIS_URL);
      await pub.publish('peliplus-control-channel', 'nuclear-restart');
      await pub.quit();
      console.log('📡 [MediaScanner] Broadcasted nuclear-restart to control channel.');
    } catch (pubErr: any) {
      console.error('⚠️ [MediaScanner] Failed to broadcast restart signal:', pubErr.message);
    }

    ok(res, {
      message: 'Cola vaciada, procesos FFmpeg cerrados y reiniciando todos los servidores (PM2). El sistema retomará todo desde cero en breve.',
      deletedVideoFiles: deleted.count,
      resetContentToPending: resetContent.count,
    });
  } catch (err) { next(err); }
}) as RequestHandler);
