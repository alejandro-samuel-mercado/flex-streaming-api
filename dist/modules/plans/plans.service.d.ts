export declare class PlansService {
    static getActivePlans(): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        maxDevices: number;
        description: string | null;
        durationDays: number;
        price: import("@prisma/client/runtime/library").Decimal;
        hasHd: boolean;
        has4k: boolean;
        allowDownload: boolean;
        noAds: boolean;
    }[]>;
}
//# sourceMappingURL=plans.service.d.ts.map