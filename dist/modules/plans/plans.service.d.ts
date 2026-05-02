export declare class PlansService {
    static getActivePlans(): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        price: import("@prisma/client/runtime/library").Decimal;
        durationDays: number;
        maxDevices: number;
        hasHd: boolean;
        has4k: boolean;
        allowDownload: boolean;
        noAds: boolean;
    }[]>;
}
//# sourceMappingURL=plans.service.d.ts.map