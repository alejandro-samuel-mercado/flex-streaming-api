import { z } from 'zod';

export const ActorSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  photoUrl: z.string().url('Invalid URL format').optional().nullable(),
  birthDate: z.string().datetime().optional().nullable(),
  nationality: z.string().optional().nullable(),
  biography: z.string().optional().nullable(),
  tmdbId: z.string().optional().nullable(),
});

export const DirectorSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  photoUrl: z.string().url('Invalid URL format').optional().nullable(),
  birthDate: z.string().datetime().optional().nullable(),
  nationality: z.string().optional().nullable(),
  biography: z.string().optional().nullable(),
  tmdbId: z.string().optional().nullable(),
});
