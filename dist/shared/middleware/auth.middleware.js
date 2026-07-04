"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireVendorOrAbove = exports.requireSuperVendorOrAbove = exports.requireAdmin = exports.optionalAuth = exports.authenticate = void 0;
exports.requireRole = requireRole;
exports.requireAnyRole = requireAnyRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const prisma_1 = require("../config/prisma");
const error_handler_1 = require("./error-handler");
const authenticate = async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        next(new error_handler_1.AppError(401, 'No authentication token provided', 'UNAUTHORIZED'));
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET);
        // Instant session invalidation check
        if (payload.role === 'END_USER' || payload.role === 'CLIENT') {
            const user = await prisma_1.prisma.endUserAccount.findFirst({ where: { userId: payload.sub }, select: { deletedAt: true, status: true } });
            if (!user || user.deletedAt || !['ACTIVE', 'DEMO'].includes(user.status)) {
                next(new error_handler_1.AppError(401, 'Account inactive or deleted', 'UNAUTHORIZED'));
                return;
            }
        }
        else {
            const sysUser = await prisma_1.prisma.user.findUnique({ where: { id: payload.sub }, select: { deletedAt: true, isActive: true } });
            if (!sysUser || sysUser.deletedAt || !sysUser.isActive) {
                next(new error_handler_1.AppError(401, 'Account inactive or deleted', 'UNAUTHORIZED'));
                return;
            }
        }
        req.user = { id: payload.sub, phone: payload.phone, role: payload.role };
        next();
    }
    catch {
        next(new error_handler_1.AppError(401, 'Invalid or expired token', 'INVALID_TOKEN'));
    }
};
exports.authenticate = authenticate;
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
const optionalAuth = async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        next();
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET);
        // For optional auth, we don't strictly block if DB check fails, we just don't set req.user
        // But we still want to not authenticate deleted users.
        if (payload.role === 'END_USER' || payload.role === 'CLIENT') {
            const user = await prisma_1.prisma.endUserAccount.findFirst({ where: { userId: payload.sub }, select: { deletedAt: true, status: true } });
            if (user && !user.deletedAt && ['ACTIVE', 'DEMO'].includes(user.status)) {
                req.user = { id: payload.sub, phone: payload.phone, role: payload.role };
            }
        }
        else {
            const sysUser = await prisma_1.prisma.user.findUnique({ where: { id: payload.sub }, select: { deletedAt: true, isActive: true } });
            if (sysUser && !sysUser.deletedAt && sysUser.isActive) {
                req.user = { id: payload.sub, phone: payload.phone, role: payload.role };
            }
        }
    }
    catch {
        // token inválido — continúa como invitado
    }
    next();
};
exports.optionalAuth = optionalAuth;
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