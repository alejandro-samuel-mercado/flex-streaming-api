"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamingService = void 0;
const env_1 = require("../../shared/config/env");
const prisma_1 = require("../../shared/config/prisma");
const token_service_1 = require("../../services/token.service");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class StreamingService {
    /**
     * Generates a signed streaming token for a content item.
     * Uses HMAC signed URLs instead of JWT for better security.
     */
    static async requestAccess(_userId, contentId, ip, episodeId) {
        let videoFile;
        if (episodeId) {
            // 1. Fetch from Episode
            const episode = await prisma_1.prisma.episode.findFirst({
                where: { id: episodeId, season: { contentId: contentId } },
                include: {
                    videoFiles: {
                        where: { status: 'COMPLETED' },
                        include: { qualities: true, audioTracks: true, subtitleTracks: true },
                        take: 1,
                    },
                },
            });
            if (!episode || episode.videoFiles.length === 0) {
                throw new Error('Episode or video stream not found');
            }
            videoFile = episode.videoFiles[0];
        }
        else {
            // 2. Fetch from Movie or find first episode if it's a series
            const content = await prisma_1.prisma.content.findFirst({
                where: { id: contentId, deletedAt: null },
                include: {
                    videoFiles: {
                        where: { status: 'COMPLETED' },
                        include: { qualities: true, audioTracks: true, subtitleTracks: true },
                        take: 1,
                    },
                    seasons: {
                        orderBy: { number: 'asc' },
                        take: 1,
                        include: {
                            episodes: {
                                orderBy: { number: 'asc' },
                                where: { videoFiles: { some: { status: 'COMPLETED' } } },
                                take: 1,
                                include: {
                                    videoFiles: {
                                        where: { status: 'COMPLETED' },
                                        include: { qualities: true, audioTracks: true, subtitleTracks: true },
                                        take: 1
                                    }
                                }
                            }
                        }
                    }
                },
            });
            if (!content) {
                throw new Error('Content not found');
            }
            // If it's a series, find the first episode that has a completed video file
            const allEpisodes = content.seasons.flatMap(s => s.episodes);
            const firstEpisodeWithVideo = allEpisodes.find(e => e.videoFiles.length > 0);
            if (firstEpisodeWithVideo) {
                videoFile = firstEpisodeWithVideo.videoFiles[0];
            }
            else if (content.videoFiles.length > 0) {
                // Fallback to direct video file (for movies)
                videoFile = content.videoFiles[0];
            }
            else {
                throw new Error('No video stream available for this content');
            }
        }
        // Generate signed token (4 hours TTL)
        const token = (0, token_service_1.generateSignedUrl)(videoFile.id, ip, 14400);
        // Record view
        await this.recordView(contentId);
        return {
            token,
            expiresIn: 14400,
            videoFileId: videoFile.id,
            masterPlaylist: videoFile.masterPlaylist,
            qualities: videoFile.qualities.map((q) => ({
                resolution: q.resolution,
                width: q.width,
                height: q.height,
                bitrate: q.bitrate,
            })),
            audioTracks: videoFile.audioTracks.map((a) => ({
                language: a.language,
                label: a.label,
                isDefault: a.isDefault,
            })),
            subtitleTracks: videoFile.subtitleTracks.map((s) => ({
                language: s.language,
                label: s.label,
                url: s.url,
                isDefault: s.isDefault,
            })),
        };
    }
    static async recordView(contentId) {
        await prisma_1.prisma.content.update({
            where: { id: contentId },
            data: { viewCount: { increment: 1 } },
        }).catch(() => null);
    }
    /**
     * Serve HLS segments with token validation.
     */
    static async serveSegment(videoFileId, filePath, token, ip) {
        // Verify token
        if (!(0, token_service_1.verifySignedToken)(token, videoFileId, ip)) {
            console.error(`[Streaming] 403: Invalid or expired token for video ${videoFileId}. IP: ${ip}`);
            return { status: 403, headers: {}, stream: null };
        }
        // ── Resolve base HLS directory ───────────────────────────────────────────
        const videoFile = await prisma_1.prisma.videoFile.findUnique({ where: { id: videoFileId } });
        if (!videoFile) {
            return { status: 404, headers: {}, stream: null };
        }
        let hlsRoot = '';
        // 1. Try hlsPath from DB (the most reliable source)
        if (videoFile.hlsPath) {
            hlsRoot = path_1.default.isAbsolute(videoFile.hlsPath)
                ? videoFile.hlsPath
                : path_1.default.resolve(process.cwd(), videoFile.hlsPath);
        }
        // 2. Fallback: try the folder named after the videoFileId
        if (!hlsRoot || !fs_1.default.existsSync(hlsRoot)) {
            hlsRoot = path_1.default.resolve(env_1.env.HLS_PATH, videoFileId);
        }
        // 3. Try legacy behavior (contentId or episodeId) if still not found
        if (!fs_1.default.existsSync(hlsRoot)) {
            const folderId = videoFile.contentId || videoFile.episodeId;
            if (folderId) {
                hlsRoot = path_1.default.resolve(env_1.env.HLS_PATH, folderId);
            }
        }
        if (!fs_1.default.existsSync(hlsRoot) && videoFile.episodeId) {
            // Last resort: find the parent content ID via episode -> season
            const ep = await prisma_1.prisma.episode.findUnique({
                where: { id: videoFile.episodeId },
                include: { season: { select: { contentId: true } } }
            });
            if (ep?.season?.contentId) {
                hlsRoot = path_1.default.resolve(env_1.env.HLS_PATH, ep.season.contentId);
            }
        }
        // Resolve the full path and verify it stays inside hlsRoot.
        let resolvedPath = path_1.default.resolve(hlsRoot, filePath);
        // Fallback: If requesting 'master.m3u8' but it doesn't exist, try to serve the actual master playlist
        if (filePath === 'master.m3u8' && !fs_1.default.existsSync(resolvedPath) && videoFile.masterPlaylist) {
            const actualFilename = videoFile.masterPlaylist.split('/').pop();
            if (actualFilename && actualFilename !== 'master.m3u8') {
                const fallbackPath = path_1.default.resolve(hlsRoot, actualFilename);
                if (fs_1.default.existsSync(fallbackPath)) {
                    resolvedPath = fallbackPath;
                }
            }
        }
        if (!resolvedPath.startsWith(hlsRoot)) {
            console.warn(`[Streaming] 403: Blocked access attempt outside HLS root. Resolved: ${resolvedPath} | Root: ${hlsRoot}`);
            return { status: 403, headers: {}, stream: null };
        }
        if (!fs_1.default.existsSync(resolvedPath)) {
            console.log(`[Streaming] File not found: ${resolvedPath} (hlsRoot: ${hlsRoot})`);
            return { status: 404, headers: {}, stream: null };
        }
        // Whitelist only valid HLS file extensions
        const ext = path_1.default.extname(resolvedPath).toLowerCase();
        if (!['.m3u8', '.ts', '.vtt'].includes(ext)) {
            console.warn(`[Streaming] 403: Invalid file extension attempted: ${ext}`);
            return { status: 403, headers: {}, stream: null };
        }
        const contentType = ext === '.m3u8' ? 'application/vnd.apple.mpegurl' :
            ext === '.ts' ? 'video/mp2t' :
                ext === '.vtt' ? 'text/vtt' :
                    'application/octet-stream';
        const stat = fs_1.default.statSync(resolvedPath);
        return {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': stat.size.toString(),
                // .ts segments are immutable (content-addressed by segment number)
                // .m3u8 playlists should be re-fetched on ABR switches
                'Cache-Control': ext === '.ts' ? 'public, max-age=31536000, immutable' : 'no-cache',
            },
            stream: fs_1.default.createReadStream(resolvedPath),
        };
    }
    /**
     * Byte-range streaming for direct video files (fallback / dev mode).
     */
    static streamDirect(videoPath, range) {
        const filePath = path_1.default.resolve(process.cwd(), videoPath.startsWith('/') ? videoPath.slice(1) : videoPath);
        if (!fs_1.default.existsSync(filePath)) {
            return { status: 404, headers: {}, stream: null };
        }
        const stat = fs_1.default.statSync(filePath);
        const fileSize = stat.size;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            if (start >= fileSize) {
                return { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` }, stream: null };
            }
            return {
                status: 206,
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': (end - start + 1).toString(),
                    'Content-Type': 'video/mp4',
                },
                stream: fs_1.default.createReadStream(filePath, { start, end }),
            };
        }
        return {
            status: 200,
            headers: { 'Content-Length': fileSize.toString(), 'Content-Type': 'video/mp4' },
            stream: fs_1.default.createReadStream(filePath),
        };
    }
}
exports.StreamingService = StreamingService;
//# sourceMappingURL=streaming.service.js.map