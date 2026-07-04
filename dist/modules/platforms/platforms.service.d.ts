export declare class PlatformsService {
    static getAll(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        slug: string;
        logoUrl: string | null;
        isFeatured: boolean;
    }[]>;
    static getBySlug(slug: string): Promise<({
        contents: ({
            translations: {
                id: string;
                description: string;
                language: string;
                title: string;
                contentId: string;
                tagline: string | null;
            }[];
        } & {
            type: import(".prisma/client").$Enums.ContentType;
            status: import(".prisma/client").$Enums.ContentStatus;
            id: string;
            country: string | null;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            slug: string;
            tmdbId: string | null;
            releaseYear: number | null;
            originalTitle: string | null;
            title: string | null;
            duration: number | null;
            rating: number | null;
            reviewCount: number;
            viewCount: bigint;
            downloadCount: bigint;
            featured: boolean;
            languages: string[];
            originalLanguage: string | null;
            budget: bigint | null;
            revenue: bigint | null;
            isAdult: boolean;
            subtitleLangs: string[];
            platformId: string | null;
            trailerUrl: string | null;
            rentalPrice: import("@prisma/client/runtime/library").Decimal | null;
            isFreeWithMembership: boolean;
            downloadAllowed: boolean;
            imdbId: string | null;
            ageRatingId: string | null;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        slug: string;
        logoUrl: string | null;
        isFeatured: boolean;
    }) | null>;
    static create(data: {
        name: string;
        slug: string;
        logoUrl?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        slug: string;
        logoUrl: string | null;
        isFeatured: boolean;
    }>;
    static update(id: string, data: {
        name?: string;
        slug?: string;
        logoUrl?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        slug: string;
        logoUrl: string | null;
        isFeatured: boolean;
    }>;
    static delete(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        slug: string;
        logoUrl: string | null;
        isFeatured: boolean;
    }>;
}
//# sourceMappingURL=platforms.service.d.ts.map