/**
 * Credit Packages Service — PeliPlus Reseller System
 *
 * CRUD for credit packages and the applyPackage logic.
 * Admin can apply packages for free; non-admin users pay baseCredits from their balance.
 */
import { UserRole } from '@prisma/client';
export declare class CreditPackagesService {
    static getActivePackages(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        isActive: boolean;
        isPromo: boolean;
        baseCredits: number;
        sortOrder: number;
        bonusCredits: number;
    }[]>;
    static getAllPackages(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        isActive: boolean;
        isPromo: boolean;
        baseCredits: number;
        sortOrder: number;
        bonusCredits: number;
    }[]>;
    static getById(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        isActive: boolean;
        isPromo: boolean;
        baseCredits: number;
        sortOrder: number;
        bonusCredits: number;
    }>;
    static create(data: {
        name: string;
        baseCredits: number;
        bonusCredits?: number;
        isPromo?: boolean;
        sortOrder?: number;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        isActive: boolean;
        isPromo: boolean;
        baseCredits: number;
        sortOrder: number;
        bonusCredits: number;
    }>;
    static update(id: string, data: {
        name?: string;
        baseCredits?: number;
        bonusCredits?: number;
        isPromo?: boolean;
        sortOrder?: number;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        isActive: boolean;
        isPromo: boolean;
        baseCredits: number;
        sortOrder: number;
        bonusCredits: number;
    }>;
    static toggle(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        isActive: boolean;
        isPromo: boolean;
        baseCredits: number;
        sortOrder: number;
        bonusCredits: number;
    }>;
    static remove(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        isActive: boolean;
        isPromo: boolean;
        baseCredits: number;
        sortOrder: number;
        bonusCredits: number;
    }>;
    static applyPackage(packageId: string, fromUserId: string, fromRole: UserRole, toUserId: string): Promise<{
        package: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            isActive: boolean;
            isPromo: boolean;
            baseCredits: number;
            sortOrder: number;
            bonusCredits: number;
        };
        creditsGiven: number;
        receiverBalance: number;
    }>;
}
//# sourceMappingURL=credit-packages.service.d.ts.map