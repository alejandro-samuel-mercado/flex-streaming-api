/**
 * End Users Service — PeliPlus Reseller System
 *
 * Manages end-user accounts created by vendors/super-vendors.
 * Handles: CRUD, plan activation (cumulative), pause/resume,
 * device management, password changes, and plan history.
 */
import { UserRole } from '@prisma/client';
export declare class EndUsersService {
    static list(userId: string, userRole: UserRole, query: {
        page?: number;
        limit?: number;
        search?: string;
        status?: string;
        type?: string;
    }): Promise<{
        users: {
            connectedDevicesCount: number;
            _count: undefined;
            type: import(".prisma/client").$Enums.EndUserAccountType;
            status: import(".prisma/client").$Enums.EndUserAccountStatus;
            plan: {
                id: string;
                name: string;
                durationDays: number;
            } | null;
            id: string;
            password: string;
            username: string;
            createdAt: Date;
            startDate: Date | null;
            endDate: Date | null;
            maxDevices: number;
            managedBy: {
                id: string;
                email: string;
                name: string | null;
            };
        }[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    static create(managedById: string, data: {
        username: string;
        password: string;
        country?: string;
        notes?: string;
    }): Promise<{
        type: import(".prisma/client").$Enums.EndUserAccountType;
        status: import(".prisma/client").$Enums.EndUserAccountStatus;
        id: string;
        password: string;
        username: string;
        createdAt: Date;
    }>;
    static getById(accountId: string, userId: string, userRole: UserRole): Promise<{
        connectedDevicesCount: number;
        plan: {
            id: string;
            name: string;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            maxDevices: number;
            description: string | null;
            durationDays: number;
            creditCost: number;
            isDemo: boolean;
            demoHours: number | null;
            isPromo: boolean;
            baseCredits: number | null;
            bonusDays: number | null;
            sortOrder: number;
        } | null;
        managedBy: {
            id: string;
            email: string;
            name: string | null;
        };
        connectedDevices: {
            platform: string | null;
            id: string;
            isActive: boolean;
            createdAt: Date;
            endUserAccountId: string;
            deviceToken: string;
            deviceType: import(".prisma/client").$Enums.DeviceType;
            deviceName: string | null;
            osVersion: string | null;
            appVersion: string | null;
            browserName: string | null;
            ipAddress: string | null;
            refreshTokenId: string | null;
            lastSeen: Date;
        }[];
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
    static changePassword(accountId: string, userId: string, userRole: UserRole, newPassword: string): Promise<{
        id: string;
        password: string;
        username: string;
    }>;
    static deleteAccount(accountId: string, userId: string, userRole: UserRole, forceDelete?: boolean): Promise<{
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
    static addPlan(accountId: string, userId: string, userRole: UserRole, planId: string): Promise<{
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
    static togglePause(accountId: string, userId: string, userRole: UserRole): Promise<{
        status: import(".prisma/client").$Enums.EndUserAccountStatus;
        id: string;
        username: string;
    }>;
    static listDevices(accountId: string, userId: string, userRole: UserRole): Promise<{
        platform: string | null;
        id: string;
        isActive: boolean;
        createdAt: Date;
        endUserAccountId: string;
        deviceToken: string;
        deviceType: import(".prisma/client").$Enums.DeviceType;
        deviceName: string | null;
        osVersion: string | null;
        appVersion: string | null;
        browserName: string | null;
        ipAddress: string | null;
        refreshTokenId: string | null;
        lastSeen: Date;
    }[]>;
    static disconnectAllDevices(accountId: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
    static disconnectDevice(accountId: string, deviceId: string, userId: string, userRole: UserRole): Promise<{
        message: string;
    }>;
    static getPlanHistory(accountId: string, userId: string, userRole: UserRole): Promise<({
        plan: {
            id: string;
            name: string;
            durationDays: number;
            creditCost: number;
            isDemo: boolean;
        };
    } & {
        id: string;
        planId: string;
        endUserAccountId: string;
        daysAdded: number;
        creditsCost: number;
        appliedById: string;
        appliedAt: Date;
    })[]>;
}
//# sourceMappingURL=end-users.service.d.ts.map