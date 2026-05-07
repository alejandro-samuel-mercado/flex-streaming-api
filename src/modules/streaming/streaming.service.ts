import { env } from '../../shared/config/env';
import { prisma } from '../../shared/config/prisma';
import { generateSignedUrl, verifySignedToken } from '../../services/token.service';
import fs from 'fs';
import path from 'path';

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
      // 2. Fetch from Movie (direct content)
      const content = await prisma.content.findFirst({
        where: { id: contentId, status: { in: ['READY', 'ACTIVE'] }, deletedAt: null },
        include: {
          videoFiles: {
            where: { status: 'COMPLETED' },
            include: { qualities: true, audioTracks: true, subtitleTracks: true },
            take: 1,
          },
        },
      });

      if (!content || content.videoFiles.length === 0) {
        throw new Error('Content or video stream not found');
      }
      videoFile = content.videoFiles[0];
    }

    // Generate signed token (4 hours TTL)
    const token = generateSignedUrl(videoFile.id, ip, 14400);

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
      return { status: 403, headers: {}, stream: null };
    }

    // ── Resolve base HLS directory ───────────────────────────────────────────
    const videoFile = await prisma.videoFile.findUnique({ where: { id: videoFileId } });
    if (!videoFile) {
        return { status: 404, headers: {}, stream: null };
    }

    let hlsRoot = videoFile.hlsPath || '';
    
    // 1. If hlsPath is absolute, use it directly.
    // 2. If it's relative, resolve it against CWD.
    // 3. If it's empty, fallback to the standard structure: media/hls/CONTENT_ID
    if (hlsRoot) {
        if (!path.isAbsolute(hlsRoot)) {
            hlsRoot = path.resolve(process.cwd(), hlsRoot);
        }
    } else {
        // Fallback for older records: use contentId if available, otherwise videoFileId
        const folderName = videoFile.contentId || videoFileId;
        hlsRoot = path.resolve(env.HLS_PATH, folderName);
    }

    // Resolve the full path and verify it stays inside hlsRoot.
    const resolvedPath = path.resolve(hlsRoot, filePath);

    if (!resolvedPath.startsWith(hlsRoot)) {
      console.warn(`[Streaming] Blocked access attempt outside HLS root: ${resolvedPath}`);
      return { status: 403, headers: {}, stream: null };
    }

    if (!fs.existsSync(resolvedPath)) {
      console.log(`[Streaming] File not found: ${resolvedPath} (hlsRoot: ${hlsRoot})`);
      return { status: 404, headers: {}, stream: null };
    }

    // Whitelist only valid HLS file extensions
    const ext = path.extname(resolvedPath).toLowerCase();
    if (!['.m3u8', '.ts', '.vtt'].includes(ext)) {
      return { status: 403, headers: {}, stream: null };
    }

    const contentType =
      ext === '.m3u8' ? 'application/vnd.apple.mpegurl' :
      ext === '.ts'   ? 'video/mp2t' :
      ext === '.vtt'  ? 'text/vtt' :
      'application/octet-stream';

    const stat = fs.statSync(resolvedPath);

    return {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Access-Control-Allow-Origin': '*',
        // .ts segments are immutable (content-addressed by segment number)
        // .m3u8 playlists should be re-fetched on ABR switches
        'Cache-Control': ext === '.ts' ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
      stream: fs.createReadStream(resolvedPath),
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
