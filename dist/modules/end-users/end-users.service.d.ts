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
        expiringInDays?: number;
        managedByMeOnly?: boolean;
        managedByOthersOnly?: boolean;
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
            username: string;
            password: string;
            startDate: Date | null;
            endDate: Date | null;
            maxDevices: number;
            createdAt: Date;
            managedBy: {
                id: string;
                username: string | null;
                name: string | null;
                phone: string;
                role: import(".prisma/client").$Enums.UserRole;
                parent: {
                    username: string | null;
                    name: string | null;
                } | null;
            };
        }[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    static create(managedById: string, userRole: UserRole, data: {
        username: string;
        password: string;
        country?: string;
        notes?: string;
        planId?: string;
    }): Promise<{
        type: import(".prisma/client").$Enums.EndUserAccountType;
        status: import(".prisma/client").$Enums.EndUserAccountStatus;
        id: string;
        username: string;
        password: string;
        createdAt: Date;
    }>;
    static getById(accountId: string, userId: string, userRole: UserRole): Promise<{
        connectedDevicesCount: number;
        plan: {
            id: string;
            maxDevices: number;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            isActive: boolean;
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
            username: string | null;
            name: string | null;
            phone: string;
            role: import(".prisma/client").$Enums.UserRole;
            parent: {
                username: string | null;
                name: string | null;
            } | null;
        };
        connectedDevices: {
            platform: string | null;
            id: string;
            createdAt: Date;
            isActive: boolean;
            deviceName: string | null;
            deviceType: import(".prisma/client").$Enums.DeviceType;
            endUserAccountId: string;
            deviceToken: string;
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
    static changePassword(accountId: string, userId: string, userRole: UserRole, newPassword: string): Promise<{
        id: string;
        username: string;
        password: string;
    }>;
    static deleteAccount(accountId: string, userId: string, userRole: UserRole): Promise<{
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
    static togglePause(accountId: string, userId: string, userRole: UserRole): Promise<{
        status: import(".prisma/client").$Enums.EndUserAccountStatus;
        id: string;
        username: string;
    }>;
    static listDevices(accountId: string, userId: string, userRole: UserRole): Promise<{
        platform: string | null;
        id: string;
        createdAt: Date;
        isActive: boolean;
        deviceName: string | null;
        deviceType: import(".prisma/client").$Enums.DeviceType;
        endUserAccountId: string;
        deviceToken: string;
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
        creditsCost: number;
        daysAdded: number;
        appliedById: string;
        appliedAt: Date;
    })[]>;
    /**
     * Revokes all active sessions for an account (PostgreSQL + Redis).
     * Also disconnects all active devices.
     */
    private static revokeAccess;
}
//# sourceMappingURL=end-users.service.d.ts.map