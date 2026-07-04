/**
 * Reseller Service — PeliPlus Reseller System
 *
 * Manages the vendor hierarchy: ADMIN → SUPER_VENDOR → VENDOR.
 * Handles vendor creation, credit assignment, and status management.
 */
import { UserRole } from '@prisma/client';
export declare class ResellerService {
    static createSuperVendor(adminId: string, data: {
        phone: string;
        username: string;
        name: string;
        password: string;
        credits?: number;
        planId?: string;
    }): Promise<{
        id: string;
        username: string | null;
        createdAt: Date;
        name: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        credits: number;
    }>;
    static createVendor(creatorId: string, creatorRole: UserRole, data: {
        phone: string;
        username: string;
        name: string;
        password: string;
        credits?: number;
        planId?: string;
    }): Promise<{
        id: string;
        username: string | null;
        createdAt: Date;
        name: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        credits: number;
    }>;
    static listVendors(userId: string, userRole: UserRole): Promise<{
        id: string;
        username: string | null;
        createdAt: Date;
        _count: {
            children: number;
            managedEndUsers: number;
        };
        name: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        isActive: boolean;
        credits: number;
        parentId: string | null;
        parent: {
            id: string;
            username: string | null;
            name: string | null;
            phone: string;
        } | null;
    }[]>;
    static getVendorDetail(vendorId: string, requesterId: string, requesterRole: UserRole): Promise<{
        id: string;
        username: string | null;
        createdAt: Date;
        _count: {
            children: number;
            managedEndUsers: number;
        };
        name: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        isActive: boolean;
        credits: number;
        parentId: string | null;
        parent: {
            id: string;
            username: string | null;
            name: string | null;
            phone: string;
        } | null;
    }>;
    static updateVendorStatus(vendorId: string, requesterId: string, requesterRole: UserRole, isActive: boolean): Promise<{
        id: string;
        username: string | null;
        name: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        isActive: boolean;
    }>;
    static deleteVendor(vendorId: string, requesterId: string, requesterRole: UserRole): Promise<{
        id: string;
        username: string | null;
        passwordHash: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        name: string | null;
        phone: string;
        googleId: string | null;
        appleId: string | null;
        role: import(".prisma/client").$Enums.UserRole;
        isActive: boolean;
        preferredLang: string | null;
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
            userId: string;
            planId: string | null;
            createdAt: Date;
            description: string | null;
            amount: number;
            balanceBefore: number;
            balanceAfter: number;
            relatedUserId: string | null;
            packageId: string | null;
            createdById: string | null;
        }[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    static assignPlanToVendor(vendorId: string, requesterId: string, requesterRole: UserRole, planId: string): Promise<{
        plan: {
            id: string;
            name: string;
            durationDays: number;
        } | null;
    } & {
        type: import(".prisma/client").$Enums.EndUserAccountType;
        status: import(".prisma/client").$Enums.EndUserAccountStatus;
        id: string;
        username: string;
        password: string;
        passwordHash: string;
        managedById: string;
        userId: string | null;
        planId: string | null;
        startDate: Date | null;
        endDate: Date | null;
        country: string | null;
        notes: string | null;
        maxDevices: number;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    static resetVendorPassword(vendorId: string, requesterId: string, requesterRole: UserRole, newPassword: string): Promise<{
        id: string;
        username: string | null;
        name: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
    }>;
    static updateVendor(vendorId: string, requesterId: string, requesterRole: UserRole, data: {
        name?: string;
        username?: string;
        phone?: string;
        password?: string;
    }): Promise<{
        id: string;
        username: string | null;
        name: string | null;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        isActive: boolean;
    }>;
}
//# sourceMappingURL=reseller.service.d.ts.map