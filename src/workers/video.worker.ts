import { Worker, Job, DelayedError } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../shared/config/env';
import { FFmpegService } from '../services/ffmpeg.service';
import { prisma } from '../shared/config/prisma';
import path from 'path';
import fs from 'fs';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const QUEUE_NAME = process.env.QUEUE_NAME || 'video-processing';

export const videoWorker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    const { videoFileId, contentId, videoPath } = job.data;
    // FIX: Usamos videoFileId en lugar de contentId para HLS para evitar que los episodios de una misma serie se sobreescriban entre sí
    const outputFolder = path.join(env.MEDIA_PATH, 'hls', videoFileId);

    const onProgress = async (percent: number) => {
      try {
        await job.updateProgress(percent);
      } catch (err: any) {
        // Prevent worker crash if job is deleted from Redis while FFmpeg is still running
        console.warn(`[VideoWorker] Progress update failed for job ${job.id}: ${err.message}`);
      }
    };

    job.log(`Starting HLS processing for contentId: ${contentId}`);

    // ─── Worker Mode Filter ────────────────────────────────────────────────
    // When WORKER_MODE is set, this server only processes a specific type.
    // Server 2 (SERIES): skips MOVIE jobs, lets them wait for Server 3.
    // Server 3 (MOVIES): skips EPISODE jobs, lets them wait for Server 2.
    const jobType = job.data.type || 'MOVIE';
    if (env.WORKER_MODE === 'MOVIES' && jobType === 'EPISODE') {
      job.log(`[WorkerMode] Skipping EPISODE job — this node handles MOVIES only. Re-queuing.`);
      await job.moveToDelayed(Date.now() + 30000, job.token);
      throw new DelayedError();
    }
    if (env.WORKER_MODE === 'SERIES' && jobType === 'MOVIE') {
      job.log(`[WorkerMode] Skipping MOVIE job — this node handles SERIES only. Re-queuing.`);
      await job.moveToDelayed(Date.now() + 30000, job.token);
      throw new DelayedError();
    }

    let existsInitial: any = null;
    try {
      // ─── Initial Checks ───────────────────────────────────────────────
      // Check if file exists and is readable by the process
      try {
        fs.accessSync(videoPath, fs.constants.R_OK);
      } catch (err: any) {
        throw new Error(`Cannot read input file at ${videoPath}: ${err.message}. Check permissions.`);
      }

      existsInitial = await prisma.videoFile.findUnique({ where: { id: videoFileId } });
      if (!existsInitial) {
        job.log('Job cancelled: VideoFile record no longer exists. Aborting early.');
        return { cancelled: true };
      }

      // ── Lock: prevent double-processing ───────────────────────────────
      // If the record is already PROCESSING, another worker is handling it
      // EXCEPT if this is a retry attempt (server restart/crash recovery), in which case we MUST proceed
      if (existsInitial.status === 'PROCESSING' && job.attemptsMade === 0) {
        job.log('Job skipped: VideoFile is already being processed by another worker.');
        return { skipped: true };
      }

      // Atomically set to PROCESSING (acts as a lock)
      await prisma.videoFile.update({
        where: { id: videoFileId },
        data: { status: 'PROCESSING' }
      });

      await onProgress(5);

      // Check if this content/episode already has an official high-quality poster (e.g. from TMDB)
      const hasPoster = await prisma.thumbnail.findFirst({
        where: {
          OR: [
            { contentId: existsInitial.contentId || undefined, type: 'POSTER' },
            { episodeId: existsInitial.episodeId || undefined, type: 'POSTER' }
          ]
        }
      });

      if (!hasPoster) {
        const thumbnailFolder = path.join(env.MEDIA_PATH, 'thumbnails', contentId);
        const thumbnailResult = await FFmpegService.generateThumbnail(videoPath, thumbnailFolder);
        job.log(`Thumbnail generated at ${thumbnailResult.path}`);
      } else {
        job.log('High-quality poster already exists. Skipping video thumbnail extraction to avoid overwriting.');
      }
      
      await onProgress(10);

      // ─── Extract embedded subtitles (MKV, MP4, etc.) ──────────────────
      const subtitlesFolder = path.join(env.MEDIA_PATH, 'subtitles', contentId);
      let extractedSubs: { language: string; label: string; filePath: string; isDefault: boolean; isForced: boolean }[] = [];
      try {
        extractedSubs = await FFmpegService.extractSubtitles(videoPath, subtitlesFolder);
        job.log(`Extracted ${extractedSubs.length} embedded subtitle(s)`);
      } catch (subErr: any) {
        job.log(`Subtitle extraction warning (non-fatal): ${subErr.message}`);
      }

      await onProgress(15);
      
      // Check if job was cancelled (record deleted) before starting heavy FFmpeg
      const exists = await prisma.videoFile.findUnique({ where: { id: videoFileId } });
      if (!exists) {
        job.log('Job cancelled: VideoFile record no longer exists. Aborting.');
        return { cancelled: true };
      }

      const hlsResult = await FFmpegService.generateHLS(videoPath, outputFolder, (pct) => {
        const jobProgress = 15 + Math.round(pct * 0.80);
        onProgress(jobProgress);
      });
      job.log(`HLS generated at ${hlsResult.path}`);

      // Final check before updating DB (in case of cancellation)
      const finalExists = await prisma.videoFile.findUnique({ where: { id: videoFileId } });
      if (!finalExists) {
        job.log('Job cancelled after processing: VideoFile record no longer exists. Aborting.');
        return { cancelled: true };
      }

      const masterPlaylistUrl = `/api/stream/hls/${videoFileId}/master.m3u8`;

      // Wait until Prisma is available correctly
      await prisma.videoFile.update({
        where: { id: videoFileId },
        data: {
          status: 'COMPLETED',
          masterPlaylist: masterPlaylistUrl,
          hlsPath: outputFolder,
          qualities: {
            create: [
              {
                resolution: '1080p',
                width: 1920,
                height: 1080,
                bitrate: 4500000,
                playlistUrl: `/api/stream/hls/${videoFileId}/master.m3u8`,
                codec: 'h264'
              },
              {
                resolution: '720p',
                width: 1280,
                height: 720,
                bitrate: 2500000,
                playlistUrl: `/api/stream/hls/${videoFileId}/master.m3u8`,
                codec: 'h264'
              }
            ]
          },
          audioTracks: {
            create: hlsResult.audioTracks.map((t: any) => ({
              language: t.language,
              label: t.name,
              trackIndex: t.index,
              codec: t.codec,
              isDefault: t.index === 0
            }))
          }
        }
      });

      // ─── Save extracted subtitles to DB ────────────────────────────────
      if (extractedSubs.length > 0) {
        for (const sub of extractedSubs) {
          // Copy subtitle file to the subtitles media folder and get relative URL
          const subFileName = path.basename(sub.filePath);
          const subUrl = `/media/subtitles/${contentId}/${subFileName}`;

          await prisma.subtitleTrack.create({
            data: {
              videoFileId,
              language: sub.language,
              label: sub.label,
              format: 'vtt',
              url: subUrl,
              isDefault: sub.isDefault,
              isForced: sub.isForced
            }
          });
        }
        job.log(`Saved ${extractedSubs.length} subtitle track(s) to database`);
      }

      const jobType = job.data.type || 'MOVIE';
      const SERIES_TYPES = ['SERIES', 'ANIME', 'ANIMATION', 'NOVELA', 'REALITY_SHOW', 'DOCUMENTARY', 'KIDS', 'FAMILY'];

      // ─── Determine content status ──────────────────────────────────────────
      // For EPISODE type: resolve real series Content ID via episode→season chain
      let realContentId: string | null = existsInitial.contentId;
      if (!realContentId && existsInitial.episodeId) {
        const epRecord = await prisma.episode.findUnique({
          where: { id: existsInitial.episodeId },
          include: { season: { select: { contentId: true } } }
        });
        realContentId = epRecord?.season?.contentId ?? null;
      }
      if (!realContentId) realContentId = contentId; // legacy fallback

      // Guard: si no pudimos resolver el contentId, no hay nada que actualizar
      if (!realContentId) {
        job.log(`Warning: could not resolve contentId for videoFile ${videoFileId} — skipping status update`);
      } else {
        const rcId: string = realContentId; // narrowed to string for TS
        const content = await prisma.content.findUnique({
          where: { id: rcId },
          include: { translations: true, thumbnails: true, genres: true }
        });

        if (content) {
          const isSeriesType = SERIES_TYPES.includes(content.type);
          const hasPoster = content.thumbnails.some((t: any) => t.type === 'POSTER');
          const targetStatus = hasPoster ? 'ACTIVE' : 'PENDING';

          if (!isSeriesType) {
            // PELÍCULA / TRAILER
            await prisma.content.update({ where: { id: rcId }, data: { status: targetStatus } });
            job.log(`Content ${rcId} marked as ${targetStatus} (hasPoster: ${hasPoster})`);
          } else {
            // SERIE: contar episodios con video COMPLETED
            const completedEpisodes = await prisma.episode.count({
              where: {
                season: { contentId: rcId },
                videoFiles: { some: { status: 'COMPLETED' } }
              }
            });
            const totalEpisodes = await prisma.episode.count({
              where: { season: { contentId: rcId } }
            });

            if (completedEpisodes > 0) {
              await prisma.content.update({ where: { id: rcId }, data: { status: targetStatus } });
              job.log(`Serie ${rcId} ${targetStatus} — ${completedEpisodes}/${totalEpisodes} eps completos (hasPoster: ${hasPoster})`);
            } else {
              await prisma.content.updateMany({
                where: { id: rcId, status: { notIn: ['ACTIVE'] } },
                data: { status: 'PROCESSING' }
              });
              job.log(`Serie ${rcId} PROCESSING — ${completedEpisodes}/${totalEpisodes} eps completos`);
            }
          }

          // Log warnings sobre metadata faltante
          const hasDescription = content.translations.some((t: any) => t.description && t.description.trim().length > 0);
          // hasPoster ya está declarado arriba
          const hasGenres = content.genres.length > 0;
          if (!hasDescription || !hasPoster || !hasGenres) {
            const missing = [];
            if (!hasDescription) missing.push('sinopsis');
            if (!hasPoster) missing.push('poster');
            if (!hasGenres) missing.push('géneros');
            job.log(`Warning: Content ${rcId} missing metadata: ${missing.join(', ')}`);
          }
        } else if (jobType === 'TRAILER') {
          await prisma.content.update({ where: { id: contentId }, data: { trailerUrl: masterPlaylistUrl } });
        }
      } // end realContentId guard

      // Update the content poster only if we actually need to/generated it
      const hasPosterOnDisk = existsInitial && await prisma.thumbnail.findFirst({
        where: {
          contentId: existsInitial.contentId || undefined,
          episodeId: existsInitial.episodeId || undefined,
          type: 'POSTER'
        }
      });
      if (!hasPosterOnDisk) {
        const posterUrl = `/media/thumbnails/${contentId}/poster.jpg`;
        const existingPoster = await prisma.thumbnail.findFirst({
          where: {
            contentId: existsInitial.contentId || undefined,
            episodeId: existsInitial.episodeId || undefined,
            type: 'POSTER'
          }
        });
        if (existingPoster) {
          await prisma.thumbnail.update({ where: { id: existingPoster.id }, data: { url: posterUrl } });
        } else {
          await prisma.thumbnail.create({
            data: {
              contentId: existsInitial.contentId || null,
              episodeId: existsInitial.episodeId || null,
              type: 'POSTER',
              url: posterUrl,
              width: existsInitial.contentId ? 500 : 1280,
              height: existsInitial.contentId ? 750 : 720
            }
          });
        }
      }

      // ─── Borrar original solo cuando sea seguro ───────────────────────────
      // PELÍCULAS: borrar siempre al completar (ya está en HLS)
      // SERIES: conservar hasta que el admin lo elimine manualmente
      try {
        const contentType = realContentId
          ? (await prisma.content.findUnique({ where: { id: realContentId }, select: { type: true } }))?.type
          : null;
        const isSafeToDelete = !contentType || !SERIES_TYPES.includes(contentType);
        if (isSafeToDelete && fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
          job.log(`Original eliminado: ${videoPath}`);
        } else if (!isSafeToDelete) {
          job.log(`Original conservado (serie): ${videoPath}`);
        }
      } catch (delErr: any) {
        job.log(`Warning: no se pudo eliminar original: ${delErr.message}`);
      }

      await onProgress(100);
      return { success: true, path: hlsResult.path };

    } catch (error: any) {
      job.log(`Failed inside worker: ${error.message}`);

      // ── Cleanup on failure ────────────────────────────────────────────
      // 1. Mark the video file as FAILED or delete if unrecoverable
      try {
        const isGhostFile = error.message.includes('ENOENT') || error.message.includes('Cannot read input file');
        const isCorrupted = error.message.includes('Invalid data found') ||
                            error.message.includes('moov atom not found') ||
                            error.message.includes('EBML header') ||
                            error.message.includes('ffprobe exited with code 1');

        if (isGhostFile) {
          // Ghost: the physical file doesn't exist — delete DB record so the scanner
          // can re-import it if the file ever appears again.
          await prisma.videoFile.deleteMany({ where: { id: videoFileId } });
          job.log(`[Auto-Clean] Deleted ghost videoFile ${videoFileId} — physical file is missing.`);
        } else if (isCorrupted) {
          // Corrupted: file exists but is unreadable by ffprobe.
          // Mark as FAILED so the client sees it, but delete the physical file to prevent scanner loops.
          await prisma.videoFile.updateMany({
            where: { id: videoFileId },
            data: { status: 'FAILED', errorMessage: `Archivo corrompido o vacío: ${error.message}` }
          });
          try {
            if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
          } catch (e) {}
          job.log(`[Auto-Clean] Marked corrupted videoFile ${videoFileId} as FAILED and deleted physical file. Re-upload a valid file.`);
        } else {
          // Transient error (timeout, Redis hiccup, etc.): keep as FAILED for inspection
          await prisma.videoFile.updateMany({
            where: { id: videoFileId },
            data: { status: 'FAILED', errorMessage: error.message }
          });
        }

        // 2. Resolver el contentId real (para episodios, navegar episode→season→content)
        let errContentId: string | null = existsInitial?.contentId ?? null;
        if (!errContentId && existsInitial?.episodeId) {
          const epRecord = await prisma.episode.findUnique({
            where: { id: existsInitial.episodeId },
            include: { season: { select: { contentId: true } } }
          });
          errContentId = epRecord?.season?.contentId ?? null;
        }
        if (!errContentId) errContentId = contentId;

        if (errContentId) {
          // Verificar si aún quedan episodios con video COMPLETED
          const completedLeft = await prisma.videoFile.count({
            where: {
              status: 'COMPLETED',
              OR: [
                { contentId: errContentId },
                { episode: { season: { contentId: errContentId } } }
              ]
            }
          });
          if (completedLeft === 0) {
            // No hay ningún video funcionando → bajar a PENDING
            await prisma.content.updateMany({
              where: { id: errContentId },
              data: { status: 'PENDING' }
            });
          }
          // Si quedan videos OK, dejar el status como está (no bajar una serie entera por 1 episodio fallido)
        }

      } catch (dbErr: any) {
        job.log(`Warning: could not update status after failure: ${dbErr.message}`);
      }

      // 3. Delete partially-written HLS output to avoid corrupt segments on disk
      try {
        if (fs.existsSync(outputFolder)) {
          fs.rmSync(outputFolder, { recursive: true, force: true });
          job.log(`Cleaned up partial HLS output at ${outputFolder}`);
        }
      } catch (cleanErr: any) {
        job.log(`Warning: cleanup failed: ${cleanErr.message}`);
      }

      throw error;
    }
  },
  {
    connection: connection as any,
    concurrency: env.MAX_CONCURRENT_ENCODING,
    lockDuration: 12 * 60 * 60 * 1000, // 12 hours — FFmpeg jobs are extremely long-running
    stalledInterval: 60 * 1000,        // Check for stalled jobs every 60s
    maxStalledCount: 10,               // Allow up to 10 stall checks
  }
);

videoWorker.on('completed', (job) => {
  console.log(`Job ${job.id} has completed!`);
});

videoWorker.on('failed', async (job, err) => {
  console.error(`Job ${job?.id} has failed with ${err.message}`);
  if (job?.data?.videoFileId) {
    try {
      const isGhostFile = err.message.includes('ENOENT') || err.message.includes('Cannot read input file');
      const isCorrupted = err.message.includes('Invalid data found') ||
                          err.message.includes('moov atom not found') ||
                          err.message.includes('EBML header') ||
                          err.message.includes('ffprobe exited with code 1');

      if (isGhostFile) {
        await prisma.videoFile.updateMany({
          where: { id: job.data.videoFileId },
          data: { status: 'FAILED', errorMessage: `Archivo no encontrado (ENOENT). Verifica que el worker tenga acceso al archivo físico.` }
        });
        console.log(`[VideoWorker] videoFile ${job.data.videoFileId} marked FAILED (ghost file). Deletion skipped to prevent scan loops.`);
      } else if (isCorrupted) {
        await prisma.videoFile.updateMany({
          where: { id: job.data.videoFileId },
          data: { status: 'FAILED', errorMessage: `Archivo corrompido o subida incompleta: ${err.message}` }
        });
        console.log(`[VideoWorker] videoFile ${job.data.videoFileId} marked FAILED (corrupted). Admin must use cleanup-stuck after re-upload.`);
      } else {
        await prisma.videoFile.updateMany({
          where: { id: job.data.videoFileId },
          data: { status: 'FAILED', errorMessage: `BullMQ job failure: ${err.message}` }
        });
        console.log(`[VideoWorker] videoFile ${job.data.videoFileId} marked FAILED (transient error).`);
      }

      // Resolver el contentId real para el handler externo (episode→season→content)
      let errContentId: string | null = null;
      try {
        const vf = await prisma.videoFile.findUnique({ where: { id: job.data.videoFileId } });
        if (vf?.contentId) {
          errContentId = vf.contentId;
        } else if (vf?.episodeId) {
          const ep = await prisma.episode.findUnique({
            where: { id: vf.episodeId },
            include: { season: { select: { contentId: true } } }
          });
          errContentId = ep?.season?.contentId ?? null;
        }
      } catch (_) {}

      if (errContentId) {
        // Solo bajar a PENDING si no quedan videos funcionando
        const completedLeft = await prisma.videoFile.count({
          where: {
            status: 'COMPLETED',
            OR: [
              { contentId: errContentId },
              { episode: { season: { contentId: errContentId } } }
            ]
          }
        });
        if (completedLeft === 0) {
          await prisma.content.updateMany({
            where: { id: errContentId },
            data: { status: 'PENDING' }
          });
        }
      }
    } catch (dbErr: any) {
      console.error(`[VideoWorker] Failed to update database status on job failure: ${dbErr.message}`);
    }
  }
});
