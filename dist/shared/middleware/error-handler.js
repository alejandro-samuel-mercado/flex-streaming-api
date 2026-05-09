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
    // Mask technical errors (Prisma, etc.) for the client
    let clientMessage = 'Internal server error';
    if (env_1.env.NODE_ENV !== 'production') {
        clientMessage = err.message;
    }
    // Specifically mask Prisma errors or internal invocation errors to protect technical details
    if (err.message.includes('Prisma') || err.message.includes('invocation') || err.message.includes('fkey')) {
        clientMessage = 'Error de base de datos. Por favor, contacte al soporte técnico.';
    }
    res.status(500).json({
        success: false,
        error: clientMessage,
    });
}
//# sourceMappingURL=error-handler.js.map