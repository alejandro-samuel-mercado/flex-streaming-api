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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
const prisma_1 = require("../../shared/config/prisma");
const queue_service_1 = require("../../services/queue.service");
const bcrypt_1 = __importDefault(require("bcrypt"));
const zod_1 = require("zod");
const reseller_service_1 = require("../reseller/reseller.service");
exports.adminRouter = (0, express_1.Router)();
// All admin routes require ADMIN or SUPER_VENDOR role
exports.adminRouter.use(auth_middleware_1.authenticate);
exports.adminRouter.use((0, auth_middleware_1.requireRole)('ADMIN', 'SUPER_VENDOR'));
// ─── Dashboard KPIs ──────────────────────────────────────────────────────────
exports.adminRouter.get('/dashboard', (async (_req, res, next) => {
    try {
        const [totalUsers, totalContent, activeMembers, totalViews, recentContent, processingVideos, topContent, recentActivity] = await Promise.all([
            prisma_1.prisma.user.count({ where: { deletedAt: null } }),
            prisma_1.prisma.videoFile.count({ where: { status: 'COMPLETED' } }), // Cuenta los videos/capítulos subidos y procesados
            prisma_1.prisma.userMembership.count({ where: { isActive: true } }),
            prisma_1.prisma.content.aggregate({ _sum: { viewCount: true } }),
            prisma_1.prisma.content.findMany({
                where: { deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { id: true, slug: true, type: true, status: true, createdAt: true },
            }),
            prisma_1.prisma.videoFile.count({ where: { status: { in: ['PENDING', 'QUEUED', 'PROCESSING'] } } }),
            prisma_1.prisma.content.findMany({
                where: { deletedAt: null },
                orderBy: { viewCount: 'desc' },
                take: 5,
                select: { id: true, type: true, viewCount: true, rating: true, translations: { select: { title: true }, take: 1 } },
            }),
            prisma_1.prisma.videoFile.findMany({
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
            const content = v.content || v.episode?.season?.content;
            if (content) {
                const title = content.translations?.[0]?.title || content.slug;
                name = `${title} (${v.type})`;
                if (v.episode) {
                    name = `${title} - T${v.episode.season.number}E${v.episode.number}`;
                }
            }
            return {
                name,
                status: v.status,
                time: v.updatedAt.toISOString(),
                type: 'VIDEO_PROCESSING'
            };
        });
        (0, api_response_1.ok)(res, {
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
    }
    catch (err) {
        next(err);
    }
}));
// ─── Users Management ────────────────────────────────────────────────────────
exports.adminRouter.get('/users', (async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const role = req.query.role;
        const search = req.query.search;
        const where = { deletedAt: null };
        if (role === 'END_USER') {
            const showDeleted = req.query.showDeleted === 'true';
            const endUserWhere = {};
            if (showDeleted) {
                endUserWhere.deletedAt = { not: null };
            }
            else {
                endUserWhere.deletedAt = null;
            }
            if (search) {
                endUserWhere.OR = [
                    { username: { contains: search, mode: 'insensitive' } },
                    { managedBy: { username: { contains: search, mode: 'insensitive' } } },
                    { managedBy: { name: { contains: search, mode: 'insensitive' } } }
                ];
            }
            const [users, total] = await Promise.all([
                prisma_1.prisma.endUserAccount.findMany({
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
                prisma_1.prisma.endUserAccount.count({ where: endUserWhere }),
            ]);
            return (0, api_response_1.ok)(res, { users, total, page, limit });
        }
        if (role === 'VENDOR') {
            where.role = 'SUPER_VENDOR';
        }
        else if (role) {
            where.role = role;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [users, total] = await Promise.all([
            prisma_1.prisma.user.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, phone: true, username: true, name: true, role: true, isActive: true, createdAt: true, credits: true,
                    _count: { select: { profiles: true, memberships: true, children: true, managedEndUsers: true } },
                },
            }),
            prisma_1.prisma.user.count({ where }),
        ]);
        return (0, api_response_1.ok)(res, { users, total, page, limit });
    }
    catch (err) {
        next(err);
    }
}));
exports.adminRouter.post('/users', (async (req, res, next) => {
    try {
        const schema = zod_1.z.object({
            name: zod_1.z.string().min(2),
            username: zod_1.z.string().min(3).max(50),
            phone: zod_1.z.string(),
            password: zod_1.z.string().min(6),
            role: zod_1.z.enum(['ADMIN', 'VENDOR', 'SUPER_VENDOR', 'MEMBER', 'REGISTERED']),
        });
        const { name, username, phone, password, role } = schema.parse(req.body);
        const existing = await prisma_1.prisma.user.findUnique({ where: { phone } });
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }
        const passwordHash = await bcrypt_1.default.hash(password, 12);
        const user = await prisma_1.prisma.user.create({
            data: { name, username, phone, passwordHash, role },
            select: { id: true, phone: true, username: true, name: true, role: true, isActive: true },
        });
        return (0, api_response_1.ok)(res, user);
    }
    catch (err) {
        next(err);
    }
}));
exports.adminRouter.put('/users/:id', (async (req, res, next) => {
    try {
        const schema = zod_1.z.object({
            name: zod_1.z.string().min(2).optional(),
            username: zod_1.z.string().min(3).max(50).optional(),
            phone: zod_1.z.string().optional(),
            password: zod_1.z.string().min(6).optional(),
            role: zod_1.z.enum(['ADMIN', 'VENDOR', 'SUPER_VENDOR', 'MEMBER', 'REGISTERED']).optional(),
            isActive: zod_1.z.boolean().optional(),
        });
        const { name, username, phone, password, role, isActive } = schema.parse(req.body);
        const data = {};
        if (name)
            data.name = name;
        if (username)
            data.username = username;
        if (phone)
            data.phone = phone;
        if (role)
            data.role = role;
        if (isActive !== undefined)
            data.isActive = isActive;
        if (password) {
            data.passwordHash = await bcrypt_1.default.hash(password, 12);
        }
        const user = await prisma_1.prisma.user.update({
            where: { id: req.params.id },
            data,
            select: { id: true, phone: true, username: true, name: true, role: true, isActive: true },
        });
        return (0, api_response_1.ok)(res, user);
    }
    catch (err) {
        next(err);
    }
}));
exports.adminRouter.delete('/users/:id', (async (req, res, next) => {
    try {
        const { id } = req.params;
        // Prevent self-deletion
        if (id === req.user?.id) {
            return res.status(400).json({ success: false, error: 'No puedes eliminar tu propia cuenta' });
        }
        const userToDelete = await prisma_1.prisma.user.findUnique({ where: { id } });
        if (!userToDelete) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
        if (userToDelete.role === 'ADMIN') {
            await prisma_1.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
        }
        else {
            await reseller_service_1.ResellerService.deleteVendor(id, req.user.id, req.user.role);
        }
        return (0, api_response_1.ok)(res, { success: true });
    }
    catch (err) {
        next(err);
    }
}));
// ─── Site Config ─────────────────────────────────────────────────────────────
exports.adminRouter.get('/settings', (async (_req, res, next) => {
    try {
        const configs = await prisma_1.prisma.siteConfig.findMany();
        const settings = Object.fromEntries(configs.map((c) => [c.key, c.value]));
        (0, api_response_1.ok)(res, settings);
    }
    catch (err) {
        next(err);
    }
}));
exports.adminRouter.put('/settings', (async (req, res, next) => {
    try {
        const entries = Object.entries(req.body);
        await Promise.all(entries.map(([key, value]) => prisma_1.prisma.siteConfig.upsert({
            where: { key },
            update: { value },
            create: { key, value },
        })));
        // Invalidate homepage cache when settings change
        const { invalidateCache } = await Promise.resolve().then(() => __importStar(require('../../shared/middleware/cache.middleware')));
        await invalidateCache('*homepage*');
        (0, api_response_1.ok)(res, { updated: entries.length });
    }
    catch (err) {
        next(err);
    }
}));
// ─── Video Processing Status ─────────────────────────────────────────────────
exports.adminRouter.get('/videos/status', (async (_req, res, next) => {
    try {
        // ─── Fetch All Active/Pending (No limit) + History (50 last) ───
        const [activeVideos, completedVideos, failedVideos, totalCompleted, totalFailed, totalProcessing, totalQueued] = await Promise.all([
            prisma_1.prisma.videoFile.findMany({
                where: { status: { in: ['PROCESSING', 'PENDING', 'QUEUED'] } },
                orderBy: { createdAt: 'desc' },
                take: 100,
                include: {
                    content: { select: { id: true, slug: true, translations: { select: { title: true }, take: 1 } } },
                    episode: { include: { season: { include: { content: { select: { id: true, slug: true, translations: { select: { title: true }, take: 1 } } } } } } },
                    qualities: { select: { resolution: true } },
                },
            }),
            prisma_1.prisma.videoFile.findMany({
                where: { status: 'COMPLETED' },
                orderBy: { updatedAt: 'desc' },
                take: 100,
                include: {
                    content: { select: { id: true, slug: true, translations: { select: { title: true }, take: 1 } } },
                    episode: { include: { season: { include: { content: { select: { id: true, slug: true, translations: { select: { title: true }, take: 1 } } } } } } },
                    qualities: { select: { resolution: true } },
                },
            }),
            prisma_1.prisma.videoFile.findMany({
                where: { status: 'FAILED' },
                orderBy: { updatedAt: 'desc' },
                take: 100,
                include: {
                    content: { select: { id: true, slug: true, translations: { select: { title: true }, take: 1 } } },
                    episode: { include: { season: { include: { content: { select: { id: true, slug: true, translations: { select: { title: true }, take: 1 } } } } } } },
                    qualities: { select: { resolution: true } },
                },
            }),
            prisma_1.prisma.videoFile.count({ where: { status: 'COMPLETED' } }),
            prisma_1.prisma.videoFile.count({ where: { status: 'FAILED' } }),
            prisma_1.prisma.videoFile.count({ where: { status: 'PROCESSING' } }),
            prisma_1.prisma.videoFile.count({ where: { status: { in: ['PENDING', 'QUEUED'] } } })
        ]);
        const videos = [...activeVideos, ...completedVideos, ...failedVideos];
        const stats = {
            totalCompleted,
            totalFailed,
            totalProcessing,
            totalQueued
        };
        // ─── Fetch real-time progress from BullMQ for active jobs ───
        const videosWithProgress = await Promise.all(videos.map(async (v) => {
            const resVideo = { ...v };
            if (!resVideo.content && resVideo.episode?.season?.content) {
                resVideo.content = resVideo.episode.season.content;
            }
            if (v.status === 'PROCESSING' && v.processingJobId) {
                try {
                    const job = await queue_service_1.videoQueue.getJob(v.processingJobId);
                    if (job) {
                        // Job is active — use real-time BullMQ progress
                        return { ...resVideo, progress: job.progress };
                    }
                    else {
                        // Job not found in BullMQ (e.g. in delayed state during worker routing).
                        // Keep the video visible with last known progress from DB.
                        return { ...resVideo, progress: resVideo.progress ?? 0 };
                    }
                }
                catch (e) {
                    console.warn(`[AdminRouter] Could not fetch progress for job ${v.processingJobId}`);
                    return { ...resVideo, progress: resVideo.progress ?? 0 };
                }
            }
            return resVideo;
        }));
        (0, api_response_1.ok)(res, { videos: videosWithProgress, stats });
    }
    catch (err) {
        next(err);
    }
}));
// --- Rejected Imports Log ---
exports.adminRouter.get('/videos/rejected-imports', (async (_req, res, next) => {
    try {
        const rejected = await prisma_1.prisma.rejectedImport.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        (0, api_response_1.ok)(res, { data: rejected });
    }
    catch (err) {
        next(err);
    }
}));
// --- Retry failed or stuck pending jobs ---
exports.adminRouter.post('/videos/retry-failed', (async (_req, res, next) => {
    try {
        const toRetry = await prisma_1.prisma.videoFile.findMany({
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
            const job = await (0, queue_service_1.addVideoJob)({
                videoFileId: v.id,
                contentId: v.contentId || '',
                type: v.type,
                episodeId: v.episodeId || undefined,
                videoPath: v.originalPath,
            });
            await prisma_1.prisma.videoFile.update({
                where: { id: v.id },
                data: {
                    status: 'QUEUED',
                    errorMessage: null,
                    processingJobId: job.id
                }
            });
            count++;
        }
        (0, api_response_1.ok)(res, { message: `Reenviados ${count} videos a la cola de procesamiento.` });
    }
    catch (err) {
        next(err);
    }
}));
exports.adminRouter.get('/videos/job/:id/logs', (async (req, res, next) => {
    try {
        const { id } = req.params;
        const { getJobLogs } = await Promise.resolve().then(() => __importStar(require('../../services/queue.service')));
        const logs = await getJobLogs(id);
        (0, api_response_1.ok)(res, logs);
    }
    catch (err) {
        next(err);
    }
}));
// ─── Watch History ─────────────────────────────────────────────────────────────
exports.adminRouter.get('/history', (async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search;
        // Dynamically import HistoryService to avoid circular dependencies
        const { HistoryService } = await Promise.resolve().then(() => __importStar(require('../history/history.service')));
        const results = await HistoryService.getGlobalHistory(page, limit, search);
        (0, api_response_1.ok)(res, results);
    }
    catch (err) {
        next(err);
    }
}));
// ─── Comments & Reviews Moderation ───────────────────────────────────────────
exports.adminRouter.get('/reviews', (async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status;
        const where = {};
        if (status)
            where.status = status;
        const [reviews, total] = await Promise.all([
            prisma_1.prisma.review.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    profile: { select: { id: true, name: true } },
                    content: { select: { id: true, slug: true, type: true } },
                },
            }),
            prisma_1.prisma.review.count({ where }),
        ]);
        (0, api_response_1.ok)(res, { reviews, total, page, limit });
    }
    catch (err) {
        next(err);
    }
}));
exports.adminRouter.put('/reviews/:id/status', (async (req, res, next) => {
    try {
        const { status } = req.body;
        const review = await prisma_1.prisma.review.update({
            where: { id: req.params.id },
            data: { status },
        });
        // Re-calculate average if status changes to/from APPROVED
        if (!review.parentId) {
            const avg = await prisma_1.prisma.review.aggregate({
                where: { contentId: review.contentId, isHidden: false, status: 'APPROVED', rating: { not: null } },
                _avg: { rating: true },
                _count: true,
            });
            await prisma_1.prisma.content.update({
                where: { id: review.contentId },
                data: { rating: avg._avg.rating || 0, reviewCount: avg._count },
            });
        }
        (0, api_response_1.ok)(res, review);
    }
    catch (err) {
        next(err);
    }
}));
exports.adminRouter.delete('/reviews/:id', (async (req, res, next) => {
    try {
        const review = await prisma_1.prisma.review.findUnique({ where: { id: req.params.id } });
        if (!review) {
            res.status(404).json({ success: false, error: 'Review not found' });
            return;
        }
        await prisma_1.prisma.review.delete({ where: { id: req.params.id } });
        if (!review.parentId) {
            const avg = await prisma_1.prisma.review.aggregate({
                where: { contentId: review.contentId, isHidden: false, status: 'APPROVED', rating: { not: null } },
                _avg: { rating: true },
                _count: true,
            });
            await prisma_1.prisma.content.update({
                where: { id: review.contentId },
                data: { rating: avg._avg.rating || 0, reviewCount: avg._count },
            });
        }
        (0, api_response_1.ok)(res, { deleted: true });
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=admin.router.js.map