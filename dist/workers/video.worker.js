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
const QUEUE_NAME = process.env.QUEUE_NAME || 'video-processing';
exports.videoWorker = new bullmq_1.Worker(QUEUE_NAME, async (job) => {
    const { videoFileId, contentId, videoPath } = job.data;
    const outputFolder = path_1.default.join(env_1.env.MEDIA_PATH, 'hls', contentId);
    const onProgress = async (percent) => {
        try {
            await job.updateProgress(percent);
        }
        catch (err) {
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
    if (env_1.env.WORKER_MODE === 'MOVIES' && jobType === 'EPISODE') {
        job.log(`[WorkerMode] Skipping EPISODE job — this node handles MOVIES only. Re-queuing.`);
        await job.moveToDelayed(Date.now() + 30000, job.token);
        throw new bullmq_1.DelayedError();
    }
    if (env_1.env.WORKER_MODE === 'SERIES' && jobType === 'MOVIE') {
        job.log(`[WorkerMode] Skipping MOVIE job — this node handles SERIES only. Re-queuing.`);
        await job.moveToDelayed(Date.now() + 30000, job.token);
        throw new bullmq_1.DelayedError();
    }
    let existsInitial = null;
    try {
        // ─── Initial Checks ───────────────────────────────────────────────
        // Check if file exists and is readable by the process
        try {
            fs_1.default.accessSync(videoPath, fs_1.default.constants.R_OK);
        }
        catch (err) {
            throw new Error(`Cannot read input file at ${videoPath}: ${err.message}. Check permissions.`);
        }
        existsInitial = await prisma_1.prisma.videoFile.findUnique({ where: { id: videoFileId } });
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
        // Check if this content/episode already has an official high-quality poster (e.g. from TMDB)
        const hasPoster = await prisma_1.prisma.thumbnail.findFirst({
            where: {
                OR: [
                    { contentId: existsInitial.contentId || undefined, type: 'POSTER' },
                    { episodeId: existsInitial.episodeId || undefined, type: 'POSTER' }
                ]
            }
        });
        if (!hasPoster) {
            const thumbnailFolder = path_1.default.join(env_1.env.MEDIA_PATH, 'thumbnails', contentId);
            const thumbnailResult = await ffmpeg_service_1.FFmpegService.generateThumbnail(videoPath, thumbnailFolder);
            job.log(`Thumbnail generated at ${thumbnailResult.path}`);
        }
        else {
            job.log('High-quality poster already exists. Skipping video thumbnail extraction to avoid overwriting.');
        }
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
        const realContentId = existsInitial.contentId || contentId;
        const content = await prisma_1.prisma.content.findUnique({
            where: { id: realContentId },
            include: {
                translations: true,
                thumbnails: true,
                genres: true
            }
        });
        if (content) {
            // If it's a movie or series/anime, it should be READY since video is done
            await prisma_1.prisma.content.update({
                where: { id: realContentId },
                data: { status: 'READY' }
            });
            job.log(`Content ${realContentId} marked as READY (video processing complete)`);
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
        // Update the content poster only if we actually need to/generated it
        if (!hasPoster) {
            const posterUrl = `/media/thumbnails/${contentId}/poster.jpg`;
            const existingPoster = await prisma_1.prisma.thumbnail.findFirst({
                where: {
                    contentId: existsInitial.contentId || undefined,
                    episodeId: existsInitial.episodeId || undefined,
                    type: 'POSTER'
                }
            });
            if (existingPoster) {
                await prisma_1.prisma.thumbnail.update({
                    where: { id: existingPoster.id },
                    data: { url: posterUrl }
                });
            }
            else {
                await prisma_1.prisma.thumbnail.create({
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
            if (fs_1.default.existsSync(videoPath)) {
                fs_1.default.unlinkSync(videoPath);
                job.log(`Original video file deleted to save space: ${videoPath}`);
            }
        }
        catch (delErr) {
            job.log(`Warning: Failed to delete original video file: ${delErr.message}`);
        }
        await onProgress(100);
        return { success: true, path: hlsResult.path };
    }
    catch (error) {
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
                await prisma_1.prisma.videoFile.deleteMany({ where: { id: videoFileId } });
                job.log(`[Auto-Clean] Deleted ghost videoFile ${videoFileId} — physical file is missing.`);
            }
            else if (isCorrupted) {
                // Corrupted: file exists but is unreadable by ffprobe.
                // Mark as FAILED so the client sees it, but delete the physical file to prevent scanner loops.
                await prisma_1.prisma.videoFile.updateMany({
                    where: { id: videoFileId },
                    data: { status: 'FAILED', errorMessage: `Archivo corrompido o vacío: ${error.message}` }
                });
                try {
                    if (fs_1.default.existsSync(videoPath))
                        fs_1.default.unlinkSync(videoPath);
                }
                catch (e) { }
                job.log(`[Auto-Clean] Marked corrupted videoFile ${videoFileId} as FAILED and deleted physical file. Re-upload a valid file.`);
            }
            else {
                // Transient error (timeout, Redis hiccup, etc.): keep as FAILED for inspection
                await prisma_1.prisma.videoFile.updateMany({
                    where: { id: videoFileId },
                    data: { status: 'FAILED', errorMessage: error.message }
                });
            }
            // 2. NEVER mark content as ERROR — reset to PENDING so it stays visible and retryable
            const errContentId = existsInitial?.contentId || contentId;
            await prisma_1.prisma.content.updateMany({
                where: { id: errContentId, status: { in: ['ERROR', 'PROCESSING'] } },
                data: { status: 'PENDING' }
            });
        }
        catch (dbErr) {
            job.log(`Warning: could not update status after failure: ${dbErr.message}`);
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
    connection: connection,
    concurrency: env_1.env.MAX_CONCURRENT_ENCODING,
    lockDuration: 12 * 60 * 60 * 1000, // 12 hours — FFmpeg jobs are extremely long-running
    stalledInterval: 60 * 1000, // Check for stalled jobs every 60s
    maxStalledCount: 10, // Allow up to 10 stall checks
});
exports.videoWorker.on('completed', (job) => {
    console.log(`Job ${job.id} has completed!`);
});
exports.videoWorker.on('failed', async (job, err) => {
    console.error(`Job ${job?.id} has failed with ${err.message}`);
    if (job?.data?.videoFileId) {
        try {
            const isGhostFile = err.message.includes('ENOENT') || err.message.includes('Cannot read input file');
            const isCorrupted = err.message.includes('Invalid data found') ||
                err.message.includes('moov atom not found') ||
                err.message.includes('EBML header') ||
                err.message.includes('ffprobe exited with code 1');
            if (isGhostFile) {
                await prisma_1.prisma.videoFile.updateMany({
                    where: { id: job.data.videoFileId },
                    data: { status: 'FAILED', errorMessage: `Archivo no encontrado (ENOENT). Verifica que el worker tenga acceso al archivo físico.` }
                });
                console.log(`[VideoWorker] videoFile ${job.data.videoFileId} marked FAILED (ghost file). Deletion skipped to prevent scan loops.`);
            }
            else if (isCorrupted) {
                await prisma_1.prisma.videoFile.updateMany({
                    where: { id: job.data.videoFileId },
                    data: { status: 'FAILED', errorMessage: `Archivo corrompido o subida incompleta: ${err.message}` }
                });
                console.log(`[VideoWorker] videoFile ${job.data.videoFileId} marked FAILED (corrupted). Admin must use cleanup-stuck after re-upload.`);
            }
            else {
                await prisma_1.prisma.videoFile.updateMany({
                    where: { id: job.data.videoFileId },
                    data: { status: 'FAILED', errorMessage: `BullMQ job failure: ${err.message}` }
                });
                console.log(`[VideoWorker] videoFile ${job.data.videoFileId} marked FAILED (transient error).`);
            }
            // Reset content from ERROR/PROCESSING back to PENDING — never permanently block content
            const errContentId = job.data.contentId;
            if (errContentId) {
                await prisma_1.prisma.content.updateMany({
                    where: { id: errContentId, status: { in: ['ERROR', 'PROCESSING'] } },
                    data: { status: 'PENDING' }
                });
            }
        }
        catch (dbErr) {
            console.error(`[VideoWorker] Failed to update database status on job failure: ${dbErr.message}`);
        }
    }
});
//# sourceMappingURL=video.worker.js.map