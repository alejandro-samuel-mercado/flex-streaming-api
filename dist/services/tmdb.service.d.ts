export interface TMDBSearchResult {
    id: number;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    overview?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    media_type?: string;
    genre_ids?: number[];
    popularity?: number;
}
export interface TMDBFullDetails {
    id: number;
    title: string;
    originalTitle: string;
    synopsis: string;
    releaseYear: number;
    duration: number;
    rating: number;
    posterPath: string | null;
    backdropPath: string | null;
    type: 'MOVIE' | 'SERIES' | 'ANIME' | 'DOCUMENTARY';
    genres: string[];
    actors: {
        name: string;
        character: string;
        photoUrl: string | null;
        tmdbId: string;
    }[];
    directors: {
        name: string;
        photoUrl: string | null;
        tmdbId: string;
    }[];
    tmdbId: string;
    imdbId?: string;
    country?: string;
    languages?: string[];
    originalLanguage?: string;
    budget?: number;
    revenue?: number;
    isAdult?: boolean;
}
export declare class TMDBService {
    private static readonly baseURL;
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
    /**
     * Normalize a string for fuzzy comparison:
     * - lowercase
     * - strip accents (á→a, ñ→n, etc.)
     * - remove common Spanish/English articles
     * - collapse whitespace
     */
    private static normalize;
    /**
     * Extract meaningful search tokens from a string.
     * Each token is normalized and at least 2 chars long.
     */
    private static tokenize;
    /**
     * Generate multiple search query variations from a filename.
     * Example: "guerreras k-pop" → ["guerreras k-pop", "guerreras kpop", "guerreras", "kpop"]
     */
    private static generateQueryVariations;
    /**
     * Search with fallback: tries multiple query variations and search types.
     * Returns best match with confidence score.
     *
     * This is designed to handle messy filenames like:
     *   "guerrera kpop" → finds "Las guerreras K-Pop"
     *   "guerreras k-pop" → finds "Las guerreras K-Pop"
     *   "las guerras" → finds "Las guerreras K-Pop" (partial word match)
     */
    static searchWithFallback(query: string, lang?: string): Promise<{
        results: TMDBSearchResult[];
        bestMatch: TMDBSearchResult | null;
        confidence: number;
    }>;
    /**
     * Get full details formatted for direct content creation
     */
    static getFullDetails(id: string | number, type: 'movie' | 'tv', lang?: string): Promise<TMDBFullDetails>;
    /**
     * Get details of a TV episode from TMDB
     */
    static getEpisodeDetails(tvId: string | number, seasonNumber: number, episodeNumber: number, lang?: string): Promise<any>;
    /**
     * Fuzzy similarity score between two normalized strings.
     * Uses word-stem overlap so "guerrera" ≈ "guerreras" and "guerras" ≈ "guerreras".
     * Returns a value between 0 (no match) and 1 (perfect match).
     */
    private static fuzzyScore;
}
//# sourceMappingURL=tmdb.service.d.ts.map