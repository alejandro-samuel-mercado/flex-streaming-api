export declare class FavoritesService {
    static toggleFavorite(profileId: string, contentId: string): Promise<{
        favorited: boolean;
    }>;
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
                language: string;
                title: string;
                description: string;
            }[];
            thumbnails: {
                type: import(".prisma/client").$Enums.ThumbnailType;
                id: string;
                contentId: string | null;
                episodeId: string | null;
                url: string;
                width: number | null;
                height: number | null;
            }[];
        }[];
    }>;
}
//# sourceMappingURL=favorites.service.d.ts.map