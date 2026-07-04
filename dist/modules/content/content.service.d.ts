import { Prisma } from '@prisma/client';
export declare class ContentService {
    static getAllContent(filters: {
        page: number;
        limit: number;
        search?: string;
        type?: string;
        status?: string;
        genreId?: string;
        tagId?: string;
        actorId?: string;
        platformId?: string;
        isFree?: boolean;
        featured?: boolean;
        minYear?: number;
        maxYear?: number;
        minDuration?: number;
        maxDuration?: number;
        sort: string;
        lang: string;
        incomplete?: boolean;
        isPublic?: boolean;
    }): Promise<{
        data: ({
            type: import(".prisma/client").$Enums.ContentType;
            status: import(".prisma/client").$Enums.ContentStatus;
            platform: {
                id: string;
                name: string;
                logoUrl: string | null;
            } | null;
            ageRating: {
                code: string;
                id: string;
                label: string;
            } | null;
            id: string;
            country: string | null;
            createdAt: Date;
            slug: string;
            releaseYear: number | null;
            originalTitle: string | null;
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
            videoFiles: {
                type: import(".prisma/client").$Enums.VideoFileType;
                status: import(".prisma/client").$Enums.ProcessingStatus;
                qualities: {
                    resolution: string;
                }[];
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
        } | {
            episodeCount: number;
            failedCount: number;
            emptyEpisodesCount: number;
            type: import(".prisma/client").$Enums.ContentType;
            status: import(".prisma/client").$Enums.ContentStatus;
            platform: {
                id: string;
                name: string;
                logoUrl: string | null;
            } | null;
            ageRating: {
                code: string;
                id: string;
                label: string;
            } | null;
            id: string;
            country: string | null;
            createdAt: Date;
            slug: string;
            releaseYear: number | null;
            originalTitle: string | null;
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
            videoFiles: {
                type: import(".prisma/client").$Enums.VideoFileType;
                status: import(".prisma/client").$Enums.ProcessingStatus;
                qualities: {
                    resolution: string;
                }[];
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
        })[];
        total: number;
        page: number;
        limit: number;
    }>;
    static getContentById(idOrSlug: string, lang?: string, isAdmin?: boolean): Promise<({
        platform: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            slug: string;
            logoUrl: string | null;
            isFeatured: boolean;
        } | null;
        ageRating: {
            code: string;
            id: string;
            label: string;
        } | null;
        _count: {
            watchHistory: number;
            reviews: number;
        };
        translations: {
            id: string;
            description: string;
            language: string;
            title: string;
            contentId: string;
            tagline: string | null;
        }[];
        videoFiles: ({
            qualities: {
                id: string;
                videoFileId: string;
                resolution: string;
                width: number;
                height: number;
                bitrate: number;
                playlistUrl: string;
                codec: string;
            }[];
            audioTracks: {
                id: string;
                language: string;
                label: string;
                videoFileId: string;
                codec: string;
                isDefault: boolean;
                trackIndex: number;
            }[];
            subtitleTracks: {
                id: string;
                language: string;
                label: string;
                videoFileId: string;
                url: string;
                isDefault: boolean;
                format: string;
                isForced: boolean;
            }[];
        } & {
            type: import(".prisma/client").$Enums.VideoFileType;
            status: import(".prisma/client").$Enums.ProcessingStatus;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            duration: number | null;
            contentId: string | null;
            episodeId: string | null;
            originalPath: string;
            hlsPath: string | null;
            masterPlaylist: string | null;
            fileSize: bigint | null;
            errorMessage: string | null;
            processingJobId: string | null;
            sourceNode: string | null;
        })[];
        seasons: ({
            translations: {
                id: string;
                description: string | null;
                language: string;
                title: string;
                seasonId: string;
            }[];
            episodes: ({
                translations: {
                    id: string;
                    description: string | null;
                    language: string;
                    title: string;
                    episodeId: string;
                }[];
                videoFiles: ({
                    qualities: {
                        id: string;
                        videoFileId: string;
                        resolution: string;
                        width: number;
                        height: number;
                        bitrate: number;
                        playlistUrl: string;
                        codec: string;
                    }[];
                } & {
                    type: import(".prisma/client").$Enums.VideoFileType;
                    status: import(".prisma/client").$Enums.ProcessingStatus;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    duration: number | null;
                    contentId: string | null;
                    episodeId: string | null;
                    originalPath: string;
                    hlsPath: string | null;
                    masterPlaylist: string | null;
                    fileSize: bigint | null;
                    errorMessage: string | null;
                    processingJobId: string | null;
                    sourceNode: string | null;
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
            } & {
                number: number;
                id: string;
                createdAt: Date;
                duration: number | null;
                seasonId: string;
            })[];
        } & {
            number: number;
            id: string;
            createdAt: Date;
            year: number | null;
            contentId: string;
            posterUrl: string | null;
        })[];
        genres: ({
            genre: {
                id: string;
                name: string;
                slug: string;
                icon: string | null;
            };
        } & {
            contentId: string;
            genreId: string;
        })[];
        tags: ({
            tag: {
                id: string;
                name: string;
                slug: string;
            };
        } & {
            contentId: string;
            tagId: string;
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
        actors: ({
            actor: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                photoUrl: string | null;
                birthDate: Date | null;
                nationality: string | null;
                biography: string | null;
                tmdbId: string | null;
            };
        } & {
            contentId: string;
            order: number;
            character: string | null;
            actorId: string;
        })[];
        directors: ({
            director: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                photoUrl: string | null;
                birthDate: Date | null;
                nationality: string | null;
                biography: string | null;
                tmdbId: string | null;
            };
        } & {
            contentId: string;
            directorId: string;
        })[];
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
        rentalPrice: Prisma.Decimal | null;
        isFreeWithMembership: boolean;
        downloadAllowed: boolean;
        imdbId: string | null;
        ageRatingId: string | null;
    }) | null>;
    static getFeaturedContent(): Promise<{
        type: import(".prisma/client").$Enums.ContentType;
        status: import(".prisma/client").$Enums.ContentStatus;
        platform: {
            name: string;
            logoUrl: string | null;
        } | null;
        ageRating: {
            code: string;
            id: string;
            label: string;
        } | null;
        id: string;
        country: string | null;
        createdAt: Date;
        slug: string;
        releaseYear: number | null;
        originalTitle: string | null;
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
        videoFiles: {
            type: import(".prisma/client").$Enums.VideoFileType;
            status: import(".prisma/client").$Enums.ProcessingStatus;
            qualities: {
                resolution: string;
            }[];
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
    }[]>;
    static getTrendingContent(): Promise<{
        type: import(".prisma/client").$Enums.ContentType;
        status: import(".prisma/client").$Enums.ContentStatus;
        platform: {
            name: string;
            logoUrl: string | null;
        } | null;
        ageRating: {
            code: string;
            id: string;
            label: string;
        } | null;
        id: string;
        country: string | null;
        createdAt: Date;
        slug: string;
        releaseYear: number | null;
        originalTitle: string | null;
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
        videoFiles: {
            type: import(".prisma/client").$Enums.VideoFileType;
            status: import(".prisma/client").$Enums.ProcessingStatus;
            qualities: {
                resolution: string;
            }[];
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
    }[]>;
    static getRecentContent(): Promise<{
        type: import(".prisma/client").$Enums.ContentType;
        status: import(".prisma/client").$Enums.ContentStatus;
        platform: {
            name: string;
            logoUrl: string | null;
        } | null;
        ageRating: {
            code: string;
            id: string;
            label: string;
        } | null;
        id: string;
        country: string | null;
        createdAt: Date;
        slug: string;
        releaseYear: number | null;
        originalTitle: string | null;
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
        videoFiles: {
            type: import(".prisma/client").$Enums.VideoFileType;
            status: import(".prisma/client").$Enums.ProcessingStatus;
            qualities: {
                resolution: string;
            }[];
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
    }[]>;
    static getRelatedContent(contentId: string): Promise<{
        type: import(".prisma/client").$Enums.ContentType;
        status: import(".prisma/client").$Enums.ContentStatus;
        platform: {
            name: string;
            logoUrl: string | null;
        } | null;
        ageRating: {
            code: string;
            id: string;
            label: string;
        } | null;
        id: string;
        country: string | null;
        createdAt: Date;
        slug: string;
        releaseYear: number | null;
        originalTitle: string | null;
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
        videoFiles: {
            type: import(".prisma/client").$Enums.VideoFileType;
            status: import(".prisma/client").$Enums.ProcessingStatus;
            qualities: {
                resolution: string;
            }[];
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
    }[]>;
    static createContent(data: Record<string, unknown>): Promise<{
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
        rentalPrice: Prisma.Decimal | null;
        isFreeWithMembership: boolean;
        downloadAllowed: boolean;
        imdbId: string | null;
        ageRatingId: string | null;
    }>;
    static updateContent(id: string, data: Record<string, unknown>): Promise<{
        translations: {
            id: string;
            description: string;
            language: string;
            title: string;
            contentId: string;
            tagline: string | null;
        }[];
        videoFiles: ({
            qualities: {
                id: string;
                videoFileId: string;
                resolution: string;
                width: number;
                height: number;
                bitrate: number;
                playlistUrl: string;
                codec: string;
            }[];
        } & {
            type: import(".prisma/client").$Enums.VideoFileType;
            status: import(".prisma/client").$Enums.ProcessingStatus;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            duration: number | null;
            contentId: string | null;
            episodeId: string | null;
            originalPath: string;
            hlsPath: string | null;
            masterPlaylist: string | null;
            fileSize: bigint | null;
            errorMessage: string | null;
            processingJobId: string | null;
            sourceNode: string | null;
        })[];
        genres: ({
            genre: {
                id: string;
                name: string;
                slug: string;
                icon: string | null;
            };
        } & {
            contentId: string;
            genreId: string;
        })[];
        tags: ({
            tag: {
                id: string;
                name: string;
                slug: string;
            };
        } & {
            contentId: string;
            tagId: string;
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
        actors: ({
            actor: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                photoUrl: string | null;
                birthDate: Date | null;
                nationality: string | null;
                biography: string | null;
                tmdbId: string | null;
            };
        } & {
            contentId: string;
            order: number;
            character: string | null;
            actorId: string;
        })[];
        directors: ({
            director: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                photoUrl: string | null;
                birthDate: Date | null;
                nationality: string | null;
                biography: string | null;
                tmdbId: string | null;
            };
        } & {
            contentId: string;
            directorId: string;
        })[];
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
        rentalPrice: Prisma.Decimal | null;
        isFreeWithMembership: boolean;
        downloadAllowed: boolean;
        imdbId: string | null;
        ageRatingId: string | null;
    }>;
    static deleteContent(id: string): Promise<{
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
        rentalPrice: Prisma.Decimal | null;
        isFreeWithMembership: boolean;
        downloadAllowed: boolean;
        imdbId: string | null;
        ageRatingId: string | null;
    }>;
}
//# sourceMappingURL=content.service.d.ts.map