"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.created = created;
exports.noContent = noContent;
exports.paginate = paginate;
function ok(res, data, meta) {
    res.status(200).json({ success: true, data, ...(meta ? { meta } : {}) });
}
function created(res, data) {
    res.status(201).json({ success: true, data });
}
function noContent(res) {
    res.status(204).send();
}
function paginate(page, limit, total) {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    };
}
//# sourceMappingURL=api-response.js.map