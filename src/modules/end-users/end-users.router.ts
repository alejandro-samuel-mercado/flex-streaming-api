/**
 * End Users Router — PeliPlus Reseller System
 *
 * Routes: CRUD for end-user accounts, plan management, device control, history.
 * All routes require VENDOR or above (ADMIN, SUPER_VENDOR, VENDOR).
 */

import { Router, RequestHandler } from 'express';
import { z } from 'zod';
import {
  authenticate,
  requireVendorOrAbove,
  AuthenticatedRequest,
} from '../../shared/middleware/auth.middleware';
import { ok, created } from '../../shared/utils/api-response';
import { EndUsersService } from './end-users.service';

export const endUsersRouter = Router();

const auth = authenticate as RequestHandler;
const vendorPlus = requireVendorOrAbove as RequestHandler;

const CreateEndUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(4).max(50),
  country: z.string().optional(),
  notes: z.string().optional(),
});

const ChangePasswordSchema = z.object({
  password: z.string().min(4).max(50),
});

const AddPlanSchema = z.object({
  planId: z.string().min(1),
});

// GET /api/end-users — List my end users (paginated + search)
endUsersRouter.get('/', auth, vendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const result = await EndUsersService.list(authReq.user!.id, authReq.user!.role, {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
      type: req.query.type as string | undefined,
    });
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);

// POST /api/end-users — Create end user account
endUsersRouter.post('/', auth, vendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = CreateEndUserSchema.parse(req.body);
    const account = await EndUsersService.create(authReq.user!.id, data);
    created(res, account);
  } catch (err) { next(err); }
}) as RequestHandler);

// GET /api/end-users/:id — Get end user detail
endUsersRouter.get('/:id', auth, vendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const account = await EndUsersService.getById(req.params.id, authReq.user!.id, authReq.user!.role);
    ok(res, account);
  } catch (err) { next(err); }
}) as RequestHandler);

// PATCH /api/end-users/:id/password — Change password
endUsersRouter.patch('/:id/password', auth, vendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { password } = ChangePasswordSchema.parse(req.body);
    const result = await EndUsersService.changePassword(req.params.id, authReq.user!.id, authReq.user!.role, password);
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);

// DELETE /api/end-users/:id — Delete end user account (soft delete)
endUsersRouter.delete('/:id', auth, vendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const forceDelete = req.query.force === 'true';
    await EndUsersService.deleteAccount(req.params.id, authReq.user!.id, authReq.user!.role, forceDelete);
    ok(res, { message: 'Account deleted successfully' });
  } catch (err) { next(err); }
}) as RequestHandler);

// POST /api/end-users/:id/plan — Add/accumulate plan
endUsersRouter.post('/:id/plan', auth, vendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { planId } = AddPlanSchema.parse(req.body);
    const result = await EndUsersService.addPlan(req.params.id, authReq.user!.id, authReq.user!.role, planId);
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);

// POST /api/end-users/:id/pause — Toggle pause/resume
endUsersRouter.post('/:id/pause', auth, vendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const result = await EndUsersService.togglePause(req.params.id, authReq.user!.id, authReq.user!.role);
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);

// GET /api/end-users/:id/devices — List connected devices
endUsersRouter.get('/:id/devices', auth, vendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const devices = await EndUsersService.listDevices(req.params.id, authReq.user!.id, authReq.user!.role);
    ok(res, devices);
  } catch (err) { next(err); }
}) as RequestHandler);

// DELETE /api/end-users/:id/devices — Disconnect ALL devices
endUsersRouter.delete('/:id/devices', auth, vendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const result = await EndUsersService.disconnectAllDevices(req.params.id, authReq.user!.id, authReq.user!.role);
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);

// DELETE /api/end-users/:id/devices/:deviceId — Disconnect ONE device
endUsersRouter.delete('/:id/devices/:deviceId', auth, vendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const result = await EndUsersService.disconnectDevice(
      req.params.id, req.params.deviceId, authReq.user!.id, authReq.user!.role
    );
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);

// GET /api/end-users/:id/history — Plan history
endUsersRouter.get('/:id/history', auth, vendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const history = await EndUsersService.getPlanHistory(req.params.id, authReq.user!.id, authReq.user!.role);
    ok(res, history);
  } catch (err) { next(err); }
}) as RequestHandler);
