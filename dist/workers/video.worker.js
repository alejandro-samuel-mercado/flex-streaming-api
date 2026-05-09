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
const fs_1 = __importDefault(require("fs"));
const connection = new ioredis_1.default(env_1.env.REDIS_URL, { maxRetriesPerRequest: null });
exports.videoWorker = new bullmq_1.Worker('video-processing', async (job) => {
    const { videoFileId, contentId, videoPath } = job.data;
    const outputFolder = path_1.default.join(env_1.env.MEDIA_PATH, 'hls', contentId);
    const onProgress = async (percent) => {
        await job.updateProgress(percent);
    };
    job.log(`Starting HLS processing for contentId: ${contentId}`);
    try {
        // ─── Initial Checks ───────────────────────────────────────────────
        // Check if file exists and is readable by the process
        try {
            fs_1.default.accessSync(videoPath, fs_1.default.constants.R_OK);
        }
        catch (err) {
            throw new Error(`Cannot read input file at ${videoPath}: ${err.message}. Check permissions.`);
        }
        const existsInitial = await prisma_1.prisma.videoFile.findUnique({ where: { id: videoFileId } });
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
        await prisma_1.prisma.videoFile.update({
            where: { id: videoFileId },
            data: { status: 'PROCESSING' }
        });
        await onProgress(5);
        const thumbnailFolder = path_1.default.join(env_1.env.MEDIA_PATH, 'thumbnails', contentId);
        const thumbnailResult = await ffmpeg_service_1.FFmpegService.generateThumbnail(videoPath, thumbnailFolder);
        job.log(`Thumbnail generated at ${thumbnailResult.path}`);
        await onProgress(10);
        // ─── Extract embedded subtitles (MKV, MP4, etc.) ──────────────────
        const subtitlesFolder = path_1.default.join(env_1.env.MEDIA_PATH, 'subtitles', contentId);
        let extractedSubs = [];
        try {
            extractedSubs = await ffmpeg_service_1.FFmpegService.extractSubtitles(videoPath, subtitlesFolder);
            job.log(`Extracted ${extractedSubs.length} embedded subtitle(s)`);
        }
        catch (subErr) {
            job.log(`Subtitle extraction warning (non-fatal): ${subErr.message}`);
        }
        await onProgress(15);
        // Check if job was cancelled (record deleted) before starting heavy FFmpeg
        const exists = await prisma_1.prisma.videoFile.findUnique({ where: { id: videoFileId } });
        if (!exists) {
            job.log('Job cancelled: VideoFile record no longer exists. Aborting.');
            return { cancelled: true };
        }
        const hlsResult = await ffmpeg_service_1.FFmpegService.generateHLS(videoPath, outputFolder, (pct) => {
            const jobProgress = 15 + Math.round(pct * 0.80);
            onProgress(jobProgress);
        });
        job.log(`HLS generated at ${hlsResult.path}`);
        // Final check before updating DB (in case of cancellation)
        const finalExists = await prisma_1.prisma.videoFile.findUnique({ where: { id: videoFileId } });
        if (!finalExists) {
            job.log('Job cancelled after processing: VideoFile record no longer exists. Aborting.');
            return { cancelled: true };
        }
        const masterPlaylistUrl = `/api/stream/hls/${videoFileId}/master.m3u8`;
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
                            resolution: '720p',
                            width: 1280,
                            height: 720,
                            bitrate: 2500000,
                            playlistUrl: `/api/stream/hls/${videoFileId}/720p.m3u8`,
                            codec: 'h264'
                        },
                        {
                            resolution: '1080p',
                            width: 1920,
                            height: 1080,
                            bitrate: 5000000,
                            playlistUrl: `/api/stream/hls/${videoFileId}/1080p.m3u8`,
                            codec: 'h264'
                        }
                    ]
                },
                audioTracks: {
                    create: hlsResult.audioTracks.map((t) => ({
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
                const subFileName = path_1.default.basename(sub.filePath);
                const subUrl = `/media/subtitles/${contentId}/${subFileName}`;
                await prisma_1.prisma.subtitleTrack.create({
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
        const content = await prisma_1.prisma.content.findUnique({
            where: { id: contentId },
            include: {
                translations: true,
                thumbnails: true,
                genres: true
            }
        });
        if (content) {
            // If it's a movie or series/anime, it should be READY since video is done
            await prisma_1.prisma.content.update({
                where: { id: contentId },
                data: { status: 'READY' }
            });
            job.log(`Content ${contentId} marked as READY (video processing complete)`);
            // Log warnings about missing data but DON'T block the status
            const hasDescription = content.translations.some((t) => t.description && t.description.trim().length > 0);
            const hasPoster = content.thumbnails.some((t) => t.type === 'POSTER');
            const hasGenres = content.genres.length > 0;
            if (!hasDescription || !hasPoster || !hasGenres) {
                const missing = [];
                if (!hasDescription)
                    missing.push('sinopsis');
                if (!hasPoster)
                    missing.push('poster');
                if (!hasGenres)
                    missing.push('géneros');
                job.log(`Warning: Content ${contentId} is READY but missing metadata: ${missing.join(', ')}`);
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
        // ── Cleanup on failure ────────────────────────────────────────────
        // 1. Mark the video file as FAILED so the UI shows the correct state
        try {
            await prisma_1.prisma.videoFile.update({
                where: { id: videoFileId },
                data: {
                    status: 'FAILED',
                    errorMessage: error.message
                }
            });
            // 2. Also mark the main content as ERROR so it doesn't show as READY on the web
            await prisma_1.prisma.content.update({
                where: { id: contentId },
                data: { status: 'ERROR' }
            }).catch(() => null); // Ignore if contentId was actually an episodeId or invalid
        }
        catch (dbErr) {
            job.log(`Warning: could not set FAILED/ERROR status: ${dbErr.message}`);
        }
        // 3. Delete partially-written HLS output to avoid corrupt segments on disk
        try {
            if (fs_1.default.existsSync(outputFolder)) {
                fs_1.default.rmSync(outputFolder, { recursive: true, force: true });
                job.log(`Cleaned up partial HLS output at ${outputFolder}`);
            }
        }
        catch (cleanErr) {
            job.log(`Warning: cleanup failed: ${cleanErr.message}`);
        }
        throw error;
    }
}, {
    connection,
    concurrency: env_1.env.MAX_CONCURRENT_ENCODING,
});
exports.videoWorker.on('completed', (job) => {
    console.log(`Job ${job.id} has completed!`);
});
exports.videoWorker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} has failed with ${err.message}`);
});
//# sourceMappingURL=video.worker.js.map