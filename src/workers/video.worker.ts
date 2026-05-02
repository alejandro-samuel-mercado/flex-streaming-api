import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../shared/config/env';
import { FFmpegService } from '../services/ffmpeg.service';
import { prisma } from '../shared/config/prisma';
import path from 'path';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const videoWorker = new Worker(
  'video-processing',
  async (job: Job) => {
    const { videoFileId, contentId, videoPath } = job.data;
    
    const outputFolder = path.join(env.MEDIA_PATH, 'hls', contentId);

    const onProgress = async (percent: number) => {
      await job.updateProgress(percent);
    };

    job.log(`Starting HLS processing for contentId: ${contentId}`);

    try {
      // Update existing record to PROCESSING
      await prisma.videoFile.update({
        where: { id: videoFileId },
        data: { status: 'PROCESSING' }
      });

      await onProgress(5);

      const thumbnailFolder = path.join(env.MEDIA_PATH, 'thumbnails', contentId);
      const thumbnailResult = await FFmpegService.generateThumbnail(videoPath, thumbnailFolder);
      job.log(`Thumbnail generated at ${thumbnailResult.path}`);
      
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

      const masterPlaylistUrl = `/media/hls/${contentId}/master.m3u8`;

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
                resolution: '360p',
                width: 640,
                height: 360,
                bitrate: 800000,
                playlistUrl: `/media/hls/${contentId}/360p.m3u8`,
                codec: 'h264'
              },
              {
                resolution: '720p',
                width: 1280,
                height: 720,
                bitrate: 2500000,
                playlistUrl: `/media/hls/${contentId}/720p.m3u8`,
                codec: 'h264'
              },
              {
                resolution: '1080p',
                width: 1920,
                height: 1080,
                bitrate: 5000000,
                playlistUrl: `/media/hls/${contentId}/1080p.m3u8`,
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

      const jobType = job.data.type || 'MOVIE';

      // Update the content status to READY if it's a MOVIE
      if (jobType === 'MOVIE') {
        const content = await prisma.content.findUnique({ where: { id: contentId } });
        if (content) {
            await prisma.content.update({
              where: { id: contentId },
              data: { status: 'READY' }
            });
        }
      } else if (jobType === 'TRAILER') {
          // If it's a trailer, update the trailerUrl field
          await prisma.content.update({
              where: { id: contentId },
              data: { trailerUrl: masterPlaylistUrl }
          });
      }

      // Update the content poster if needed
      const existingPoster = await prisma.thumbnail.findFirst({
        where: {
          contentId: contentId,
          type: 'POSTER'
        }
      });

      const posterUrl = `/media/thumbnails/${contentId}/poster.jpg`;

      if (existingPoster) {
        await prisma.thumbnail.update({
          where: { id: existingPoster.id },
          data: { url: posterUrl }
        });
      } else {
        await prisma.thumbnail.create({
          data: {
            contentId: contentId,
            type: 'POSTER',
            url: posterUrl,
            width: 1280,
            height: 720
          }
        });
      }

      await onProgress(100);
      return { success: true, path: hlsResult.path };

    } catch (error: any) {
      job.log(`Failed inside worker: ${error.message}`);
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

videoWorker.on('completed', (job) => {
  console.log(`Job ${job.id} has completed!`);
});

videoWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} has failed with ${err.message}`);
});
