import { Router, RequestHandler, Request } from 'express';
import { StreamingService } from './streaming.service';
import { authenticate, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';

export const streamingRouter = Router();

// ─── Request streaming access (signed URL) ───────────────────────────────────
streamingRouter.post('/request-access', authenticate as RequestHandler, (async (req: AuthenticatedRequest, res, next) => {
  try {
    const { contentId, episodeId } = req.body;
    if (!contentId) {
      res.status(400).json({ success: false, error: 'contentId is required' });
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';
    const access = await StreamingService.requestAccess(req.user!.id, req.user!.role, contentId, ip, episodeId);
    ok(res, access);
  } catch (err: any) {
    if (err.message.includes('No video stream') || err.message.includes('not found')) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    next(err);
  }
}) as RequestHandler);

// ─── Serve HLS segments (token-validated) ────────────────────────────────────
// Supports both ?token=XXX and /hls/:videoFileId/:token/* path formats for mobile compatibility
streamingRouter.get('/hls/:videoFileId/*', (async (req: Request, res, next) => {
  try {
    const videoFileId = req.params.videoFileId;
    let filePath = req.params[0]; // Everything after videoFileId/
    let token = req.query.token as string;

    // Mobile path-token support: /hls/videoFileId/TOKEN/playlist.m3u8
    // ExoPlayer resolves relative inner-playlist URLs against the base URL.
    // If the base URL is /TOKEN/master.m3u8, the inner URL becomes /TOKEN/1080p.m3u8?token=TOKEN
    // We must ALWAYS strip the token from the path if it's present!
    if (filePath.includes('/')) {
      const parts = filePath.split('/');
      // Tokens are usually long strings (HMACs or JWTs)
      if (parts[0].length > 20) { 
        const pathToken = parts.shift()!;
        if (!token) token = pathToken;
        filePath = parts.join('/');
      }
    }

    if (!token) {
      res.status(401).send('Missing access token');
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';
    const audioIndex = req.query.audioIndex ? parseInt(req.query.audioIndex as string, 10) : null;

    const result = await StreamingService.serveSegment(videoFileId, filePath, token, ip, audioIndex);
    if (result.stream) {
      res.writeHead(result.status, result.headers);
      result.stream.pipe(res);
    } else {
      res.status(result.status).end();
    }
  } catch (err) { next(err); }
}) as RequestHandler);

// ─── Direct stream fallback (dev mode, byte-range) ──────────────────────────
streamingRouter.get('/play', ((req: Request, res, next) => {
  try {
    const videoPath = req.query.path as string;
    if (!videoPath) {
      res.status(400).send('Missing video path');
      return;
    }

    const range = req.headers.range;
    const result = StreamingService.streamDirect(videoPath, range);
    if (result.stream) {
      res.writeHead(result.status, result.headers);
      result.stream.pipe(res);
    } else {
      res.status(result.status).end();
    }
  } catch (err) { next(err); }
}) as RequestHandler);
