/**
 * PeliPlus Backend — Entry Point (PROMPT MAESTRO)
 *
 * Express server with Socket.io for real-time upload progress,
 * all module routers, and differentiated rate limiting.
 */

// BigInt serialization fix for JSON
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

import express, { RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './shared/config/env';
import { redis } from './shared/config/redis';
import { prisma } from './shared/config/prisma';
import { errorHandler } from './shared/middleware/error-handler';
import { authenticate, requireRole } from './shared/middleware/auth.middleware';

// Module routers
import { authRouter } from './modules/auth/auth.router';
import { categoriesRouter } from './modules/categories/categories.router';
import { actorsRouter } from './modules/actors/actors.router';
import { contentRouter } from './modules/content/content.router';
import { searchRouter } from './modules/search/search.router';
import { streamingRouter } from './modules/streaming/streaming.router';
import { profilesRouter } from './modules/profiles/profiles.router';
import { favoritesRouter } from './modules/favorites/favorites.router';
import { historyRouter } from './modules/history/history.router';
import { reviewsRouter } from './modules/reviews/reviews.router';
import { adminRouter } from './modules/admin/admin.router';
import { uploadRouter } from './modules/upload/upload.router';
import { platformsRouter } from './modules/platforms/platforms.router';
import { plansRouter } from './modules/plans/plans.router';
import { homepageRouter } from './modules/homepage/homepage.router';
import { resellerRouter } from './modules/reseller/reseller.router';
import { subscriptionPlansRouter } from './modules/subscription-plans/subscription-plans.router';
import { creditPackagesRouter } from './modules/credit-packages/credit-packages.router';
import { endUsersRouter } from './modules/end-users/end-users.router';
import { tmdbRouter } from './modules/admin/tmdb.router';
import { mediaScannerRouter } from './modules/media-scanner/media-scanner.router';
import { backupRouter } from './modules/backup/backup.router';
import { likesRouter } from './modules/likes/likes.router';
import { startAutoBackupScheduler } from './modules/backup/backup.service';
// import { AutoScannerWorker } from './workers/auto-scanner.worker';
import { AccountExpiryWorker } from './workers/account-expiry.worker';
import { MaintenanceService } from './modules/maintenance/maintenance.service';
import { ChunkUploadService } from './services/chunk-upload.service';

const app = express();

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: env.FRONTEND_URL,
        credentials: true,
    }
});

// Import worker and events to start them
import { videoQueueEvents } from './services/queue.service';
import fs from 'fs';

// ─── Manual PM2 Cache Bypass ────────────────────────────────────────────────
// If PM2 cached ENABLE_WORKER=true, but the physical .env file says false,
// we forcefully disable it here to prevent Cerebro from stealing jobs.
let isWorkerEnabled = env.ENABLE_WORKER;
try {
  if (fs.existsSync('.env')) {
    const envFile = fs.readFileSync('.env', 'utf-8');
    if (envFile.includes('ENABLE_WORKER=false') || envFile.includes('ENABLE_WORKER="false"')) {
      isWorkerEnabled = false;
    }
  }
} catch (e) {}

if (isWorkerEnabled) {
  try {
    require('./workers/video.worker');
    console.log(`[Worker] Video processing worker ENABLED (Mode: ${env.WORKER_MODE})`);
  } catch (err) {
    console.log(`[Worker] Failed to initialize video worker:`, err);
  }
} else {
  console.log('[Worker] Video processing worker DISABLED on this node (read from .env / process)');
}

// Listen to BullMQ queue progress and emit to clients
videoQueueEvents.on('progress', ({ jobId, data }) => {
    io.emit('video-progress', { jobId, progress: data });
});
videoQueueEvents.on('completed', ({ jobId }) => {
    io.emit('video-status', { jobId, status: 'READY' });
});

// ─── Security & Utilities ────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Trust proxy — required for correct IP detection behind Nginx/Cloudflare/VPS reverse proxies
// Without this, req.ip is always the proxy IP, breaking the HMAC token validation
app.set('trust proxy', 1);

// Compression — explicitly skip already-compressed media files
// .ts (HLS segments) and .mp4 are H.264/AAC encoded; gzipping them wastes CPU and can make them larger
app.use(compression({
    filter: (req, res) => {
        const url = req.url || '';
        // Skip compression for media segments
        if (/\.(ts|mp4|webm|mkv|avi|mov)$/i.test(url)) return false;
        return compression.filter(req, res);
    }
}));

app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    skip: (req, _res) => {
        const url = req.url || '';
        // Skip logging for the video status polling endpoint to prevent log spam
        if (url.includes('/api/admin/videos/status')) return true;
        return false;
    }
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
    origin: true, // Dynamically allow any origin (required for credentials: true)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Static Files ─────────────────────────────────────────────────────────────
// Serve uploads (profile images, posters, etc.) — non-sensitive
app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)));
app.use('/api/uploads', express.static(path.resolve(env.UPLOAD_DIR))); // Alias for frontend consistency

// NOTE: /media is intentionally NOT exposed via express.static.
// All HLS access is authenticated through /api/stream/hls/:videoFileId/* with signed tokens.
// Thumbnails and subtitles are still served statically as they are not protected content.
app.use('/media/thumbnails', express.static(path.resolve(env.THUMBNAILS_PATH)));
app.use('/api/media/thumbnails', express.static(path.resolve(env.THUMBNAILS_PATH))); // Alias

app.use('/media/subtitles', express.static(path.resolve(env.SUBTITLES_PATH)));
app.use('/media/subtitles', express.static(path.resolve(env.SUBTITLES_PATH)));
app.use('/api/media/subtitles', express.static(path.resolve(env.SUBTITLES_PATH))); // Alias

// Distributed subtitle proxy/redirect for Cerebro node
app.get(['/media/subtitles/:contentId/:filename', '/api/media/subtitles/:contentId/:filename'], async (req, res, next) => {
    // If we have the file locally, express.static already served it.
    // If we reached here, it means the file is not on this node's disk.
    // Let's redirect to the correct storage node if distributed mode is enabled.
    const { contentId, filename } = req.params;

    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const content = await prisma.content.findUnique({ where: { id: contentId } });

        if (content) {
            const storageNodeUrl = content.type === 'SERIES' ? env.STORAGE_NODE_SERIES_URL : env.STORAGE_NODE_MOVIES_URL;
            if (storageNodeUrl && storageNodeUrl !== env.BACKEND_URL) {
                return res.redirect(302, `${storageNodeUrl}/media/subtitles/${contentId}/${filename}`);
            }
        }
    } catch (err) {
        console.error('[Subtitle Redirect Error]', err);
    }

    // Fallback if not distributed or not found
    next();
});

// ─── Rate Limiting (differentiated per endpoint type) ─────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { success: false, error: 'Too many auth requests' },
    standardHeaders: true,
    legacyHeaders: false,
});

const streamLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 500,            // HLS: each .ts segment = 1 request. 6s segments → ~10 req/min at normal playback,
    // but ABR + prefetch + multiple quality checks can spike. 500/min is safe.
    message: { success: false, error: 'Too many stream requests' },
    standardHeaders: true,
    legacyHeaders: false,
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many uploads' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { success: false, error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/content', apiLimiter, contentRouter);
app.get('/api/content-debug', (_req: any, res: any) => res.json({ debug: true }));
app.use('/api/categories', categoriesRouter);
app.use('/api/actors', actorsRouter);
app.use('/api/search', apiLimiter, searchRouter);
app.use('/api/stream', streamLimiter, streamingRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/history', historyRouter);
app.use('/api/likes', likesRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/tmdb', tmdbRouter);
app.use('/api/admin/media-scanner', mediaScannerRouter);
app.use('/api/admin/backup', backupRouter);
app.use('/api/upload', uploadLimiter, authenticate as RequestHandler, requireRole('ADMIN') as RequestHandler, uploadRouter);
app.use('/api/platforms', platformsRouter);
app.use('/api/plans', plansRouter);
app.use('/api/homepage', homepageRouter);
app.use('/api/reseller', apiLimiter, resellerRouter);
app.use('/api/subscription-plans', apiLimiter, subscriptionPlansRouter);
app.use('/api/credit-packages', apiLimiter, creditPackagesRouter);
app.use('/api/end-users', apiLimiter, endUsersRouter);

// Health check
app.get('/health', (_req, res) => {
    res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Error Handler (must be last) ─────────────────────────────────────────────
app.use(errorHandler);


// ─── Start Server ─────────────────────────────────────────────────────────────
async function bootstrap() {
    try {
        // Ensure directories exist
        const dirs = [
            env.UPLOAD_DIR,
            env.MEDIA_PATH,
            env.UPLOADS_PATH,
            env.HLS_PATH,
            env.THUMBNAILS_PATH,
            env.SUBTITLES_PATH
        ];
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 Created directory: ${dir}`);
            }
        });

        await redis.connect();
        await prisma.$connect();
        console.log('✅ Database connected');

        // Start auto-scanner worker (DISABLED - Preferimos usar CRON de Linux o consola manual)
        // AutoScannerWorker.start(io);
        // console.log('🔍 Auto-scanner worker initialized (DISABLED)');

        // Start account expiry worker
        AccountExpiryWorker.start();
        MaintenanceService.start();
        console.log('⏰ Account expiry worker initialized');

        // Start auto-backup scheduler (reads config from DB)
        startAutoBackupScheduler().catch(err =>
            console.warn('[Backup] Scheduler startup skipped:', err?.message)
        );
        console.log('💾 Backup scheduler initialized');

        httpServer.listen(env.BACKEND_PORT, () => {
            console.log(`🚀 Nuba API running at http://localhost:${env.BACKEND_PORT}`);
        });

        // Periodic cleanup of abandoned chunk uploads (every 6 hours)
        setInterval(() => {
            const cleaned = ChunkUploadService.cleanupStaleChunks();
            if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} stale chunk upload(s)`);
        }, 6 * 60 * 60 * 1000);
        // Run once at startup too
        ChunkUploadService.cleanupStaleChunks();

        // Periodic cleanup of stuck video processes (every 6 hours)
        setInterval(async () => {
            try {
                const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
                const stuck = await prisma.videoFile.updateMany({
                    where: {
                        status: 'PROCESSING',
                        updatedAt: { lt: fourHoursAgo }
                    },
                    data: {
                        status: 'FAILED',
                        errorMessage: 'Proceso marcado como fallido automáticamente tras 4 horas de inactividad.'
                    }
                });
                if (stuck.count > 0) {
                    console.log(`🧹 [Cleanup] Reseteados ${stuck.count} procesos de video estancados (más de 4 horas inactivos)`);
                }
            } catch (err: any) {
                console.error('[Cleanup] Failed to cleanup stuck video processes:', err.message);
            }
        }, 6 * 60 * 60 * 1000);
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

bootstrap();

export { app, httpServer, io };
// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = async () => {
    console.log('🛑 [Server] Shutting down gracefully...');
    try {
        const { videoQueue, videoQueueEvents } = await import('./services/queue.service');
        await videoQueue.close();
        await videoQueueEvents.close();
        await prisma.$disconnect();
        console.log('✅ [Server] Connections closed. Exiting.');
        process.exit(0);
    } catch (err) {
        console.error('❌ [Server] Error during shutdown:', err);
        process.exit(1);
    }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
