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
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentRouter = void 0;
const express_1 = require("express");
const content_service_1 = require("./content.service");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
const cache_middleware_1 = require("../../shared/middleware/cache.middleware");
const redis_1 = require("../../shared/config/redis");
const zod_1 = require("zod");
exports.contentRouter = (0, express_1.Router)();
console.log('🚀 [ContentRouter] Router loaded and routes defined');
const ContentFiltersSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().min(1).default(1),
    limit: zod_1.z.coerce.number().min(1).max(100).default(50), // Increased max for better browsing
    search: zod_1.z.string().optional(),
    type: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    genreId: zod_1.z.string().optional(),
    tagId: zod_1.z.string().optional(),
    actorId: zod_1.z.string().optional(),
    platformId: zod_1.z.string().optional(),
    isFree: zod_1.z.preprocess((v) => v === 'true', zod_1.z.boolean()).optional(),
    minYear: zod_1.z.coerce.number().optional(),
    maxYear: zod_1.z.coerce.number().optional(),
    minDuration: zod_1.z.coerce.number().optional(),
    maxDuration: zod_1.z.coerce.number().optional(),
    sort: zod_1.z.enum(['recent', 'popular', 'rating', 'az', 'za', 'oldest']).default('recent'),
    lang: zod_1.z.string().default('es'),
});
// ─── PUBLIC ENDPOINTS ────────────────────────────────────────────────────────
exports.contentRouter.get('/featured', (0, cache_middleware_1.cacheMiddleware)('catalog'), (async (_req, res, next) => {
    try {
        const data = await content_service_1.ContentService.getFeaturedContent();
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.contentRouter.get('/trending', (0, cache_middleware_1.cacheMiddleware)('trending'), (async (_req, res, next) => {
    try {
        const data = await content_service_1.ContentService.getTrendingContent();
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.contentRouter.get('/recent', (0, cache_middleware_1.cacheMiddleware)('catalog'), (async (_req, res, next) => {
    try {
        const data = await content_service_1.ContentService.getRecentContent();
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.contentRouter.get('/', (async (req, res, next) => {
    try {
        console.log('[ContentRouter] Query received:', req.query);
        const filters = ContentFiltersSchema.parse(req.query);
        const { data, total, page, limit } = await content_service_1.ContentService.getAllContent(filters);
        (0, api_response_1.ok)(res, data, (0, api_response_1.paginate)(page, limit, total));
    }
    catch (err) {
        next(err);
    }
}));
exports.contentRouter.get('/:id', auth_middleware_1.optionalAuth, (async (req, res, next) => {
    try {
        const isAdmin = req.user?.role === 'ADMIN';
        const lang = req.query.lang || 'es';
        // 1. Manual cache check for guests
        if (!isAdmin) {
            const key = `cache:${req.originalUrl}`;
            try {
                const cached = await redis_1.redis.get(key);
                if (cached) {
                    res.setHeader('X-Cache', 'HIT');
                    res.json(JSON.parse(cached));
                    return;
                }
            }
            catch (err) {
                console.error('[Cache Error] Redis fail:', err);
            }
        }
        // 2. Fetch from DB
        const data = await content_service_1.ContentService.getContentById(req.params.id, lang);
        if (!data) {
            res.status(404).json({ success: false, error: 'Content not found' });
            return;
        }
        // 3. Cache the result for guests
        if (!isAdmin) {
            const key = `cache:${req.originalUrl}`;
            redis_1.redis.setex(key, 600, JSON.stringify(data)).catch(() => { });
            res.setHeader('X-Cache', 'MISS');
        }
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.contentRouter.get('/:id/related', (0, cache_middleware_1.cacheMiddleware)('catalog'), (async (req, res, next) => {
    try {
        const data = await content_service_1.ContentService.getRelatedContent(req.params.id);
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
// ─── ADMIN ENDPOINTS ─────────────────────────────────────────────────────────
exports.contentRouter.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('ADMIN'), (async (req, res, next) => {
    try {
        const data = await content_service_1.ContentService.createContent(req.body);
        (0, api_response_1.created)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.contentRouter.put('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('ADMIN'), (async (req, res, next) => {
    try {
        const data = await content_service_1.ContentService.updateContent(req.params.id, req.body);
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.contentRouter.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('ADMIN'), (async (req, res, next) => {
    try {
        const { invalidateCache } = await Promise.resolve().then(() => __importStar(require('../../shared/middleware/cache.middleware')));
        await invalidateCache(`*/content/${req.params.id}*`);
        await invalidateCache(`*catalog*`);
        await content_service_1.ContentService.deleteContent(req.params.id);
        (0, api_response_1.ok)(res, { deleted: true });
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=content.router.js.map