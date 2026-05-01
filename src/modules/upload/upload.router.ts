import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { env } from '../../shared/config/env';
import { addVideoJob } from '../../services/queue.service';
import { prisma } from '../../shared/config/prisma';
import sharp from 'sharp';
import fs from 'fs';

export const uploadRouter = Router();
console.log('📂 [UploadRouter] Initializing...');

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
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB limit
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

uploadRouter.post('/image', (_req, _res, next) => {
  console.log('📸 [UploadRouter] POST /image request received');
  next();
}, imageUpload.single('image'), async (req, res, next) => {
  try {
    const file = req.file;
    const { contentId, type } = req.body; // type: 'POSTER' | 'BACKDROP'

    if (!file || !contentId || !type) {
      return res.status(400).json({ success: false, error: 'File, contentId and type are required' });
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
      sharpInstance.resize(600, 900, { fit: 'cover', position: 'center' });
    } else if (type === 'BACKDROP') {
      sharpInstance.resize(1920, 1080, { fit: 'cover', position: 'center' });
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

    return res.json({ success: true, url: imageUrl });
  } catch (error) {
    return next(error);
  }
});

uploadRouter.post('/', upload.single('video'), async (req, res, next) => {
  try {
    const file = req.file;
    const { contentId, seasonId, episodeId } = req.body;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No video file provided' });
    }
    if (!contentId) {
      return res.status(400).json({ success: false, error: 'contentId is required' });
    }

    // Ensure content exists
    const content = await prisma.content.findUnique({ where: { id: contentId } });
    if (!content) {
      return res.status(404).json({ success: false, error: 'Content not found' });
    }

    // 1. Create VideoFile record first (prevent duplicates in UI)
    const videoFile = await prisma.videoFile.create({
      data: {
        contentId,
        episodeId: episodeId || null,
        originalPath: file.path,
        status: 'QUEUED' // Change to QUEUED as it's going to BullMQ
      }
    });

    // 2. Add job to BullMQ
    const job = await addVideoJob({
      videoFileId: videoFile.id,
      contentId,
      seasonId: seasonId || undefined,
      episodeId: episodeId || undefined,
      videoPath: file.path, 
    });

    // 3. Update record with job ID
    await prisma.videoFile.update({
      where: { id: videoFile.id },
      data: { processingJobId: job.id }
    });

    return res.status(200).json({
      success: true,
      message: 'Video upload completed and enqueued for processing',
      jobId: job.id,
      videoFileId: videoFile.id
    });
  } catch (error) {
    return next(error);
  }
});
