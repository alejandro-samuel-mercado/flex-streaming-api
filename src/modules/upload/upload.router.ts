import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { env } from '../../shared/config/env';
import { addVideoJob } from '../../services/queue.service';
import { prisma } from '../../shared/config/prisma';

export const uploadRouter = Router();

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

    // Add job to BullMQ
    const job = await addVideoJob({
      contentId,
      seasonId: seasonId || undefined,
      episodeId: episodeId || undefined,
      videoPath: file.path, 
    });

    return res.status(200).json({
      success: true,
      message: 'Video upload completed and enqueued for processing',
      jobId: job.id
    });
  } catch (error) {
    return next(error);
  }
});
