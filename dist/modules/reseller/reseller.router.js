"use strict";
/**
 * Reseller Router — PeliPlus Reseller System
 *
 * Routes: create super vendors, create vendors, list/manage hierarchy, assign credits.
 * Super vendor creation: ADMIN only.
 * Vendor creation: ADMIN or SUPER_VENDOR.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resellerRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
const reseller_service_1 = require("./reseller.service");
exports.resellerRouter = (0, express_1.Router)();
const auth = auth_middleware_1.authenticate;
const adminOnly = (0, auth_middleware_1.requireRole)('ADMIN');
const superVendorPlus = auth_middleware_1.requireSuperVendorOrAbove;
const CreateVendorSchema = zod_1.z.object({
    phone: zod_1.z.string().min(8),
    username: zod_1.z.string().min(3).max(50),
    name: zod_1.z.string().min(1).max(100),
    password: zod_1.z.string().min(6),
    credits: zod_1.z.number().int().min(0).optional(),
});
const AssignCreditsSchema = zod_1.z.object({
    amount: zod_1.z.number().int().min(1),
});
// POST /api/reseller/vendors/super — Create Super Vendor (ADMIN only)
exports.resellerRouter.post('/vendors/super', auth, adminOnly, (async (req, res, next) => {
    try {
        const authReq = req;
        const data = CreateVendorSchema.parse(req.body);
        const vendor = await reseller_service_1.ResellerService.createSuperVendor(authReq.user.id, data);
        (0, api_response_1.created)(res, vendor);
    }
    catch (err) {
        next(err);
    }
}));
// POST /api/reseller/vendors/regular — Create Vendor (ADMIN or SUPER_VENDOR)
exports.resellerRouter.post('/vendors/regular', auth, superVendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const data = CreateVendorSchema.parse(req.body);
        const vendor = await reseller_service_1.ResellerService.createVendor(authReq.user.id, authReq.user.role, data);
        (0, api_response_1.created)(res, vendor);
    }
    catch (err) {
        next(err);
    }
}));
// GET /api/reseller/vendors — List vendors under my hierarchy
exports.resellerRouter.get('/vendors', auth, superVendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const vendors = await reseller_service_1.ResellerService.listVendors(authReq.user.id, authReq.user.role);
        (0, api_response_1.ok)(res, vendors);
    }
    catch (err) {
        next(err);
    }
}));
// GET /api/reseller/vendors/:id — Get vendor detail
exports.resellerRouter.get('/vendors/:id', auth, superVendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const vendor = await reseller_service_1.ResellerService.getVendorDetail(req.params.id, authReq.user.id, authReq.user.role);
        (0, api_response_1.ok)(res, vendor);
    }
    catch (err) {
        next(err);
    }
}));
// PATCH /api/reseller/vendors/:id/status — Activate/deactivate vendor
exports.resellerRouter.patch('/vendors/:id/status', auth, superVendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const { isActive } = zod_1.z.object({ isActive: zod_1.z.boolean() }).parse(req.body);
        const vendor = await reseller_service_1.ResellerService.updateVendorStatus(req.params.id, authReq.user.id, authReq.user.role, isActive);
        (0, api_response_1.ok)(res, vendor);
    }
    catch (err) {
        next(err);
    }
}));
// DELETE /api/reseller/vendors/:id — Delete vendor (ADMIN or SUPER_VENDOR)
exports.resellerRouter.delete('/vendors/:id', auth, superVendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        await reseller_service_1.ResellerService.deleteVendor(req.params.id, authReq.user.id, authReq.user.role);
        (0, api_response_1.ok)(res, { message: 'Vendor deleted successfully' });
    }
    catch (err) {
        next(err);
    }
}));
// POST /api/reseller/vendors/:id/credits — Assign credits to a vendor
exports.resellerRouter.post('/vendors/:id/credits', auth, superVendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const { amount } = AssignCreditsSchema.parse(req.body);
        const result = await reseller_service_1.ResellerService.assignCredits(authReq.user.id, authReq.user.role, req.params.id, amount);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
// GET /api/reseller/vendors/:id/credits/history — Credit history of a vendor
exports.resellerRouter.get('/vendors/:id/credits/history', auth, superVendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const result = await reseller_service_1.ResellerService.getCreditHistory(req.params.id, authReq.user.id, authReq.user.role, page, limit);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
// POST /api/reseller/vendors/:id/plan — Assign subscription plan to a vendor
exports.resellerRouter.post('/vendors/:id/plan', auth, superVendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const { planId } = zod_1.z.object({ planId: zod_1.z.string() }).parse(req.body);
        const result = await reseller_service_1.ResellerService.assignPlanToVendor(req.params.id, authReq.user.id, authReq.user.role, planId);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
// GET /api/reseller/transactions — Get own credit history
exports.resellerRouter.get('/transactions', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRole)('VENDOR', 'SUPER_VENDOR', 'ADMIN'), (async (req, res, next) => {
    try {
        const authReq = req;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const result = await reseller_service_1.ResellerService.getCreditHistory(authReq.user.id, authReq.user.id, authReq.user.role, page, limit);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
// PATCH /api/reseller/vendors/:id/password — Reset vendor password
exports.resellerRouter.patch('/vendors/:id/password', auth, superVendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const { password } = zod_1.z.object({ password: zod_1.z.string().min(6) }).parse(req.body);
        const result = await reseller_service_1.ResellerService.resetVendorPassword(req.params.id, authReq.user.id, authReq.user.role, password);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=reseller.router.js.map