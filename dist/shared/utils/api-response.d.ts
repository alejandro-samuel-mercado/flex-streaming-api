import { Response } from 'express';
export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
export declare function ok<T>(res: Response, data: T, meta?: PaginationMeta): void;
export declare function created<T>(res: Response, data: T): void;
export declare function noContent(res: Response): void;
export declare function paginate(page: number, limit: number, total: number): PaginationMeta;
//# sourceMappingURL=api-response.d.ts.map