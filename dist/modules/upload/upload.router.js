"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../../shared/config/env");
const queue_service_1 = require("../../services/queue.service");
const prisma_1 = require("../../shared/config/prisma");
const chunk_upload_service_1 = require("../../services/chunk-upload.service");
const sharp_1 = __importDefault(require("sharp"));
const fs_1 = __importDefault(require("fs"));
exports.uploadRouter = (0, express_1.Router)();
console.log('📂 [UploadRouter] Initializing...');
/**
 * GET /api/upload/chunk-status/:fileId
 * MOVED TO TOP to ensure it's matched first
 */
exports.uploadRouter.get('/chunk-status/:fileId', (async (req, res, next) => {
    try {
        const { fileId } = req.params;
        console.log(`🔍 [UploadRouter] Checking status for ${fileId}`);
        const chunkDir = path_1.default.join(env_1.env.UPLOAD_DIR, 'chunks', fileId);
        if (!fs_1.default.existsSync(chunkDir)) {
            return res.json({ success: true, uploadedChunks: [] });
        }
        const files = fs_1.default.readdirSync(chunkDir);
        const uploadedChunks = files
            .map(f => parseInt(f))
            .filter(n => !isNaN(n));
        res.json({ success: true, uploadedChunks });
    }
    catch (err) {
        next(err);
    }
}));
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, env_1.env.UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 * 1024 }, // 20GB limit
    fileFilter: (_req, file, cb) => {
        const allowed = ['video/mp4', 'video/x-matroska', 'video/webm'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only MP4, MKV and WEBM are allowed.'));
        }
    }
});
const imageUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for images
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid image type. Only JPG, PNG and WEBP are allowed.'));
        }
    }
});
const chunkUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB per chunk max
});
const subtitleUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => {
            const dir = path_1.default.join(env_1.env.MEDIA_PATH, 'subtitles');
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (_req, file, cb) => {
            cb(null, `sub-${Date.now()}${path_1.default.extname(file.originalname)}`);
        }
    }),
    fileFilter: (_req, file, cb) => {
        const allowed = ['.vtt', '.srt'];
        if (allowed.includes(path_1.default.extname(file.originalname).toLowerCase())) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid subtitle type. Only .VTT and .SRT are allowed.'));
        }
    }
});
exports.uploadRouter.post('/subtitle', subtitleUpload.single('subtitle'), (async (req, res, next) => {
    try {
        const file = req.file;
        const { videoFileId, language, label } = req.body;
        if (!file || !videoFileId || !language) {
            res.status(400).json({ success: false, error: 'Subtitle file, videoFileId and language are required' });
            return;
        }
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        let finalPath = file.path;
        // ── Encoding & format normalization ──────────────────────────────
        // 1. Read the raw file and strip UTF-8 BOM (common in Spanish subtitles)
        let content = fs_1.default.readFileSync(file.path, 'utf-8');
        content = content.replace(/^\uFEFF/, ''); // Strip BOM
        // 2. If it's SRT, convert to VTT (HLS.js only supports VTT natively)
        if (ext === '.srt') {
            const vttContent = 'WEBVTT\n\n' + content
                // Remove SRT sequence numbers (lines that are just a number before timestamps)
                .replace(/^\d+\s*$/gm, '')
                // Convert SRT timestamps (00:00:00,000) to VTT format (00:00:00.000)
                .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
                // Clean up extra blank lines
                .replace(/\n{3,}/g, '\n\n')
                .trim();
            // Write as .vtt with a new filename
            finalPath = file.path.replace(/\.srt$/i, '.vtt');
            fs_1.default.writeFileSync(finalPath, vttContent, 'utf-8');
            // Remove the original .srt
            fs_1.default.unlinkSync(file.path);
        }
        else {
            // It's already VTT — just write back the BOM-stripped version
            fs_1.default.writeFileSync(file.path, content, 'utf-8');
        }
        const finalFilename = path_1.default.basename(finalPath);
        const subtitleUrl = `/media/subtitles/${finalFilename}`;
        const subtitle = await prisma_1.prisma.subtitleTrack.create({
            data: {
                videoFileId,
                language,
                label: label || language,
                url: subtitleUrl,
                format: 'VTT' // Always VTT after conversion
            }
        });
        res.json({ success: true, data: subtitle });
    }
    catch (err) {
        next(err);
    }
}));
exports.uploadRouter.post('/image', (_req, _res, next) => {
    console.log('📸 [UploadRouter] POST /image request received');
    next();
}, imageUpload.single('image'), (async (req, res, next) => {
    try {
        const file = req.file;
        const { contentId, type } = req.body; // type: 'POSTER' | 'BACKDROP'
        if (!file || !contentId || !type) {
            res.status(400).json({ success: false, error: 'File, contentId and type are required' });
            return;
        }
        const folder = path_1.default.join(env_1.env.MEDIA_PATH, 'thumbnails', contentId);
        if (!fs_1.default.existsSync(folder)) {
            fs_1.default.mkdirSync(folder, { recursive: true });
        }
        const filename = `${type.toLowerCase()}-${Date.now()}.webp`;
        const fullPath = path_1.default.join(folder, filename);
        // Process with sharp (convert to webp and resize)
        const sharpInstance = (0, sharp_1.default)(file.buffer);
        if (type === 'POSTER') {
            sharpInstance.resize(600, 900, { fit: 'cover', position: 'center' });
        }
        else if (type === 'BACKDROP') {
            sharpInstance.resize(1920, 1080, { fit: 'cover', position: 'center' });
        }
        await sharpInstance.webp({ quality: 85 }).toFile(fullPath);
        const imageUrl = `/media/thumbnails/${contentId}/${filename}`;
        // Update DB
        const existing = await prisma_1.prisma.thumbnail.findFirst({
            where: {
                contentId: contentId,
                type: type
            }
        });
        if (existing) {
            await prisma_1.prisma.thumbnail.update({
                where: { id: existing.id },
                data: { url: imageUrl }
            });
        }
        else {
            await prisma_1.prisma.thumbnail.create({
                data: {
                    contentId,
                    type: type,
                    url: imageUrl,
                    width: type === 'POSTER' ? 600 : 1920,
                    height: type === 'POSTER' ? 900 : 1080
                }
            });
        }
        res.json({ success: true, url: imageUrl });
    }
    catch (error) {
        next(error);
    }
}));
exports.uploadRouter.post('/', upload.single('video'), (async (req, res, next) => {
    try {
        const file = req.file;
        const { contentId, seasonId, episodeId, type } = req.body;
        if (!file) {
            res.status(400).json({ success: false, error: 'No video file provided' });
            return;
        }
        if (!contentId) {
            res.status(400).json({ success: false, error: 'contentId is required' });
            return;
        }
        const content = await prisma_1.prisma.content.findUnique({ where: { id: contentId } });
        if (!content) {
            res.status(404).json({ success: false, error: 'Content not found' });
            return;
        }
        // NEW: Check if video of this type already exists
        const videoType = type || 'MOVIE';
        const existingVideo = await prisma_1.prisma.videoFile.findFirst({
            where: {
                contentId,
                type: videoType,
                episodeId: episodeId || null,
                status: { not: 'FAILED' }
            }
        });
        if (existingVideo) {
            res.status(400).json({
                success: false,
                error: `Este contenido ya tiene un video de tipo ${videoType}. Elimínalo primero si deseas subir uno nuevo.`
            });
            return;
        }
        // 1. Create VideoFile record first (prevent duplicates in UI)
        const videoFile = await prisma_1.prisma.videoFile.create({
            data: {
                contentId,
                episodeId: episodeId || null,
                type: type || 'MOVIE',
                originalPath: file.path,
                status: 'QUEUED'
            }
        });
        // 2. Add job to BullMQ
        const job = await (0, queue_service_1.addVideoJob)({
            videoFileId: videoFile.id,
            contentId,
            type: videoFile.type,
            seasonId: seasonId || undefined,
            episodeId: episodeId || undefined,
            videoPath: file.path,
        });
        // 3. Update record with job ID
        await prisma_1.prisma.videoFile.update({
            where: { id: videoFile.id },
            data: { processingJobId: job.id }
        });
        res.status(200).json({
            success: true,
            message: 'Video upload completed and enqueued for processing',
            jobId: job.id,
            videoFileId: videoFile.id
        });
    }
    catch (error) {
        next(error);
    }
}));
exports.uploadRouter.delete('/video/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        // 1. Find the video file record
        const videoFile = await prisma_1.prisma.videoFile.findUnique({
            where: { id }
        });
        if (!videoFile) {
            return res.status(404).json({ success: false, error: 'Video file not found' });
        }
        // 2. If it has a processing job, remove it
        if (videoFile.processingJobId) {
            const { removeVideoJob } = await Promise.resolve().then(() => __importStar(require('../../services/queue.service')));
            await removeVideoJob(videoFile.processingJobId);
        }
        // 3. Delete the record
        await prisma_1.prisma.videoFile.delete({ where: { id } });
        // 4. Delete the physical file ONLY if it was uploaded to our temp directory (not if auto-scanned from elsewhere)
        if (videoFile.originalPath && fs_1.default.existsSync(videoFile.originalPath)) {
            const absolutePath = path_1.default.resolve(videoFile.originalPath);
            const absoluteUploadDir = path_1.default.resolve(env_1.env.UPLOAD_DIR || path_1.default.join(env_1.env.MEDIA_PATH, 'uploads'));
            if (absolutePath.startsWith(absoluteUploadDir)) {
                fs_1.default.unlinkSync(videoFile.originalPath);
            }
        }
        return res.json({ success: true, message: 'Video upload cancelled and deleted' });
    }
    catch (error) {
        return next(error);
    }
});
exports.uploadRouter.delete('/subtitle/:id', (async (req, res, next) => {
    try {
        const { id } = req.params;
        const sub = await prisma_1.prisma.subtitleTrack.findUnique({ where: { id } });
        if (!sub) {
            return res.status(404).json({ success: false, error: 'Subtitle not found' });
        }
        // Delete physical file
        const filePath = path_1.default.join(env_1.env.MEDIA_PATH, sub.url.replace('/media/', ''));
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
        await prisma_1.prisma.subtitleTrack.delete({ where: { id } });
        res.json({ success: true, message: 'Subtitle deleted' });
    }
    catch (err) {
        next(err);
    }
}));
/**
 * POST /api/upload/chunk
 */
exports.uploadRouter.post('/chunk', chunkUpload.single('chunk'), (async (req, res, next) => {
    try {
        const { fileId, chunkIndex } = req.body;
        const file = req.file;
        if (!file || !fileId || chunkIndex === undefined) {
            res.status(400).json({ success: false, error: 'Missing chunk data' });
            return;
        }
        await chunk_upload_service_1.ChunkUploadService.saveChunk(fileId, parseInt(chunkIndex), file.buffer);
        res.json({ success: true, message: `Chunk ${chunkIndex} saved` });
    }
    catch (err) {
        next(err);
    }
}));
// Chunk status route moved to top
/**
 * POST /api/upload/complete
 */
exports.uploadRouter.post('/complete', (async (req, res, next) => {
    try {
        const { fileId, fileName, totalChunks, contentId, seasonId, episodeId, type } = req.body;
        if (!fileId || !fileName || !totalChunks || !contentId) {
            res.status(400).json({ success: false, error: 'Missing data for completion' });
            return;
        }
        // NEW: Check if video of this type already exists (Chunked)
        const videoType = type || 'MOVIE';
        const existingVideo = await prisma_1.prisma.videoFile.findFirst({
            where: {
                contentId,
                type: videoType,
                episodeId: episodeId || null,
                status: { not: 'FAILED' }
            }
        });
        if (existingVideo) {
            res.status(400).json({
                success: false,
                error: `Este contenido ya tiene un video de tipo ${videoType}. Elimínalo primero si deseas subir uno nuevo.`
            });
            return;
        }
        // 1. Merge chunks
        const finalPath = await chunk_upload_service_1.ChunkUploadService.mergeChunks(fileId, fileName, parseInt(totalChunks));
        // 2. Create VideoFile record
        const videoFile = await prisma_1.prisma.videoFile.create({
            data: {
                contentId,
                episodeId: episodeId || null,
                type: type || 'MOVIE',
                originalPath: finalPath,
                status: 'QUEUED'
            }
        });
        // 3. Add job to BullMQ
        const job = await (0, queue_service_1.addVideoJob)({
            videoFileId: videoFile.id,
            contentId,
            type: videoFile.type,
            seasonId: seasonId || undefined,
            episodeId: episodeId || undefined,
            videoPath: finalPath,
        });
        await prisma_1.prisma.videoFile.update({
            where: { id: videoFile.id },
            data: { processingJobId: job.id }
        });
        res.json({
            success: true,
            message: 'File merged and enqueued',
            videoFileId: videoFile.id,
            jobId: job.id
        });
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=upload.router.js.map