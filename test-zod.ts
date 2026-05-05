import { z } from 'zod';
const ContentFiltersSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(1000).default(50), 
});
console.log(ContentFiltersSchema.parse({ limit: 500 }));
