import { Router, RequestHandler } from 'express';
import { authenticate, requireRole, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { prisma } from '../../shared/config/prisma';
import { TMDBService } from '../../services/tmdb.service';
import { ok } from '../../shared/utils/api-response';

export const requestsRouter = Router();

// ==========================================
// RUTAS PÚBLICAS/USUARIOS (Requieren Autenticación)
// ==========================================
requestsRouter.use(authenticate as RequestHandler);

// Buscar en TMDB
requestsRouter.get('/tmdb-search', (async (req, res, next) => {
  try {
    const q = req.query.q as string;
    if (!q) {
       res.status(400).json({ success: false, error: 'Query is required' });
       return;
    }
    const movies = await TMDBService.searchWithFallback(q, 'es-ES', 'movie');
    const series = await TMDBService.searchWithFallback(q, 'es-ES', 'tv');
    
    const results: any[] = [];
    if (movies.results && movies.results.length > 0) {
       movies.results.forEach(m => {
          results.push({
            tmdbId: String(m.id),
            title: m.title || m.name,
            poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
            type: 'movie'
          });
       });
    }
    if (series.results && series.results.length > 0) {
       series.results.forEach(s => {
          results.push({
            tmdbId: String(s.id),
            title: s.name || s.title,
            poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
            type: 'tv'
          });
       });
    }
    
    ok(res, results);
  } catch (err) { next(err); }
}) as RequestHandler);

// Buscar en DB interna (para reportes)
requestsRouter.get('/db-search', (async (req, res, next) => {
  try {
    const q = req.query.q as string;
    if (!q) {
       res.status(400).json({ success: false, error: 'Query is required' });
       return;
    }
    const contents = await prisma.content.findMany({
      where: {
         title: { contains: q, mode: 'insensitive' },
      },
      select: {
         id: true,
         title: true,
         type: true,
         thumbnails: {
           where: { type: 'POSTER' }
         }
      },
      take: 50
    });
    
    const results = contents.map(c => ({
       id: c.id,
       title: c.title,
       type: c.type,
       poster: c.thumbnails[0]?.url || null
    }));
    ok(res, results);
  } catch (err) { next(err); }
}) as RequestHandler);

// Crear Solicitud o Reporte
requestsRouter.post('/', (async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { type, message, tmdbId, tmdbTitle, tmdbType, tmdbPoster, contentId } = req.body;
    
    if (!['REQUEST', 'REPORT'].includes(type)) {
       res.status(400).json({ success: false, error: 'Invalid request type' });
       return;
    }
    
    const request = await prisma.contentRequest.create({
       data: {
          userId,
          type,
          message,
          tmdbId,
          tmdbTitle,
          tmdbType,
          tmdbPoster,
          contentId
       }
    });
    
    ok(res, request);
  } catch (err) { next(err); }
}) as RequestHandler);

// ==========================================
// RUTAS ADMIN
// ==========================================
const adminRouter = Router();
adminRouter.use(requireRole('ADMIN') as RequestHandler);

adminRouter.get('/', (async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    
    const [total, requests] = await Promise.all([
      prisma.contentRequest.count(),
      prisma.contentRequest.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, username: true } },
          content: { select: { title: true } }
        }
      })
    ]);
    
    ok(res, { requests, total, page, limit });
  } catch(err) { next(err); }
}) as RequestHandler);

adminRouter.patch('/:id/status', (async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['PENDING', 'REVIEWED', 'RESOLVED', 'REJECTED'].includes(status)) {
       res.status(400).json({ success: false, error: 'Invalid status' });
       return;
    }
    
    const request = await prisma.contentRequest.update({
      where: { id },
      data: { status }
    });
    
    ok(res, request);
  } catch(err) { next(err); }
}) as RequestHandler);

requestsRouter.use('/admin', adminRouter);
