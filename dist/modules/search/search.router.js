"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchRouter = void 0;
const express_1 = require("express");
const search_service_1 = require("./search.service");
const api_response_1 = require("../../shared/utils/api-response");
exports.searchRouter = (0, express_1.Router)();
// ==========================================
// PUBLIC ENDPOINTS
// ==========================================
exports.searchRouter.get('/', (async (req, res, next) => {
    try {
        const query = req.query.q;
        const limit = parseInt(req.query.limit) || 5;
        const data = await search_service_1.SearchService.globalSearch(query, limit);
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
exports.searchRouter.get('/suggest', (async (req, res, next) => {
    try {
        const query = req.query.q;
        const data = await search_service_1.SearchService.suggest(query);
        (0, api_response_1.ok)(res, data);
    }
    catch (err) {
        next(err);
    }
}));
//# sourceMappingURL=search.router.js.map