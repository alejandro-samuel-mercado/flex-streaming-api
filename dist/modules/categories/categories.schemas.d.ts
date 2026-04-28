import { z } from 'zod';
export declare const GenreSchema: z.ZodObject<{
    name: z.ZodString;
    slug: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    slug: string;
}, {
    name: string;
    slug: string;
}>;
export declare const AgeRatingSchema: z.ZodObject<{
    code: z.ZodString;
    label: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    label: string;
}, {
    code: string;
    label: string;
}>;
export declare const TagSchema: z.ZodObject<{
    name: z.ZodString;
    slug: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    slug: string;
}, {
    name: string;
    slug: string;
}>;
//# sourceMappingURL=categories.schemas.d.ts.map