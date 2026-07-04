/**
 * Subscription Plans Service — PeliPlus Reseller System
 *
 * CRUD for subscription plans used by the reseller flow.
 * These plans define credit cost and duration for end-user accounts.
 * Separate from the existing Plan model used for memberships.
 */
export declare class SubscriptionPlansService {
    static getActivePlans(): Promise<{
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
    }[]>;
    static getAllPlans(): Promise<{
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
    }[]>;
    static getById(id: string): Promise<{
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
    }>;
    static create(data: {
        name: string;
        description?: string;
        durationDays: number;
        creditCost: number;
        isDemo?: boolean;
        demoHours?: number | null;
        isPromo?: boolean;
        bonusDays?: number;
        maxDevices?: number;
        sortOrder?: number;
        baseCredits?: number;
    }): Promise<{
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
    }>;
    static update(id: string, data: {
        name?: string;
        description?: string;
        durationDays?: number;
        creditCost?: number;
        isDemo?: boolean;
        demoHours?: number | null;
        isPromo?: boolean;
        bonusDays?: number;
        maxDevices?: number;
        sortOrder?: number;
        baseCredits?: number;
    }): Promise<{
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
    }>;
    static toggle(id: string): Promise<{
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
    }>;
    static remove(id: string): Promise<{
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
    }>;
}
//# sourceMappingURL=subscription-plans.service.d.ts.map