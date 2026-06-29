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
// ─── In-memory cache for HLS segment serving ─────────────────────────────────
// Eliminates DB queries on every .ts segment request.
// TTL: 5 minutes (videos don't change paths after encoding)
const VIDEO_FILE_CACHE = new Map();
const HLS_ROOT_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
function getCachedVideoFile(id) {
    const entry = VIDEO_FILE_CACHE.get(id);
    if (entry && entry.expiresAt > Date.now())
        return entry.data;
    VIDEO_FILE_CACHE.delete(id);
    return null;
}
function setCachedVideoFile(id, data) {
    VIDEO_FILE_CACHE.set(id, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}
function getCachedHlsRoot(id) {
    const entry = HLS_ROOT_CACHE.get(id);
    if (entry && entry.expiresAt > Date.now())
        return entry.root;
    HLS_ROOT_CACHE.delete(id);
    return null;
}
function setCachedHlsRoot(id, root) {
    HLS_ROOT_CACHE.set(id, { root, expiresAt: Date.now() + CACHE_TTL_MS });
}
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
        // Determine which storage node holds this video
        // EPISODE → STORAGE_NODE_SERIES_URL, MOVIE → STORAGE_NODE_MOVIES_URL
        const isEpisode = !!episodeId || !!videoFile.episodeId;
        const storageNodeUrl = isEpisode
            ? env_1.env.STORAGE_NODE_SERIES_URL
            : env_1.env.STORAGE_NODE_MOVIES_URL;
        // Falls back to the current API server if no nodes are configured yet
        const streamBaseUrl = storageNodeUrl || env_1.env.BACKEND_URL;
        // Record view
        await this.recordView(contentId);
        return {
            token,
            expiresIn: 14400,
            videoFileId: videoFile.id,
            masterPlaylist: videoFile.masterPlaylist,
            streamBaseUrl,
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
                url: s.url.startsWith('http') ? s.url : `${streamBaseUrl}${s.url.startsWith('/') ? '' : '/'}${s.url}`,
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
        // ── Resolve base HLS directory (cached to avoid repeated disk + DB lookups) ──
        let hlsRoot = getCachedHlsRoot(videoFileId);
        if (!hlsRoot) {
            const videoFile = getCachedVideoFile(videoFileId) ||
                await prisma_1.prisma.videoFile.findUnique({ where: { id: videoFileId } });
            if (!videoFile) {
                return { status: 404, headers: {}, stream: null };
            }
            setCachedVideoFile(videoFileId, videoFile);
            let resolvedRoot = '';
            // 1. Try hlsPath from DB (the most reliable source)
            if (videoFile.hlsPath) {
                if (path_1.default.isAbsolute(videoFile.hlsPath)) {
                    resolvedRoot = videoFile.hlsPath;
                }
                else if (videoFile.hlsPath.startsWith('media/hls')) {
                    // Map old relative paths directly to the new 64TB HLS path
                    resolvedRoot = path_1.default.resolve(env_1.env.HLS_PATH, videoFile.hlsPath.replace('media/hls', '').replace(/^\//, ''));
                }
                else {
                    resolvedRoot = path_1.default.resolve(process.cwd(), videoFile.hlsPath);
                }
            }
            // 2. Fallback: folder named after the videoFileId
            if (!resolvedRoot || !fs_1.default.existsSync(resolvedRoot)) {
                resolvedRoot = path_1.default.resolve(env_1.env.HLS_PATH, videoFileId);
            }
            // 3. Try legacy behavior (contentId or episodeId)
            if (!fs_1.default.existsSync(resolvedRoot)) {
                const folderId = videoFile.contentId || videoFile.episodeId;
                if (folderId)
                    resolvedRoot = path_1.default.resolve(env_1.env.HLS_PATH, folderId);
            }
            // 4. Last resort: parent content via episode -> season
            if (!fs_1.default.existsSync(resolvedRoot) && videoFile.episodeId) {
                const ep = await prisma_1.prisma.episode.findUnique({
                    where: { id: videoFile.episodeId },
                    include: { season: { select: { contentId: true } } }
                });
                if (ep?.season?.contentId) {
                    resolvedRoot = path_1.default.resolve(env_1.env.HLS_PATH, ep.season.contentId);
                }
            }
            hlsRoot = resolvedRoot;
            if (fs_1.default.existsSync(hlsRoot)) {
                setCachedHlsRoot(videoFileId, hlsRoot);
            }
        }
        // We also need videoFile for the master playlist fallback check
        const videoFile = getCachedVideoFile(videoFileId) ||
            await prisma_1.prisma.videoFile.findUnique({ where: { id: videoFileId } });
        if (!videoFile)
            return { status: 404, headers: {}, stream: null };
        setCachedVideoFile(videoFileId, videoFile);
        // Resolve the full path and verify it stays inside hlsRoot.
        let resolvedPath = path_1.default.resolve(hlsRoot, filePath);
        // Fallback: If frontend requests '720p.m3u8' (due to stale cache) but it was converted to 'master.m3u8'
        if ((filePath === '720p.m3u8' || filePath === 'stream_0.m3u8' || filePath === 'stream_v:0.m3u8') && !fs_1.default.existsSync(resolvedPath)) {
            const newMasterPath = path_1.default.resolve(hlsRoot, 'master.m3u8');
            if (fs_1.default.existsSync(newMasterPath)) {
                resolvedPath = newMasterPath;
                console.log(`[Streaming] Alias applied: ${filePath} -> master.m3u8 for video ${videoFileId} (Bypassing stale cache)`);
            }
        }
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
        let stream = null;
        let headers = {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': ext === '.ts' ? 'public, max-age=31536000, immutable' : 'no-cache, no-store',
            'Access-Control-Allow-Origin': '*',
        };
        if (ext === '.m3u8') {
            let content = fs_1.default.readFileSync(resolvedPath, 'utf8');
            const actualFilename = path_1.default.basename(resolvedPath);
            if (actualFilename === 'master.m3u8') {
                // 1. Fix broken master playlists pointing to deleted level playlists
                if (content.includes('720p.m3u8')) {
                    content = content.replace(/720p\.m3u8/g, 'stream_video.m3u8');
                }
                if (content.includes('stream_0.m3u8')) {
                    content = content.replace(/stream_0\.m3u8/g, 'stream_video.m3u8');
                }
                // 2. If it lacks AUDIO="audio", check if separated audio exists and inject it
                if (!content.includes('AUDIO=')) {
                    const files = fs_1.default.existsSync(hlsRoot) ? fs_1.default.readdirSync(hlsRoot) : [];
                    const audioPlaylists = files.filter(f => f.startsWith('stream_') && f.endsWith('.m3u8') && f !== 'stream_video.m3u8' && f !== 'stream_0.m3u8');
                    if (audioPlaylists.length > 0) {
                        let audioTags = '';
                        audioPlaylists.forEach((audioFile, i) => {
                            const isDefault = i === 0 ? 'DEFAULT=YES,AUTOSELECT=YES,' : '';
                            // Extract a clean name from the file (e.g. stream_Audio_1_0.m3u8 -> Audio 1)
                            let cleanName = audioFile.replace('stream_', '').replace('.m3u8', '').replace(/_[0-9]+$/, '').replace(/_/g, ' ');
                            audioTags += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="spa",NAME="${cleanName}",${isDefault}URI="${audioFile}"\n`;
                        });
                        content = content.replace(/#EXT-X-STREAM-INF:(.*)/, `${audioTags}#EXT-X-STREAM-INF:$1,AUDIO="audio"`);
                    }
                }
                // 3. Inject CODECS if missing but AUDIO is present
                if (content.includes('AUDIO="audio"') && !content.includes('CODECS=')) {
                    content = content.replace(/AUDIO="audio"/g, 'CODECS="avc1.4d4028,mp4a.40.2",AUDIO="audio"');
                }
                // 4. Ensure DEFAULT=YES is present on the first audio track
                if (content.includes('TYPE=AUDIO') && !content.includes('DEFAULT=YES')) {
                    content = content.replace(/TYPE=AUDIO(.*?),URI=/i, 'TYPE=AUDIO$1,DEFAULT=YES,AUTOSELECT=YES,URI=');
                }
            }
            let modified = content.replace(/^(?!#)([^\s].+)$/gm, (match) => match.includes('?token=') ? match : `${match}?token=${token}`);
            modified = modified.replace(/URI="([^"]+)"/g, (match, uri) => uri.includes('?token=') ? match : `URI="${uri}?token=${token}"`);
            const modifiedBuffer = Buffer.from(modified, 'utf8');
            headers['Content-Length'] = modifiedBuffer.length.toString();
            const { Readable } = require('stream');
            stream = Readable.from([modifiedBuffer]);
        }
        else {
            headers['Content-Length'] = fs_1.default.statSync(resolvedPath).size.toString();
            stream = fs_1.default.createReadStream(resolvedPath);
        }
        return {
            status: 200,
            headers,
            stream,
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