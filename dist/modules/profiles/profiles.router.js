"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profilesRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
const prisma_1 = require("../../shared/config/prisma");
const zod_1 = require("zod");
exports.profilesRouter = (0, express_1.Router)();
const CreateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(50),
    avatar: zod_1.z.string().url().optional(),
    isKids: zod_1.z.boolean().default(false),
    pin: zod_1.z.string().length(4).optional(),
    language: zod_1.z.string().default('es'),
});
const UpdateProfileSchema = CreateProfileSchema.partial();
// All profile endpoints require authentication
exports.profilesRouter.use(auth_middleware_1.authenticate);
exports.profilesRouter.get('/', (async (req, res, next) => {
    try {
        const profiles = await prisma_1.prisma.profile.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'asc' },
        });
        (0, api_response_1.ok)(res, profiles);
    }
    catch (err) {
        next(err);
    }
}));
exports.profilesRouter.post('/', (async (req, res, next) => {
    try {
        const input = CreateProfileSchema.parse(req.body);
        // Max 5 profiles per user
        const count = await prisma_1.prisma.profile.count({ where: { userId: req.user.id } });
        if (count >= 5) {
            res.status(400).json({ success: false, error: 'Maximum 5 profiles per account' });
            return;
        }
        const profile = await prisma_1.prisma.profile.create({
            data: { ...input, userId: req.user.id },
        });
        (0, api_response_1.created)(res, profile);
    }
    catch (err) {
        next(err);
    }
}));
exports.profilesRouter.put('/:id', (async (req, res, next) => {
    try {
        const input = UpdateProfileSchema.parse(req.body);
        const profile = await prisma_1.prisma.profile.updateMany({
            where: { id: req.params.id, userId: req.user.id },
            data: input,
        });
        if (profile.count === 0) {
            res.status(404).json({ success: false, error: 'Profile not found' });
            return;
        }
        const updated = await prisma_1.prisma.profile.findUnique({ where: { id: req.params.id } });
        (0, api_response_1.ok)(res, updated);
    }
    catch (err) {
        next(err);
    }
}));
exports.profilesRouter.delete('/:id', (async (req, res, next) => {
    try {
        const result = await prisma_1.prisma.profile.deleteMany({
            where: { id: req.params.id, userId: req.user.id },
        });
        if (result.count === 0) {
            res.status(404).json({ success: false, error: 'Profile not found' });
            return;
        }
        (0, api_response_1.ok)(res, { deleted: true });
    }
    catch (err) {
        next(err);
    }
}));
exports.profilesRouter.post('/:id/verify-pin', (async (req, res, next) => {
    try {
        const { pin } = req.body;
        const profile = await prisma_1.prisma.profile.findFirst({
            where: { id: req.params.id, userId: req.user.id },
        });
        if (!profile) {
            res.status(404).json({ success: false, error: 'Profile not found' });
            return;
        }
        if (!profile.pin) {
            (0, api_response_1.ok)(res, { valid: true });
            return;
        }
        (0, api_response_1.ok)(res, { valid: profile.pin === pin });
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=profiles.router.js.map