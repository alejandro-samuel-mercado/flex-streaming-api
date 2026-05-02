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
exports.adminRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
const prisma_1 = require("../../shared/config/prisma");
exports.adminRouter = (0, express_1.Router)();
// All admin routes require ADMIN role
exports.adminRouter.use(auth_middleware_1.authenticate);
exports.adminRouter.use((0, auth_middleware_1.requireRole)('ADMIN'));
// ─── Dashboard KPIs ──────────────────────────────────────────────────────────
exports.adminRouter.get('/dashboard', (async (_req, res, next) => {
    try {
        const [totalUsers, totalContent, activeMembers, totalViews, recentContent, processingVideos,] = await Promise.all([
            prisma_1.prisma.user.count({ where: { deletedAt: null } }),
            prisma_1.prisma.content.count({ where: { deletedAt: null } }),
            prisma_1.prisma.userMembership.count({ where: { isActive: true } }),
            prisma_1.prisma.content.aggregate({ _sum: { viewCount: true } }),
            prisma_1.prisma.content.findMany({
                where: { deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { id: true, slug: true, type: true, status: true, createdAt: true },
            }),
            prisma_1.prisma.videoFile.count({ where: { status: { in: ['PENDING', 'QUEUED', 'PROCESSING'] } } }),
        ]);
        (0, api_response_1.ok)(res, {
            kpis: {
                totalUsers,
                totalContent,
                activeMembers,
                totalViews: totalViews._sum.viewCount?.toString() || '0',
                processingVideos,
            },
            recentContent,
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
        const where = { deletedAt: null };
        if (role)
            where.role = role;
        const [users, total] = await Promise.all([
            prisma_1.prisma.user.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, email: true, name: true, role: true, isActive: true, createdAt: true,
                    _count: { select: { profiles: true, memberships: true } },
                },
            }),
            prisma_1.prisma.user.count({ where }),
        ]);
        (0, api_response_1.ok)(res, { users, total, page, limit });
    }
    catch (err) {
        next(err);
    }
}));
exports.adminRouter.put('/users/:id', (async (req, res, next) => {
    try {
        const { role, isActive } = req.body;
        const user = await prisma_1.prisma.user.update({
            where: { id: req.params.id },
            data: { ...(role ? { role } : {}), ...(isActive !== undefined ? { isActive } : {}) },
        });
        (0, api_response_1.ok)(res, user);
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
        const videos = await prisma_1.prisma.videoFile.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: {
                content: { select: { id: true, slug: true } },
                qualities: { select: { resolution: true } },
            },
        });
        (0, api_response_1.ok)(res, videos);
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