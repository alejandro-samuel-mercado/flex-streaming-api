import { env } from '../../shared/config/env';
import { prisma } from '../../shared/config/prisma';
import { generateSignedUrl, verifySignedToken } from '../../services/token.service';
import fs from 'fs';
import path from 'path';

// ─── In-memory cache for HLS segment serving ─────────────────────────────────
// Eliminates DB queries on every .ts segment request.
// TTL: 5 minutes (videos don't change paths after encoding)
const VIDEO_FILE_CACHE = new Map<string, { data: any; expiresAt: number }>();
const HLS_ROOT_CACHE   = new Map<string, { root: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedVideoFile(id: string) {
    const entry = VIDEO_FILE_CACHE.get(id);
    if (entry && entry.expiresAt > Date.now()) return entry.data;
    VIDEO_FILE_CACHE.delete(id);
    return null;
}
function setCachedVideoFile(id: string, data: any) {
    VIDEO_FILE_CACHE.set(id, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}
function getCachedHlsRoot(id: string) {
    const entry = HLS_ROOT_CACHE.get(id);
    if (entry && entry.expiresAt > Date.now()) return entry.root;
    HLS_ROOT_CACHE.delete(id);
    return null;
}
function setCachedHlsRoot(id: string, root: string) {
    HLS_ROOT_CACHE.set(id, { root, expiresAt: Date.now() + CACHE_TTL_MS });
}

export class StreamingService {
  /**
   * Generates a signed streaming token for a content item.
   * Uses HMAC signed URLs instead of JWT for better security.
   */
  static async requestAccess(_userId: string, contentId: string, ip: string, episodeId?: string) {
    let videoFile;

    if (episodeId) {
      // 1. Fetch from Episode
      const episode = await prisma.episode.findFirst({
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
    } else {
      // 2. Fetch from Movie or find first episode if it's a series
      const content = await prisma.content.findFirst({
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
      } else if (content.videoFiles.length > 0) {
        // Fallback to direct video file (for movies)
        videoFile = content.videoFiles[0];
      } else {
        throw new Error('No video stream available for this content');
      }
    }

    // Generate signed token (4 hours TTL)
    const token = generateSignedUrl(videoFile.id, ip, 14400);

    // Determine which storage node holds this video
    // EPISODE → STORAGE_NODE_SERIES_URL, MOVIE → STORAGE_NODE_MOVIES_URL
    const isEpisode = !!episodeId || !!videoFile.episodeId;
    const storageNodeUrl = isEpisode
      ? env.STORAGE_NODE_SERIES_URL
      : env.STORAGE_NODE_MOVIES_URL;
    // Falls back to the current API server if no nodes are configured yet
    const streamBaseUrl = storageNodeUrl || env.BACKEND_URL;

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
        url: s.url,
        isDefault: s.isDefault,
      })),
    };
  }

  static async recordView(contentId: string) {
    await prisma.content.update({
      where: { id: contentId },
      data: { viewCount: { increment: 1 } },
    }).catch(() => null);
  }

  /**
   * Serve HLS segments with token validation.
   */
  static async serveSegment(
    videoFileId: string,
    filePath: string,
    token: string,
    ip: string
  ): Promise<{ status: number; headers: Record<string, string>; stream: fs.ReadStream | null }> {
    // Verify token
    if (!verifySignedToken(token, videoFileId, ip)) {
      console.error(`[Streaming] 403: Invalid or expired token for video ${videoFileId}. IP: ${ip}`);
      return { status: 403, headers: {}, stream: null };
    }

    // ── Resolve base HLS directory (cached to avoid repeated disk + DB lookups) ──
    let hlsRoot = getCachedHlsRoot(videoFileId);

    if (!hlsRoot) {
        const videoFile = getCachedVideoFile(videoFileId) ||
            await prisma.videoFile.findUnique({ where: { id: videoFileId } });

        if (!videoFile) {
            return { status: 404, headers: {}, stream: null };
        }
        setCachedVideoFile(videoFileId, videoFile);

        let resolvedRoot = '';

        // 1. Try hlsPath from DB (the most reliable source)
        if (videoFile.hlsPath) {
            resolvedRoot = path.isAbsolute(videoFile.hlsPath)
                ? videoFile.hlsPath
                : path.resolve(process.cwd(), videoFile.hlsPath);
        }

        // 2. Fallback: folder named after the videoFileId
        if (!resolvedRoot || !fs.existsSync(resolvedRoot)) {
            resolvedRoot = path.resolve(env.HLS_PATH, videoFileId);
        }

        // 3. Try legacy behavior (contentId or episodeId)
        if (!fs.existsSync(resolvedRoot)) {
            const folderId = videoFile.contentId || videoFile.episodeId;
            if (folderId) resolvedRoot = path.resolve(env.HLS_PATH, folderId);
        }

        // 4. Last resort: parent content via episode -> season
        if (!fs.existsSync(resolvedRoot) && videoFile.episodeId) {
            const ep = await prisma.episode.findUnique({
                where: { id: videoFile.episodeId },
                include: { season: { select: { contentId: true } } }
            });
            if (ep?.season?.contentId) {
                resolvedRoot = path.resolve(env.HLS_PATH, ep.season.contentId);
            }
        }

        hlsRoot = resolvedRoot;
        if (fs.existsSync(hlsRoot)) {
            setCachedHlsRoot(videoFileId, hlsRoot);
        }
    }

    // We also need videoFile for the master playlist fallback check
    const videoFile = getCachedVideoFile(videoFileId) ||
        await prisma.videoFile.findUnique({ where: { id: videoFileId } });
    if (!videoFile) return { status: 404, headers: {}, stream: null };
    setCachedVideoFile(videoFileId, videoFile);
    
    // Resolve the full path and verify it stays inside hlsRoot.
    let resolvedPath = path.resolve(hlsRoot, filePath);

    // Fallback: If requesting 'master.m3u8' but it doesn't exist, try to serve the actual master playlist
    if (filePath === 'master.m3u8' && !fs.existsSync(resolvedPath) && videoFile.masterPlaylist) {
        const actualFilename = videoFile.masterPlaylist.split('/').pop();
        if (actualFilename && actualFilename !== 'master.m3u8') {
            const fallbackPath = path.resolve(hlsRoot, actualFilename);
            if (fs.existsSync(fallbackPath)) {
                resolvedPath = fallbackPath;
            }
        }
    }

    if (!resolvedPath.startsWith(hlsRoot)) {
      console.warn(`[Streaming] 403: Blocked access attempt outside HLS root. Resolved: ${resolvedPath} | Root: ${hlsRoot}`);
      return { status: 403, headers: {}, stream: null };
    }

    if (!fs.existsSync(resolvedPath)) {
      console.log(`[Streaming] File not found: ${resolvedPath} (hlsRoot: ${hlsRoot})`);
      return { status: 404, headers: {}, stream: null };
    }

    // Whitelist only valid HLS file extensions
    const ext = path.extname(resolvedPath).toLowerCase();
    if (!['.m3u8', '.ts', '.vtt'].includes(ext)) {
      console.warn(`[Streaming] 403: Invalid file extension attempted: ${ext}`);
      return { status: 403, headers: {}, stream: null };
    }

    const contentType =
      ext === '.m3u8' ? 'application/vnd.apple.mpegurl' :
      ext === '.ts'   ? 'video/mp2t' :
      ext === '.vtt'  ? 'text/vtt' :
      'application/octet-stream';

    const accelPath = `/internal_hls/${resolvedPath.replace(env.HLS_PATH, '').replace(/^\\//, '')}`;

    return {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': ext === '.ts' ? 'public, max-age=31536000, immutable' : 'no-cache, no-store',
        'X-Accel-Redirect': accelPath,
      },
      stream: null,
    };
  }

  /**
   * Byte-range streaming for direct video files (fallback / dev mode).
   */
  static streamDirect(
    videoPath: string,
    range: string | undefined
  ): { headers: Record<string, string>; status: number; stream: fs.ReadStream | null } {
    const filePath = path.resolve(process.cwd(), videoPath.startsWith('/') ? videoPath.slice(1) : videoPath);

    if (!fs.existsSync(filePath)) {
      return { status: 404, headers: {}, stream: null };
    }

    const stat = fs.statSync(filePath);
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
        stream: fs.createReadStream(filePath, { start, end }),
      };
    }

    return {
      status: 200,
      headers: { 'Content-Length': fileSize.toString(), 'Content-Type': 'video/mp4' },
      stream: fs.createReadStream(filePath),
    };
  }
}
