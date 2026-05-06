import { Router, RequestHandler, Request } from 'express';
import { StreamingService } from './streaming.service';
import { authenticate, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';

export const streamingRouter = Router();

// ─── Request streaming access (signed URL) ───────────────────────────────────
streamingRouter.post('/request-access', authenticate as RequestHandler, (async (req: AuthenticatedRequest, res, next) => {
  try {
    const { contentId, episodeId: _episodeId } = req.body;
    if (!contentId) {
      res.status(400).json({ success: false, error: 'contentId is required' });
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';
    const access = await StreamingService.requestAccess(req.user!.id, contentId, ip);
    ok(res, access);
  } catch (err) { next(err); }
}) as RequestHandler);

// ─── Serve HLS segments (token-validated) ────────────────────────────────────
streamingRouter.get('/hls/:videoFileId/*', (async (req: Request, res, next) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(401).send('Missing access token');
      return;
    }

    const videoFileId = req.params.videoFileId;
    const filePath = req.params[0]; // Everything after videoFileId/
    const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';

    const result = await StreamingService.serveSegment(videoFileId, filePath, token, ip);
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
