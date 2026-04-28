"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const env_1 = require("../config/env");
class AppError extends Error {
    statusCode;
    message;
    code;
    constructor(statusCode, message, code) {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
        this.code = code;
        this.name = 'AppError';
    }
}
exports.AppError = AppError;
function errorHandler(err, _req, res, _next) {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            success: false,
            error: err.message,
            code: err.code,
        });
        return;
    }
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({
            success: false,
            error: 'Validation error',
            details: err.flatten().fieldErrors,
        });
        return;
    }
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: env_1.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
}
//# sourceMappingURL=error-handler.js.map