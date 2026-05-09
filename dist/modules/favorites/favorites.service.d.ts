export declare class FavoritesService {
    static toggleFavorite(profileId: string, contentId: string): Promise<{
        favorited: boolean;
    }>;
    static checkFavorite(profileId: string, contentId: string): Promise<boolean>;
    static getProfileFavorites(profileId: string, page?: number, limit?: number): Promise<{
        total: number;
        pages: number;
        data: {
            type: import(".prisma/client").$Enums.ContentType;
            id: string;
            slug: string;
            releaseYear: number | null;
            rating: number | null;
            translations: {
                description: string;
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
    }>;
    static syncFavorites(profileId: string, contentIds: string[]): Promise<{
        synced: number;
    }>;
}
//# sourceMappingURL=favorites.service.d.ts.map