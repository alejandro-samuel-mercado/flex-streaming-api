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
const child_process_1 = require("child_process");
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
    static async requestAccess(_userId, role, contentId, ip, episodeId) {
        if (role === 'END_USER' || role === 'CLIENT') {
            const endUser = await prisma_1.prisma.endUserAccount.findFirst({ where: { userId: _userId }, select: { deletedAt: true, status: true } });
            if (!endUser || endUser.deletedAt || !['ACTIVE', 'DEMO'].includes(endUser.status)) {
                throw new Error('Your account is no longer active. Playback is not allowed.');
            }
        }
        else {
            const sysUser = await prisma_1.prisma.user.findUnique({ where: { id: _userId }, select: { deletedAt: true, isActive: true } });
            if (!sysUser || sysUser.deletedAt || !sysUser.isActive) {
                throw new Error('Your account is no longer active.');
            }
        }
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
    static async serveSegment(videoFileId, filePath, token, ip, audioIndex = null) {
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
        let isSynthesizedMaster = false;
        let synthesizedContent = '';
        if (!fs_1.default.existsSync(resolvedPath)) {
            if (filePath === 'master.m3u8' && (fs_1.default.existsSync(path_1.default.resolve(hlsRoot, 'stream_video.m3u8')) || fs_1.default.existsSync(path_1.default.resolve(hlsRoot, 'stream_0.m3u8')))) {
                console.log(`[Streaming] Synthesizing missing master.m3u8 in memory for ${videoFileId}`);
                isSynthesizedMaster = true;
                const vp = fs_1.default.existsSync(path_1.default.resolve(hlsRoot, 'stream_video.m3u8')) ? 'stream_video.m3u8' : 'stream_0.m3u8';
                synthesizedContent = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720\n${vp}\n`;
            }
            else {
                console.log(`[Streaming] File not found: ${resolvedPath} (hlsRoot: ${hlsRoot})`);
                return { status: 404, headers: {}, stream: null };
            }
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
            let content = '';
            if (isSynthesizedMaster) {
                content = synthesizedContent.trim();
            }
            else {
                // Read and immediately strip BOM if present to prevent ExoPlayer ParseException
                content = fs_1.default.readFileSync(resolvedPath, 'utf8').replace(/^\uFEFF/, '').trim();
            }
            // Normalize line endings to \n to prevent \r from corrupting regex capture groups
            content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const actualFilename = isSynthesizedMaster ? 'master.m3u8' : path_1.default.basename(resolvedPath);
            // Ensure the file starts with #EXTM3U for strict players like ExoPlayer
            if (!content.startsWith('#EXTM3U')) {
                content = '#EXTM3U\n' + content;
            }
            if (actualFilename === 'master.m3u8') {
                // 1. Fix broken master playlists pointing to deleted level playlists
                // ONLY replace if the new stream_video.m3u8 actually exists (meaning it was repaired)
                const streamVideoExists = fs_1.default.existsSync(path_1.default.resolve(hlsRoot, 'stream_video.m3u8'));
                if (streamVideoExists) {
                    if (content.includes('720p.m3u8')) {
                        content = content.replace(/720p\.m3u8/g, 'stream_video.m3u8');
                    }
                    if (content.includes('stream_0.m3u8')) {
                        content = content.replace(/stream_0\.m3u8/g, 'stream_video.m3u8');
                    }
                }
                // 2. If it lacks AUDIO="audio", check if separated audio exists and inject it
                if (!content.includes('AUDIO=')) {
                    const files = fs_1.default.existsSync(hlsRoot) ? fs_1.default.readdirSync(hlsRoot) : [];
                    const audioPlaylists = files.filter(f => f.startsWith('stream_') && f.endsWith('.m3u8') && f !== 'stream_video.m3u8' && f !== 'stream_0.m3u8');
                    if (audioPlaylists.length > 0) {
                        let audioTags = '';
                        const languageMap = {
                            'spa': 'Español (España)',
                            'lat': 'Español (Latino)',
                            'eng': 'Inglés',
                            'jpn': 'Japonés',
                            'fra': 'Francés',
                            'por': 'Portugués',
                            'ita': 'Italiano',
                            'ger': 'Alemán',
                            'kor': 'Coreano',
                            'chi': 'Chino'
                        };
                        audioPlaylists.forEach((audioFile, i) => {
                            // Extract trackIndex from the end of the filename (e.g. stream_Audio_1_0.m3u8 -> index 0)
                            const match = audioFile.match(/_([0-9]+)\.m3u8$/);
                            const trackIndex = match ? parseInt(match[1]) : i;
                            const targetIndex = (audioIndex !== null && !isNaN(audioIndex)) ? audioIndex : 0;
                            const isDefault = trackIndex === targetIndex ? 'DEFAULT=YES,AUTOSELECT=YES,' : '';
                            // Find the corresponding track in the database
                            const dbTrack = videoFile?.audioTracks?.find((t) => t.trackIndex === trackIndex);
                            let finalName = `Pista ${trackIndex + 1}`;
                            let langCode = 'unk';
                            if (dbTrack) {
                                langCode = dbTrack.language || 'unk';
                                if (langCode && languageMap[langCode.toLowerCase()]) {
                                    finalName = languageMap[langCode.toLowerCase()];
                                }
                                else if (dbTrack.label && dbTrack.label.trim() !== '') {
                                    finalName = dbTrack.label;
                                }
                            }
                            // Sanitize junk names (like 'www.hbnm...')
                            if (finalName.length > 30 || finalName.toLowerCase().includes('www') || finalName.toLowerCase().includes('.com')) {
                                finalName = `Audio ${trackIndex + 1}`;
                            }
                            // Fix common encoding corruptions if it fell back to label
                            finalName = finalName.replace(/Espa.ol/ig, 'Español')
                                .replace(/Ingl.s/ig, 'Inglés')
                                .replace(/Latinoam.rica/ig, 'Latinoamérica')
                                .replace(/Japon.s/ig, 'Japonés')
                                .replace(/Franc.s/ig, 'Francés')
                                .replace(/[^\w\s\u00C0-\u017F()]/g, '');
                            audioTags += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="${langCode}",NAME="${finalName.trim()}",${isDefault}URI="${audioFile}"\n`;
                        });
                        content = content.replace(/#EXT-X-STREAM-INF:(.*)/, `${audioTags}#EXT-X-STREAM-INF:$1,AUDIO="audio"`);
                    }
                }
                // 3. Inject CODECS if missing but AUDIO is present
                if (content.includes('AUDIO="audio"') && !content.includes('CODECS=')) {
                    content = content.replace(/AUDIO="audio"/g, 'CODECS="avc1.4d4028,mp4a.40.2",AUDIO="audio"');
                }
                // 4. Ensure DEFAULT=YES is present on the first audio track (only when no audioIndex override)
                if (content.includes('TYPE=AUDIO') && !content.includes('DEFAULT=YES') && audioIndex === null) {
                    content = content.replace(/TYPE=AUDIO(.*?),URI=/i, 'TYPE=AUDIO$1,DEFAULT=YES,AUTOSELECT=YES,URI=');
                }
                // 4b. CRITICAL: If audioIndex is specified, re-assign DEFAULT=YES to the correct track.
                //     This works regardless of whether AUDIO= was already in the master or was injected above.
                if (audioIndex !== null && !isNaN(audioIndex) && content.includes('TYPE=AUDIO')) {
                    let trackCounter = -1;
                    content = content.replace(/#EXT-X-MEDIA:TYPE=AUDIO([^\n]*)/g, (line) => {
                        trackCounter++;
                        // Remove existing DEFAULT/AUTOSELECT flags
                        let newLine = line
                            .replace(/,?DEFAULT=(YES|NO)/gi, '')
                            .replace(/,?AUTOSELECT=(YES|NO)/gi, '');
                        // Add correct DEFAULT flag based on audioIndex
                        if (trackCounter === audioIndex) {
                            newLine = newLine.replace('TYPE=AUDIO', 'TYPE=AUDIO');
                            // Insert DEFAULT=YES,AUTOSELECT=YES before URI or at end
                            if (newLine.includes(',URI=')) {
                                newLine = newLine.replace(',URI=', ',DEFAULT=YES,AUTOSELECT=YES,URI=');
                            }
                            else {
                                newLine += ',DEFAULT=YES,AUTOSELECT=YES';
                            }
                            console.log(`[Streaming] ✅ audioIndex=${audioIndex}: set DEFAULT=YES on track ${trackCounter}: ${newLine.substring(0, 80)}`);
                        }
                        else {
                            if (newLine.includes(',URI=')) {
                                newLine = newLine.replace(',URI=', ',DEFAULT=NO,AUTOSELECT=NO,URI=');
                            }
                            else {
                                newLine += ',DEFAULT=NO,AUTOSELECT=NO';
                            }
                        }
                        return newLine;
                    });
                }
                // 5. CRITICAL: If the master.m3u8 has no #EXT-X-STREAM-INF at all, synthesize one
                //    from the video playlist that exists on disk. This happens when FFmpeg generates
                //    a master that only lists audio tracks but omits the video stream entry.
                if (!content.includes('#EXT-X-STREAM-INF')) {
                    const allFiles = fs_1.default.existsSync(hlsRoot) ? fs_1.default.readdirSync(hlsRoot) : [];
                    // Look for a video-level playlist (stream_0, stream_video, stream_v0, etc.)
                    const videoPlaylist = allFiles.find(f => f.endsWith('.m3u8') && f !== 'master.m3u8' &&
                        (f === 'stream_0.m3u8' || f === 'stream_video.m3u8' || /^stream_v\d/.test(f))) || allFiles.find(f => f.endsWith('.m3u8') && f !== 'master.m3u8' && !f.toLowerCase().includes('audio'));
                    if (videoPlaylist) {
                        const hasAudioGroup = content.includes('GROUP-ID="group_audio"') ? ',AUDIO="group_audio"' :
                            content.includes('GROUP-ID="audio"') ? ',AUDIO="audio"' : '';
                        const streamInf = `#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.640028,mp4a.40.2"${hasAudioGroup}\n${videoPlaylist}\n`;
                        content = content.trimEnd() + '\n' + streamInf;
                        console.log(`[Streaming] ✅ Synthesized missing #EXT-X-STREAM-INF -> ${videoPlaylist} for video ${videoFileId}`);
                    }
                    else {
                        console.warn(`[Streaming] ⚠️ master.m3u8 has no #EXT-X-STREAM-INF and no video playlist found on disk for ${videoFileId}`);
                    }
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
            const chunksize = (end - start) + 1;
            const file = fs_1.default.createReadStream(filePath, { start, end });
            return {
                status: 206,
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize.toString(),
                    'Content-Type': 'video/mp4'
                },
                stream: file
            };
        }
        return {
            status: 200,
            headers: {
                'Content-Length': fileSize.toString(),
                'Content-Type': 'video/mp4'
            },
            stream: fs_1.default.createReadStream(filePath)
        };
    }
    /**
     * Spawns FFmpeg to remux an HLS playlist into a fragmented MP4 piped to stdout.
     * Sets CWD to the playlist directory so relative segment paths resolve correctly.
     * Logs stderr for debugging.
     */
    static spawnFfmpegMp4(playlistPath) {
        const cwd = path_1.default.dirname(playlistPath);
        const ffmpeg = (0, child_process_1.spawn)('ffmpeg', [
            '-allowed_extensions', 'ALL',
            '-i', playlistPath,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc', // Required: AAC in TS segments has ADTS headers that MP4 can't handle raw
            '-movflags', 'frag_keyframe+empty_moov',
            '-f', 'mp4',
            'pipe:1'
        ], { cwd });
        // Log stderr for debugging (don't throw — stderr always has info lines)
        ffmpeg.stderr.on('data', (chunk) => {
            const msg = chunk.toString();
            // Only log actual errors, not progress lines
            if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('failed')) {
                console.error(`[FFmpeg][${path_1.default.basename(cwd)}]`, msg.trim());
            }
        });
        ffmpeg.on('close', (code) => {
            if (code !== 0 && code !== null) {
                console.error(`[FFmpeg][${path_1.default.basename(cwd)}] exited with code ${code}`);
            }
        });
        return ffmpeg.stdout;
    }
    /**
     * Finds the HLS master playlist by scanning known HLS directories for a
     * folder whose name ends with a prefix of the given contentId.
     * Then spawns FFmpeg to mux the HLS stream into an MP4 on the fly.
     *
     * HLS folders are named like: "titulo-de-pelicula--cmrp2fj3"
     * where "cmrp2fj3" is the first 8 chars of the content ID.
     */
    static async downloadHlsAsMp4(contentId, episodeId) {
        // ── EPISODE DOWNLOAD ──────────────────────────────────────────────────
        // Structure in /home/peliplus_gran_disco/hls/series/:
        //   {series-slug}--{seriesIdPrefix}/
        //     {SxxExx}--{episodeIdPrefix}/
        //       master.m3u8
        //
        // Structure in /home/media/series/:
        //   {tmdbId}_{series_name}/{series_name}/{tmdbId}_S{s}E{ep}/
        //     index.m3u8
        if (episodeId) {
            const epPrefix = episodeId.substring(0, 8);
            // Look up episode to get its contentId (series) from the DB
            const ep = await prisma_1.prisma.episode.findUnique({
                where: { id: episodeId },
                select: { id: true, number: true, season: { select: { number: true, contentId: true } } }
            }).catch(() => null);
            const seriesContentId = ep?.season?.contentId;
            // ── Strategy 1: new-style HLS under /home/peliplus_gran_disco/hls/series/
            const hlsSeriesDir = path_1.default.join(env_1.env.HLS_PATH, 'series');
            if (fs_1.default.existsSync(hlsSeriesDir)) {
                // Find the series folder (slug--seriesIdPrefix)
                const seriesIdPrefix = seriesContentId?.substring(0, 8);
                const seriesFolders = fs_1.default.readdirSync(hlsSeriesDir);
                const matchedSeriesFolder = seriesFolders.find(f => (seriesIdPrefix && f.endsWith(`--${seriesIdPrefix}`)) ||
                    f === seriesContentId);
                if (matchedSeriesFolder) {
                    const seriesFolderPath = path_1.default.join(hlsSeriesDir, matchedSeriesFolder);
                    // Find the episode subfolder (SxxExx--episodeIdPrefix)
                    const epFolders = fs_1.default.readdirSync(seriesFolderPath);
                    const matchedEpFolder = epFolders.find(f => f.endsWith(`--${epPrefix}`) ||
                        f === episodeId);
                    if (matchedEpFolder) {
                        const epFolderPath = path_1.default.join(seriesFolderPath, matchedEpFolder);
                        let playlist = path_1.default.join(epFolderPath, 'master.m3u8');
                        if (!fs_1.default.existsSync(playlist))
                            playlist = path_1.default.join(epFolderPath, 'index.m3u8');
                        if (fs_1.default.existsSync(playlist)) {
                            return { status: 200, stream: StreamingService.spawnFfmpegMp4(playlist) };
                        }
                    }
                }
            }
            // ── Strategy 2: old-style HLS under /home/media/series/{tmdbId}_{name}/
            // Look up content TMDB id to find the correct top-level folder
            if (seriesContentId) {
                const content = await prisma_1.prisma.content.findFirst({
                    where: { id: { startsWith: seriesContentId.substring(0, 8) } },
                    select: { tmdbId: true }
                }).catch(() => null);
                if (content?.tmdbId && ep?.season?.number !== undefined && ep?.number !== undefined) {
                    const mediaSeriesDir = '/home/media/series';
                    if (fs_1.default.existsSync(mediaSeriesDir)) {
                        // Find top-level folder starting with tmdbId_
                        const topDirs = fs_1.default.readdirSync(mediaSeriesDir);
                        const topMatch = topDirs.find(d => d.startsWith(`${content.tmdbId}_`));
                        if (topMatch) {
                            // Walk subdirs to find the episode folder like {tmdbId}_S01E01
                            const sNum = String(ep.season.number).padStart(2, '0');
                            const eNum = String(ep.number).padStart(2, '0');
                            const epFolderName = `${content.tmdbId}_S${sNum}E${eNum}`;
                            // The episode folder may be nested one level deep (e.g. inside a "Show Name" folder)
                            const walk = (dir, depth) => {
                                if (depth < 0 || !fs_1.default.existsSync(dir))
                                    return null;
                                const entries = fs_1.default.readdirSync(dir);
                                if (entries.includes(epFolderName))
                                    return path_1.default.join(dir, epFolderName);
                                for (const e of entries) {
                                    const sub = path_1.default.join(dir, e);
                                    if (fs_1.default.statSync(sub).isDirectory()) {
                                        const found = walk(sub, depth - 1);
                                        if (found)
                                            return found;
                                    }
                                }
                                return null;
                            };
                            const epDir = walk(path_1.default.join(mediaSeriesDir, topMatch), 2);
                            if (epDir) {
                                const playlist = path_1.default.join(epDir, 'index.m3u8');
                                if (fs_1.default.existsSync(playlist)) {
                                    return { status: 200, stream: StreamingService.spawnFfmpegMp4(playlist) };
                                }
                            }
                        }
                    }
                }
            }
            return { status: 404, stream: null, error: `Episode HLS not found for episodeId ${episodeId} (prefix: ${epPrefix})` };
        }
        if (!contentId)
            return { status: 400, stream: null, error: 'contentId or episodeId required' };
        // The first 8 chars of the contentId match the suffix in the folder name
        const idPrefix = contentId.substring(0, 8);
        const cacheKey = `download:${contentId}`;
        let hlsRoot = getCachedHlsRoot(cacheKey);
        if (!hlsRoot || !fs_1.default.existsSync(hlsRoot)) {
            // Directories to scan for HLS folders (order: most likely first)
            const scanDirs = [
                path_1.default.join(env_1.env.HLS_PATH, 'peliculas'),
                path_1.default.join(env_1.env.HLS_PATH, 'peliculas_manuales'),
                path_1.default.join(env_1.env.HLS_PATH, 'series'),
                env_1.env.HLS_PATH,
            ];
            for (const dir of scanDirs) {
                if (!fs_1.default.existsSync(dir))
                    continue;
                const entries = fs_1.default.readdirSync(dir);
                // Match folder ending in "--{idPrefix}" or exactly matching contentId
                const match = entries.find(e => e.endsWith(`--${idPrefix}`) ||
                    e.endsWith(`--${contentId}`) ||
                    e === contentId);
                if (match) {
                    hlsRoot = path_1.default.join(dir, match);
                    setCachedHlsRoot(cacheKey, hlsRoot);
                    break;
                }
            }
            // Also try /home/media/peliculas/{tmdbId}/ and /home/media/series/{tmdbId}/
            // for older style HLS stored directly by numeric TMDB id
            if (!hlsRoot || !fs_1.default.existsSync(hlsRoot)) {
                // Try looking up from DB by content id to get tmdbId
                const content = await prisma_1.prisma.content.findFirst({
                    where: { id: { startsWith: idPrefix } },
                    select: { tmdbId: true }
                }).catch(() => null);
                if (content?.tmdbId) {
                    const candidates = [
                        path_1.default.join('/home/media/peliculas', content.tmdbId),
                        path_1.default.join('/home/media/series', content.tmdbId),
                    ];
                    for (const c of candidates) {
                        if (fs_1.default.existsSync(c)) {
                            hlsRoot = c;
                            break;
                        }
                    }
                }
            }
        }
        if (!hlsRoot || !fs_1.default.existsSync(hlsRoot)) {
            return { status: 404, stream: null, error: `HLS directory not found for contentId ${contentId} (prefix: ${idPrefix})` };
        }
        // Identify the playlist file
        let playlistPath = path_1.default.resolve(hlsRoot, 'master.m3u8');
        if (!fs_1.default.existsSync(playlistPath)) {
            playlistPath = path_1.default.resolve(hlsRoot, 'index.m3u8');
            if (!fs_1.default.existsSync(playlistPath)) {
                return { status: 404, stream: null, error: `Playlist not found in ${hlsRoot}` };
            }
        }
        return { status: 200, stream: StreamingService.spawnFfmpegMp4(playlistPath) };
    }
}
exports.StreamingService = StreamingService;
//# sourceMappingURL=streaming.service.js.map