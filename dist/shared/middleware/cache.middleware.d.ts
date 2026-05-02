import { Request, Response, NextFunction } from 'express';
declare const CACHE_TTL: {
    readonly catalog: number;
    readonly contentDetail: number;
    readonly trending: number;
    readonly recommendations: number;
    readonly search: number;
    readonly homepage: number;
};
export type CacheCategory = keyof typeof CACHE_TTL;
export declare function cacheMiddleware(category: CacheCategory): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare function invalidateCache(pattern: string): Promise<void>;
export {};
//# sourceMappingURL=cache.middleware.d.ts.map