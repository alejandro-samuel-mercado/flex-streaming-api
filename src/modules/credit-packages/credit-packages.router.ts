/**
 * Credit Packages Router — PeliPlus Reseller System
 *
 * Routes: CRUD for credit packages + applyPackage endpoint.
 * Mutations require ADMIN. Apply requires ADMIN or SUPER_VENDOR.
 */

import { Router, RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireSuperVendorOrAbove, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok, created } from '../../shared/utils/api-response';
import { CreditPackagesService } from './credit-packages.service';

export const creditPackagesRouter = Router();

const auth = authenticate as RequestHandler;
const adminOnly = requireRole('ADMIN') as RequestHandler;
const superVendorPlus = requireSuperVendorOrAbove as RequestHandler;

const CreatePackageSchema = z.object({
  name: z.string().min(1).max(100),
  baseCredits: z.number().int().min(1),
  bonusCredits: z.number().int().min(0).default(0),
  isPromo: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const UpdatePackageSchema = CreatePackageSchema.partial();

const ApplyPackageSchema = z.object({
  targetUserId: z.string().min(1),
});

// GET /api/credit-packages — Active packages
creditPackagesRouter.get('/', auth, (async (_req, res, next) => {
  try {
    const packages = await CreditPackagesService.getActivePackages();
    ok(res, packages);
  } catch (err) { next(err); }
}) as RequestHandler);

// GET /api/credit-packages/all — All packages (ADMIN only)
creditPackagesRouter.get('/all', auth, adminOnly, (async (_req, res, next) => {
  try {
    const packages = await CreditPackagesService.getAllPackages();
    ok(res, packages);
  } catch (err) { next(err); }
}) as RequestHandler);

// POST /api/credit-packages — Create package (ADMIN only)
creditPackagesRouter.post('/', auth, adminOnly, (async (req, res, next) => {
  try {
    const data = CreatePackageSchema.parse(req.body);
    const pkg = await CreditPackagesService.create(data);
    created(res, pkg);
  } catch (err) { next(err); }
}) as RequestHandler);

// PATCH /api/credit-packages/:id — Update package (ADMIN only)
creditPackagesRouter.patch('/:id', auth, adminOnly, (async (req, res, next) => {
  try {
    const data = UpdatePackageSchema.parse(req.body);
    const pkg = await CreditPackagesService.update(req.params.id, data);
    ok(res, pkg);
  } catch (err) { next(err); }
}) as RequestHandler);

// PATCH /api/credit-packages/:id/toggle — Toggle active (ADMIN only)
creditPackagesRouter.patch('/:id/toggle', auth, adminOnly, (async (req, res, next) => {
  try {
    const pkg = await CreditPackagesService.toggle(req.params.id);
    ok(res, pkg);
  } catch (err) { next(err); }
}) as RequestHandler);

// DELETE /api/credit-packages/:id — Delete package (ADMIN only)
creditPackagesRouter.delete('/:id', auth, adminOnly, (async (req, res, next) => {
  try {
    await CreditPackagesService.remove(req.params.id);
    ok(res, { message: 'Package deleted successfully' });
  } catch (err) { next(err); }
}) as RequestHandler);

// POST /api/credit-packages/:id/apply — Apply package to a reseller
creditPackagesRouter.post('/:id/apply', auth, superVendorPlus, (async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { targetUserId } = ApplyPackageSchema.parse(req.body);
    const result = await CreditPackagesService.applyPackage(req.params.id, authReq.user!.id, authReq.user!.role, targetUserId);
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);
