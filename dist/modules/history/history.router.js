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
exports.historyRouter.get('/:contentId', (async (req, res, next) => {
    try {
        const profileId = req.headers['x-profile-id'];
        if (!profileId) {
            res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
            return;
        }
        const episodeId = req.query.episodeId;
        const { prisma } = await Promise.resolve().then(() => __importStar(require('../../shared/config/prisma')));
        const result = await prisma.watchHistory.findUnique({
            where: {
                profileId_contentId_episodeId: {
                    profileId,
                    contentId: req.params.contentId,
                    episodeId: episodeId || '',
                }
            }
        });
        (0, api_response_1.ok)(res, result);
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