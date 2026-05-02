"use strict";
/**
 * Subscription Plans Router — PeliPlus Reseller System
 *
 * Routes: CRUD for subscription plans (credit-based).
 * GET / is accessible to any authenticated user (for plan selection).
 * All mutations require ADMIN role.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionPlansRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
const subscription_plans_service_1 = require("./subscription-plans.service");
exports.subscriptionPlansRouter = (0, express_1.Router)();
const auth = auth_middleware_1.authenticate;
const adminOnly = (0, auth_middleware_1.requireRole)('ADMIN');
const CreatePlanSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    description: zod_1.z.string().optional(),
    durationDays: zod_1.z.number().int().min(0),
    creditCost: zod_1.z.number().int().min(0),
    isDemo: zod_1.z.boolean().default(false),
    demoHours: zod_1.z.number().int().min(1).optional().nullable(),
    isPromo: zod_1.z.boolean().default(false),
    bonusDays: zod_1.z.number().int().min(0).default(0),
    maxDevices: zod_1.z.number().int().min(1).default(1),
    sortOrder: zod_1.z.number().int().default(0),
});
const UpdatePlanSchema = CreatePlanSchema.partial();
// GET /api/subscription-plans — Active plans (for plan selectors)
exports.subscriptionPlansRouter.get('/', auth, (async (_req, res, next) => {
    try {
        const plans = await subscription_plans_service_1.SubscriptionPlansService.getActivePlans();
        (0, api_response_1.ok)(res, plans);
    }
    catch (err) {
        next(err);
    }
}));
// GET /api/subscription-plans/all — All plans including inactive (ADMIN only)
exports.subscriptionPlansRouter.get('/all', auth, adminOnly, (async (_req, res, next) => {
    try {
        const plans = await subscription_plans_service_1.SubscriptionPlansService.getAllPlans();
        (0, api_response_1.ok)(res, plans);
    }
    catch (err) {
        next(err);
    }
}));
// POST /api/subscription-plans — Create plan (ADMIN only)
exports.subscriptionPlansRouter.post('/', auth, adminOnly, (async (req, res, next) => {
    try {
        const data = CreatePlanSchema.parse(req.body);
        const plan = await subscription_plans_service_1.SubscriptionPlansService.create(data);
        (0, api_response_1.created)(res, plan);
    }
    catch (err) {
        next(err);
    }
}));
// PATCH /api/subscription-plans/:id — Update plan (ADMIN only)
exports.subscriptionPlansRouter.patch('/:id', auth, adminOnly, (async (req, res, next) => {
    try {
        const data = UpdatePlanSchema.parse(req.body);
        const plan = await subscription_plans_service_1.SubscriptionPlansService.update(req.params.id, data);
        (0, api_response_1.ok)(res, plan);
    }
    catch (err) {
        next(err);
    }
}));
// PATCH /api/subscription-plans/:id/toggle — Toggle active status (ADMIN only)
exports.subscriptionPlansRouter.patch('/:id/toggle', auth, adminOnly, (async (req, res, next) => {
    try {
        const plan = await subscription_plans_service_1.SubscriptionPlansService.toggle(req.params.id);
        (0, api_response_1.ok)(res, plan);
    }
    catch (err) {
        next(err);
    }
}));
// DELETE /api/subscription-plans/:id — Delete plan (ADMIN only, no active accounts)
exports.subscriptionPlansRouter.delete('/:id', auth, adminOnly, (async (req, res, next) => {
    try {
        await subscription_plans_service_1.SubscriptionPlansService.remove(req.params.id);
        (0, api_response_1.ok)(res, { message: 'Plan deleted successfully' });
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=subscription-plans.router.js.map