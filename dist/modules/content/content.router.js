"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentRouter = void 0;
const express_1 = require("express");
const content_service_1 = require("./content.service");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
const cache_middleware_1 = require("../../shared/middleware/cache.middleware");
const zod_1 = require("zod");
exports.contentRouter = (0, express_1.Router)();
const ContentFiltersSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().min(1).default(1),
    limit: zod_1.z.coerce.number().min(1).max(50).default(20),
    search: zod_1.z.string().optional(),
    type: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    genreId: zod_1.z.string().optional(),
    tagId: zod_1.z.string().optional(),
    actorId: zod_1.z.string().optional(),
    year: zod_1.z.coerce.number().optional(),
    sort: zod_1.z.enum(['recent', 'popular', 'rating', 'az', 'za']).default('recent'),
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
exports.contentRouter.get('/', (0, cache_middleware_1.cacheMiddleware)('catalog'), (async (req, res, next) => {
    try {
        const filters = ContentFiltersSchema.parse(req.query);
        const { data, total, page, limit } = await content_service_1.ContentService.getAllContent(filters);
        (0, api_response_1.ok)(res, data, (0, api_response_1.paginate)(page, limit, total));
    }
    catch (err) {
        next(err);
    }
}));
exports.contentRouter.get('/:id', (0, cache_middleware_1.cacheMiddleware)('contentDetail'), (async (req, res, next) => {
    try {
        const lang = req.query.lang || 'es';
        const data = await content_service_1.ContentService.getContentById(req.params.id, lang);
        if (!data) {
            res.status(404).json({ success: false, error: 'Content not found' });
            return;
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
        await content_service_1.ContentService.deleteContent(req.params.id);
        (0, api_response_1.ok)(res, { deleted: true });
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=content.router.js.map