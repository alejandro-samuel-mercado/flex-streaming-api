"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoWorker = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../shared/config/env");
const ffmpeg_service_1 = require("../services/ffmpeg.service");
const prisma_1 = require("../shared/config/prisma");
const path_1 = __importDefault(require("path"));
const connection = new ioredis_1.default(env_1.env.REDIS_URL, { maxRetriesPerRequest: null });
exports.videoWorker = new bullmq_1.Worker('video-processing', async (job) => {
    const { videoFileId, contentId, videoPath } = job.data;
    const outputFolder = path_1.default.join(env_1.env.MEDIA_PATH, 'hls', contentId);
    const onProgress = async (percent) => {
        await job.updateProgress(percent);
    };
    job.log(`Starting HLS processing for contentId: ${contentId}`);
    try {
        // Update existing record to PROCESSING
        await prisma_1.prisma.videoFile.update({
            where: { id: videoFileId },
            data: { status: 'PROCESSING' }
        });
        await onProgress(5);
        const thumbnailFolder = path_1.default.join(env_1.env.MEDIA_PATH, 'thumbnails', contentId);
        const thumbnailResult = await ffmpeg_service_1.FFmpegService.generateThumbnail(videoPath, thumbnailFolder);
        job.log(`Thumbnail generated at ${thumbnailResult.path}`);
        await onProgress(15);
        const hlsResult = await ffmpeg_service_1.FFmpegService.generateHLS(videoPath, outputFolder, (pct) => {
            const jobProgress = 15 + Math.round(pct * 0.80);
            onProgress(jobProgress);
        });
        job.log(`HLS generated at ${hlsResult.path}`);
        const masterPlaylistUrl = `/media/hls/${contentId}/master.m3u8`;
        // Wait until Prisma is available correctly
        await prisma_1.prisma.videoFile.update({
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
                    create: hlsResult.audioTracks.map((t) => ({
                        language: t.language,
                        name: t.name,
                        label: t.name,
                        trackIndex: t.index,
                        codec: t.codec,
                        isDefault: t.index === 0,
                        url: `/media/hls/${contentId}/${t.playlistUrl}`
                    }))
                }
            }
        });
        const jobType = job.data.type || 'MOVIE';
        // Update the content status to READY if it's a MOVIE
        if (jobType === 'MOVIE') {
            const content = await prisma_1.prisma.content.findUnique({ where: { id: contentId } });
            if (content) {
                await prisma_1.prisma.content.update({
                    where: { id: contentId },
                    data: { status: 'READY' }
                });
            }
        }
        else if (jobType === 'TRAILER') {
            // If it's a trailer, update the trailerUrl field
            await prisma_1.prisma.content.update({
                where: { id: contentId },
                data: { trailerUrl: masterPlaylistUrl }
            });
        }
        // Update the content poster if needed
        const existingPoster = await prisma_1.prisma.thumbnail.findFirst({
            where: {
                contentId: contentId,
                type: 'POSTER'
            }
        });
        const posterUrl = `/media/thumbnails/${contentId}/poster.jpg`;
        if (existingPoster) {
            await prisma_1.prisma.thumbnail.update({
                where: { id: existingPoster.id },
                data: { url: posterUrl }
            });
        }
        else {
            await prisma_1.prisma.thumbnail.create({
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
    }
    catch (error) {
        job.log(`Failed inside worker: ${error.message}`);
        throw error;
    }
}, {
    connection,
    concurrency: 1,
});
exports.videoWorker.on('completed', (job) => {
    console.log(`Job ${job.id} has completed!`);
});
exports.videoWorker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} has failed with ${err.message}`);
});
//# sourceMappingURL=video.worker.js.map