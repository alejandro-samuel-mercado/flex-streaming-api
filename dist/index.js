"use strict";
/**
 * PeliPlus Backend — Entry Point (PROMPT MAESTRO)
 *
 * Express server with Socket.io for real-time upload progress,
 * all module routers, and differentiated rate limiting.
 */
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
const tmdb_router_1 = require("./modules/admin/tmdb.router");
const app = (0, express_1.default)();
exports.app = app;
app.use((_req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${_req.method} ${_req.url}`);
    next();
});
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
require("./workers/video.worker");
// Listen to BullMQ queue progress and emit to clients
queue_service_1.videoQueueEvents.on('progress', ({ jobId, data }) => {
    io.emit('video-progress', { jobId, progress: data });
});
queue_service_1.videoQueueEvents.on('completed', ({ jobId }) => {
    io.emit('video-status', { jobId, status: 'READY' });
});
// ─── Security & Utilities ────────────────────────────────────────────────────
app.use((0, helmet_1.default)({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)(env_1.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use((0, cors_1.default)({
    origin: env_1.env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// ─── Static Files ─────────────────────────────────────────────────────────────
app.use('/uploads', express_1.default.static(path_1.default.resolve(env_1.env.UPLOAD_DIR)));
app.use('/media', express_1.default.static(path_1.default.resolve(env_1.env.MEDIA_PATH)));
// ─── Rate Limiting (differentiated per endpoint type) ─────────────────────────
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Too many auth requests' },
    standardHeaders: true,
    legacyHeaders: false,
});
const streamLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 60,
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
app.use('/api/reviews', reviews_router_1.reviewsRouter);
app.use('/api/admin', admin_router_1.adminRouter);
app.use('/api/admin/tmdb', tmdb_router_1.tmdbRouter);
app.use('/api/upload', uploadLimiter, auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('ADMIN'), upload_router_1.uploadRouter);
app.use('/api/platforms', platforms_router_1.platformsRouter);
app.use('/api/plans', plans_router_1.plansRouter);
app.use('/api/homepage', homepage_router_1.homepageRouter);
app.use('/api/reseller', apiLimiter, reseller_router_1.resellerRouter);
app.use('/api/subscription-plans', apiLimiter, subscription_plans_router_1.subscriptionPlansRouter);
app.use('/api/credit-packages', apiLimiter, credit_packages_router_1.creditPackagesRouter);
app.use('/api/end-users', apiLimiter, end_users_router_1.endUsersRouter);
// Health check
app.get('/health', (_req, res) => {
    res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});
// ─── Error Handler (must be last) ─────────────────────────────────────────────
app.use(error_handler_1.errorHandler);
const fs_1 = __importDefault(require("fs"));
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
        httpServer.listen(env_1.env.BACKEND_PORT, () => {
            console.log(`🚀 PeliPlus API running at http://localhost:${env_1.env.BACKEND_PORT}`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
bootstrap();
//# sourceMappingURL=index.js.map