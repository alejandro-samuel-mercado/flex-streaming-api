import axios from 'axios';
import fs from 'fs';
import { env } from '../shared/config/env';

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
  actors: { name: string; character: string; photoUrl: string | null; tmdbId: string }[];
  directors: { name: string; photoUrl: string | null; tmdbId: string }[];
  tmdbId: string;
  imdbId?: string;
  country?: string;
  languages?: string[];
  originalLanguage?: string;
  budget?: number;
  revenue?: number;
  isAdult?: boolean;
}

export class TMDBService {
  private static readonly baseURL = env.TMDB_BASE_URL;

  /**
   * Search for movies or series by title
   */
  static async search(query: string, type: 'movie' | 'tv' | 'multi' = 'multi', lang: string = 'es-ES') {
    try {
      const response = await axios.get(`${this.baseURL}/search/${type}`, {
        params: {
          api_key: env.TMDB_API_KEY,
          query,
          language: lang,
          include_adult: false
        }
      });
      return response.data.results;
    } catch (error) {
      console.error('TMDB Search Error:', error);
      throw error;
    }
  }

  /**
   * Get full details of a movie or series
   */
  static async getDetails(id: string | number, type: 'movie' | 'tv', lang: string = 'es-ES') {
    try {
      const response = await axios.get(`${this.baseURL}/${type}/${id}`, {
        params: {
          api_key: env.TMDB_API_KEY,
          language: lang,
          append_to_response: 'credits,videos,images'
        }
      });
      return response.data;
    } catch (error) {
      console.error('TMDB Details Error:', error);
      throw error;
    }
  }

  /**
   * Resolve full image URL from TMDB path
   */
  static getImageUrl(path: string | null, size: string = 'original') {
    if (!path) return null;
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }

  /**
   * Download image from TMDB to local storage
   */
  static async downloadImage(tmdbPath: string, targetPath: string) {
    try {
      const url = this.getImageUrl(tmdbPath);
      if (!url) return null;

      const response = await axios.get(url, { responseType: 'stream' });
      const writer = fs.createWriteStream(targetPath);

      response.data.pipe(writer);

      return new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', (err) => reject(err));
      });
    } catch (error) {
      console.error('TMDB Image Download Error:', error);
      throw error;
    }
  }

  /**
   * Normalize a string for fuzzy comparison:
   * - lowercase
   * - strip accents (á→a, ñ→n, etc.)
   * - remove common Spanish/English articles
   * - collapse whitespace
   */
  private static normalize(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
      .replace(/[-_.:,;!?'"()[\]{}]/g, ' ')            // punctuation → space
      .replace(/\b(las?|los?|el|un|una|unos|unas|the|a|an|of|and|y|de|del)\b/gi, ' ') // articles
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract meaningful search tokens from a string.
   * Each token is normalized and at least 2 chars long.
   */
  private static tokenize(str: string): string[] {
    return this.normalize(str).split(' ').filter(t => t.length >= 2);
  }

  /**
   * Generate multiple search query variations from a filename.
   * Example: "guerreras k-pop" → ["guerreras k-pop", "guerreras kpop", "guerreras", "kpop"]
   */
  private static generateQueryVariations(query: string): string[] {
    const variations = new Set<string>();
    const clean = query.trim();

    if (clean.length === 0) return [];

    // 1. Full query as-is
    variations.add(clean);

    // 2. Without hyphens (k-pop → kpop)
    const noHyphens = clean.replace(/-/g, '');
    if (noHyphens !== clean) variations.add(noHyphens);

    // 3. With hyphens replaced by spaces (k-pop → k pop)
    const hyphenSpaces = clean.replace(/-/g, ' ');
    if (hyphenSpaces !== clean) variations.add(hyphenSpaces);

    // 4. Individual significant words (2+ chars), in order of length (longer = more specific)
    const tokens = this.tokenize(clean);
    if (tokens.length > 1) {
      // Try pairs of consecutive tokens (sliding window)
      for (let i = 0; i < tokens.length - 1; i++) {
        variations.add(`${tokens[i]} ${tokens[i + 1]}`);
      }
      // Try individual tokens (only if they're significant: 4+ chars)
      for (const token of tokens) {
        if (token.length >= 4) {
          variations.add(token);
        }
      }
    }

    return Array.from(variations);
  }

  /**
   * Search with fallback: tries multiple query variations and search types.
   * Returns best match with confidence score.
   * 
   * This is designed to handle messy filenames like:
   *   "guerrera kpop" → finds "Las guerreras K-Pop"
   *   "guerreras k-pop" → finds "Las guerreras K-Pop"
   *   "las guerras" → finds "Las guerreras K-Pop" (partial word match)
   */
  static async searchWithFallback(
    query: string,
    lang: string = 'es-ES'
  ): Promise<{ results: TMDBSearchResult[]; bestMatch: TMDBSearchResult | null; confidence: number }> {
    try {
      const variations = this.generateQueryVariations(query);
      const allResultsMap = new Map<number, TMDBSearchResult>(); // Dedup by TMDB id

      // Search each variation, collecting unique results
      for (const variation of variations) {
        // Try multi search first
        let results = await this.search(variation, 'multi', lang);

        // If no results, try movie and tv separately
        if (!results || results.length === 0) {
          results = await this.search(variation, 'movie', lang);
        }
        if (!results || results.length === 0) {
          results = await this.search(variation, 'tv', lang);
        }

        if (results && results.length > 0) {
          for (const r of results) {
            if (!allResultsMap.has(r.id)) {
              allResultsMap.set(r.id, r);
            }
          }
        }

        // Stop early if we already have enough candidates
        if (allResultsMap.size >= 20) break;

        // Small delay to respect TMDB rate limits
        if (variations.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const allResults = Array.from(allResultsMap.values());

      if (allResults.length === 0) {
        return { results: [], bestMatch: null, confidence: 0 };
      }

      // Score all results against the original query
      const queryNorm = this.normalize(query);
      let bestMatch: TMDBSearchResult | null = null;
      let bestScore = 0;

      for (const result of allResults) {
        const title = (result.title || result.name || '');
        const originalTitle = (result.original_title || result.original_name || '');

        const titleScore = this.fuzzyScore(queryNorm, this.normalize(title));
        const originalScore = this.fuzzyScore(queryNorm, this.normalize(originalTitle));
        const score = Math.max(titleScore, originalScore);

        // Boost popular results slightly
        const popularityBoost = Math.min(result.popularity || 0, 100) / 1000;
        const finalScore = score + popularityBoost;

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestMatch = result;
        }
      }

      // Sort results by score descending for the suggestions list
      const scored = allResults.map(r => {
        const t = this.normalize(r.title || r.name || '');
        const o = this.normalize(r.original_title || r.original_name || '');
        const s = Math.max(this.fuzzyScore(queryNorm, t), this.fuzzyScore(queryNorm, o));
        return { result: r, score: s };
      });
      scored.sort((a, b) => b.score - a.score);

      return {
        results: scored.slice(0, 10).map(s => s.result),
        bestMatch,
        confidence: Math.min(bestScore, 1)
      };
    } catch (error) {
      console.error('TMDB SearchWithFallback Error:', error);
      return { results: [], bestMatch: null, confidence: 0 };
    }
  }

  /**
   * Get full details formatted for direct content creation
   */
  static async getFullDetails(
    id: string | number,
    type: 'movie' | 'tv',
    lang: string = 'es-ES'
  ): Promise<TMDBFullDetails> {
    const data = await this.getDetails(id, type, lang);

    const title = data.title || data.name || '';
    const originalTitle = data.original_title || data.original_name || '';
    const synopsis = data.overview || '';
    const releaseDate = data.release_date || data.first_air_date || '';
    const releaseYear = releaseDate ? parseInt(releaseDate.split('-')[0]) : new Date().getFullYear();
    const duration = data.runtime || (data.episode_run_time?.[0]) || 0;
    const rating = Math.round((data.vote_average || 0) * 10) / 10;

    // Map genres
    const genres: string[] = (data.genres || []).map((g: any) => g.name);

    // Determine content type
    let contentType: 'MOVIE' | 'SERIES' | 'ANIME' | 'DOCUMENTARY' = type === 'movie' ? 'MOVIE' : 'SERIES';
    const genreIds = (data.genres || []).map((g: any) => g.id);
    // TMDB genre ID 16 = Animation (for anime detection)
    if (genreIds.includes(16) && type === 'tv') {
      contentType = 'ANIME';
    }
    // TMDB genre ID 99 = Documentary
    if (genreIds.includes(99)) {
      contentType = 'DOCUMENTARY';
    }

    // Extract actors (top 20)
    const actors = (data.credits?.cast || []).slice(0, 20).map((a: any) => ({
      name: a.name,
      character: a.character || '',
      photoUrl: a.profile_path ? this.getImageUrl(a.profile_path, 'w185') : null,
      tmdbId: String(a.id)
    }));

    // Extract directors
    const directors = (data.credits?.crew || [])
      .filter((c: any) => c.job === 'Director')
      .map((d: any) => ({
        name: d.name,
        photoUrl: d.profile_path ? this.getImageUrl(d.profile_path, 'w185') : null,
        tmdbId: String(d.id)
      }));

    // Country and languages
    const country = data.production_countries?.[0]?.iso_3166_1 || data.origin_country?.[0] || null;
    const languages = data.spoken_languages?.map((l: any) => l.iso_639_1) || [];
    const originalLanguage = data.original_language || null;
    const budget = data.budget || 0;
    const revenue = data.revenue || 0;
    const isAdult = data.adult || false;

    return {
      id: data.id,
      title,
      originalTitle,
      synopsis,
      releaseYear,
      duration,
      rating,
      posterPath: data.poster_path || null,
      backdropPath: data.backdrop_path || null,
      type: contentType,
      genres,
      actors,
      directors,
      tmdbId: String(data.id),
      imdbId: data.imdb_id || undefined,
      country,
      languages,
      originalLanguage,
      budget,
      revenue,
      isAdult
    };
  }

  /**
   * Get details of a TV episode from TMDB
   */
  static async getEpisodeDetails(tvId: string | number, seasonNumber: number, episodeNumber: number, lang: string = 'es-ES') {
    try {
      const response = await axios.get(`${this.baseURL}/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`, {
        params: {
          api_key: env.TMDB_API_KEY,
          language: lang,
        }
      });
      return response.data;
    } catch (error) {
      console.error(`TMDB Episode Details Error (tvId: ${tvId}, S${seasonNumber}E${episodeNumber}):`, error);
      return null;
    }
  }

  /**
   * Fuzzy similarity score between two normalized strings.
   * Uses word-stem overlap so "guerrera" ≈ "guerreras" and "guerras" ≈ "guerreras".
   * Returns a value between 0 (no match) and 1 (perfect match).
   */
  private static fuzzyScore(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;

    // Direct substring containment (high confidence)
    if (a.includes(b) || b.includes(a)) {
      const longer = Math.max(a.length, b.length);
      const shorter = Math.min(a.length, b.length);
      return 0.5 + (shorter / longer) * 0.5; // Range: 0.5–1.0
    }

    // Word-level fuzzy matching
    const tokensA = a.split(/\s+/).filter(t => t.length >= 2);
    const tokensB = b.split(/\s+/).filter(t => t.length >= 2);
    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    let matchScore = 0;

    for (const ta of tokensA) {
      let bestWordScore = 0;

      for (const tb of tokensB) {
        // Exact word match
        if (ta === tb) {
          bestWordScore = Math.max(bestWordScore, 1);
          continue;
        }

        // Prefix/stem match: "guerrera" matches "guerreras" (one starts with the other)
        const minLen = Math.min(ta.length, tb.length);
        const maxLen = Math.max(ta.length, tb.length);

        if (ta.startsWith(tb) || tb.startsWith(ta)) {
          bestWordScore = Math.max(bestWordScore, minLen / maxLen);
          continue;
        }

        // Substring containment: "guerr" inside "guerreras"
        if (ta.includes(tb) || tb.includes(ta)) {
          bestWordScore = Math.max(bestWordScore, (minLen / maxLen) * 0.8);
          continue;
        }

        // Common prefix length ratio (handles typos: "guerras" vs "guerreras")
        let commonPrefix = 0;
        for (let i = 0; i < minLen; i++) {
          if (ta[i] === tb[i]) commonPrefix++;
          else break;
        }
        if (commonPrefix >= 3) {
          bestWordScore = Math.max(bestWordScore, (commonPrefix / maxLen) * 0.7);
        }
      }

      matchScore += bestWordScore;
    }

    // Normalize by the larger token set
    return matchScore / Math.max(tokensA.length, tokensB.length);
  }
}
