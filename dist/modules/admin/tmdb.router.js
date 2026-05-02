"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tmdbRouter = void 0;
const express_1 = require("express");
const tmdb_service_1 = require("../../services/tmdb.service");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
exports.tmdbRouter = (0, express_1.Router)();
// Protect all TMDB routes for admins only
exports.tmdbRouter.use(auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('ADMIN'));
/**
 * GET /api/admin/tmdb/search?query=...&type=movie|tv
 */
exports.tmdbRouter.get('/search', (async (req, res, next) => {
    try {
        const { query, type } = req.query;
        if (!query) {
            res.status(400).json({ success: false, error: 'Query is required' });
            return;
        }
        const results = await tmdb_service_1.TMDBService.search(query, type || 'multi');
        (0, api_response_1.ok)(res, results);
    }
    catch (err) {
        next(err);
    }
}));
/**
 * GET /api/admin/tmdb/details/:type/:id
 */
exports.tmdbRouter.get('/details/:type/:id', (async (req, res, next) => {
    try {
        const { type, id } = req.params;
        const details = await tmdb_service_1.TMDBService.getDetails(id, type);
        (0, api_response_1.ok)(res, details);
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=tmdb.router.js.map