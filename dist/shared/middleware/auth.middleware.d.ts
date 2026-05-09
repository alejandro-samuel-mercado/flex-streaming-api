import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        phone: string;
        role: UserRole;
    };
}
export declare function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void;
export declare function requireRole(...roles: UserRole[]): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void;
export declare function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void;
export declare function requireAnyRole(...roles: UserRole[]): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void;
export declare const requireAdmin: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void;
export declare const requireSuperVendorOrAbove: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void;
export declare const requireVendorOrAbove: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.middleware.d.ts.map