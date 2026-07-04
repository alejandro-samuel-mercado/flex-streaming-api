export declare class HistoryService {
    static updateWatchProgress(profileId: string, contentId: string, progress: number, duration?: number, episodeId?: string): Promise<{
        id: string;
        updatedAt: Date;
        duration: number | null;
        contentId: string | null;
        episodeId: string | null;
        profileId: string;
        progress: number;
        completed: boolean;
        watchedAt: Date;
    } | null>;
    static getProfileHistory(profileId: string, page?: number, limit?: number): Promise<{
        total: number;
        pages: number;
        data: ({
            content: {
                type: import(".prisma/client").$Enums.ContentType;
                id: string;
                slug: string;
                tmdbId: string | null;
                duration: number | null;
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
            } | null;
            episode: {
                number: number;
                id: string;
                translations: {
                    language: string;
                    title: string;
                }[];
            } | null;
        } & {
            id: string;
            updatedAt: Date;
            duration: number | null;
            contentId: string | null;
            episodeId: string | null;
            profileId: string;
            progress: number;
            completed: boolean;
            watchedAt: Date;
        })[];
    }>;
    static getContinueWatching(profileId: string, limit?: number): Promise<({
        content: {
            type: import(".prisma/client").$Enums.ContentType;
            id: string;
            slug: string;
            tmdbId: string | null;
            duration: number | null;
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
        } | null;
    } & {
        id: string;
        updatedAt: Date;
        duration: number | null;
        contentId: string | null;
        episodeId: string | null;
        profileId: string;
        progress: number;
        completed: boolean;
        watchedAt: Date;
    })[]>;
    static getGlobalHistory(page?: number, limit?: number, search?: string): Promise<{
        total: number;
        pages: number;
        data: ({
            profile: {
                user: {
                    name: string | null;
                    phone: string;
                    role: import(".prisma/client").$Enums.UserRole;
                };
                id: string;
                name: string;
            };
            content: {
                type: import(".prisma/client").$Enums.ContentType;
                id: string;
                slug: string;
                translations: {
                    language: string;
                    title: string;
                }[];
            } | null;
            episode: {
                number: number;
                id: string;
                translations: {
                    language: string;
                    title: string;
                }[];
            } | null;
        } & {
            id: string;
            updatedAt: Date;
            duration: number | null;
            contentId: string | null;
            episodeId: string | null;
            profileId: string;
            progress: number;
            completed: boolean;
            watchedAt: Date;
        })[];
    }>;
    static deleteProfileHistory(profileId: string, contentId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
}
//# sourceMappingURL=history.service.d.ts.map