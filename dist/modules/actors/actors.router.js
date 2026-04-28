"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actorsRouter = void 0;
const express_1 = require("express");
const actors_service_1 = require("./actors.service");
const actors_schemas_1 = require("./actors.schemas");
const auth_middleware_1 = require("../../shared/middleware/auth.middleware");
const api_response_1 = require("../../shared/utils/api-response");
exports.actorsRouter = (0, express_1.Router)();
// ==========================================
// PUBLIC ENDPOINTS
// ==========================================
// Actors
exports.actorsRouter.get('/', (async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search;
        const { data, total } = await actors_service_1.ActorsService.getAllActors(page, limit, search);
        (0, api_response_1.ok)(res, data, (0, api_response_1.paginate)(page, limit, total));
    }
    catch (err) {
        next(err);
    }
}));
exports.actorsRouter.get('/:id', (async (req, res, next) => {
    try {
        const data = await actors_service_1.ActorsService.getActorById(req.params.id);
        if (!data) {
            res.status(404).json({ success: false, error: 'Actor not found' });
            return;
        }
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
// Directors
exports.actorsRouter.get('/directors/list', (async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search;
        const { data, total } = await actors_service_1.ActorsService.getAllDirectors(page, limit, search);
        (0, api_response_1.ok)(res, data, (0, api_response_1.paginate)(page, limit, total));
    }
    catch (err) {
        next(err);
    }
}));
exports.actorsRouter.get('/directors/:id', (async (req, res, next) => {
    try {
        const data = await actors_service_1.ActorsService.getDirectorById(req.params.id);
        if (!data) {
            res.status(404).json({ success: false, error: 'Director not found' });
            return;
        }
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
// ==========================================
// ADMIN ENDPOINTS
// ==========================================
exports.actorsRouter.use(auth_middleware_1.authenticate);
exports.actorsRouter.use((0, auth_middleware_1.requireRole)('ADMIN'));
// Actors
exports.actorsRouter.post('/', (async (req, res, next) => {
    try {
        const validatedData = actors_schemas_1.ActorSchema.parse(req.body);
        const data = await actors_service_1.ActorsService.createActor(validatedData);
        (0, api_response_1.created)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.actorsRouter.put('/:id', (async (req, res, next) => {
    try {
        const validatedData = actors_schemas_1.ActorSchema.partial().parse(req.body);
        const data = await actors_service_1.ActorsService.updateActor(req.params.id, validatedData);
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.actorsRouter.delete('/:id', (async (req, res, next) => {
    try {
        await actors_service_1.ActorsService.deleteActor(req.params.id);
        (0, api_response_1.ok)(res, { deleted: true });
    }
    catch (err) {
        next(err);
    }
}));
// Directors
exports.actorsRouter.post('/directors', (async (req, res, next) => {
    try {
        const validatedData = actors_schemas_1.DirectorSchema.parse(req.body);
        const data = await actors_service_1.ActorsService.createDirector(validatedData);
        (0, api_response_1.created)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.actorsRouter.put('/directors/:id', (async (req, res, next) => {
    try {
        const validatedData = actors_schemas_1.DirectorSchema.partial().parse(req.body);
        const data = await actors_service_1.ActorsService.updateDirector(req.params.id, validatedData);
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.actorsRouter.delete('/directors/:id', (async (req, res, next) => {
    try {
        await actors_service_1.ActorsService.deleteDirector(req.params.id);
        (0, api_response_1.ok)(res, { deleted: true });
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=actors.router.js.map