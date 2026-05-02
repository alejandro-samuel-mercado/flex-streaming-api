/**
 * Reseller Service — PeliPlus Reseller System
 *
 * Manages the vendor hierarchy: ADMIN → SUPER_VENDOR → VENDOR.
 * Handles vendor creation, credit assignment, and status management.
 */
import { UserRole } from '@prisma/client';
export declare class ResellerService {
    static createSuperVendor(adminId: string, data: {
        email: string;
        name: string;
        password: string;
        credits?: number;
    }): Promise<{
        id: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        createdAt: Date;
        credits: number;
    }>;
    static createVendor(creatorId: string, creatorRole: UserRole, data: {
        email: string;
        name: string;
        password: string;
        credits?: number;
    }): Promise<{
        id: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        createdAt: Date;
        credits: number;
    }>;
    static listVendors(userId: string, userRole: UserRole): Promise<{
        id: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        isActive: boolean;
        createdAt: Date;
        credits: number;
        parentId: string | null;
        parent: {
            id: string;
            email: string;
            name: string | null;
        } | null;
        _count: {
            children: number;
            managedEndUsers: number;
        };
    }[]>;
    static getVendorDetail(vendorId: string, requesterId: string, requesterRole: UserRole): Promise<{
        id: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        isActive: boolean;
        createdAt: Date;
        credits: number;
        parentId: string | null;
        parent: {
            id: string;
            email: string;
            name: string | null;
        } | null;
        _count: {
            children: number;
            managedEndUsers: number;
        };
    }>;
    static updateVendorStatus(vendorId: string, requesterId: string, requesterRole: UserRole, isActive: boolean): Promise<{
        id: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        isActive: boolean;
    }>;
    static deleteVendor(vendorId: string): Promise<{
        id: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        googleId: string | null;
        appleId: string | null;
        passwordHash: string | null;
        isActive: boolean;
        preferredLang: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        credits: number;
        parentId: string | null;
    }>;
    static assignCredits(fromUserId: string, fromRole: UserRole, toUserId: string, amount: number): Promise<{
        recipientId: string;
        creditsAssigned: number;
        recipientNewBalance: number;
    }>;
    static getCreditHistory(targetUserId: string, requesterId: string, requesterRole: UserRole, page?: number, limit?: number): Promise<{
        transactions: {
            type: import(".prisma/client").$Enums.CreditTransactionType;
            id: string;
            createdAt: Date;
            userId: string;
            description: string | null;
            amount: number;
            balanceBefore: number;
            balanceAfter: number;
            relatedUserId: string | null;
            packageId: string | null;
            planId: string | null;
            createdById: string | null;
        }[];
        total: number;
        page: number;
        totalPages: number;
    }>;
}
//# sourceMappingURL=reseller.service.d.ts.map