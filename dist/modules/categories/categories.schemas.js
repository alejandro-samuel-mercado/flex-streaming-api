"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TagSchema = exports.AgeRatingSchema = exports.GenreSchema = void 0;
const zod_1 = require("zod");
exports.GenreSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name is required'),
    slug: zod_1.z.string().min(2, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Invalid slug format'),
});
exports.AgeRatingSchema = zod_1.z.object({
    code: zod_1.z.string().min(1, 'Code is required'),
    label: zod_1.z.string().min(2, 'Label is required'),
});
exports.TagSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name is required'),
    slug: zod_1.z.string().min(2, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Invalid slug format'),
});
//# sourceMappingURL=categories.schemas.js.map