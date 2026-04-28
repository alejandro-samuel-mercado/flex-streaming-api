import { z } from 'zod';

export const GenreSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  slug: z.string().min(2, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Invalid slug format'),
});

export const AgeRatingSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  label: z.string().min(2, 'Label is required'),
});

export const TagSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  slug: z.string().min(2, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Invalid slug format'),
});
