import { z } from 'zod';
export declare const ActorSchema: z.ZodObject<{
    name: z.ZodString;
    photoUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    birthDate: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    nationality: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    biography: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    tmdbId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    photoUrl?: string | null | undefined;
    birthDate?: string | null | undefined;
    nationality?: string | null | undefined;
    biography?: string | null | undefined;
    tmdbId?: string | null | undefined;
}, {
    name: string;
    photoUrl?: string | null | undefined;
    birthDate?: string | null | undefined;
    nationality?: string | null | undefined;
    biography?: string | null | undefined;
    tmdbId?: string | null | undefined;
}>;
export declare const DirectorSchema: z.ZodObject<{
    name: z.ZodString;
    photoUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    birthDate: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    nationality: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    biography: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    tmdbId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    photoUrl?: string | null | undefined;
    birthDate?: string | null | undefined;
    nationality?: string | null | undefined;
    biography?: string | null | undefined;
    tmdbId?: string | null | undefined;
}, {
    name: string;
    photoUrl?: string | null | undefined;
    birthDate?: string | null | undefined;
    nationality?: string | null | undefined;
    biography?: string | null | undefined;
    tmdbId?: string | null | undefined;
}>;
//# sourceMappingURL=actors.schemas.d.ts.map