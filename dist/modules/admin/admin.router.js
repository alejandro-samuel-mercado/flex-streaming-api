"use strict";
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
//# sourceMappingURL=admin.router.js.map