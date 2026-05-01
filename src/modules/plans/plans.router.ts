import { Router, RequestHandler } from 'express';
import { PlansService } from './plans.service';

export const plansRouter = Router();

// GET /api/plans — Public: returns active plans
plansRouter.get('/', (async (_req, res, next) => {
  try {
    const plans = await PlansService.getActivePlans();
    res.json({ success: true, data: plans });
  } catch (error) { next(error); }
}) as RequestHandler);
