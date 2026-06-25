import { Router, RequestHandler, Response, NextFunction } from 'express';
import { authenticate, requireRole, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';
import { prisma } from '../../shared/config/prisma';
import { videoQueue, addVideoJob } from '../../services/queue.service';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { ResellerService } from '../reseller/reseller.service';


export const adminRouter = Router();

// All admin routes require ADMIN or SUPER_VENDOR role
adminRouter.use(authenticate as RequestHandler);
adminRouter.use(requireRole('ADMIN', 'SUPER_VENDOR') as RequestHandler);



// ─── Dashboard KPIs ──────────────────────────────────────────────────────────

adminRouter.get('/dashboard', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const [
            totalUsers,
            totalContent,
            activeMembers,
            totalViews,
            recentContent,
            processingVideos,
            topContent,
            recentActivity
        ] = await Promise.all([
            prisma.user.count({ where: { deletedAt: null } }),
            prisma.videoFile.count({ where: { status: 'COMPLETED' } }), // Cuenta los videos/capítulos subidos y procesados
            prisma.userMembership.count({ where: { isActive: true } }),
            prisma.content.aggregate({ _sum: { viewCount: true } }),
            prisma.content.findMany({
                where: { deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { id: true, slug: true, type: true, status: true, createdAt: true },
            }),
            prisma.videoFile.count({ where: { status: { in: ['PENDING', 'QUEUED', 'PROCESSING'] } } }),
            prisma.content.findMany({
                where: { deletedAt: null },
                orderBy: { viewCount: 'desc' },
                take: 5,
                select: { id: true, type: true, viewCount: true, rating: true, translations: { select: { title: true }, take: 1 } },
            }),
            prisma.videoFile.findMany({
                orderBy: { updatedAt: 'desc' },
                take: 5,
                select: {
                    id: true,
                    type: true,
                    status: true,
                    updatedAt: true,
                    content: { select: { slug: true, translations: { select: { title: true }, take: 1 } } },
                    episode: { include: { season: { include: { content: { select: { slug: true, translations: { select: { title: true }, take: 1 } } } } } } }
                }
            })
        ]);

        // Map recentActivity into a generic notification / activity shape
        const activityLogs = recentActivity.map(v => {
            let name = 'Archivo de video';
            const content = v.content || (v as any).episode?.season?.content;
            if (content) {
                const title = content.translations?.[0]?.title || content.slug;
                name = `${title} (${v.type})`;
                if ((v as any).episode) {
                    name = `${title} - T${(v as any).episode.season.number}E${(v as any).episode.number}`;
                }
            }
            return {
                name,
                status: v.status,
                time: v.updatedAt.toISOString(),
                type: 'VIDEO_PROCESSING'
            };
        });

        ok(res, {
            kpis: {
                totalUsers,
                totalContent,
                activeMembers,
                totalViews: totalViews._sum.viewCount?.toString() || '0',
                processingVideos,
            },
            recentContent,
            topContent: topContent.map(c => ({
                title: c.translations?.[0]?.title || 'Sin Título',
                type: c.type,
                views: c.viewCount,
                rating: c.rating
            })),
            activity: activityLogs
        });
    } catch (err) { next(err); }
}) as RequestHandler);

// ─── Users Management ────────────────────────────────────────────────────────

adminRouter.get('/users', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {


    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const role = req.query.role as string | undefined;
        const search = req.query.search as string | undefined;

        const where: any = { deletedAt: null };

        if (role === 'END_USER') {
            const endUserWhere: any = { deletedAt: null };
            
            if (search) {
                endUserWhere.OR = [
                    { username: { contains: search, mode: 'insensitive' } },
                    { managedBy: { username: { contains: search, mode: 'insensitive' } } },
                    { managedBy: { name: { contains: search, mode: 'insensitive' } } }
                ];
            }

            const [users, total] = await Promise.all([
                prisma.endUserAccount.findMany({
                    where: endUserWhere,
                    skip: (page - 1) * limit,
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        plan: true,
                        managedBy: { 
                            select: { 
                                id: true, 
                                name: true, 
                                username: true,
                                phone: true,
                                parent: {
                                    select: {
                                        id: true,
                                        name: true,
                                        username: true
                                    }
                                }
                            } 
                        },
                        _count: { select: { connectedDevices: true } },
                        connectedDevices: true,
                    },
                }),
                prisma.endUserAccount.count({ where: endUserWhere }),
            ]);
            return ok(res, { users, total, page, limit });
        }

        if (role === 'VENDOR') {
            where.role = 'SUPER_VENDOR';
        } else if (role) {
            where.role = role;
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, phone: true, username: true, name: true, role: true, isActive: true, createdAt: true, credits: true,
                    _count: { select: { profiles: true, memberships: true, children: true, managedEndUsers: true } },
                },
            }),
            prisma.user.count({ where }),
        ]);

        return ok(res, { users, total, page, limit });
    } catch (err) { next(err); }
}) as RequestHandler);

adminRouter.post('/users', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {


    try {
        const schema = z.object({
            name: z.string().min(2),
            username: z.string().min(3).max(50),
            phone: z.string(),
            password: z.string().min(6),
            role: z.enum(['ADMIN', 'VENDOR', 'SUPER_VENDOR', 'MEMBER', 'REGISTERED']),
        });

        const { name, username, phone, password, role } = schema.parse(req.body);

        const existing = await prisma.user.findUnique({ where: { phone } });
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: { name, username, phone, passwordHash, role },
            select: { id: true, phone: true, username: true, name: true, role: true, isActive: true },
        });

        return ok(res, user);
    } catch (err) { next(err); }
}) as RequestHandler);

adminRouter.put('/users/:id', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {


    try {
        const schema = z.object({
            name: z.string().min(2).optional(),
            username: z.string().min(3).max(50).optional(),
            phone: z.string().optional(),
            password: z.string().min(6).optional(),
            role: z.enum(['ADMIN', 'VENDOR', 'SUPER_VENDOR', 'MEMBER', 'REGISTERED']).optional(),
            isActive: z.boolean().optional(),
        });

        const { name, username, phone, password, role, isActive } = schema.parse(req.body);
        const data: any = {};

        if (name) data.name = name;
        if (username) data.username = username;
        if (phone) data.phone = phone;
        if (role) data.role = role;
        if (isActive !== undefined) data.isActive = isActive;
        if (password) {
            data.passwordHash = await bcrypt.hash(password, 12);
        }

        const user = await prisma.user.update({
            where: { id: req.params.id },
            data,
            select: { id: true, phone: true, username: true, name: true, role: true, isActive: true },
        });

        return ok(res, user);
    } catch (err) { next(err); }
}) as RequestHandler);

adminRouter.delete('/users/:id', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {


    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (id === req.user?.id) {
            return res.status(400).json({ success: false, error: 'No puedes eliminar tu propia cuenta' });
        }

        const userToDelete = await prisma.user.findUnique({ where: { id } });
        if (!userToDelete) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        if (userToDelete.role === 'ADMIN') {
            await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
        } else {
            await ResellerService.deleteVendor(id, req.user!.id, req.user!.role);
        }

        return ok(res, { success: true });
    } catch (err) { next(err); }
}) as RequestHandler);


// ─── Site Config ─────────────────────────────────────────────────────────────

adminRouter.get('/settings', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const configs = await prisma.siteConfig.findMany();
        const settings = Object.fromEntries(configs.map((c) => [c.key, c.value]));
        ok(res, settings);
    } catch (err) { next(err); }
}) as RequestHandler);

adminRouter.put('/settings', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const entries = Object.entries(req.body as Record<string, string>);
        await Promise.all(
            entries.map(([key, value]) =>
                prisma.siteConfig.upsert({
                    where: { key },
                    update: { value },
                    create: { key, value },
                })
            )
        );

        // Invalidate homepage cache when settings change
        const { invalidateCache } = await import('../../shared/middleware/cache.middleware');
        await invalidateCache('*homepage*');

        ok(res, { updated: entries.length });
    } catch (err) { next(err); }
}) as RequestHandler);

// ─── Video Processing Status ─────────────────────────────────────────────────

adminRouter.get('/videos/status', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        // ─── Fetch All Active/Pending (No limit) + History (50 last) ───
        const [activeVideos, historyVideos, totalCompleted, totalFailed, totalProcessing, totalQueued] = await Promise.all([
            prisma.videoFile.findMany({
                where: { status: { in: ['PROCESSING', 'PENDING', 'QUEUED'] } },
                orderBy: { createdAt: 'desc' },
                take: 100,
                include: {
                    content: { select: { id: true, slug: true, translations: { select: { title: true }, take: 1 } } },
                    episode: { include: { season: { include: { content: { select: { id: true, slug: true, translations: { select: { title: true }, take: 1 } } } } } } },
                    qualities: { select: { resolution: true } },
                },
            }),
            prisma.videoFile.findMany({
                where: { status: { in: ['COMPLETED', 'FAILED'] } },
                orderBy: { updatedAt: 'desc' },
                take: 100, 
                include: {
                    content: { select: { id: true, slug: true, translations: { select: { title: true }, take: 1 } } },
                    episode: { include: { season: { include: { content: { select: { id: true, slug: true, translations: { select: { title: true }, take: 1 } } } } } } },
                    qualities: { select: { resolution: true } },
                },
            }),
            prisma.videoFile.count({ where: { status: 'COMPLETED' } }),
            prisma.videoFile.count({ where: { status: 'FAILED' } }),
            prisma.videoFile.count({ where: { status: 'PROCESSING' } }),
            prisma.videoFile.count({ where: { status: { in: ['PENDING', 'QUEUED'] } } })
        ]);

        const videos = [...activeVideos, ...historyVideos];
        const stats = {
            totalCompleted,
            totalFailed,
            totalProcessing,
            totalQueued
        };

        // ─── Fetch real-time progress from BullMQ for active jobs ───
        const videosWithProgress = await Promise.all(videos.map(async (v: any) => {
            const resVideo = { ...v };
            if (!resVideo.content && resVideo.episode?.season?.content) {
                resVideo.content = resVideo.episode.season.content;
            }

            if (v.status === 'PROCESSING' && v.processingJobId) {
                try {
                    const job = await videoQueue.getJob(v.processingJobId);
                    if (job) {
                        // Job is active — use real-time BullMQ progress
                        return { ...resVideo, progress: job.progress };
                    } else {
                        // Job not found in BullMQ (e.g. in delayed state during worker routing).
                        // Keep the video visible with last known progress from DB.
                        return { ...resVideo, progress: resVideo.progress ?? 0 };
                    }
                } catch (e) {
                    console.warn(`[AdminRouter] Could not fetch progress for job ${v.processingJobId}`);
                    return { ...resVideo, progress: resVideo.progress ?? 0 };
                }
            }
            return resVideo;
        }));

        ok(res, { videos: videosWithProgress, stats });
    } catch (err) { next(err); }
}) as RequestHandler);

// --- Retry failed or stuck pending jobs ---
adminRouter.post('/videos/retry-failed', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const toRetry = await prisma.videoFile.findMany({ 
            where: { 
                status: 'FAILED',
                OR: [
                    { errorMessage: null },
                    { errorMessage: { not: { startsWith: 'Archivo corrompido' } } }
                ]
            } 
        });
        
        let count = 0;
        for (const v of toRetry) {
            // Eliminar chequeo fs.existsSync porque Cerebro no tiene los discos de 64TB montados.
            // Si el archivo no existe, el worker remoto (Debian o Ubuntu) fallará por su cuenta.
            const job = await addVideoJob({
                videoFileId: v.id,
                contentId: v.contentId || '',
                type: v.type,
                episodeId: v.episodeId || undefined,
                videoPath: v.originalPath,
            });

            await prisma.videoFile.update({
                where: { id: v.id },
                data: { 
                    status: 'QUEUED', 
                    errorMessage: null, 
                    processingJobId: job.id 
                }
            });
            count++;
        }
        ok(res, { message: `Reenviados ${count} videos a la cola de procesamiento.` });
    } catch (err) { next(err); }
}) as RequestHandler);

adminRouter.get('/videos/job/:id/logs', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { getJobLogs } = await import('../../services/queue.service');
        const logs = await getJobLogs(id);
        ok(res, logs);
    } catch (err) { next(err); }
}) as RequestHandler);
// ─── Watch History ─────────────────────────────────────────────────────────────

adminRouter.get('/history', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const search = req.query.search as string | undefined;

        // Dynamically import HistoryService to avoid circular dependencies
        const { HistoryService } = await import('../history/history.service');
        const results = await HistoryService.getGlobalHistory(page, limit, search);

        ok(res, results);
    } catch (err) { next(err); }
}) as RequestHandler);

// ─── Comments & Reviews Moderation ───────────────────────────────────────────

adminRouter.get('/reviews', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const status = req.query.status as string | undefined;

        const where: any = {};
        if (status) where.status = status;

        const [reviews, total] = await Promise.all([
            prisma.review.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    profile: { select: { id: true, name: true } },
                    content: { select: { id: true, slug: true, type: true } },
                },
            }),
            prisma.review.count({ where }),
        ]);

        ok(res, { reviews, total, page, limit });
    } catch (err) { next(err); }
}) as RequestHandler);

adminRouter.put('/reviews/:id/status', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        const review = await prisma.review.update({
            where: { id: req.params.id },
            data: { status },
        });

        // Re-calculate average if status changes to/from APPROVED
        if (!review.parentId) {
            const avg = await prisma.review.aggregate({
                where: { contentId: review.contentId, isHidden: false, status: 'APPROVED', rating: { not: null } },
                _avg: { rating: true },
                _count: true,
            });
            await prisma.content.update({
                where: { id: review.contentId },
                data: { rating: avg._avg.rating || 0, reviewCount: avg._count },
            });
        }

        ok(res, review);
    } catch (err) { next(err); }
}) as RequestHandler);

adminRouter.delete('/reviews/:id', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const review = await prisma.review.findUnique({ where: { id: req.params.id } });
        if (!review) { res.status(404).json({ success: false, error: 'Review not found' }); return; }

        await prisma.review.delete({ where: { id: req.params.id } });

        if (!review.parentId) {
            const avg = await prisma.review.aggregate({
                where: { contentId: review.contentId, isHidden: false, status: 'APPROVED', rating: { not: null } },
                _avg: { rating: true },
                _count: true,
            });
            await prisma.content.update({
                where: { id: review.contentId },
                data: { rating: avg._avg.rating || 0, reviewCount: avg._count },
            });
        }

        ok(res, { deleted: true });
    } catch (err) { next(err); }
}) as RequestHandler);
