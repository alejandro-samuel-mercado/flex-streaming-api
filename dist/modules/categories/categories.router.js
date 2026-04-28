"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoriesRouter = void 0;
const express_1 = require("express");
const categories_service_1 = require("./categories.service");
const categories_schemas_1 = require("./categories.schemas");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
exports.categoriesRouter = (0, express_1.Router)();
// ==========================================
// PUBLIC ENDPOINTS (Anyone can read)
// ==========================================
exports.categoriesRouter.get('/content-types', (async (_req, res, next) => {
    try {
        const data = await categories_service_1.CategoriesService.getAllContentTypes();
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.categoriesRouter.get('/genres', (async (_req, res, next) => {
    try {
        const data = await categories_service_1.CategoriesService.getAllGenres();
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.categoriesRouter.get('/age-ratings', (async (_req, res, next) => {
    try {
        const data = await categories_service_1.CategoriesService.getAllAgeRatings();
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.categoriesRouter.get('/tags', (async (_req, res, next) => {
    try {
        const data = await categories_service_1.CategoriesService.getAllTags();
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
// ==========================================
// ADMIN ENDPOINTS
// ==========================================
exports.categoriesRouter.use(auth_middleware_1.authenticate);
exports.categoriesRouter.use((0, auth_middleware_1.requireRole)('ADMIN'));
// Genres
exports.categoriesRouter.post('/genres', (async (req, res, next) => {
    try {
        const validatedData = categories_schemas_1.GenreSchema.parse(req.body);
        const data = await categories_service_1.CategoriesService.createGenre(validatedData);
        (0, api_response_1.created)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.categoriesRouter.put('/genres/:id', (async (req, res, next) => {
    try {
        const validatedData = categories_schemas_1.GenreSchema.partial().parse(req.body);
        const data = await categories_service_1.CategoriesService.updateGenre(req.params.id, validatedData);
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.categoriesRouter.delete('/genres/:id', (async (req, res, next) => {
    try {
        await categories_service_1.CategoriesService.deleteGenre(req.params.id);
        (0, api_response_1.ok)(res, { deleted: true });
    }
    catch (err) {
        next(err);
    }
}));
// Age Ratings
exports.categoriesRouter.post('/age-ratings', (async (req, res, next) => {
    try {
        const validatedData = categories_schemas_1.AgeRatingSchema.parse(req.body);
        const data = await categories_service_1.CategoriesService.createAgeRating(validatedData);
        (0, api_response_1.created)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.categoriesRouter.put('/age-ratings/:id', (async (req, res, next) => {
    try {
        const validatedData = categories_schemas_1.AgeRatingSchema.partial().parse(req.body);
        const data = await categories_service_1.CategoriesService.updateAgeRating(req.params.id, validatedData);
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.categoriesRouter.delete('/age-ratings/:id', (async (req, res, next) => {
    try {
        await categories_service_1.CategoriesService.deleteAgeRating(req.params.id);
        (0, api_response_1.ok)(res, { deleted: true });
    }
    catch (err) {
        next(err);
    }
}));
// Tags
exports.categoriesRouter.post('/tags', (async (req, res, next) => {
    try {
        const validatedData = categories_schemas_1.TagSchema.parse(req.body);
        const data = await categories_service_1.CategoriesService.createTag(validatedData);
        (0, api_response_1.created)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.categoriesRouter.put('/tags/:id', (async (req, res, next) => {
    try {
        const validatedData = categories_schemas_1.TagSchema.partial().parse(req.body);
        const data = await categories_service_1.CategoriesService.updateTag(req.params.id, validatedData);
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.categoriesRouter.delete('/tags/:id', (async (req, res, next) => {
    try {
        await categories_service_1.CategoriesService.deleteTag(req.params.id);
        (0, api_response_1.ok)(res, { deleted: true });
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=categories.router.js.map