"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireVendorOrAbove = exports.requireSuperVendorOrAbove = exports.requireAdmin = void 0;
exports.authenticate = authenticate;
exports.requireRole = requireRole;
exports.optionalAuth = optionalAuth;
exports.requireAnyRole = requireAnyRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const error_handler_1 = require("./error-handler");
function authenticate(req, _res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        next(new error_handler_1.AppError(401, 'No authentication token provided', 'UNAUTHORIZED'));
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET);
        req.user = { id: payload.sub, phone: payload.phone, role: payload.role };
        next();
    }
    catch {
        next(new error_handler_1.AppError(401, 'Invalid or expired token', 'INVALID_TOKEN'));
    }
}
function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user) {
            next(new error_handler_1.AppError(401, 'Authentication required', 'UNAUTHORIZED'));
            return;
        }
        if (!roles.includes(req.user.role)) {
            next(new error_handler_1.AppError(403, 'Insufficient permissions', 'FORBIDDEN'));
            return;
        }
        next();
    };
}
function optionalAuth(req, _res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        next();
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET);
        req.user = { id: payload.sub, phone: payload.phone, role: payload.role };
    }
    catch {
        // token inválido — continúa como invitado
    }
    next();
}
function requireAnyRole(...roles) {
    return (req, _res, next) => {
        if (!req.user) {
            next(new error_handler_1.AppError(401, 'Authentication required', 'UNAUTHORIZED'));
            return;
        }
        if (!roles.includes(req.user.role)) {
            next(new error_handler_1.AppError(403, 'Insufficient permissions', 'FORBIDDEN'));
            return;
        }
        next();
    };
}
exports.requireAdmin = requireRole('ADMIN');
exports.requireSuperVendorOrAbove = requireAnyRole('ADMIN', 'SUPER_VENDOR');
exports.requireVendorOrAbove = requireAnyRole('ADMIN', 'SUPER_VENDOR', 'VENDOR');
//# sourceMappingURL=auth.middleware.js.map