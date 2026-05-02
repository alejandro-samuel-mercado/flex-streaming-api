"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plansRouter = void 0;
const express_1 = require("express");
const plans_service_1 = require("./plans.service");
exports.plansRouter = (0, express_1.Router)();
// GET /api/plans — Public: returns active plans
exports.plansRouter.get('/', (async (_req, res, next) => {
    try {
        const plans = await plans_service_1.PlansService.getActivePlans();
        res.json({ success: true, data: plans });
    }
    catch (error) {
        next(error);
    }
}));
//# sourceMappingURL=plans.router.js.map