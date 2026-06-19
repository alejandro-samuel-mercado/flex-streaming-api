import { Worker, Job, DelayedError } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../shared/config/env';
import { FFmpegService } from '../services/ffmpeg.service';
import { prisma } from '../shared/config/prisma';
import path from 'path';
import fs from 'fs';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const videoWorker = new Worker(
  'video-processing',
  async (job: Job) => {
    const { videoFileId, contentId, videoPath } = job.data;
    
    const outputFolder = path.join(env.MEDIA_PATH, 'hls', contentId);

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
                playlistUrl: `/api/stream/hls/${videoFileId}/1080p.m3u8`,
                codec: 'h264'
              },
              {
                resolution: '720p',
                width: 1280,
                height: 720,
                bitrate: 2500000,
                playlistUrl: `/api/stream/hls/${videoFileId}/720p.m3u8`,
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

      // ─── Determine content status: READY if video is done ─────
      const realContentId = existsInitial.contentId || contentId;
      const content = await prisma.content.findUnique({
        where: { id: realContentId },
        include: {
          translations: true,
          thumbnails: true,
          genres: true
        }
      });

      if (content) {
        // If it's a movie or series/anime, it should be READY since video is done
        await prisma.content.update({
          where: { id: realContentId },
          data: { status: 'READY' }
        });
        job.log(`Content ${realContentId} marked as READY (video processing complete)`);
        
        // Log warnings about missing data but DON'T block the status
        const hasDescription = content.translations.some((t: any) => t.description && t.description.trim().length > 0);
        const hasPoster = content.thumbnails.some((t: any) => t.type === 'POSTER');
        const hasGenres = content.genres.length > 0;
        
        if (!hasDescription || !hasPoster || !hasGenres) {
          const missing = [];
          if (!hasDescription) missing.push('sinopsis');
          if (!hasPoster) missing.push('poster');
          if (!hasGenres) missing.push('géneros');
          job.log(`Warning: Content ${contentId} is READY but missing metadata: ${missing.join(', ')}`);
        }
      } else if (jobType === 'TRAILER') {
          // If it's a trailer, update the trailerUrl field
          await prisma.content.update({
              where: { id: contentId },
              data: { trailerUrl: masterPlaylistUrl }
          });
      }

      // Update the content poster only if we actually need to/generated it
      if (!hasPoster) {
        const posterUrl = `/media/thumbnails/${contentId}/poster.jpg`;
        const existingPoster = await prisma.thumbnail.findFirst({
          where: {
            contentId: existsInitial.contentId || undefined,
            episodeId: existsInitial.episodeId || undefined,
            type: 'POSTER'
          }
        });

        if (existingPoster) {
          await prisma.thumbnail.update({
            where: { id: existingPoster.id },
            data: { url: posterUrl }
          });
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

      // ─── Delete original file to save space ───────────────────────────────
      try {
        if (fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
          job.log(`Original video file deleted to save space: ${videoPath}`);
        }
      } catch (delErr: any) {
        job.log(`Warning: Failed to delete original video file: ${delErr.message}`);
      }

      await onProgress(100);
      return { success: true, path: hlsResult.path };

    } catch (error: any) {
      job.log(`Failed inside worker: ${error.message}`);

      // ── Cleanup on failure ────────────────────────────────────────────
      // 1. Mark the video file as FAILED so the UI shows the correct state
      try {
        await prisma.videoFile.updateMany({
          where: { id: videoFileId },
          data: { 
            status: 'FAILED',
            errorMessage: error.message 
          }
        });

        // 2. Also mark the main content as ERROR so it doesn't show as READY on the web
        const errContentId = existsInitial?.contentId || contentId;
        await prisma.content.updateMany({
          where: { id: errContentId },
          data: { status: 'ERROR' }
        });

      } catch (dbErr: any) {
        job.log(`Warning: could not set FAILED/ERROR status: ${dbErr.message}`);
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
      await prisma.videoFile.updateMany({
        where: { id: job.data.videoFileId },
        data: {
          status: 'FAILED',
          errorMessage: err.message.includes('ENOENT') 
             ? `El archivo físico de video no se encuentra en este servidor (Verifique si la ruta existe o vuelva a subirlo): ${err.message}` 
             : `Error en BullMQ (Stalled o Caído): ${err.message}`
        }
      });
      console.log(`[VideoWorker] Updated database status of videoFile ${job.data.videoFileId} to FAILED due to job failure`);
    } catch (dbErr: any) {
      console.error(`[VideoWorker] Failed to update database status on job failure: ${dbErr.message}`);
    }
  }
});
