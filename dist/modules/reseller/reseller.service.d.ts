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
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        username: string | null;
        createdAt: Date;
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
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        username: string | null;
        createdAt: Date;
        credits: number;
    }>;
    static listVendors(userId: string, userRole: UserRole): Promise<{
        id: string;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        username: string | null;
        isActive: boolean;
        createdAt: Date;
        credits: number;
        parentId: string | null;
        parent: {
            id: string;
            phone: string;
            name: string | null;
            username: string | null;
        } | null;
        _count: {
            children: number;
            managedEndUsers: number;
        };
    }[]>;
    static getVendorDetail(vendorId: string, requesterId: string, requesterRole: UserRole): Promise<{
        id: string;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        username: string | null;
        isActive: boolean;
        createdAt: Date;
        credits: number;
        parentId: string | null;
        parent: {
            id: string;
            phone: string;
            name: string | null;
            username: string | null;
        } | null;
        _count: {
            children: number;
            managedEndUsers: number;
        };
    }>;
    static updateVendorStatus(vendorId: string, requesterId: string, requesterRole: UserRole, isActive: boolean): Promise<{
        id: string;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        username: string | null;
        isActive: boolean;
    }>;
    static deleteVendor(vendorId: string, requesterId: string, requesterRole: UserRole): Promise<{
        id: string;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        username: string | null;
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
            planId: string | null;
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
        password: string;
        username: string;
        passwordHash: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        userId: string | null;
        managedById: string;
        planId: string | null;
        startDate: Date | null;
        endDate: Date | null;
        country: string | null;
        notes: string | null;
        maxDevices: number;
    }>;
    static resetVendorPassword(vendorId: string, requesterId: string, requesterRole: UserRole, newPassword: string): Promise<{
        id: string;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        username: string | null;
    }>;
    static updateVendor(vendorId: string, requesterId: string, requesterRole: UserRole, data: {
        name?: string;
        username?: string;
        phone?: string;
        password?: string;
    }): Promise<{
        id: string;
        phone: string;
        role: import(".prisma/client").$Enums.UserRole;
        name: string | null;
        username: string | null;
        isActive: boolean;
    }>;
}
//# sourceMappingURL=reseller.service.d.ts.map