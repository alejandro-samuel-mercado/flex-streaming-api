import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { env } from '../../shared/config/env';
import { addVideoJob } from '../../services/queue.service';
import { prisma } from '../../shared/config/prisma';
import { ChunkUploadService } from '../../services/chunk-upload.service';
import sharp from 'sharp';
import fs from 'fs';

export const uploadRouter = Router();
console.log('📂 [UploadRouter] Initializing...');

/**
 * GET /api/upload/chunk-status/:fileId
 * MOVED TO TOP to ensure it's matched first
 */
uploadRouter.get('/chunk-status/:fileId', (async (req: any, res: any, next: any) => {
  try {
    const { fileId } = req.params;
    console.log(`🔍 [UploadRouter] Checking status for ${fileId}`);
    const chunkDir = path.join(env.UPLOAD_DIR, 'chunks', fileId);
    
    if (!fs.existsSync(chunkDir)) {
      return res.json({ success: true, uploadedChunks: [] });
    }

    const files = fs.readdirSync(chunkDir);
    const uploadedChunks = files
      .map(f => parseInt(f))
      .filter(n => !isNaN(n));
    
    res.json({ success: true, uploadedChunks });
  } catch (err) { next(err); }
}) as any);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 20 * 1024 * 1024 * 1024 }, // 20GB limit
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/mp4', 'video/x-matroska', 'video/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, MKV and WEBM are allowed.'));
    }
  }
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for images
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image type. Only JPG, PNG and WEBP are allowed.'));
    }
  }
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB per chunk max
});

const subtitleUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(env.MEDIA_PATH, 'subtitles');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `sub-${Date.now()}${path.extname(file.originalname)}`);
    }
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ['.vtt', '.srt'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid subtitle type. Only .VTT and .SRT are allowed.'));
    }
  }
});

uploadRouter.post('/subtitle', subtitleUpload.single('subtitle'), (async (req: any, res: any, next: any) => {
  try {
    const file = req.file;
    const { videoFileId, language, label } = req.body;

    if (!file || !videoFileId || !language) {
      res.status(400).json({ success: false, error: 'Subtitle file, videoFileId and language are required' });
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase();
    let finalPath = file.path;

    // ── Encoding & format normalization ──────────────────────────────
    // 1. Read the raw file and strip UTF-8 BOM (common in Spanish subtitles)
    let content = fs.readFileSync(file.path, 'utf-8');
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
      fs.writeFileSync(finalPath, vttContent, 'utf-8');
      // Remove the original .srt
      fs.unlinkSync(file.path);
    } else {
      // It's already VTT — just write back the BOM-stripped version
      fs.writeFileSync(file.path, content, 'utf-8');
    }

    const finalFilename = path.basename(finalPath);
    const subtitleUrl = `/media/subtitles/${finalFilename}`;

    const subtitle = await prisma.subtitleTrack.create({
      data: {
        videoFileId,
        language,
        label: label || language,
        url: subtitleUrl,
        format: 'VTT' // Always VTT after conversion
      }
    });

    res.json({ success: true, data: subtitle });
  } catch (err) { next(err); }
}) as any);

uploadRouter.post('/image', (_req, _res, next) => {
  console.log('📸 [UploadRouter] POST /image request received');
  next();
}, imageUpload.single('image'), (async (req: any, res: any, next: any) => {
  try {
    const file = req.file;
    const { contentId, type } = req.body; // type: 'POSTER' | 'BACKDROP'

    if (!file || !contentId || !type) {
      res.status(400).json({ success: false, error: 'File, contentId and type are required' });
      return;
    }

    const folder = path.join(env.MEDIA_PATH, 'thumbnails', contentId);
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }

    const filename = `${type.toLowerCase()}-${Date.now()}.webp`;
    const fullPath = path.join(folder, filename);

    // Process with sharp (convert to webp and resize)
    const sharpInstance = sharp(file.buffer);
    
    if (type === 'POSTER') {
      // Use 'contain' to preserve the full poster without any cropping.
      // Posters are designed to be seen in their entirety - never crop them.
      sharpInstance.resize(600, 900, { 
        fit: 'contain',
        background: { r: 3, g: 6, b: 18, alpha: 1 } // Dark background for letterboxing if needed
      });
    } else if (type === 'BACKDROP') {
      // For backdrops, use 'cover' with 'top' position to preserve the cinematic upper area
      // (where the main subject/title card usually is), avoiding cropping into random bottom areas.
      sharpInstance.resize(1920, 1080, { 
        fit: 'cover', 
        position: 'top'
      });
    }

    await sharpInstance.webp({ quality: 85 }).toFile(fullPath);

    const imageUrl = `/media/thumbnails/${contentId}/${filename}`;

    // Update DB
    const existing = await prisma.thumbnail.findFirst({
      where: { 
        contentId: contentId,
        type: type as any
      }
    });

    if (existing) {
      await prisma.thumbnail.update({
        where: { id: existing.id },
        data: { url: imageUrl }
      });
    } else {
      await prisma.thumbnail.create({
        data: {
          contentId,
          type: type as any,
          url: imageUrl,
          width: type === 'POSTER' ? 600 : 1920,
          height: type === 'POSTER' ? 900 : 1080
        }
      });
    }

    res.json({ success: true, url: imageUrl });
  } catch (error) {
    next(error);
  }
}) as any);

uploadRouter.post('/', upload.single('video'), (async (req: any, res: any, next: any) => {
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

    const content = await prisma.content.findUnique({ where: { id: contentId } });
    if (!content) {
      res.status(404).json({ success: false, error: 'Content not found' });
      return;
    }

    // NEW: Check if video of this type already exists
    const videoType = (type as any) || 'MOVIE';
    const existingVideo = await prisma.videoFile.findFirst({
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
    const videoFile = await prisma.videoFile.create({
      data: {
        contentId,
        episodeId: episodeId || null,
        type: (type as any) || 'MOVIE',
        originalPath: file.path,
        status: 'QUEUED'
      }
    });

    // 2. Add job to BullMQ
    const job = await addVideoJob({
      videoFileId: videoFile.id,
      contentId,
      type: videoFile.type,
      seasonId: seasonId || undefined,
      episodeId: episodeId || undefined,
      videoPath: file.path, 
    });

    // 3. Update record with job ID
    await prisma.videoFile.update({
      where: { id: videoFile.id },
      data: { processingJobId: job.id }
    });

    res.status(200).json({
      success: true,
      message: 'Video upload completed and enqueued for processing',
      jobId: job.id,
      videoFileId: videoFile.id
    });
  } catch (error) {
    next(error);
  }
}) as any);

uploadRouter.delete('/video/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // 1. Find the video file record
    const videoFile = await prisma.videoFile.findUnique({
      where: { id }
    });

    if (!videoFile) {
      return res.status(404).json({ success: false, error: 'Video file not found' });
    }

    // 2. If it has a processing job, remove it
    if (videoFile.processingJobId) {
      const { removeVideoJob } = await import('../../services/queue.service');
      await removeVideoJob(videoFile.processingJobId);
    }

    // 3. Delete the record
    await prisma.videoFile.delete({ where: { id } });

    // 4. Delete the physical file ONLY if it was uploaded to our temp directory (not if auto-scanned from elsewhere)
    if (videoFile.originalPath && fs.existsSync(videoFile.originalPath)) {
      const absolutePath = path.resolve(videoFile.originalPath);
      const absoluteUploadDir = path.resolve(env.UPLOAD_DIR || path.join(env.MEDIA_PATH, 'uploads'));
      
      if (absolutePath.startsWith(absoluteUploadDir)) {
        fs.unlinkSync(videoFile.originalPath);
      }
    }

    return res.json({ success: true, message: 'Video upload cancelled and deleted' });
  } catch (error) {
    return next(error);
  }
});

uploadRouter.post('/video/:id/retry', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const videoFile = await prisma.videoFile.findUnique({
      where: { id }
    });

    if (!videoFile) {
      return res.status(404).json({ success: false, error: 'Video file not found' });
    }

    if (videoFile.status !== 'FAILED') {
      return res.status(400).json({ success: false, error: 'Solo se pueden reintentar videos fallidos' });
    }

    if (!fs.existsSync(videoFile.originalPath)) {
      return res.status(400).json({ success: false, error: 'El archivo original ya no existe en el disco' });
    }

    const { addVideoJob } = await import('../../services/queue.service');

    await prisma.videoFile.update({
      where: { id },
      data: { status: 'QUEUED', errorMessage: null }
    });

    const job = await addVideoJob({
      videoFileId: videoFile.id,
      contentId: videoFile.contentId || '',
      type: videoFile.type,
      episodeId: videoFile.episodeId || undefined,
      videoPath: videoFile.originalPath,
    });

    await prisma.videoFile.update({
      where: { id },
      data: { processingJobId: job.id }
    });

    return res.json({ success: true, message: 'Video encolado para reintento', jobId: job.id });
  } catch (error) {
    return next(error);
  }
});

uploadRouter.delete('/subtitle/:id', (async (req: any, res: any, next: any) => {
  try {
    const { id } = req.params;
    const sub = await prisma.subtitleTrack.findUnique({ where: { id } });
    
    if (!sub) {
      return res.status(404).json({ success: false, error: 'Subtitle not found' });
    }

    // Delete physical file
    const filePath = path.join(env.MEDIA_PATH, sub.url.replace('/media/', ''));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.subtitleTrack.delete({ where: { id } });
    res.json({ success: true, message: 'Subtitle deleted' });
  } catch (err) { next(err); }
}) as any);

/**
 * POST /api/upload/chunk
 */
uploadRouter.post('/chunk', chunkUpload.single('chunk'), (async (req: any, res: any, next: any) => {
  try {
    const { fileId, chunkIndex } = req.body;
    const file = req.file;

    if (!file || !fileId || chunkIndex === undefined) {
      res.status(400).json({ success: false, error: 'Missing chunk data' });
      return;
    }

    await ChunkUploadService.saveChunk(fileId, parseInt(chunkIndex), file.buffer);
    res.json({ success: true, message: `Chunk ${chunkIndex} saved` });
  } catch (err) { next(err); }
}) as any);

// Chunk status route moved to top

/**
 * POST /api/upload/complete
 */
uploadRouter.post('/complete', (async (req: any, res: any, next: any) => {
  try {
    const { fileId, fileName, totalChunks, contentId, seasonId, episodeId, type } = req.body;

    if (!fileId || !fileName || !totalChunks || !contentId) {
      res.status(400).json({ success: false, error: 'Missing data for completion' });
      return;
    }

    // NEW: Check if video of this type already exists (Chunked)
    const videoType = (type as any) || 'MOVIE';
    const existingVideo = await prisma.videoFile.findFirst({
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
    const finalPath = await ChunkUploadService.mergeChunks(fileId, fileName, parseInt(totalChunks));

    // 2. Create VideoFile record
    const videoFile = await prisma.videoFile.create({
      data: {
        contentId,
        episodeId: episodeId || null,
        type: (type as any) || 'MOVIE',
        originalPath: finalPath,
        status: 'QUEUED'
      }
    });

    // 3. Add job to BullMQ
    const job = await addVideoJob({
      videoFileId: videoFile.id,
      contentId,
      type: videoFile.type,
      seasonId: seasonId || undefined,
      episodeId: episodeId || undefined,
      videoPath: finalPath,
    });

    await prisma.videoFile.update({
      where: { id: videoFile.id },
      data: { processingJobId: job.id }
    });

    res.json({ 
      success: true, 
      message: 'File merged and enqueued',
      videoFileId: videoFile.id,
      jobId: job.id
    });
  } catch (err) { next(err); }
}) as any);
