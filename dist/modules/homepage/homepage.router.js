"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.homepageRouter = void 0;
const express_1 = require("express");
const homepage_service_1 = require("./homepage.service");
const cache_middleware_1 = require("../../shared/middleware/cache.middleware");
exports.homepageRouter = (0, express_1.Router)();
// GET /api/homepage — Public: aggregated homepage data
exports.homepageRouter.get('/', (0, cache_middleware_1.cacheMiddleware)('homepage'), (async (_req, res, next) => {
    try {
        const data = await homepage_service_1.HomepageService.getHomepageData();
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
}));
//# sourceMappingURL=homepage.router.js.map