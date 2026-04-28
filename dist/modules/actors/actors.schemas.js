"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DirectorSchema = exports.ActorSchema = void 0;
const zod_1 = require("zod");
exports.ActorSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name is required'),
    photoUrl: zod_1.z.string().url('Invalid URL format').optional().nullable(),
    birthDate: zod_1.z.string().datetime().optional().nullable(),
    nationality: zod_1.z.string().optional().nullable(),
    biography: zod_1.z.string().optional().nullable(),
    tmdbId: zod_1.z.string().optional().nullable(),
});
exports.DirectorSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name is required'),
    photoUrl: zod_1.z.string().url('Invalid URL format').optional().nullable(),
    birthDate: zod_1.z.string().datetime().optional().nullable(),
    nationality: zod_1.z.string().optional().nullable(),
    biography: zod_1.z.string().optional().nullable(),
    tmdbId: zod_1.z.string().optional().nullable(),
});
//# sourceMappingURL=actors.schemas.js.map