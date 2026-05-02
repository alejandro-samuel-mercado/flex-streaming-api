export declare class TMDBService {
    private static readonly baseURL;
    private static readonly accessToken;
    private static getHeaders;
    /**
     * Search for movies or series by title
     */
    static search(query: string, type?: 'movie' | 'tv' | 'multi', lang?: string): Promise<any>;
    /**
     * Get full details of a movie or series
     */
    static getDetails(id: string | number, type: 'movie' | 'tv', lang?: string): Promise<any>;
    /**
     * Resolve full image URL from TMDB path
     */
    static getImageUrl(path: string | null, size?: string): string | null;
    /**
     * Download image from TMDB to local storage
     */
    static downloadImage(tmdbPath: string, targetPath: string): Promise<void | null>;
}
//# sourceMappingURL=tmdb.service.d.ts.map