"use strict";
/**
 * Credit Packages Router — PeliPlus Reseller System
 *
 * Routes: CRUD for credit packages + applyPackage endpoint.
 * Mutations require ADMIN. Apply requires ADMIN or SUPER_VENDOR.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.creditPackagesRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
const credit_packages_service_1 = require("./credit-packages.service");
exports.creditPackagesRouter = (0, express_1.Router)();
const auth = auth_middleware_1.authenticate;
const adminOnly = (0, auth_middleware_1.requireRole)('ADMIN');
const superVendorPlus = auth_middleware_1.requireSuperVendorOrAbove;
const CreatePackageSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    baseCredits: zod_1.z.number().int().min(1),
    bonusCredits: zod_1.z.number().int().min(0).default(0),
    isPromo: zod_1.z.boolean().default(false),
    sortOrder: zod_1.z.number().int().default(0),
});
const UpdatePackageSchema = CreatePackageSchema.partial();
const ApplyPackageSchema = zod_1.z.object({
    targetUserId: zod_1.z.string().min(1),
});
// GET /api/credit-packages — Active packages
exports.creditPackagesRouter.get('/', auth, (async (_req, res, next) => {
    try {
        const packages = await credit_packages_service_1.CreditPackagesService.getActivePackages();
        (0, api_response_1.ok)(res, packages);
    }
    catch (err) {
        next(err);
    }
}));
// GET /api/credit-packages/all — All packages (ADMIN only)
exports.creditPackagesRouter.get('/all', auth, adminOnly, (async (_req, res, next) => {
    try {
        const packages = await credit_packages_service_1.CreditPackagesService.getAllPackages();
        (0, api_response_1.ok)(res, packages);
    }
    catch (err) {
        next(err);
    }
}));
// POST /api/credit-packages — Create package (ADMIN only)
exports.creditPackagesRouter.post('/', auth, adminOnly, (async (req, res, next) => {
    try {
        const data = CreatePackageSchema.parse(req.body);
        const pkg = await credit_packages_service_1.CreditPackagesService.create(data);
        (0, api_response_1.created)(res, pkg);
    }
    catch (err) {
        next(err);
    }
}));
// PATCH /api/credit-packages/:id — Update package (ADMIN only)
exports.creditPackagesRouter.patch('/:id', auth, adminOnly, (async (req, res, next) => {
    try {
        const data = UpdatePackageSchema.parse(req.body);
        const pkg = await credit_packages_service_1.CreditPackagesService.update(req.params.id, data);
        (0, api_response_1.ok)(res, pkg);
    }
    catch (err) {
        next(err);
    }
}));
// PATCH /api/credit-packages/:id/toggle — Toggle active (ADMIN only)
exports.creditPackagesRouter.patch('/:id/toggle', auth, adminOnly, (async (req, res, next) => {
    try {
        const pkg = await credit_packages_service_1.CreditPackagesService.toggle(req.params.id);
        (0, api_response_1.ok)(res, pkg);
    }
    catch (err) {
        next(err);
    }
}));
// DELETE /api/credit-packages/:id — Delete package (ADMIN only)
exports.creditPackagesRouter.delete('/:id', auth, adminOnly, (async (req, res, next) => {
    try {
        await credit_packages_service_1.CreditPackagesService.remove(req.params.id);
        (0, api_response_1.ok)(res, { message: 'Package deleted successfully' });
    }
    catch (err) {
        next(err);
    }
}));
// POST /api/credit-packages/:id/apply — Apply package to a reseller
exports.creditPackagesRouter.post('/:id/apply', auth, superVendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const { targetUserId } = ApplyPackageSchema.parse(req.body);
        const result = await credit_packages_service_1.CreditPackagesService.applyPackage(req.params.id, authReq.user.id, authReq.user.role, targetUserId);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=credit-packages.router.js.map