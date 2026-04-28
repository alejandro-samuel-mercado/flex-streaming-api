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
    const { contentId, episodeId, videoPath } = job.data;
    
    const outputFolder = path.join(env.MEDIA_PATH, 'hls', contentId);

    const onProgress = async (percent: number) => {
      await job.updateProgress(percent);
    };

    job.log(`Starting HLS processing for contentId: ${contentId}`);

    try {
      const videoFile = await prisma.videoFile.create({
        data: {
          contentId: contentId,
          episodeId: episodeId || null,
          originalPath: videoPath,
          status: 'PROCESSING'
        }
      });

      await onProgress(5);

      const thumbnailFolder = path.join(env.MEDIA_PATH, 'thumbnails', contentId);
      const thumbnailResult = await FFmpegService.generateThumbnail(videoPath, thumbnailFolder);
      job.log(`Thumbnail generated at ${thumbnailResult.path}`);
      
      await onProgress(15);
      
      const hlsResult = await FFmpegService.generateHLS(videoPath, outputFolder, (pct) => {
        const jobProgress = 15 + Math.round(pct * 0.80);
        onProgress(jobProgress);
      });
      job.log(`HLS generated at ${hlsResult.path}`);

      // Wait until Prisma is available correctly
      await prisma.videoFile.update({
        where: { id: videoFile.id },
        data: {
          status: 'COMPLETED',
          masterPlaylist: `/media/hls/${contentId}/master.m3u8`,
          hlsPath: outputFolder,
          qualities: {
            create: [
              {
                resolution: '720p',
                width: 1280,
                height: 720,
                bitrate: 2500000,
                playlistUrl: `/media/hls/${contentId}/720p.m3u8`,
                codec: 'h264'
              }
            ]
          }
        }
      });

      // Update the content status to READY if it's a MOVIE
      const content = await prisma.content.findUnique({ where: { id: contentId } });
      if (content && content.type === 'MOVIE') {
        await prisma.content.update({
          where: { id: contentId },
          data: { status: 'READY' }
        });
      }

      // Update the content poster if needed
      await prisma.thumbnail.upsert({
        where: { 
          contentId_type: {
            contentId: contentId,
            type: 'POSTER'
          }
        },
        update: {
          url: `/media/thumbnails/${contentId}/poster.jpg`,
        },
        create: {
          contentId: contentId,
          type: 'POSTER',
          url: `/media/thumbnails/${contentId}/poster.jpg`,
          width: 1280,
          height: 720
        }
      });

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
