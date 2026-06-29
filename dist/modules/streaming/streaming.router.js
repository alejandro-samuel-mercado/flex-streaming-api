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
        const { contentId, episodeId } = req.body;
        if (!contentId) {
            res.status(400).json({ success: false, error: 'contentId is required' });
            return;
        }
        const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';
        const access = await streaming_service_1.StreamingService.requestAccess(req.user.id, contentId, ip, episodeId);
        (0, api_response_1.ok)(res, access);
    }
    catch (err) {
        if (err.message.includes('No video stream') || err.message.includes('not found')) {
            res.status(400).json({ success: false, error: err.message });
            return;
        }
        next(err);
    }
}));
// ─── Serve HLS segments (token-validated) ────────────────────────────────────
// Supports both ?token=XXX and /hls/:videoFileId/:token/* path formats for mobile compatibility
exports.streamingRouter.get('/hls/:videoFileId/*', (async (req, res, next) => {
    try {
        const videoFileId = req.params.videoFileId;
        let filePath = req.params[0]; // Everything after videoFileId/
        let token = req.query.token;
        // Mobile path-token support: /hls/videoFileId/TOKEN/playlist.m3u8
        // ExoPlayer resolves relative inner-playlist URLs against the base URL.
        // If the base URL is /TOKEN/master.m3u8, the inner URL becomes /TOKEN/1080p.m3u8?token=TOKEN
        // We must ALWAYS strip the token from the path if it's present!
        if (filePath.includes('/')) {
            const parts = filePath.split('/');
            // Tokens are usually long strings (HMACs or JWTs)
            if (parts[0].length > 20) {
                const pathToken = parts.shift();
                if (!token)
                    token = pathToken;
                filePath = parts.join('/');
            }
        }
        if (!token) {
            res.status(401).send('Missing access token');
            return;
        }
        const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';
        const audioIndex = req.query.audioIndex ? parseInt(req.query.audioIndex, 10) : null;
        const result = await streaming_service_1.StreamingService.serveSegment(videoFileId, filePath, token, ip, audioIndex);
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