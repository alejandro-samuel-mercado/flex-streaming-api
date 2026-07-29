"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.favoritesRouter = void 0;
const express_1 = require("express");
const favorites_service_1 = require("./favorites.service");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
exports.favoritesRouter = (0, express_1.Router)();
exports.favoritesRouter.use(auth_middleware_1.authenticate);
exports.favoritesRouter.get('/', (async (req, res, next) => {
    try {
        const profileId = req.headers['x-profile-id'];
        if (!profileId) {
            res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
            return;
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const results = await favorites_service_1.FavoritesService.getProfileFavorites(profileId, page, limit);
        (0, api_response_1.ok)(res, results);
    }
    catch (err) {
        next(err);
    }
}));
exports.favoritesRouter.get('/check/:contentId', (async (req, res, next) => {
    try {
        const profileId = req.headers['x-profile-id'];
        const { contentId } = req.params;
        if (!profileId) {
            res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
            return;
        }
        const favorite = await favorites_service_1.FavoritesService.checkFavorite(profileId, contentId);
        (0, api_response_1.ok)(res, { isFavorited: favorite });
    }
    catch (err) {
        next(err);
    }
}));
// Batch check – resolves N favorites in ONE DB query instead of N individual requests
exports.favoritesRouter.post('/batch-check', (async (req, res, next) => {
    try {
        const profileId = req.headers['x-profile-id'];
        if (!profileId) {
            res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
            return;
        }
        const { contentIds } = req.body;
        if (!Array.isArray(contentIds) || contentIds.length === 0) {
            (0, api_response_1.ok)(res, {});
            return;
        }
        const result = await favorites_service_1.FavoritesService.batchCheckFavorites(profileId, contentIds);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
exports.favoritesRouter.post('/toggle', (async (req, res, next) => {
    try {
        const profileId = req.headers['x-profile-id'];
        if (!profileId) {
            res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
            return;
        }
        const { contentId } = req.body;
        if (!contentId) {
            res.status(400).json({ success: false, error: 'contentId is required' });
            return;
        }
        const result = await favorites_service_1.FavoritesService.toggleFavorite(profileId, contentId);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
exports.favoritesRouter.post('/sync', (async (req, res, next) => {
    try {
        const profileId = req.headers['x-profile-id'];
        if (!profileId) {
            res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
            return;
        }
        const { contentIds } = req.body;
        if (!Array.isArray(contentIds)) {
            res.status(400).json({ success: false, error: 'contentIds must be an array' });
            return;
        }
        const result = await favorites_service_1.FavoritesService.syncFavorites(profileId, contentIds);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=favorites.router.js.map