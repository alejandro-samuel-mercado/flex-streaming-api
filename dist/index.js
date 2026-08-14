"use strict";
/**
 * PeliPlus Backend — Entry Point (PROMPT MAESTRO)
 *
 * Express server with Socket.io for real-time upload progress,
 * all module routers, and differentiated rate limiting.
 */
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
exports.io = exports.httpServer = exports.app = void 0;
// BigInt serialization fix for JSON
BigInt.prototype.toJSON = function () {
    return this.toString();
};
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const env_1 = require("./shared/config/env");
const redis_1 = require("./shared/config/redis");
const prisma_1 = require("./shared/config/prisma");
const error_handler_1 = require("./shared/middleware/error-handler");
const auth_middleware_1 = require("./shared/middleware/auth.middleware");
// Module routers
const auth_router_1 = require("./modules/auth/auth.router");
const categories_router_1 = require("./modules/categories/categories.router");
const actors_router_1 = require("./modules/actors/actors.router");
const content_router_1 = require("./modules/content/content.router");
const search_router_1 = require("./modules/search/search.router");
const streaming_router_1 = require("./modules/streaming/streaming.router");
const profiles_router_1 = require("./modules/profiles/profiles.router");
const favorites_router_1 = require("./modules/favorites/favorites.router");
const history_router_1 = require("./modules/history/history.router");
const reviews_router_1 = require("./modules/reviews/reviews.router");
const admin_router_1 = require("./modules/admin/admin.router");
const upload_router_1 = require("./modules/upload/upload.router");
const platforms_router_1 = require("./modules/platforms/platforms.router");
const plans_router_1 = require("./modules/plans/plans.router");
const homepage_router_1 = require("./modules/homepage/homepage.router");
const reseller_router_1 = require("./modules/reseller/reseller.router");
const subscription_plans_router_1 = require("./modules/subscription-plans/subscription-plans.router");
const credit_packages_router_1 = require("./modules/credit-packages/credit-packages.router");
const end_users_router_1 = require("./modules/end-users/end-users.router");
const requests_router_1 = require("./modules/requests/requests.router");
const tmdb_router_1 = require("./modules/admin/tmdb.router");
const media_scanner_router_1 = require("./modules/media-scanner/media-scanner.router");
const backup_router_1 = require("./modules/backup/backup.router");
const app_version_router_1 = require("./modules/app-version/app-version.router");
const likes_router_1 = require("./modules/likes/likes.router");
const backup_service_1 = require("./modules/backup/backup.service");
// import { AutoScannerWorker } from './workers/auto-scanner.worker';
const account_expiry_worker_1 = require("./workers/account-expiry.worker");
const maintenance_service_1 = require("./modules/maintenance/maintenance.service");
const chunk_upload_service_1 = require("./services/chunk-upload.service");
const app = (0, express_1.default)();
exports.app = app;
const httpServer = (0, http_1.createServer)(app);
exports.httpServer = httpServer;
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: env_1.env.FRONTEND_URL,
        credentials: true,
    }
});
exports.io = io;
// Import worker and events to start them
const queue_service_1 = require("./services/queue.service");
const fs_1 = __importDefault(require("fs"));
const ioredis_1 = __importDefault(require("ioredis"));
// ─── Redis PubSub Control Listener (Multi-Server Command) ──────────────────
const controlRedis = new ioredis_1.default(env_1.env.REDIS_URL, { maxRetriesPerRequest: null });
controlRedis.subscribe('peliplus-control-channel').then(() => {
    console.log('📡 [Control] Subscribed to peliplus-control-channel');
}).catch(err => {
    console.error('📡 [Control] Failed to subscribe to control channel:', err.message);
});
controlRedis.on('message', (channel, message) => {
    if (channel === 'peliplus-control-channel' && message === 'nuclear-restart') {
        console.log('🔄 [Control] Nuclear restart signal received. Cleaning up FFmpeg and restarting in 2 seconds...');
        const { exec } = require('child_process');
        exec('killall ffmpeg', () => { });
        setTimeout(() => {
            console.log('🔄 [Control] Exiting process now.');
            process.exit(1); // PM2 will automatically restart the process
        }, 2000);
    }
});
// ─── Manual PM2 Cache Bypass ────────────────────────────────────────────────
// If PM2 cached ENABLE_WORKER=true, but the physical .env file says false,
// we forcefully disable it here to prevent Cerebro from stealing jobs.
let isWorkerEnabled = env_1.env.ENABLE_WORKER;
try {
    if (fs_1.default.existsSync('.env')) {
        const envFile = fs_1.default.readFileSync('.env', 'utf-8');
        if (envFile.includes('ENABLE_WORKER=false') || envFile.includes('ENABLE_WORKER="false"')) {
            isWorkerEnabled = false;
        }
    }
}
catch (e) { }
if (isWorkerEnabled) {
    try {
        require('./workers/video.worker');
        console.log(`[Worker] Video processing worker ENABLED (Mode: ${env_1.env.WORKER_MODE})`);
    }
    catch (err) {
        console.log(`[Worker] Failed to initialize video worker:`, err);
    }
}
else {
    console.log('[Worker] Video processing worker DISABLED on this node (read from .env / process)');
}
// Listen to BullMQ queue progress and emit to clients
queue_service_1.videoQueueEvents.on('progress', ({ jobId, data }) => {
    io.emit('video-progress', { jobId, progress: data });
});
queue_service_1.videoQueueEvents.on('completed', ({ jobId }) => {
    io.emit('video-status', { jobId, status: 'READY' });
});
// ─── Security & Utilities ────────────────────────────────────────────────────
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// Trust proxy — required for correct IP detection behind Nginx/Cloudflare/VPS reverse proxies
// Without this, req.ip is always the proxy IP, breaking the HMAC token validation
app.set('trust proxy', 1);
// Compression — explicitly skip already-compressed media files
// .ts (HLS segments) and .mp4 are H.264/AAC encoded; gzipping them wastes CPU and can make them larger
app.use((0, compression_1.default)({
    filter: (req, res) => {
        const url = req.url || '';
        // Skip compression for media segments
        if (/\.(ts|mp4|webm|mkv|avi|mov)$/i.test(url))
            return false;
        return compression_1.default.filter(req, res);
    }
}));
app.use((0, morgan_1.default)(env_1.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    skip: (req, _res) => {
        const url = req.url || '';
        // Skip logging for the video status polling endpoint to prevent log spam
        if (url.includes('/api/admin/videos/status'))
            return true;
        return false;
    }
}));
// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((0, cors_1.default)({
    origin: true, // Dynamically allow any origin (required for credentials: true)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// ─── Static Files ─────────────────────────────────────────────────────────────
// Serve uploads (profile images, posters, etc.) — non-sensitive
app.use('/uploads', express_1.default.static(path_1.default.resolve(env_1.env.UPLOAD_DIR)));
app.use('/api/uploads', express_1.default.static(path_1.default.resolve(env_1.env.UPLOAD_DIR))); // Alias for frontend consistency
// NOTE: /media is intentionally NOT exposed via express.static.
// All HLS access is authenticated through /api/stream/hls/:videoFileId/* with signed tokens.
// Thumbnails and subtitles are still served statically as they are not protected content.
app.use('/media/thumbnails', express_1.default.static(path_1.default.resolve(env_1.env.THUMBNAILS_PATH)));
app.use('/api/media/thumbnails', express_1.default.static(path_1.default.resolve(env_1.env.THUMBNAILS_PATH))); // Alias
app.use('/media/subtitles', express_1.default.static(path_1.default.resolve(env_1.env.SUBTITLES_PATH)));
app.use('/media/subtitles', express_1.default.static(path_1.default.resolve(env_1.env.SUBTITLES_PATH)));
app.use('/api/media/subtitles', express_1.default.static(path_1.default.resolve(env_1.env.SUBTITLES_PATH))); // Alias
// Distributed subtitle proxy/redirect for Cerebro node
app.get(['/media/subtitles/:contentId/:filename', '/api/media/subtitles/:contentId/:filename'], async (req, res, next) => {
    // If we have the file locally, express.static already served it.
    // If we reached here, it means the file is not on this node's disk.
    // Let's redirect to the correct storage node if distributed mode is enabled.
    const { contentId, filename } = req.params;
    try {
        const content = await prisma_1.prisma.content.findUnique({ where: { id: contentId } });
        if (content) {
            const storageNodeUrl = content.type === 'SERIES' ? env_1.env.STORAGE_NODE_SERIES_URL : env_1.env.STORAGE_NODE_MOVIES_URL;
            if (storageNodeUrl && storageNodeUrl !== env_1.env.BACKEND_URL) {
                return res.redirect(302, `${storageNodeUrl}/media/subtitles/${contentId}/${filename}`);
            }
        }
    }
    catch (err) {
        console.error('[Subtitle Redirect Error]', err);
    }
    // Fallback if not distributed or not found
    next();
});
// ─── Rate Limiting (differentiated per endpoint type) ─────────────────────────
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { success: false, error: 'Too many auth requests' },
    standardHeaders: true,
    legacyHeaders: false,
});
const streamLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 500, // HLS: each .ts segment = 1 request. 6s segments → ~10 req/min at normal playback,
    // but ABR + prefetch + multiple quality checks can spike. 500/min is safe.
    message: { success: false, error: 'Too many stream requests' },
    standardHeaders: true,
    legacyHeaders: false,
});
const uploadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many uploads' },
    standardHeaders: true,
    legacyHeaders: false,
});
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 200,
    message: { success: false, error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
});
// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, auth_router_1.authRouter);
app.use('/api/profiles', profiles_router_1.profilesRouter);
app.use('/api/content', apiLimiter, content_router_1.contentRouter);
app.get('/api/content-debug', (_req, res) => res.json({ debug: true }));
app.use('/api/categories', categories_router_1.categoriesRouter);
app.use('/api/actors', actors_router_1.actorsRouter);
app.use('/api/search', apiLimiter, search_router_1.searchRouter);
app.use('/api/stream', streamLimiter, streaming_router_1.streamingRouter);
app.use('/api/favorites', favorites_router_1.favoritesRouter);
app.use('/api/history', history_router_1.historyRouter);
app.use('/api/likes', likes_router_1.likesRouter);
app.use('/api/reviews', reviews_router_1.reviewsRouter);
app.use('/api/admin', admin_router_1.adminRouter);
app.use('/api/admin/tmdb', tmdb_router_1.tmdbRouter);
app.use('/api/admin/media-scanner', media_scanner_router_1.mediaScannerRouter);
app.use('/api/admin/backup', backup_router_1.backupRouter);
app.use('/api/app', app_version_router_1.appVersionRouter);
app.use('/api/upload', uploadLimiter, auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('ADMIN'), upload_router_1.uploadRouter);
app.use('/api/platforms', platforms_router_1.platformsRouter);
app.use('/api/plans', plans_router_1.plansRouter);
app.use('/api/homepage', homepage_router_1.homepageRouter);
app.use('/api/reseller', apiLimiter, reseller_router_1.resellerRouter);
app.use('/api/subscription-plans', apiLimiter, subscription_plans_router_1.subscriptionPlansRouter);
app.use('/api/credit-packages', apiLimiter, credit_packages_router_1.creditPackagesRouter);
app.use('/api/end-users', apiLimiter, end_users_router_1.endUsersRouter);
app.use('/api/requests', apiLimiter, requests_router_1.requestsRouter);
// Health check
app.get('/health', (_req, res) => {
    res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});
// ─── Error Handler (must be last) ─────────────────────────────────────────────
app.use(error_handler_1.errorHandler);
// ─── Start Server ─────────────────────────────────────────────────────────────
async function bootstrap() {
    try {
        // Ensure directories exist
        const dirs = [
            env_1.env.UPLOAD_DIR,
            env_1.env.MEDIA_PATH,
            env_1.env.UPLOADS_PATH,
            env_1.env.HLS_PATH,
            env_1.env.THUMBNAILS_PATH,
            env_1.env.SUBTITLES_PATH
        ];
        dirs.forEach(dir => {
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
                console.log(`📁 Created directory: ${dir}`);
            }
        });
        await redis_1.redis.connect();
        await prisma_1.prisma.$connect();
        console.log('✅ Database connected');
        // Start auto-scanner worker (DISABLED - Preferimos usar CRON de Linux o consola manual)
        // AutoScannerWorker.start(io);
        // console.log('🔍 Auto-scanner worker initialized (DISABLED)');
        // Start background workers
        account_expiry_worker_1.AccountExpiryWorker.start();
        maintenance_service_1.MaintenanceService.start();
        console.log('⏰ Account expiry worker & Maintenance service initialized');
        const { HealthInspectorWorker } = require('./workers/health-inspector.worker');
        HealthInspectorWorker.start();
        console.log('🩺 Health Inspector worker initialized');
        const { FileIntegrityWorker } = require('./workers/file-integrity.worker');
        FileIntegrityWorker.start();
        console.log('🛡️ File Integrity worker initialized');
        // Start auto-backup scheduler (reads config from DB)
        (0, backup_service_1.startAutoBackupScheduler)().catch(err => console.warn('[Backup] Scheduler startup skipped:', err?.message));
        console.log('💾 Backup scheduler initialized');
        httpServer.listen(env_1.env.BACKEND_PORT, () => {
            console.log(`🚀 Nuba API running at http://localhost:${env_1.env.BACKEND_PORT}`);
        });
        // Periodic cleanup of abandoned chunk uploads (every 6 hours)
        setInterval(() => {
            const cleaned = chunk_upload_service_1.ChunkUploadService.cleanupStaleChunks();
            if (cleaned > 0)
                console.log(`🧹 Cleaned ${cleaned} stale chunk upload(s)`);
        }, 6 * 60 * 60 * 1000);
        // Run once at startup too
        chunk_upload_service_1.ChunkUploadService.cleanupStaleChunks();
        // Periodic cleanup of stuck video processes (every 6 hours)
        setInterval(async () => {
            try {
                const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
                const stuck = await prisma_1.prisma.videoFile.updateMany({
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
            }
            catch (err) {
                console.error('[Cleanup] Failed to cleanup stuck video processes:', err.message);
            }
        }, 6 * 60 * 60 * 1000);
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
bootstrap();
// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = async () => {
    console.log('🛑 [Server] Shutting down gracefully...');
    try {
        const { videoQueue, videoQueueEvents } = await Promise.resolve().then(() => __importStar(require('./services/queue.service')));
        await videoQueue.close();
        await videoQueueEvents.close();
        await prisma_1.prisma.$disconnect();
        console.log('✅ [Server] Connections closed. Exiting.');
        process.exit(0);
    }
    catch (err) {
        console.error('❌ [Server] Error during shutdown:', err);
        process.exit(1);
    }
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
//# sourceMappingURL=index.js.map