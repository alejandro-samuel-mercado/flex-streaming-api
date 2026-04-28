"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyRouter = void 0;
const express_1 = require("express");
const history_service_1 = require("./history.service");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
exports.historyRouter = (0, express_1.Router)();
exports.historyRouter.use(auth_middleware_1.authenticate);
exports.historyRouter.get('/', (async (req, res, next) => {
    try {
        const profileId = req.headers['x-profile-id'];
        if (!profileId) {
            res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
            return;
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const results = await history_service_1.HistoryService.getProfileHistory(profileId, page, limit);
        (0, api_response_1.ok)(res, results);
    }
    catch (err) {
        next(err);
    }
}));
exports.historyRouter.get('/continue', (async (req, res, next) => {
    try {
        const profileId = req.headers['x-profile-id'];
        if (!profileId) {
            res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
            return;
        }
        const results = await history_service_1.HistoryService.getContinueWatching(profileId);
        (0, api_response_1.ok)(res, results);
    }
    catch (err) {
        next(err);
    }
}));
exports.historyRouter.post('/progress', (async (req, res, next) => {
    try {
        const profileId = req.headers['x-profile-id'];
        if (!profileId) {
            res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
            return;
        }
        const { contentId, progress, duration, episodeId } = req.body;
        if (!contentId || progress === undefined) {
            res.status(400).json({ success: false, error: 'contentId and progress are required' });
            return;
        }
        const result = await history_service_1.HistoryService.updateWatchProgress(profileId, contentId, progress, duration, episodeId);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=history.router.js.map