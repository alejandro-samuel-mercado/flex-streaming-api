export declare class PlatformsService {
    static getAll(): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        slug: string;
        logoUrl: string | null;
        isFeatured: boolean;
    }[]>;
    static getBySlug(slug: string): Promise<({
        contents: ({
            translations: {
                id: string;
                language: string;
                contentId: string;
                title: string;
                description: string;
                tagline: string | null;
            }[];
        } & {
            type: import(".prisma/client").$Enums.ContentType;
            status: import(".prisma/client").$Enums.ContentStatus;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            slug: string;
            tmdbId: string | null;
            releaseYear: number | null;
            duration: number | null;
            rating: number | null;
            reviewCount: number;
            viewCount: bigint;
            downloadCount: bigint;
            featured: boolean;
            country: string | null;
            languages: string[];
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
        name: string;
        createdAt: Date;
        updatedAt: Date;
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
        name: string;
        createdAt: Date;
        updatedAt: Date;
        slug: string;
        logoUrl: string | null;
        isFeatured: boolean;
    }>;
}
//# sourceMappingURL=platforms.service.d.ts.map