"use strict";
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
exports.uploadRouter = (0, express_1.Router)();
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
    limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB limit
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
exports.uploadRouter.post('/', upload.single('video'), async (req, res, next) => {
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
        const content = await prisma_1.prisma.content.findUnique({ where: { id: contentId } });
        if (!content) {
            return res.status(404).json({ success: false, error: 'Content not found' });
        }
        // Add job to BullMQ
        const job = await (0, queue_service_1.addVideoJob)({
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
    }
    catch (error) {
        return next(error);
    }
});
//# sourceMappingURL=upload.router.js.map