"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformsRouter = void 0;
const express_1 = require("express");
const platforms_service_1 = require("./platforms.service");
exports.platformsRouter = (0, express_1.Router)();
exports.platformsRouter.get('/', async (_req, res, next) => {
    try {
        const platforms = await platforms_service_1.PlatformsService.getAll();
        res.json({ success: true, data: platforms });
    }
    catch (error) {
        next(error);
    }
});
exports.platformsRouter.get('/:slug', async (req, res, next) => {
    try {
        const platform = await platforms_service_1.PlatformsService.getBySlug(req.params.slug);
        if (!platform) {
            res.status(404).json({ success: false, error: 'Platform not found' });
            return;
        }
        res.json({ success: true, data: platform });
    }
    catch (error) {
        next(error);
    }
});
exports.platformsRouter.post('/', async (req, res, next) => {
    try {
        const { name, slug, logoUrl } = req.body;
        const platform = await platforms_service_1.PlatformsService.create({ name, slug, logoUrl });
        res.status(201).json({ success: true, data: platform });
    }
    catch (error) {
        next(error);
    }
});
//# sourceMappingURL=platforms.router.js.map