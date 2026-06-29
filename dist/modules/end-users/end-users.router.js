"use strict";
/**
 * End Users Router — PeliPlus Reseller System
 *
 * Routes: CRUD for end-user accounts, plan management, device control, history.
 * All routes require VENDOR or above (ADMIN, SUPER_VENDOR, VENDOR).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.endUsersRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
const end_users_service_1 = require("./end-users.service");
exports.endUsersRouter = (0, express_1.Router)();
const auth = auth_middleware_1.authenticate;
const vendorPlus = auth_middleware_1.requireVendorOrAbove;
const CreateEndUserSchema = zod_1.z.object({
    username: zod_1.z.string().min(3).max(50),
    password: zod_1.z.string().min(4).max(50),
    country: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
    planId: zod_1.z.string().optional(),
});
const ChangePasswordSchema = zod_1.z.object({
    password: zod_1.z.string().min(4).max(50),
});
const AddPlanSchema = zod_1.z.object({
    planId: zod_1.z.string().min(1),
});
// GET /api/end-users — List my end users (paginated + search)
exports.endUsersRouter.get('/', auth, vendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const result = await end_users_service_1.EndUsersService.list(authReq.user.id, authReq.user.role, {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 20,
            search: req.query.search,
            status: req.query.status,
            type: req.query.type,
            expiringInDays: req.query.expiringInDays ? parseInt(req.query.expiringInDays) : undefined,
            managedByMeOnly: req.query.managedByMeOnly === 'true',
            managedByOthersOnly: req.query.managedByOthersOnly === 'true',
        });
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
// POST /api/end-users — Create end user account (optionally with plan)
exports.endUsersRouter.post('/', auth, vendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const data = CreateEndUserSchema.parse(req.body);
        const account = await end_users_service_1.EndUsersService.create(authReq.user.id, authReq.user.role, data);
        (0, api_response_1.created)(res, account);
    }
    catch (err) {
        next(err);
    }
}));
// GET /api/end-users/:id — Get end user detail
exports.endUsersRouter.get('/:id', auth, vendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const account = await end_users_service_1.EndUsersService.getById(req.params.id, authReq.user.id, authReq.user.role);
        (0, api_response_1.ok)(res, account);
    }
    catch (err) {
        next(err);
    }
}));
// PATCH /api/end-users/:id/password — Change password
exports.endUsersRouter.patch('/:id/password', auth, vendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const { password } = ChangePasswordSchema.parse(req.body);
        const result = await end_users_service_1.EndUsersService.changePassword(req.params.id, authReq.user.id, authReq.user.role, password);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
// DELETE /api/end-users/:id — Delete end user account (soft delete)
exports.endUsersRouter.delete('/:id', auth, vendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        await end_users_service_1.EndUsersService.deleteAccount(req.params.id, authReq.user.id, authReq.user.role);
        (0, api_response_1.ok)(res, { message: 'Account deleted successfully' });
    }
    catch (err) {
        next(err);
    }
}));
// POST /api/end-users/:id/plan — Add/accumulate plan
exports.endUsersRouter.post('/:id/plan', auth, vendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const { planId } = AddPlanSchema.parse(req.body);
        const result = await end_users_service_1.EndUsersService.addPlan(req.params.id, authReq.user.id, authReq.user.role, planId);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
// POST /api/end-users/:id/pause — Toggle pause/resume
exports.endUsersRouter.post('/:id/pause', auth, vendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const result = await end_users_service_1.EndUsersService.togglePause(req.params.id, authReq.user.id, authReq.user.role);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
// GET /api/end-users/:id/devices — List connected devices
exports.endUsersRouter.get('/:id/devices', auth, vendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const devices = await end_users_service_1.EndUsersService.listDevices(req.params.id, authReq.user.id, authReq.user.role);
        (0, api_response_1.ok)(res, devices);
    }
    catch (err) {
        next(err);
    }
}));
// DELETE /api/end-users/:id/devices — Disconnect ALL devices
exports.endUsersRouter.delete('/:id/devices', auth, vendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const result = await end_users_service_1.EndUsersService.disconnectAllDevices(req.params.id, authReq.user.id, authReq.user.role);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
// DELETE /api/end-users/:id/devices/:deviceId — Disconnect ONE device
exports.endUsersRouter.delete('/:id/devices/:deviceId', auth, vendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const result = await end_users_service_1.EndUsersService.disconnectDevice(req.params.id, req.params.deviceId, authReq.user.id, authReq.user.role);
        (0, api_response_1.ok)(res, result);
    }
    catch (err) {
        next(err);
    }
}));
// GET /api/end-users/:id/history — Plan history
exports.endUsersRouter.get('/:id/history', auth, vendorPlus, (async (req, res, next) => {
    try {
        const authReq = req;
        const history = await end_users_service_1.EndUsersService.getPlanHistory(req.params.id, authReq.user.id, authReq.user.role);
        (0, api_response_1.ok)(res, history);
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=end-users.router.js.map