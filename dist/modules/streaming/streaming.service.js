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
    static async requestAccess(_userId, contentId, ip) {
        const content = await prisma_1.prisma.content.findFirst({
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
        const videoFile = content.videoFiles[0];
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
    static serveSegment(videoFileId, filePath, token, ip) {
        // Verify token
        if (!(0, token_service_1.verifySignedToken)(token, videoFileId, ip)) {
            return { status: 403, headers: {}, stream: null };
        }
        const resolvedPath = path_1.default.resolve(env_1.env.HLS_PATH, filePath);
        if (!fs_1.default.existsSync(resolvedPath)) {
            return { status: 404, headers: {}, stream: null };
        }
        const ext = path_1.default.extname(filePath).toLowerCase();
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
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': ext === '.ts' ? 'public, max-age=31536000, immutable' : 'public, max-age=5',
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