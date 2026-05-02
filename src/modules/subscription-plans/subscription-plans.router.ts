/**
 * Subscription Plans Router — PeliPlus Reseller System
 *
 * Routes: CRUD for subscription plans (credit-based).
 * GET / is accessible to any authenticated user (for plan selection).
 * All mutations require ADMIN role.
 */

import { Router, RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../shared/middleware/auth.middleware';
import { ok, created } from '../../shared/utils/api-response';
import { SubscriptionPlansService } from './subscription-plans.service';

export const subscriptionPlansRouter = Router();

const auth = authenticate as RequestHandler;
const adminOnly = requireRole('ADMIN') as RequestHandler;

const CreatePlanSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  durationDays: z.number().int().min(0),
  creditCost: z.number().int().min(0),
  isDemo: z.boolean().default(false),
  demoHours: z.number().int().min(1).optional().nullable(),
  isPromo: z.boolean().default(false),
  bonusDays: z.number().int().min(0).default(0),
  maxDevices: z.number().int().min(1).default(1),
  sortOrder: z.number().int().default(0),
});

const UpdatePlanSchema = CreatePlanSchema.partial();

// GET /api/subscription-plans — Active plans (for plan selectors)
subscriptionPlansRouter.get('/', auth, (async (_req, res, next) => {
  try {
    const plans = await SubscriptionPlansService.getActivePlans();
    ok(res, plans);
  } catch (err) { next(err); }
}) as RequestHandler);

// GET /api/subscription-plans/all — All plans including inactive (ADMIN only)
subscriptionPlansRouter.get('/all', auth, adminOnly, (async (_req, res, next) => {
  try {
    const plans = await SubscriptionPlansService.getAllPlans();
    ok(res, plans);
  } catch (err) { next(err); }
}) as RequestHandler);

// POST /api/subscription-plans — Create plan (ADMIN only)
subscriptionPlansRouter.post('/', auth, adminOnly, (async (req, res, next) => {
  try {
    const data = CreatePlanSchema.parse(req.body);
    const plan = await SubscriptionPlansService.create(data);
    created(res, plan);
  } catch (err) { next(err); }
}) as RequestHandler);

// PATCH /api/subscription-plans/:id — Update plan (ADMIN only)
subscriptionPlansRouter.patch('/:id', auth, adminOnly, (async (req, res, next) => {
  try {
    const data = UpdatePlanSchema.parse(req.body);
    const plan = await SubscriptionPlansService.update(req.params.id, data);
    ok(res, plan);
  } catch (err) { next(err); }
}) as RequestHandler);

// PATCH /api/subscription-plans/:id/toggle — Toggle active status (ADMIN only)
subscriptionPlansRouter.patch('/:id/toggle', auth, adminOnly, (async (req, res, next) => {
  try {
    const plan = await SubscriptionPlansService.toggle(req.params.id);
    ok(res, plan);
  } catch (err) { next(err); }
}) as RequestHandler);

// DELETE /api/subscription-plans/:id — Delete plan (ADMIN only, no active accounts)
subscriptionPlansRouter.delete('/:id', auth, adminOnly, (async (req, res, next) => {
  try {
    await SubscriptionPlansService.remove(req.params.id);
    ok(res, { message: 'Plan deleted successfully' });
  } catch (err) { next(err); }
}) as RequestHandler);
