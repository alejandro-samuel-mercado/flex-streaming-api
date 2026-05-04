import { z } from 'zod';
const schema = z.object({ featured: z.preprocess(v => v === undefined ? undefined : v === 'true', z.boolean().optional()) });
console.log(schema.parse({ featured: 'true' }));
console.log(schema.parse({ featured: 'false' }));
console.log(schema.parse({}));
