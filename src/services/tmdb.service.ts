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
}

export class TMDBService {
  private static readonly baseURL = env.TMDB_BASE_URL;
  private static readonly accessToken = env.TMDB_ACCESS_TOKEN;

  private static getHeaders() {
    return {
      accept: 'application/json',
      Authorization: `Bearer ${this.accessToken}`
    };
  }

  /**
   * Search for movies or series by title
   */
  static async search(query: string, type: 'movie' | 'tv' | 'multi' = 'multi', lang: string = 'es-ES') {
    try {
      const response = await axios.get(`${this.baseURL}/search/${type}`, {
        headers: this.getHeaders(),
        params: {
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
        headers: this.getHeaders(),
        params: {
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
   * Search with fallback: tries multi, then movie, then tv.
   * Returns best match with confidence score.
   */
  static async searchWithFallback(
    query: string,
    lang: string = 'es-ES'
  ): Promise<{ results: TMDBSearchResult[]; bestMatch: TMDBSearchResult | null; confidence: number }> {
    try {
      // 1. Try multi search
      let results = await this.search(query, 'multi', lang);

      // 2. If no results, try movie-specific
      if (!results || results.length === 0) {
        results = await this.search(query, 'movie', lang);
      }

      // 3. If still no results, try tv-specific
      if (!results || results.length === 0) {
        results = await this.search(query, 'tv', lang);
      }

      if (!results || results.length === 0) {
        return { results: [], bestMatch: null, confidence: 0 };
      }

      // Find best match by title similarity
      const queryLower = query.toLowerCase().trim();
      let bestMatch: TMDBSearchResult | null = null;
      let bestScore = 0;

      for (const result of results) {
        const title = (result.title || result.name || '').toLowerCase().trim();
        const originalTitle = (result.original_title || result.original_name || '').toLowerCase().trim();

        const titleScore = this.similarityScore(queryLower, title);
        const originalScore = this.similarityScore(queryLower, originalTitle);
        const score = Math.max(titleScore, originalScore);

        // Boost popular results slightly
        const popularityBoost = Math.min(result.popularity || 0, 100) / 1000;
        const finalScore = score + popularityBoost;

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestMatch = result;
        }
      }

      return {
        results: results.slice(0, 10),
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
      languages
    };
  }

  /**
   * Simple string similarity using Levenshtein-based approach.
   * Returns a value between 0 (no match) and 1 (exact match).
   */
  private static similarityScore(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;

    // Check if one contains the other
    if (a.includes(b) || b.includes(a)) {
      const longer = Math.max(a.length, b.length);
      const shorter = Math.min(a.length, b.length);
      return shorter / longer;
    }

    // Token-based overlap
    const tokensA = a.split(/\s+/).filter(Boolean);
    const tokensB = b.split(/\s+/).filter(Boolean);
    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    let matches = 0;
    for (const t of tokensA) {
      if (tokensB.some(tb => tb.includes(t) || t.includes(tb))) {
        matches++;
      }
    }

    return matches / Math.max(tokensA.length, tokensB.length);
  }
}
