import { Router, RequestHandler, Response, NextFunction } from 'express';
import { authenticate, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok, created } from '../../shared/utils/api-response';
import { prisma } from '../../shared/config/prisma';
import { z } from 'zod';

export const profilesRouter = Router();

const CreateProfileSchema = z.object({
  name: z.string().min(1).max(50),
  avatar: z.string().url().optional(),
  isKids: z.boolean().default(false),
  pin: z.string().length(4).optional(),
  language: z.string().default('es'),
});

const UpdateProfileSchema = CreateProfileSchema.partial();

// All profile endpoints require authentication
profilesRouter.use(authenticate as RequestHandler);

profilesRouter.get('/', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const profiles = await prisma.profile.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'asc' },
    });
    ok(res, profiles);
  } catch (err) { next(err); }
}) as RequestHandler);

profilesRouter.post('/', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const input = CreateProfileSchema.parse(req.body);

    // Max 5 profiles per user
    const count = await prisma.profile.count({ where: { userId: req.user!.id } });
    if (count >= 5) {
      res.status(400).json({ success: false, error: 'Maximum 5 profiles per account' });
      return;
    }

    const profile = await prisma.profile.create({
      data: { ...input, userId: req.user!.id },
    });
    created(res, profile);
  } catch (err) { next(err); }
}) as RequestHandler);

profilesRouter.put('/:id', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const input = UpdateProfileSchema.parse(req.body);
    const profile = await prisma.profile.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: input,
    });
    if (profile.count === 0) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }
    const updated = await prisma.profile.findUnique({ where: { id: req.params.id } });
    ok(res, updated);
  } catch (err) { next(err); }
}) as RequestHandler);

profilesRouter.delete('/:id', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await prisma.profile.deleteMany({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (result.count === 0) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }
    ok(res, { deleted: true });
  } catch (err) { next(err); }
}) as RequestHandler);

profilesRouter.post('/:id/verify-pin', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { pin } = req.body;
    const profile = await prisma.profile.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }
    if (!profile.pin) {
      ok(res, { valid: true });
      return;
    }
    ok(res, { valid: profile.pin === pin });
  } catch (err) { next(err); }
}) as RequestHandler);
