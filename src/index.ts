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
import { AutoScannerWorker } from './workers/auto-scanner.worker';
import { AccountExpiryWorker } from './workers/account-expiry.worker';
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
import './workers/video.worker';

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

app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  env.FRONTEND_URL,
  'https://unixxtech.online',
  'https://admin-streamflex.unixxtech.online',
  'https://streamflex.unixxtech.online'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('unixxtech.online')) {
      callback(null, true);
    } else {
      // In production, we might want to be stricter, but for now let's allow unixxtech.online
      callback(null, true); 
    }
  },
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
app.use('/api/media/subtitles', express.static(path.resolve(env.SUBTITLES_PATH))); // Alias

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
app.use('/api/reviews', reviewsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/tmdb', tmdbRouter);
app.use('/api/admin/media-scanner', mediaScannerRouter);
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

import fs from 'fs';

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

    // Start auto-scanner worker
    AutoScannerWorker.start(io);
    console.log('🔍 Auto-scanner worker initialized');

    // Start account expiry worker
    AccountExpiryWorker.start();
    console.log('⏰ Account expiry worker initialized');

    httpServer.listen(env.BACKEND_PORT, () => {
      console.log(`🚀 PeliPlus API running at http://localhost:${env.BACKEND_PORT}`);
    });

    // Periodic cleanup of abandoned chunk uploads (every 6 hours)
    setInterval(() => {
      const cleaned = ChunkUploadService.cleanupStaleChunks();
      if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} stale chunk upload(s)`);
    }, 6 * 60 * 60 * 1000);
    // Run once at startup too
    ChunkUploadService.cleanupStaleChunks();
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
