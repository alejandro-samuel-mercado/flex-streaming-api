"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewsRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
const prisma_1 = require("../../shared/config/prisma");
const zod_1 = require("zod");
exports.reviewsRouter = (0, express_1.Router)();
const CreateReviewSchema = zod_1.z.object({
    contentId: zod_1.z.string(),
    rating: zod_1.z.number().min(1).max(10).nullable().optional(),
    title: zod_1.z.string().optional(),
    body: zod_1.z.string().optional(),
    language: zod_1.z.string().default('es'),
    parentId: zod_1.z.string().optional()
});
// Get reviews for a content item (public)
exports.reviewsRouter.get('/content/:contentId', (async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const reviews = await prisma_1.prisma.review.findMany({
            where: { contentId: req.params.contentId, isHidden: false, status: 'APPROVED', parentId: null },
            include: {
                profile: { select: { id: true, name: true, avatar: true } },
                replies: {
                    where: { isHidden: false, status: 'APPROVED' },
                    include: { profile: { select: { id: true, name: true, avatar: true } } },
                    orderBy: { createdAt: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        });
        (0, api_response_1.ok)(res, reviews);
    }
    catch (err) {
        next(err);
    }
}));
// Create/update a review (requires auth + profileId header)
exports.reviewsRouter.post('/', auth_middleware_1.authenticate, (async (req, res, next) => {
    try {
        const profileId = req.headers['x-profile-id'];
        if (!profileId) {
            res.status(400).json({ success: false, error: 'X-Profile-Id header required' });
            return;
        }
        const input = CreateReviewSchema.parse(req.body);
        const parentId = input.parentId || null;
        const config = await prisma_1.prisma.siteConfig.findUnique({ where: { key: 'COMMENTS_REQUIRE_MODERATION' } });
        const requireModeration = config?.value === 'true';
        const status = requireModeration ? 'PENDING' : 'APPROVED';
        let review;
        if (parentId === null) {
            const existing = await prisma_1.prisma.review.findFirst({
                where: { profileId, contentId: input.contentId, parentId: null }
            });
            if (existing) {
                review = await prisma_1.prisma.review.update({
                    where: { id: existing.id },
                    data: { rating: input.rating, title: input.title, body: input.body, status }
                });
            }
            else {
                review = await prisma_1.prisma.review.create({
                    data: { profileId, status, ...input, parentId: null }
                });
            }
        }
        else {
            review = await prisma_1.prisma.review.create({
                data: { profileId, status, ...input, parentId }
            });
        }
        // Update content average rating only for top-level reviews with rating
        if (!parentId && input.rating) {
            const avg = await prisma_1.prisma.review.aggregate({
                where: { contentId: input.contentId, isHidden: false, status: 'APPROVED', rating: { not: null } },
                _avg: { rating: true },
                _count: true,
            });
            await prisma_1.prisma.content.update({
                where: { id: input.contentId },
                data: { rating: avg._avg.rating || 0, reviewCount: avg._count },
            });
        }
        (0, api_response_1.created)(res, review);
    }
    catch (err) {
        if (err.code === 'P2003') {
            res.status(400).json({ success: false, error: 'El perfil seleccionado no es válido o ha sido eliminado.' });
            return;
        }
        next(err);
    }
}));
// Delete own review
exports.reviewsRouter.delete('/:id', auth_middleware_1.authenticate, (async (req, res, next) => {
    try {
        const profileId = req.headers['x-profile-id'];
        const result = await prisma_1.prisma.review.deleteMany({
            where: { id: req.params.id, profileId },
        });
        if (result.count === 0) {
            res.status(404).json({ success: false, error: 'Review not found' });
            return;
        }
        (0, api_response_1.ok)(res, { deleted: true });
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=reviews.router.js.map