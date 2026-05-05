/**
 * Reseller Router — PeliPlus Reseller System
 *
 * Routes: create super vendors, create vendors, list/manage hierarchy, assign credits.
 * Super vendor creation: ADMIN only.
 * Vendor creation: ADMIN or SUPER_VENDOR.
 */

import { Router, RequestHandler } from 'express';
import { z } from 'zod';
import {
  authenticate,
  requireRole,
  requireSuperVendorOrAbove,
  AuthenticatedRequest,
} from '../../shared/middleware/auth.middleware';
import { ok, created } from '../../shared/utils/api-response';
import { ResellerService } from './reseller.service';

export const resellerRouter = Router();

const auth = authenticate as RequestHandler;
const adminOnly = requireRole('ADMIN') as RequestHandler;
const superVendorPlus = requireSuperVendorOrAbove as RequestHandler;

const CreateVendorSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(6),
  credits: z.number().int().min(0).optional(),
});

const AssignCreditsSchema = z.object({
  amount: z.number().int().min(1),
});

// POST /api/reseller/vendors/super — Create Super Vendor (ADMIN only)
resellerRouter.post('/vendors/super', auth, adminOnly, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = CreateVendorSchema.parse(req.body);
    const vendor = await ResellerService.createSuperVendor(authReq.user!.id, data);
    created(res, vendor);
  } catch (err) { next(err); }
}) as RequestHandler);

// POST /api/reseller/vendors/regular — Create Vendor (ADMIN or SUPER_VENDOR)
resellerRouter.post('/vendors/regular', auth, superVendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = CreateVendorSchema.parse(req.body);
    const vendor = await ResellerService.createVendor(authReq.user!.id, authReq.user!.role, data);
    created(res, vendor);
  } catch (err) { next(err); }
}) as RequestHandler);

// GET /api/reseller/vendors — List vendors under my hierarchy
resellerRouter.get('/vendors', auth, superVendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const vendors = await ResellerService.listVendors(authReq.user!.id, authReq.user!.role);
    ok(res, vendors);
  } catch (err) { next(err); }
}) as RequestHandler);

// GET /api/reseller/vendors/:id — Get vendor detail
resellerRouter.get('/vendors/:id', auth, superVendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const vendor = await ResellerService.getVendorDetail(req.params.id, authReq.user!.id, authReq.user!.role);
    ok(res, vendor);
  } catch (err) { next(err); }
}) as RequestHandler);

// PATCH /api/reseller/vendors/:id/status — Activate/deactivate vendor
resellerRouter.patch('/vendors/:id/status', auth, superVendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const vendor = await ResellerService.updateVendorStatus(req.params.id, authReq.user!.id, authReq.user!.role, isActive);
    ok(res, vendor);
  } catch (err) { next(err); }
}) as RequestHandler);

// DELETE /api/reseller/vendors/:id — Delete vendor (ADMIN or SUPER_VENDOR)
resellerRouter.delete('/vendors/:id', auth, superVendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    await ResellerService.deleteVendor(req.params.id, authReq.user!.id, authReq.user!.role);
    ok(res, { message: 'Vendor deleted successfully' });
  } catch (err) { next(err); }
}) as RequestHandler);

// POST /api/reseller/vendors/:id/credits — Assign credits to a vendor
resellerRouter.post('/vendors/:id/credits', auth, superVendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { amount } = AssignCreditsSchema.parse(req.body);
    const result = await ResellerService.assignCredits(
      authReq.user!.id,
      authReq.user!.role,
      req.params.id,
      amount,
    );
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);

// GET /api/reseller/vendors/:id/credits/history — Credit history of a vendor
resellerRouter.get('/vendors/:id/credits/history', auth, superVendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await ResellerService.getCreditHistory(req.params.id, authReq.user!.id, authReq.user!.role, page, limit);
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);
// POST /api/reseller/vendors/:id/plan — Assign subscription plan to a vendor
resellerRouter.post('/vendors/:id/plan', auth, superVendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { planId } = z.object({ planId: z.string() }).parse(req.body);
    const result = await ResellerService.assignPlanToVendor(
      req.params.id,
      authReq.user!.id,
      authReq.user!.role,
      planId,
    );
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);
