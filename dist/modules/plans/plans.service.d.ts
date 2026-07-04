export declare class PlansService {
    static getActivePlans(): Promise<{
        id: string;
        maxDevices: number;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        isActive: boolean;
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