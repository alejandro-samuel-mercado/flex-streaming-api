"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamingRouter = void 0;
const express_1 = require("express");
const streaming_service_1 = require("./streaming.service");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
exports.streamingRouter = (0, express_1.Router)();
// ─── Request streaming access (signed URL) ───────────────────────────────────
exports.streamingRouter.post('/request-access', auth_middleware_1.authenticate, (async (req, res, next) => {
    try {
        const { contentId, episodeId: _episodeId } = req.body;
        if (!contentId) {
            res.status(400).json({ success: false, error: 'contentId is required' });
            return;
        }
        const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';
        const access = await streaming_service_1.StreamingService.requestAccess(req.user.id, contentId, ip);
        (0, api_response_1.ok)(res, access);
    }
    catch (err) {
        next(err);
    }
}));
// ─── Serve HLS segments (token-validated) ────────────────────────────────────
exports.streamingRouter.get('/hls/:videoFileId/*', ((req, res, next) => {
    try {
        const token = req.query.token;
        if (!token) {
            res.status(401).send('Missing access token');
            return;
        }
        const videoFileId = req.params.videoFileId;
        const filePath = req.params[0]; // Everything after videoFileId/
        const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';
        const result = streaming_service_1.StreamingService.serveSegment(videoFileId, filePath, token, ip);
        if (result.stream) {
            res.writeHead(result.status, result.headers);
            result.stream.pipe(res);
        }
        else {
            res.status(result.status).end();
        }
    }
    catch (err) {
        next(err);
    }
}));
// ─── Direct stream fallback (dev mode, byte-range) ──────────────────────────
exports.streamingRouter.get('/play', ((req, res, next) => {
    try {
        const videoPath = req.query.path;
        if (!videoPath) {
            res.status(400).send('Missing video path');
            return;
        }
        const range = req.headers.range;
        const result = streaming_service_1.StreamingService.streamDirect(videoPath, range);
        if (result.stream) {
            res.writeHead(result.status, result.headers);
            result.stream.pipe(res);
        }
        else {
            res.status(result.status).end();
        }
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=streaming.router.js.map