import { Prisma } from '@prisma/client';
export declare class HomepageService {
    /**
     * Aggregated endpoint that gathers all data needed for the homepage in one round-trip.
     */
    static getHomepageData(): Promise<{
        featured: any[];
        trending: {
            type: import(".prisma/client").$Enums.ContentType;
            status: import(".prisma/client").$Enums.ContentStatus;
            platform: {
                id: string;
                name: string;
                slug: string;
                logoUrl: string | null;
            } | null;
            ageRating: {
                code: string;
                id: string;
                label: string;
            } | null;
            id: string;
            createdAt: Date;
            country: string | null;
            slug: string;
            releaseYear: number | null;
            duration: number | null;
            rating: number | null;
            viewCount: bigint;
            featured: boolean;
            trailerUrl: string | null;
            isFreeWithMembership: boolean;
            translations: {
                description: string;
                language: string;
                title: string;
                tagline: string | null;
            }[];
            genres: ({
                genre: {
                    id: string;
                    name: string;
                    slug: string;
                };
            } & {
                contentId: string;
                genreId: string;
            })[];
            thumbnails: {
                type: import(".prisma/client").$Enums.ThumbnailType;
                id: string;
                contentId: string | null;
                episodeId: string | null;
                width: number | null;
                height: number | null;
                url: string;
            }[];
        }[];
        recent: {
            type: import(".prisma/client").$Enums.ContentType;
            status: import(".prisma/client").$Enums.ContentStatus;
            platform: {
                id: string;
                name: string;
                slug: string;
                logoUrl: string | null;
            } | null;
            ageRating: {
                code: string;
                id: string;
                label: string;
            } | null;
            id: string;
            createdAt: Date;
            country: string | null;
            slug: string;
            releaseYear: number | null;
            duration: number | null;
            rating: number | null;
            viewCount: bigint;
            featured: boolean;
            trailerUrl: string | null;
            isFreeWithMembership: boolean;
            translations: {
                description: string;
                language: string;
                title: string;
                tagline: string | null;
            }[];
            genres: ({
                genre: {
                    id: string;
                    name: string;
                    slug: string;
                };
            } & {
                contentId: string;
                genreId: string;
            })[];
            thumbnails: {
                type: import(".prisma/client").$Enums.ThumbnailType;
                id: string;
                contentId: string | null;
                episodeId: string | null;
                width: number | null;
                height: number | null;
                url: string;
            }[];
        }[];
        estrenos: {
            type: import(".prisma/client").$Enums.ContentType;
            status: import(".prisma/client").$Enums.ContentStatus;
            platform: {
                id: string;
                name: string;
                slug: string;
                logoUrl: string | null;
            } | null;
            ageRating: {
                code: string;
                id: string;
                label: string;
            } | null;
            id: string;
            createdAt: Date;
            country: string | null;
            slug: string;
            releaseYear: number | null;
            duration: number | null;
            rating: number | null;
            viewCount: bigint;
            featured: boolean;
            trailerUrl: string | null;
            isFreeWithMembership: boolean;
            translations: {
                description: string;
                language: string;
                title: string;
                tagline: string | null;
            }[];
            genres: ({
                genre: {
                    id: string;
                    name: string;
                    slug: string;
                };
            } & {
                contentId: string;
                genreId: string;
            })[];
            thumbnails: {
                type: import(".prisma/client").$Enums.ThumbnailType;
                id: string;
                contentId: string | null;
                episodeId: string | null;
                width: number | null;
                height: number | null;
                url: string;
            }[];
        }[];
        freeContent: {
            type: import(".prisma/client").$Enums.ContentType;
            status: import(".prisma/client").$Enums.ContentStatus;
            platform: {
                id: string;
                name: string;
                slug: string;
                logoUrl: string | null;
            } | null;
            ageRating: {
                code: string;
                id: string;
                label: string;
            } | null;
            id: string;
            createdAt: Date;
            country: string | null;
            slug: string;
            releaseYear: number | null;
            duration: number | null;
            rating: number | null;
            viewCount: bigint;
            featured: boolean;
            trailerUrl: string | null;
            isFreeWithMembership: boolean;
            translations: {
                description: string;
                language: string;
                title: string;
                tagline: string | null;
            }[];
            genres: ({
                genre: {
                    id: string;
                    name: string;
                    slug: string;
                };
            } & {
                contentId: string;
                genreId: string;
            })[];
            thumbnails: {
                type: import(".prisma/client").$Enums.ThumbnailType;
                id: string;
                contentId: string | null;
                episodeId: string | null;
                width: number | null;
                height: number | null;
                url: string;
            }[];
        }[];
        platforms: ({
            contents: {
                id: string;
                slug: string;
                translations: {
                    language: string;
                    title: string;
                }[];
                thumbnails: {
                    type: import(".prisma/client").$Enums.ThumbnailType;
                    id: string;
                    contentId: string | null;
                    episodeId: string | null;
                    width: number | null;
                    height: number | null;
                    url: string;
                }[];
            }[];
        } & {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            slug: string;
            logoUrl: string | null;
            isFeatured: boolean;
        })[];
        genres: {
            id: string;
            name: string;
            slug: string;
            icon: string | null;
        }[];
        contentTypes: {
            type: import(".prisma/client").$Enums.ContentType;
            count: number;
        }[];
        plans: {
            id: string;
            name: string;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            maxDevices: number;
            description: string | null;
            durationDays: number;
            price: Prisma.Decimal;
            hasHd: boolean;
            has4k: boolean;
            allowDownload: boolean;
            noAds: boolean;
        }[];
        faq: {
            question: string;
            answer: string;
        }[];
        config: {
            [k: string]: string;
        };
    }>;
}
//# sourceMappingURL=homepage.service.d.ts.map