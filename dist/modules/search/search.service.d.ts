export declare class SearchService {
    /**
     * Global platform search across content translations, actors, and directors.
     */
    static globalSearch(query: string, limitPerCategory?: number): Promise<{
        content: {
            type: import(".prisma/client").$Enums.ContentType;
            ageRating: {
                code: string;
                label: string;
            } | null;
            id: string;
            slug: string;
            releaseYear: number | null;
            rating: number | null;
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
        actors: {
            id: string;
            name: string;
            photoUrl: string | null;
        }[];
        directors: {
            id: string;
            name: string;
            photoUrl: string | null;
        }[];
    }>;
    static suggest(query: string): Promise<{
        type: import(".prisma/client").$Enums.ContentType;
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
    }[]>;
}
//# sourceMappingURL=search.service.d.ts.map